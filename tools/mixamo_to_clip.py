"""Retarget a Mixamo FBX animation onto the game's rigid-limb clip format.

    tools/mixamo_to_clip.sh anim.fbx --name cast --split auto

Mixamo rigs are ~65-bone humanoid skeletons meant for skinning. Our monsters are seven
rigid limbs posed by Euler angles (src/render/anim.js), so a bone-for-bone transfer is not
possible - there is no forearm, no shin, no spine chain to receive the motion. What this
does instead is measure the *result* of the Mixamo pose and restate it in our channels:

  arms, legs   aim.   The single rigid limb is pointed at where the hand / foot actually
                      ended up (shoulder -> hand, hip -> foot). This folds the elbow and
                      knee into the one segment we have, which keeps the reach of the pose
                      even though the bend itself is lost. Taking the upper-arm bone's own
                      rotation instead would leave the arms out at T-pose while the Mixamo
                      hands are folded in front of the chest.
  torso, head  delta. These are real single joints on both rigs, so the world-space
                      rotation relative to the rest pose transfers directly.

Everything is measured in the model's own axes (+Y up, +Z front, and -X is the character's
right, which is why Mixamo's *Right* bones drive our armL / legL - see _side() in
export_heroes.py). Body yaw is divided out, because in game the facing comes from the sim
via rig.root.rotation.y, not from the clip.

The sampled curve is then reduced to a handful of keys by inserting, greedily, whichever
frame is currently worst-reconstructed - scored through the same smoothstep evalClip() uses,
so the emitted keys are chosen against the interpolation that will actually play them.

Needs Blender (io_scene_fbx); run it through the .sh wrapper.
"""

import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

M = "mixamorig:"

# Mixamo bone -> our channel prefix. Mixamo's Right drives our L: the model's armL sits at
# x = -0.74, and with +Z front / +Y up the character's right hand side is -X.
AIM = {
    "aL": (M + "RightArm", M + "RightHand"),
    "aR": (M + "LeftArm", M + "LeftHand"),
    "lL": (M + "RightUpLeg", M + "RightFoot"),
    "lR": (M + "LeftUpLeg", M + "LeftFoot"),
}
CHANNELS = ["ryaw", "tx", "tyaw", "tz", "ty", "hx", "hy",
            "aLx", "aLz", "aRx", "aRz", "lLx", "lLz", "lRx", "lRz"]


# ---------------------------------------------------------------------------- maths

def smooth(t):
    return 0.0 if t <= 0 else 1.0 if t >= 1 else t * t * (3 - 2 * t)


def yxz(m):
    """Decompose a 3x3 rotation into Three.js 'YXZ' Euler order, i.e. m = Ry*Rx*Rz.

    Mirrors Euler.setFromRotationMatrix so the angles mean the same thing they will mean
    when applyPose hands them to a node whose rotation.order is 'YXZ' (root, torso, head).
    """
    s = max(-1.0, min(1.0, m[1][2]))
    x = math.asin(-s)
    if abs(s) < 0.9999999:
        y = math.atan2(m[0][2], m[2][2])
        z = math.atan2(m[1][0], m[1][1])
    else:                                     # gimbal lock: fold z into y
        y = math.atan2(-m[2][0], m[0][0])
        z = 0.0
    return x, y, z


def aim(d):
    """Euler (x, z) that swings a limb resting along -Y onto unit direction d.

    applyPose sets limb.rotation = (-cx, 0, cz) in Three's default XYZ order, so
    d = Rx(-cx) * Rz(cz) * (0,-1,0) = (sin cz, -cos cz cos cx, cos cz sin cx).
    """
    z = math.asin(max(-1.0, min(1.0, d.x)))
    x = math.atan2(d.z, -d.y)
    return x, z


# ---------------------------------------------------------------------------- sampling

def rot(m):
    return m.to_3x3().normalized()


