"""Turn Tripo's ghost into Wispra: a body and a tail, flat colours, eyes that glow.

    Blender -b -P assets/blender/wispra_tripo/prepare_wispra.py

Wispra is a blob in the game (render/monsters.js updateBlob): no skeleton, the whole body
squashes, leans and bobs about one node, so the model needs no rig. What it does need:
- flat colour, like every other model - the texture is sampled per face and clustered;
- the eyes and mouth glowing: the teal clusters get an emission of their own colour;
- the wisp of a tail under the hem as its own object, its origin where it leaves the hem,
  so the game can sway it (`tail`);
- the game's size, centred on its own middle, because updateBlob puts the body node at half
  the hurtbox's height and squashes about it.

Output: assets/monsters/wispra.glb, one `wispra` node with a `tail` child.
"""
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "wispra_tripo.glb")
OUT = os.path.join(HERE, "..", "..", "monsters", "wispra.glb")
FACES = 6000
CLUSTERS = 7
HEIGHT = 1.35          # game units, hem-tail tip to crown; the hurtbox is 1.5 tall
TAIL_Z = 0.21          # in Tripo's units (0..1 tall): below this, near the axis, is tail
TAIL_R = 0.13

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ob = next(o for o in bpy.data.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bm = bmesh.new(); bm.from_mesh(ob.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0003)
bm.to_mesh(ob.data); bm.free()
for _ in range(4):
    if len(ob.data.polygons) <= FACES * 1.15:
        break
    dec = ob.modifiers.new("dec", "DECIMATE")
    dec.ratio = max(0.1, FACES / len(ob.data.polygons))
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
rng = np.random.default_rng(11)
C = col[rng.choice(nf, CLUSTERS, replace=False)].astype(np.float64)
for _ in range(50):
    lab = ((col[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)
    C = np.array([col[lab == k].mean(0) if (lab == k).any() else C[k] for k in range(CLUSTERS)])
lin = lambda c: [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
me.materials.clear()
for k in range(CLUSTERS):
    r, g, b = C[k]
    glow = g - r > 0.15                       # the teal of the eyes and mouth; the sheet is grey
    m = bpy.data.materials.new(f"WS • {'glow' if glow else 'sheet'} {k:02d}")
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*lin(C[k]), 1)
    bsdf.inputs["Roughness"].default_value = 0.85
    if glow:
        bsdf.inputs["Emission Color"].default_value = (*lin(C[k]), 1)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    me.materials.append(m)
    print(f"[wispra] tone {k}: {[round(float(c), 2) for c in C[k]]} {'glow' if glow else ''} ({(lab == k).sum()} faces)")
me.polygons.foreach_set("material_index", lab.astype(np.int32))
me.uv_layers.remove(me.uv_layers.active)
for im in list(bpy.data.images):
    bpy.data.images.remove(im)

# ---- the game's size, about its own middle
co = np.array([list(v.co) for v in me.vertices])
lo, hi = co.min(0), co.max(0)
k = HEIGHT / (hi[2] - lo[2])
mid = Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2))
tail_z = (TAIL_Z - mid.z) * k
me.transform(Matrix.Scale(k, 4) @ Matrix.Translation(-mid))

# ---- cut the tail off under the hem
cen = np.array([list(p.center) for p in me.polygons])
tail_pts = cen[cen[:, 2] < tail_z]
axis = np.median(tail_pts[:, :2], axis=0)
is_tail = (cen[:, 2] < tail_z) & (np.linalg.norm(cen[:, :2] - axis, axis=1) < TAIL_R * k)
joint = Vector((axis[0], axis[1], tail_z))

def part(keep, name):
    m2 = me.copy()
    bm = bmesh.new(); bm.from_mesh(m2); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f, t in zip(bm.faces, is_tail) if t != keep], context="FACES")
    bm.to_mesh(m2); bm.free()
    o = bpy.data.objects.new(name, m2)
    bpy.context.scene.collection.objects.link(o)
    return o

body = part(False, "wispra")
tail = part(True, "tail")
tail.data.transform(Matrix.Translation(-joint))
tail.parent = body
tail.location = joint
bpy.data.objects.remove(ob)
print("[wispra] faces", {o.name: len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH"},
      "height", HEIGHT, "tail joint", [round(c, 3) for c in joint])

for o in bpy.data.objects:
    o.select_set(o.type == "MESH")
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True,
                          export_materials="EXPORT", export_normals=True, export_texcoords=False,
                          export_animations=False)
print("[wispra] ->", os.path.normpath(OUT), os.path.getsize(OUT) // 1024, "KB")
