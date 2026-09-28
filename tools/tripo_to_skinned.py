"""Turn a Tripo auto-rigged GLB (Mixamo preset) into a skinned source .blend for the game.

    Blender -b -P tools/tripo_to_skinned.py -- <preset>

The Knight has his own converter (assets/blender/knight_tripo/convert_tripo_knight.py)
because he needed re-posing, a cape cut out and a sword put in his fist. A model that stands
the way the game wants it and holds nothing that is not already part of it only needs the
common part, which is this:

- Flat colour. The base-colour map is sampled per face, clustered into `clusters` colours,
  and each cluster becomes one Principled material. The game ships no textures.
- Appendages the auto-rig got wrong. Tripo skins whatever hangs off a figure to the nearest
  limb - Moonraya's tail to her left thigh, so it would kick with every step. An appendage in
  the preset gets a bone of its own, parented where it belongs, and its vertices move to it.
- Skirts. A long robe skinned straight to the thighs splits down the middle when the legs
  swing. Vertices of it far from the leg bones hand part of their weight to the hips.

The result is saved as <out>.blend with `model_top` on the scene; export it with
tools/export_skinned_hero.sh like the Knight.
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

M = "mixamorig:"
PRESETS = {
    "moonraya": {
        "src": "assets/blender/moonraya_tripo/moonraya_rigged.glb",
        "out": "assets/blender/moonraya_tripo/moonraya_skinned.blend",
        "prefix": "MR",
        "clusters": 18,
        # The tail: behind her, below the hair, skinned to a thigh by the auto-rig.
        "appendages": [{
            "bone": "Tail", "parent": "Hips",
            "head": (0.0, 0.07, 0.47), "tail": (0.02, 0.22, 0.30),
            "pick": lambda c, dom, d_leg, lum=1: dom.endswith("UpLeg") and c[1] > 0.06 and d_leg > 0.06,
        }],
        "skirt": {"below": 0.52, "start": 0.035, "full": 0.12, "max": 0.65},
    },
    "baphomet": {
        "src": "assets/blender/baphomet_tripo/baphomet_rigged.glb",
        "out": "assets/blender/baphomet_tripo/baphomet_skinned.blend",
        "prefix": "BP",
        "clusters": 16,
        # The tail: behind the legs it was skinned to.
        "appendages": [{
            "bone": "Tail", "parent": "Hips",
            "head": (0.0, 0.10, 0.44), "tail": (0.03, 0.30, 0.14),
            # White fur only: the hakama's back panel hangs in the same place and is dark.
            "pick": lambda c, dom, d_leg, lum=1: dom.endswith(("UpLeg", "Leg")) and c[1] > 0.09 and d_leg > 0.06 and lum > 0.62,
        }],
        # The katana is part of the mesh. Its blade came out skinned to the hand, but the hilt
        # went to the fingers and the forearm, so it would bend the moment a clip curled them.
        # Everything along the blade's line, hilt and pommel included, rides the hand rigidly.
        "rigid": {
            "bone": "RightHand",
            "axis": lambda c, dom: dom == "RightHand" and c[1] < -0.12,     # the blade itself
            "radius": 0.035, "reach": (-0.30, 0.40),
            "absorb": ("RightHandIndex", "RightHandMiddle", "RightHandRing", "RightHandPinky", "RightHandThumb"),
        },
    },
    "hunter": {
        "src": "assets/blender/hunter_tripo/hunter_rigged.glb",
        "out": "assets/blender/hunter_tripo/hunter_skinned.blend",
        "prefix": "HN",
        "clusters": 16,
        # The quiver rides the back. The auto-rig gave most of it to the right upper arm, so it
        # would swing out with every draw of the bow.
        "rebind": [{
            "to": "Spine2",
            "pick": lambda c, dom, near: c[1] > 0.055 and c[2] > 0.45 and near["arm"] > 0.045
                    and dom.startswith(("RightArm", "RightShoulder", "LeftShoulder", "Head", "Neck")),
        }],
        # A closed bow hand; the falcon hand stays open, it is a perch.
        "fist": {"side": "Right", "joints": (70, 90, 70), "thumb": (20, 40, 30)},
        # The classic Hunter's bow and falcon, lifted out of his GLB about their own pivots.
        "mount": {
            "glb": "assets/blender/hunter_tripo/classic_hunter_parts.glb", "old_height": 1.75,
            "items": [
                # Tripo's recurve bow, fitted onto the classic bow's frame by
                # assets/blender/hunter_tripo/prepare_bow.py.
                # Fitted to the fist itself ("align"): grip in the hollow of the fingers, the
                # bow along the knuckle line (upper limb on the index side), string towards the
                # archer - where the hand, not the old bow, says it goes.
                {"node": "weapon", "glb": "assets/blender/hunter_tripo/bow_parts.glb",
                 "anchor": "grip", "bone": "RightHand", "at": "fist", "align": "bow"},
                # Beside the left shoulder, where the classic Hunter carried it: the bird's pivot
                # is its body, and its tail and wingtips hang well below its feet, so it is
                # placed by that pivot, out and a little up, not by its lowest point.
                # The falcon is Tripo's, cut into body and wings by
                # assets/blender/hunter_tripo/prepare_falcon.py.
                {"node": "falcon", "glb": "assets/blender/hunter_tripo/falcon_parts.glb",
                 "anchor": "perch", "bone": "LeftShoulder", "at": "shoulder", "offset": (0.09, 0.0, 0.10)},
            ],
        },
        "head_anchor": True,
    },
}


# ---------------------------------------------------------------- props from an older model

def lift_parts(mount):
    """Import the old rigid model and keep copies of the named nodes' meshes, each about its
    own pivot, in its old game units - plus any child nodes (the falcon's wings) with their
    offsets from it. Everything imported is then deleted but the copies."""
    out = {}
    for it in mount["items"]:
        # An item may come from a file of its own (the Tripo falcon); the rest from `glb`.
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o)
        bpy.ops.import_scene.gltf(filepath=it.get("glb", mount["glb"]))
        objs = {o.name: o for o in bpy.data.objects}
        node = objs[it["node"]]
        pivot = node.matrix_world.translation.copy()
        parts = []
        for o in [node] + [c for c in node.children_recursive]:
            if o.type != "MESH":
                continue
            me = o.data.copy()
            own = o.matrix_world.translation.copy()
            # A child keeps its own origin (it is animated about it); its mesh is about that.
            origin = pivot if o is node else own
            me.transform(Matrix.Translation(-origin) @ o.matrix_world)
            parts.append((o.name, me, (own - pivot)))
        out[it["node"]] = parts
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    return out


def bow_frame(co):
    """A bow's grip (middle of the riser), long axis (upper limb +), riser->string axis, side."""
    mid = co.mean(0)
    vt = np.linalg.svd(co - mid, full_matrices=False)[2]
    length, depth = vt[0], vt[1]
    if length[2] < 0:
        length = -length
    d = (co - mid) @ depth
    if (d.max() + d.min()) / 2 < d.mean():        # point from the mass (riser) to the string
        depth = -depth; d = -d
    t = (co - mid) @ length
    riser = co[np.abs(t) < 0.12 * (t.max() - t.min())]
    rd = (riser - mid) @ depth
    grip = riser[rd < np.percentile(rd, 50)].mean(0)
    return Vector(grip), Vector(length), Vector(depth), Vector(np.cross(length, depth))


def pose_and_mount(preset, arm, body, lifted, top):
    """Close a hand, make the pose the rest pose, and hang props off bone anchors."""
    world = arm.matrix_world
    pb = arm.pose.bones
    H = lambda n: world @ pb[M + n].head

    def turn_bone(name, axis, angle):
        bone = pb[M + name]
        m = world @ bone.matrix
        r = Matrix.Rotation(angle, 4, Vector(axis).normalized())
        bone.matrix = world.inverted() @ (Matrix.Translation(m.translation) @ r @ Matrix.Translation(-m.translation) @ m)
        bpy.context.view_layer.update()

    fs = preset.get("fist")
    if fs:
        side = fs["side"]
        f = (world @ pb[f"{M}{side}Hand"].matrix).to_3x3().col[1].normalized()
        k = (H(f"{side}HandIndex1") - H(f"{side}HandPinky1")).normalized()
        palm = (k.cross(f) if side == "Right" else f.cross(k)).normalized()
        axis = f.cross(palm)
        for finger in ("Index", "Middle", "Ring", "Pinky"):
            for j, deg in zip((1, 2, 3), fs["joints"]):
                turn_bone(f"{side}Hand{finger}{j}", axis, math.radians(deg))
        for j, deg in zip((1, 2, 3), fs["thumb"]):
            turn_bone(f"{side}HandThumb{j}", axis, math.radians(deg))
    fist = sum((H(f"RightHandMiddle{j}") for j in (1, 2, 3, 4)), Vector()) / 4
    points = {"fist": fist, "shoulder": H("LeftArm")}
    # The closed hand's own frame, for a prop that must sit in it rather than where an older
    # model's prop sat: the knuckle line, and back along the hand towards the wrist.
    hand_up = (H("RightHandIndex1") - H("RightHandPinky1")).normalized()
    hand_back = (H("RightHand") - H("RightHandMiddle1")).normalized()
    hand_back = (hand_back - hand_up * hand_back.dot(hand_up)).normalized()
    neck = H("Neck")

    dg = bpy.context.evaluated_depsgraph_get()
    posed = bpy.data.meshes.new_from_object(body.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    posed.transform(body.matrix_world)
    old = body.data
    body.data = posed
    body.matrix_world = Matrix.Identity(4)
    bpy.data.meshes.remove(old)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    scene = bpy.context.scene

    def anchor(name, bone, at):
        e = bpy.data.objects.new(name, None)
        scene.collection.objects.link(e)
        e.parent, e.parent_type, e.parent_bone = arm, "BONE", M + bone
        for _ in range(3):
            bpy.context.view_layer.update()
            e.matrix_world = Matrix.Translation(at)
        bpy.context.view_layer.update()
        return e

    mount = preset.get("mount")
    if mount:
        k = top / mount["old_height"]                   # old game units -> this file's units
        for it in mount["items"]:
            parts = lifted[it["node"]]
            at = points[it["at"]].copy() + Vector(it.get("offset", (0, 0, 0)))
            if it.get("align") == "bow":
                _, me0, _ = parts[0]
                g, l, d, sd = bow_frame(np.array([list(v.co) for v in me0.vertices]))
                src = Matrix((l, d, sd)).transposed()
                dst = Matrix((hand_up, hand_back, hand_up.cross(hand_back))).transposed()
                me0.transform((dst @ src.inverted()).to_4x4() @ Matrix.Translation(-g))
            if it.get("sit"):
                # Lift the prop so its lowest point rests on the spot rather than its pivot.
                low = min(min((v.co.z + off.z) for v in me.vertices) for _, me, off in parts)
                at.z -= low * k
            a = anchor(it["anchor"], it["bone"], at)
            root_ob = None
            for i, (name, me, off) in enumerate(parts):
                ob = bpy.data.objects.new(name, me)
                scene.collection.objects.link(ob)
                if i == 0:
                    ob.parent = a; ob.matrix_parent_inverse = Matrix.Identity(4)
                    ob.location = (0, 0, 0); ob.scale = (k, k, k)
                    root_ob = ob
                else:
                    ob.parent = root_ob; ob.matrix_parent_inverse = Matrix.Identity(4)
                    ob.location = off
            print(f"[tripo] {it['node']} on {it['bone']} ({len(parts)} parts)")
        scene["knight_fist"] = [round(c, 4) for c in fist]
    if preset.get("head_anchor"):
        anchor("head", "Head", neck)
        scene["knight_neck"] = [round(c, 4) for c in neck]


def main():
    preset = PRESETS[sys.argv[sys.argv.index("--") + 1]]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    lifted = lift_parts(preset["mount"]) if preset.get("mount") else {}
    bpy.ops.import_scene.gltf(filepath=preset["src"])
    for o in list(bpy.data.objects):
        if o.type == "MESH" and not o.vertex_groups:
            bpy.data.objects.remove(o)                       # Tripo's stray Icosphere
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    body = next(o for o in bpy.data.objects if o.type == "MESH")
    me, world = body.data, arm.matrix_world
    scene = bpy.context.scene

    # ---------------------------------------------------------------- colour per face
    img = next(i for i in bpy.data.images if "basecolor" in i.name)
    W, H = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[:, :, :3]
    nf = len(me.polygons)
    uv = np.zeros(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    ls = np.zeros(nf, np.int32); me.polygons.foreach_get("loop_start", ls)
    lt = np.zeros(nf, np.int32); me.polygons.foreach_get("loop_total", lt)

    def sample(u):
        x = np.clip((u[:, 0] % 1) * W, 0, W - 1).astype(int)
        y = np.clip((u[:, 1] % 1) * H, 0, H - 1).astype(int)
        return px[y, x]

    cen_uv = np.zeros((nf, 2))
    for k in range(3):
        cen_uv += uv[ls + np.minimum(k, lt - 1)]
    cen_uv /= 3
    colour = (sample(uv[ls]) + sample(uv[ls + 1]) + sample(uv[ls + np.minimum(2, lt - 1)]) + 2 * sample(cen_uv)) / 5

    X = colour.astype(np.float64)
    K = preset["clusters"]
    rng = np.random.default_rng(7)
    C = X[rng.choice(len(X), K, replace=False)]
    for _ in range(60):
        lab = ((X[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)
        C = np.array([X[lab == k].mean(0) if (lab == k).any() else C[k] for k in range(K)])

    def linear(c):
        return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

    me.materials.clear()
    for k in range(K):
        m = bpy.data.materials.new(f"{preset['prefix']} • tone {k:02d}")
        m.use_nodes = True
        bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        rgb = linear(C[k])
        bsdf.inputs["Base Color"].default_value = (*rgb, 1)
        bsdf.inputs["Roughness"].default_value = 0.7
        m.diffuse_color = (*rgb, 1)
        me.materials.append(m)
    me.polygons.foreach_set("material_index", lab.astype(np.int32))
    me.update()
    for im in list(bpy.data.images):
        bpy.data.images.remove(im)
    keep = {m for parts in lifted.values() for _, pm, _ in parts for m in pm.materials if m}
    for m in list(bpy.data.materials):
        if not m.name.startswith(preset["prefix"] + " •") and m not in keep:
            bpy.data.materials.remove(m)

    # ---------------------------------------------------------------- weights
    bones = {b.name.replace(M, ""): b for b in arm.data.bones}

    def seg(n):
        b = bones[n]
        return np.array(world @ b.head_local), np.array(world @ b.tail_local)

    def dist(points, names):
        out = []
        for n in names:
            a, b = seg(n)
            ab = b - a
            t = np.clip(((points - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
            out.append(np.linalg.norm(points - (a + t[:, None] * ab), axis=1))
        return np.min(out, axis=0)

    co = np.array([list(body.matrix_world @ v.co) for v in me.vertices])
    # How light each vertex reads: the mean of the faces around it, from the sampled texture.
    lum = np.zeros(len(me.vertices)); cnt = np.zeros(len(me.vertices))
    face_lum = colour.mean(1)
    for f, p in enumerate(me.polygons):
        for vi in p.vertices:
            lum[vi] += face_lum[f]; cnt[vi] += 1
    lum /= np.maximum(cnt, 1)
    legs = [f"{s}{p}" for s in ("Left", "Right") for p in ("UpLeg", "Leg", "Foot")]
    d_leg = dist(co, legs)
    gname = {g.index: g.name.replace(M, "") for g in body.vertex_groups}
    dom = []
    for v in me.vertices:
        g = max(v.groups, key=lambda g: g.weight, default=None)
        dom.append(gname[g.group] if g else "")

    for ap in preset.get("appendages", []):
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode="EDIT")
        inv = world.inverted()
        eb = arm.data.edit_bones.new(M + ap["bone"])
        eb.head, eb.tail = inv @ Vector(ap["head"]), inv @ Vector(ap["tail"])
        eb.parent = arm.data.edit_bones[M + ap["parent"]]
        bpy.ops.object.mode_set(mode="OBJECT")
        grp = body.vertex_groups.new(name=M + ap["bone"])
        picked = [i for i in range(len(co)) if ap["pick"](co[i], dom[i], d_leg[i], lum[i])]
        for i in picked:
            for g in list(me.vertices[i].groups):
                body.vertex_groups[g.group].remove([i])
            grp.add([i], 1.0, "REPLACE")
        print(f"[tripo] {ap['bone']}: {len(picked)} verts moved off the limbs")

    arms = [f"{s_}{p}" for s_ in ("Left", "Right") for p in ("Arm", "ForeArm", "Hand")]
    near = {"arm": dist(co, arms), "leg": d_leg}
    for rb in preset.get("rebind", []):
        grp = body.vertex_groups[M + rb["to"]]
        picked = [i for i in range(len(co)) if rb["pick"](co[i], dom[i], {k: v[i] for k, v in near.items()})]
        for i in picked:
            for g in list(me.vertices[i].groups):
                body.vertex_groups[g.group].remove([i])
            grp.add([i], 1.0, "REPLACE")
        print(f"[tripo] {rb['to']}: {len(picked)} verts rebound")

    rg = preset.get("rigid")
    if rg:
        hand = body.vertex_groups[M + rg["bone"]]
        blade = np.array([co[i] for i in range(len(co)) if rg["axis"](co[i], dom[i])])
        mid = blade.mean(0)
        axis = np.linalg.svd(blade - mid)[2][0]
        rel = co - mid
        along = rel @ axis
        off = np.linalg.norm(rel - along[:, None] * axis, axis=1)
        lo, hi = rg["reach"]
        picked = set(np.nonzero((off < rg["radius"]) & (along > lo) & (along < hi))[0].tolist())
        picked |= {i for i, d in enumerate(dom) if d.startswith(rg["absorb"])}
        for i in picked:
            for g in list(me.vertices[i].groups):
                body.vertex_groups[g.group].remove([i])
            hand.add([i], 1.0, "REPLACE")
        print(f"[tripo] {rg['bone']}: {len(picked)} verts of the weapon and the grip held rigid")

    sk = preset.get("skirt")
    if sk:
        hips = body.vertex_groups[M + "Hips"]
        n = 0
        for i, v in enumerate(me.vertices):
            if co[i][2] > sk["below"] or not dom[i].endswith(("UpLeg", "Leg", "Foot")):
                continue
            share = min(sk["max"], max(0.0, (d_leg[i] - sk["start"]) / (sk["full"] - sk["start"])) * sk["max"])
            if share <= 0:
                continue
            for g in v.groups:
                g.weight *= (1 - share)
            hips.add([i], share, "ADD")
            n += 1
        print(f"[tripo] skirt: {n} verts share weight with the hips")

    top = float(co[:, 2].max())
    if preset.get("fist") or preset.get("mount") or preset.get("head_anchor"):
        pose_and_mount(preset, arm, body, lifted, top)
    scene["model_top"] = round(top, 4)
    scene["knight_top"] = round(top, 4)                 # the key export_skinned_hero.py reads
    bpy.ops.wm.save_as_mainfile(filepath=preset["out"], compress=True)
    print(f"[tripo] saved {preset['out']} ({len(body.data.vertices)} verts, top {top:.3f})")


main()