def sample(arm, frames, scale, keep_yaw=False):
    """Per-frame channel dict, measured in model axes with body yaw removed."""
    bones, data = arm.pose.bones, arm.data.bones
    w3 = rot(arm.matrix_world)

    def rest(n):
        return w3 @ rot(data[n].matrix_local)

    def rest_head(n):
        return arm.matrix_world @ data[n].head_local

    # Model axes in Blender world space, read off the rest pose.
    up = (rest_head(M + "Spine2") - rest_head(M + "Hips")).normalized()
    right = (rest_head(M + "RightArm") - rest_head(M + "LeftArm")).normalized()
    right = (right - up * right.dot(up)).normalized()
    front = up.cross(right)                        # +Z: with right = Z x Y, front = Y x right
    A = Matrix((
        (up.cross(front).x, up.x, front.x),        # +X = Y x Z (so +X is the character's left)
        (up.cross(front).y, up.y, front.y),
        (up.cross(front).z, up.z, front.z),
    ))
    At = A.transposed()

    hips_r, chest_r, head_r = rest(M + "Hips"), rest(M + "Spine2"), rest(M + "Head")
    out, diag = [], {"hipPitch": 0.0, "hipRoll": 0.0, "yawLo": 9e9, "yawHi": -9e9}
    hips_y0 = None

    for f in frames:
        bpy.context.scene.frame_set(int(f))
        bpy.context.view_layer.update()

        def pose(n):
            return w3 @ rot(bones[n].matrix)

        def head(n):
            return arm.matrix_world @ bones[n].head

        # World rotation each joint has picked up since the rest pose.
        d_hips = pose(M + "Hips") @ hips_r.inverted()
        d_chest = pose(M + "Spine2") @ chest_r.inverted()
        d_head = pose(M + "Head") @ head_r.inverted()

        # The root node carries only yaw in game, so split the hips' rotation and keep the
        # rest of it (pitch/roll) inside the torso and the leg aims.
        hx_, hy_, hz_ = yxz(At @ d_hips @ A)
        diag["hipPitch"] = max(diag["hipPitch"], abs(hx_))
        diag["hipRoll"] = max(diag["hipRoll"], abs(hz_))
        unyaw = Matrix.Rotation(-hy_, 3, "Y")

        diag["yawLo"] = min(diag["yawLo"], hy_)
        diag["yawHi"] = max(diag["yawHi"], hy_)

        c = {}
        t_m = unyaw @ (At @ d_chest @ A)
        c["tx"], c["tyaw"], c["tz"] = yxz(t_m)
        # A spin attack IS its body yaw, so it cannot always be thrown away. It belongs on the
        # root, not the torso: the legs hang off the root, and a torso-only spin would whip
        # the upper body around hooves that never move. Everything else stays measured with
        # the yaw removed, and the composition still comes out right - the arms are relative
        # to the torso, which is relative to the root that is now carrying the turn.
        c["ryaw"] = hy_ if keep_yaw else 0.0
        h_m = (At @ d_chest @ A).inverted() @ (At @ d_head @ A)
        c["hx"], c["hy"], _ = yxz(h_m)

        # Arms hang off the torso, legs off the root, so each is measured in its own parent.
        t_inv = t_m.inverted()
        for pre, (a, b) in AIM.items():
            d = unyaw @ (At @ (head(b) - head(a)).normalized())
            if pre.startswith("a"):
                d = t_inv @ d
            c[pre + "x"], c[pre + "z"] = aim(d)

        y = head(M + "Hips").z
        if hips_y0 is None:
            hips_y0 = y
        c["ty"] = (y - hips_y0) * scale
        out.append(c)

    return out, diag


def unwrap(rows):
    """atan2 and the Euler decomposition both wrap at +/-pi; a limb that sweeps past
    vertical then reads as a 360deg jump, which the key reducer chases instead of the
    motion. Re-lift every angle onto a continuous branch."""
    for c in CHANNELS:
        if c == "ty":
            continue
        for i in range(1, len(rows)):
            d = rows[i][c] - rows[i - 1][c]
            rows[i][c] -= 2 * math.pi * round(d / (2 * math.pi))
    return rows


GROUP = {"arms": ("aLx", "aLz", "aRx", "aRz"), "legs": ("lLx", "lLz", "lRx", "lRz"),
         "torso": ("tx", "tyaw", "tz", "ty"), "head": ("hx", "hy")}


