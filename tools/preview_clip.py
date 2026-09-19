"""Render a clip onto a real exported rig, so a pose can be looked at before it ships.

    tools/preview_clip.sh baphomet cast --json out.json --out strip.png

Reproduces applyPose() exactly - same channels, same Euler orders, same per-type REST - and
steps the clip through evalClip()'s smoothstep, then renders the game camera's framing plus
a side view. The side view is the one that matters: a limb swinging through the torso or the
floor is invisible head-on, which is precisely the angle the player watches from.
"""

import json
import math
import os
import subprocess
import sys

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # Blender ignores PYTHONPATH
from render_rest import REST                                     # noqa: E402  (same dir)

CAMERA = {"fov": 36, "height": 4.6, "dist": 10.2, "lookY": 1.5}

# glTF is Y-up/+Z-front; Blender's importer rewrites every node into Z-up/-Y-front, which is
# a change of basis by +90 deg about X. Local rotations have to be conjugated through it.
C = Matrix.Rotation(math.radians(90), 3, "X")


def smooth(t):
    return 0.0 if t <= 0 else 1.0 if t >= 1 else t * t * (3 - 2 * t)


def eval_clip(keys, t):
    """src/render/anim.js evalClip + lerpPose: absent channels read as zero."""
    if t <= keys[0][0]:
        return dict(keys[0][1])
    for i in range(1, len(keys)):
        t1, p1 = keys[i]
        if t <= t1:
            t0, p0 = keys[i - 1]
            s = smooth((t - t0) / (t1 - t0)) if t1 > t0 else 1.0
            out = {k: v + (p1.get(k, 0.0) - v) * s for k, v in p0.items()}
            out.update({k: v * s for k, v in p1.items() if k not in p0})
            return out
    return dict(keys[-1][1])


def pose(objs, c, rest, yaw):
    """applyPose(). root/torso/head are 'YXZ' nodes, the limbs keep Three's default 'XYZ'."""
    def v(k):
        return c.get(k, 0.0) + rest.get(k, 0.0)

    def put(name, xyz, order):
        o = objs.get(name)
        if o is None:
            return
        o.rotation_mode = "QUATERNION"
        m = Euler(xyz, order).to_matrix()
        o.rotation_quaternion = (C @ m @ C.inverted()).to_quaternion()

    put("root", (v("rx"), yaw, v("rz")), "YXZ")
    put("torso", (v("tx"), v("tyaw"), v("tz")), "YXZ")
    put("head", (v("hx"), v("hy"), 0), "YXZ")
    for n, p in (("armL", "aL"), ("armR", "aR")):
        put(n, (-v(p + "x"), v(p + "y"), v(p + "z")), "XYZ")
    for n, p in (("legL", "lL"), ("legR", "lR")):
        put(n, (-v(p + "x"), 0, v(p + "z")), "XYZ")
    put("weapon", (v("wx"), v("wy"), v("wz")), "XYZ")
    for name, ch in (("root", "ry"), ("torso", "ty")):
        o = objs.get(name)
        if o is not None:
            o.location.z = o["base_z"] + v(ch)          # glTF +Y is Blender +Z


def setup(glb):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    objs = {o.name: o for o in bpy.data.objects}
    for o in objs.values():
        o["base_z"] = o.location.z

    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"              # silhouette review, not a beauty pass
    sc.display.shading.light = "STUDIO"
    sc.display.shading.show_shadows = False
    sc.render.resolution_x, sc.render.resolution_y = 420, 600
    sc.render.film_transparent = False
    sc.world = bpy.data.worlds.new("w")
    sc.world.color = (0.16, 0.17, 0.2)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens_unit, cam_data.angle_y = "FOV", math.radians(CAMERA["fov"])
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam

    # Ground plane, so a limb pushing through the floor is obvious.
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    return objs, cam


def aim_camera(cam, angle, zoom=1.0, flat=False):
    """The game's viewing angle, dollied in by `zoom` so the character fills the frame.

    `flat` swaps in a level orthographic camera instead: the game's 24-degree downward
    perspective foreshortens exactly the limb swings being judged, so angles are read off
    the flat view and only the composition off the game view.
    """
    if flat:
        cam.data.type, cam.data.ortho_scale = "ORTHO", 4.2
        cam.location = Vector((math.sin(angle) * 12, -math.cos(angle) * 12, 1.7))
    else:
        cam.data.type = "PERSP"
        d = CAMERA["dist"] * zoom
        cam.location = Vector((math.sin(angle) * d, -math.cos(angle) * d,
                               CAMERA["height"] * zoom))
    look = Vector((0, 0, cam.location.z if flat else CAMERA["lookY"]))
    cam.rotation_euler = (look - cam.location).to_track_quat("-Z", "Y").to_euler()


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    model, name = argv[0], argv[1]
    opt = {"json": "", "out": "clip.png", "shots": "8", "glb": "", "zoom": "0.52",
           # A belt-scroller is watched from the side: the boss faces the hero along X while
           # the camera sits in front, so 'side' is the angle the player actually judges.
           "views": "side,front"}
    for i in range(2, len(argv) - 1, 2):
        opt[argv[i].lstrip("-")] = argv[i + 1]
    glb = opt["glb"] or f"assets/monsters/{model}.glb"

    data = json.load(open(opt["json"]))
    clips = data["clips"]
    seq = [k for k in (name + "Windup", name) if k in clips] or list(clips)
    shots, rest = int(opt["shots"]), REST.get(model, {})

    objs, cam = setup(glb)
    tmp = os.path.join(os.path.dirname(opt["out"]) or ".", "_pv")
    os.makedirs(tmp, exist_ok=True)

    views = [v.strip() for v in opt["views"].split(",")]
    n = 0
    for view in views:
        aim_camera(cam, math.radians(90 if view.startswith("side") else 0),
                   float(opt["zoom"]), view.endswith("flat"))
        for label in seq:
            for s in range(shots):
                t = s / (shots - 1) if shots > 1 else 0.0
                pose(objs, eval_clip(clips[label], t), rest, 0.0)
                bpy.context.view_layer.update()
                bpy.context.scene.render.filepath = os.path.join(tmp, f"{n:03d}.png")
                bpy.ops.render.render(write_still=True)
                n += 1

    cols = shots * len(seq)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "1",
                    "-i", os.path.join(tmp, "%03d.png"),
                    "-vf", f"tile={cols}x{len(views)}", "-frames:v", "1", opt["out"]], check=True)
    print(f"PV| {n} shots -> {opt['out']}  (rows: {', '.join(views)}; "
          f"cols: {' then '.join(seq)})")


main()
