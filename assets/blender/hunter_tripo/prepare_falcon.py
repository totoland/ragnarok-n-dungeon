"""Turn Tripo's eagle-in-flight into the Hunter's falcon: a body and two wings.

    Blender -b -P assets/blender/hunter_tripo/prepare_falcon.py

The game flaps the falcon by turning two nodes, `wingL` and `wingR`, about their shoulders
(render/heroes.js updateFalcon), and flies it by moving `falcon`. Tripo hands over one
316k-vertex textured mesh. This decimates it, flattens the texture to a few colours the way
tools/tripo_to_skinned.py does, turns it to face the game's front, sizes it to the classic
falcon's span, and cuts the wings off at the body - each an object with its origin at its
shoulder, parented to the body. Output: falcon_parts.glb beside this script, which
tools/tripo_to_skinned.py (preset hunter) mounts on the Hunter's shoulder.
"""
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "falcon_tripo.glb")
OUT = os.path.join(HERE, "falcon_parts.glb")
FACES = 7000          # the whole bird; it is small on screen and there is only ever one
CLUSTERS = 10
SPAN = 0.85           # game units tip to tip - the classic falcon's was 0.94
BODY_HALF = 0.075     # |x| past this, in Tripo's units, is wing

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ob = next(o for o in bpy.data.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = ob.data

# Decimate first; the texture is sampled off the UVs that survive it.
# glTF arrives split at every UV seam, and a collapse cannot cross a split: weld first (UVs are
# per corner, so they survive it), then decimate - a few passes, since seams still slow it.
bm = bmesh.new(); bm.from_mesh(ob.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0004)
bm.to_mesh(ob.data); bm.free()
for _ in range(5):
    if len(ob.data.polygons) <= FACES * 1.15:
        break
    dec = ob.modifiers.new("dec", "DECIMATE")
    dec.ratio = max(0.05, FACES / len(ob.data.polygons))
    bpy.ops.object.modifier_apply(modifier="dec")
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.quads_convert_to_tris()
bpy.ops.object.mode_set(mode="OBJECT")
me = ob.data

# ---- flat colour
img = next(i for i in bpy.data.images if "basecolor" in i.name)
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[:, :, :3]
nf = len(me.polygons)
uv = np.zeros(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get("uv", uv); uv = uv.reshape(-1, 2)
ls = np.zeros(nf, np.int32); me.polygons.foreach_get("loop_start", ls)
def sample(u):
    x = np.clip((u[:, 0] % 1) * W, 0, W - 1).astype(int); y = np.clip((u[:, 1] % 1) * H, 0, H - 1).astype(int)
    return px[y, x]
col = (sample(uv[ls]) + sample(uv[ls + 1]) + sample(uv[ls + 2]) + 2 * sample((uv[ls] + uv[ls + 1] + uv[ls + 2]) / 3)) / 5
rng = np.random.default_rng(3)
C = col[rng.choice(nf, CLUSTERS, replace=False)].astype(np.float64)
for _ in range(50):
    lab = ((col[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)
    C = np.array([col[lab == k].mean(0) if (lab == k).any() else C[k] for k in range(CLUSTERS)])
lin = lambda c: [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
me.materials.clear()
for k in range(CLUSTERS):
    m = bpy.data.materials.new(f"FC • tone {k:02d}")
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*lin(C[k]), 1)
    bsdf.inputs["Roughness"].default_value = 0.75
    me.materials.append(m)
me.polygons.foreach_set("material_index", lab.astype(np.int32))
me.uv_layers.remove(me.uv_layers.active)
for im in list(bpy.data.images):
    bpy.data.images.remove(im)

# ---- face the game's front: Tripo's beak points -X, the game's front is -Y
me.transform(Matrix.Rotation(math.radians(90), 4, "Z"))
co = np.array([list(v.co) for v in me.vertices])
span = co[:, 0].max() - co[:, 0].min()
me.transform(Matrix.Scale(SPAN / span, 4))
co = np.array([list(v.co) for v in me.vertices])
half = BODY_HALF * SPAN / span

# ---- cut the wings off at the body
cen = np.array([list(p.center) for p in me.polygons])
side = np.where(cen[:, 0] < -half, "L", np.where(cen[:, 0] > half, "R", "B"))
body_pts = co[np.abs(co[:, 0]) <= half]
pivot = Vector(body_pts.mean(0))
shoulder_z = float(np.percentile(body_pts[:, 2], 85))

def part(keep, name):
    m2 = me.copy()
    bm = bmesh.new(); bm.from_mesh(m2); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f, s in zip(bm.faces, side) if s != keep], context="FACES")
    bm.to_mesh(m2); bm.free()
    o = bpy.data.objects.new(name, m2)
    bpy.context.scene.collection.objects.link(o)
    return o

body = part("B", "falcon")
body.data.transform(Matrix.Translation(-pivot))
wings = {}
for s_, name in (("L", "wingL"), ("R", "wingR")):
    w = part(s_, name)
    joint = Vector((-half if s_ == "L" else half, pivot.y, shoulder_z))
    w.data.transform(Matrix.Translation(-joint))
    w.parent = body
    w.location = joint - pivot
    wings[name] = w
bpy.data.objects.remove(ob)
print("[falcon] faces", {o.name: len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH"},
      "span", SPAN, "pivot", [round(c, 3) for c in pivot])

for o in bpy.data.objects:
    o.select_set(o.type == "MESH")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True,
                          export_materials="EXPORT", export_normals=True, export_texcoords=False,
                          export_animations=False)
print("[falcon] ->", OUT, os.path.getsize(OUT) // 1024, "KB")