def apply_gain(rows, spec):
    """--gain legs=0.6,head=0.8 - scale a group or a single channel about zero.

    A faithful retarget is the starting point, not the goal: Mixamo's stance is a human
    one, and Baphomet is sculpted already crouched with his legs apart, so the transferred
    splay lands on top of splay that is already in the mesh."""
    if not spec:
        return rows
    for part in spec.split(","):
        k, _, v = part.partition("=")
        g = float(v)
        for c in GROUP.get(k.strip(), (k.strip(),)):
            for r in rows:
                if c in r:
                    r[c] *= g
    return rows


# ---------------------------------------------------------------------------- reduction

def reduce_keys(rows, max_keys, tol):
    """Greedily insert the worst-reconstructed frame until the clip is faithful enough."""
    n = len(rows)
    if n <= 2:
        return list(range(n)), 0.0
    keys = [0, n - 1]

    def err_at(i):
        for k in range(1, len(keys)):
            if i <= keys[k]:
                a, b = keys[k - 1], keys[k]
                s = smooth((i - a) / (b - a)) if b > a else 0.0
                return max(abs(rows[a][c] + (rows[b][c] - rows[a][c]) * s - rows[i][c])
                           for c in CHANNELS)
        return 0.0

    while len(keys) < max_keys:
        worst, we = -1, 0.0
        for i in range(n):
            if i in keys:
                continue
            e = err_at(i)
            if e > we:
                worst, we = i, e
        if worst < 0 or we < tol:
            break
        keys.append(worst)
        keys.sort()
    return keys, max((err_at(i) for i in range(n)), default=0.0)


def emit(name, rows, keys, drop, indent="    "):
    lo, hi = keys[0], keys[-1]
    span = max(1, hi - lo)
    live = [c for c in CHANNELS if max(abs(rows[i][c]) for i in keys) > drop]
    out = [f"{indent}{name}: ["]
    for i in keys:
        t = round((i - lo) / span, 3)
        body = ", ".join(f"{c}: {rows[i][c]:.2f}" for c in live
                         if abs(rows[i][c]) > drop or i in (lo, hi))
        out.append(f"{indent}  [{t:g}, {{ {body} }}],")
    out.append(f"{indent}],")
    return "\n".join(out)


# ---------------------------------------------------------------------------- main

