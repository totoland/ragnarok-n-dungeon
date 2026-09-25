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
}


def main():
    preset = PRESETS[sys.argv[sys.argv.index("--") + 1]]
    bpy.ops.wm.read_factory_settings(use_empty=True)
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
    for m in list(bpy.data.materials):
        if not m.name.startswith(preset["prefix"] + " •"):
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
    scene["model_top"] = round(top, 4)
    scene["knight_top"] = round(top, 4)                 # the key export_skinned_hero.py reads
    bpy.ops.wm.save_as_mainfile(filepath=preset["out"], compress=True)
    print(f"[tripo] saved {preset['out']} ({len(me.vertices)} verts, top {top:.3f})")


main()