def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    fbx = argv[0]
    opt = {"name": "clip", "split": "auto", "keys": "5", "tol": "0.05", "drop": "0.04",
           "height": "3.0", "json": "", "range": "", "gain": "", "loop": "", "keepyaw": "", "centre": ""}
    for i in range(1, len(argv) - 1, 2):
        opt[argv[i].lstrip("-")] = argv[i + 1]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    act = arm.animation_data.action
    r = act.frame_range if hasattr(act, "frame_range") else act.curve_frame_range
    frames = list(range(int(r[0]), int(r[1]) + 1))
    n_src, fps = len(frames), bpy.context.scene.render.fps

    # Mixamo exports in metres; the rigs are exported at `height` game units.
    top = (arm.matrix_world @ arm.data.bones[M + "HeadTop_End"].head_local).z
    scale = float(opt["height"]) / top

    rows, diag = sample(arm, frames, scale, opt["keepyaw"] not in ("", "0", "false"))
    unwrap(rows)

    # Mixamo clips open and close on a neutral stance the game never plays: the engine
    # blends in from idle and back out again on its own. Trim to the motion.
    if opt["range"]:
        a, b = (int(x) for x in opt["range"].split(":"))
        lo, hi = frames.index(a), frames.index(b)
        rows, frames = rows[lo:hi + 1], frames[lo:hi + 1]
        base, yaw0 = rows[0]["ty"], rows[0]["ryaw"]
        for row in rows:
            row["ty"] -= base
            row["ryaw"] -= yaw0

    # --centre all subtracts each channel's own mean, leaving motion without stance. An idle
    # needs it: Mixamo's mannequin rests with its torso turned 9 degrees and its arms out 17,
    # and next to 15 degrees of actual breathing that offset is the whole pose. Baphomet is
    # sculpted with a stance already, and REST tilts him again on top - a third one just
    # fights both. A walk keeps its offsets, because leaning into the stride is the walk.
    if opt["centre"]:
        want = CHANNELS if opt["centre"] == "all" else opt["centre"].split(",")
        for c in want:
            c = c.strip()
            mean = sum(r[c] for r in rows) / len(rows)
            for r in rows:
                r[c] -= mean

    apply_gain(rows, opt["gain"])

    # A cycle has no wind-up to split at, and it has to meet itself: Mixamo ends the loop on
    # a duplicate of frame 1, so keys spanning first..last already close seamlessly. The
    # vertical bob is re-centred on the cycle mean instead of frame 1, or the torso would sit
    # permanently low against legs that hang off the root rather than off it.
    loop = opt["loop"] not in ("", "0", "false")
    if loop:
        mean = sum(r["ty"] for r in rows) / len(rows)
        for row in rows:
            row["ty"] -= mean
        cut = 0
    elif opt["split"] == "auto":
        arms = [r["aLx"] + r["aRx"] for r in rows]
        cut = max(range(len(rows)),
                  key=lambda i: min(abs(arms[i] - arms[0]), abs(arms[i] - arms[-1])))
        cut = min(max(cut, 2), len(rows) - 3)
    else:
        cut = int(round(float(opt["split"]) * (len(rows) - 1)))

    print(f"\nRET| {os.path.basename(fbx)}  {n_src} frames @ {fps}fps"
          f"  = {n_src/fps:.2f}s   model scale x{scale:.2f}")
    # The root node only yaws in game, so the hips' own pitch and roll are folded into the
    # torso lean and left in the leg aims rather than lost - worth seeing how much that is.
    print(f"RET| hips pitch/roll folded into torso: "
          f"{math.degrees(diag['hipPitch']):.1f}deg / {math.degrees(diag['hipRoll']):.1f}deg")
    spin = math.degrees(diag["yawHi"] - diag["yawLo"])
    print(f"RET| body turns {spin:.0f}deg over the clip"
          + (" - folded into tyaw" if opt["keepyaw"] not in ("", "0", "false")
             else " - removed (pass --keepyaw 1 to keep it)"))
    print(f"RET| using frames {frames[0]}-{frames[-1]} "
          f"({len(rows)} of {n_src}, {len(rows)/fps:.2f}s)"
          + (f", gain {opt['gain']}" if opt["gain"] else ""))
    if loop:
        seam = max(abs(rows[0][c] - rows[-1][c]) for c in CHANNELS)
        print(f"RET| loop of {len(rows)} frames; seam frame {frames[0]} vs {frames[-1]} "
              f"is {math.degrees(seam):.1f}deg\n")
    else:
        print(f"RET| split at frame {frames[cut]} ({cut/(len(rows)-1)*100:.0f}%)\n")

    mk, tol, drop = int(opt["keys"]), float(opt["tol"]), float(opt["drop"])
    clips = {}
    segs = ([(opt["name"], rows)] if loop else
            [(opt["name"] + "Windup", rows[:cut + 1]), (opt["name"], rows[cut:])])
    for label, seg in segs:
        keys, e = reduce_keys(seg, mk, tol)
        lo, hi = keys[0], keys[-1]
        span = max(1, hi - lo)
        live = [c for c in CHANNELS if max(abs(seg[i][c]) for i in keys) > drop]
        clips[label] = [[(i - lo) / span, {c: round(seg[i][c], 4) for c in live}] for i in keys]
        print(f"RET| {label}: {len(keys)} keys, worst error {math.degrees(e):.1f}deg")
        print(emit(label, seg, keys, drop))
        print()

    if opt["json"]:
        with open(opt["json"], "w") as fh:
            json.dump({"frames": frames, "cut": cut, "scale": scale,
                       "rows": rows, "clips": clips}, fh)
        print(f"RET| raw + reduced clips -> {opt['json']}")


main()
