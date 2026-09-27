"""Turn Tripo's recurve bow into the Hunter's default bow, fitted where the old one was held.

    Blender -b -P assets/blender/hunter_tripo/prepare_bow.py

The Hunter's shooting poses (render/heroes.js HUNTER) were written against the classic bow's
orientation in the fist: which way is up, which side the string is on, where the grip sits.
So rather than guess a rotation, this measures both bows - the long axis, the string side
(the riser is where the mass is; the string is a thin line on the other side), the grip at the
middle of the riser - and maps the new one onto the old one's frame, at the old one's length.
It also welds, decimates and flattens the texture like prepare_falcon.py.

Output: bow_parts.glb beside this script - one object `weapon`, its origin at the old grip -
which tools/tripo_to_skinned.py (preset hunter) mounts in the Hunter's bow hand.
"""
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "bow_tripo.glb")
OLD = os.path.join(HERE, "classic_hunter_parts.glb")
OUT = os.path.join(HERE, "bow_parts.glb")
FACES = 3000
CLUSTERS = 8


def frame(co):
    """(centre of the grip, length axis, riser->string axis, side axis, length) for a bow."""
    mid = co.mean(0)
    u, s, vt = np.linalg.svd(co - mid, full_matrices=False)
    length = vt[0]
    t = (co - mid) @ length
    depth = vt[1]
    d = (co - mid) @ depth
    # The string is the thin far side: the bbox middle along depth sits nearer the string than
    # the mass does, so pointing from mass to bbox middle points at the string.
    if (d.max() + d.min()) / 2 < d.mean():
        depth = -depth
        d = -d
    riser = co[np.abs(t) < 0.12 * (t.max() - t.min())]
    rd = (riser - mid) @ depth
    grip = riser[rd < np.percentile(rd, 50)].mean(0)       # the riser's own half, not the string
    side = np.cross(length, depth)
    return Vector(grip), Vector(length), Vector(depth), Vector(side), float(t.max() - t.min())


# ---- the old bow: where it was, which way it faced
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=OLD)
old = bpy.data.objects["weapon"]
old_pivot = old.matrix_world.translation.copy()
old_co = np.array([list(old.matrix_world @ v.co) for v in old.data.vertices])
og, ol, od, os_, olen = frame(old_co)
if ol.z < 0:                       # its long axis the way the bow stands: upper limb up
    ol = -ol; os_ = -os_
print("[bow] old: length", round(olen, 3), "grip", [round(c, 3) for c in og], "pivot", [round(c, 3) for c in old_pivot])
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)

# ---- the new bow
bpy.ops.import_scene.gltf(filepath=SRC)
ob = next(o for o in bpy.data.objects if o.type == "MESH")
bpy.context.view_layer.objects.active = ob
ob.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bm = bmesh.new(); bm.from_mesh(ob.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0003)
bm.to_mesh(ob.data); bm.free()
for _ in range(6):
    if len(ob.data.polygons) <= FACES * 1.15:
        break
    dec = ob.modifiers.new("dec", "DECIMATE")
    dec.ratio = max(0.03, FACES / len(ob.data.polygons))
    bpy.ops.object.modifier_apply(modifier="dec")
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.quads_convert_to_tris()
bpy.ops.object.mode_set(mode="OBJECT")
me = ob.data

# flat colour
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
rng = np.random.default_rng(5)
C = col[rng.choice(nf, CLUSTERS, replace=False)].astype(np.float64)
for _ in range(50):
    lab = ((col[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)
    C = np.array([col[lab == k].mean(0) if (lab == k).any() else C[k] for k in range(CLUSTERS)])
lin = lambda c: [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
me.materials.clear()
for k in range(CLUSTERS):
    m = bpy.data.materials.new(f"BW • tone {k:02d}")
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*lin(C[k]), 1)
    bsdf.inputs["Roughness"].default_value = 0.6
    me.materials.append(m)
me.polygons.foreach_set("material_index", lab.astype(np.int32))
me.uv_layers.remove(me.uv_layers.active)
for im in list(bpy.data.images):
    bpy.data.images.remove(im)

# ---- onto the old bow's frame
new_co = np.array([list(v.co) for v in me.vertices])
ng, nl, nd, ns, nlen = frame(new_co)
if nl.z < 0:
    nl = -nl; ns = -ns
src = Matrix((nl, nd, ns)).transposed()         # columns: length, depth, side
dst = Matrix((ol, od, os_)).transposed()
R = (dst @ src.inverted()).to_4x4()
k = olen / nlen
me.transform(Matrix.Translation(og) @ R @ Matrix.Scale(k, 4) @ Matrix.Translation(-ng))
# the object sits at the old pivot, its mesh about it - exactly the old `weapon` node's shape
me.transform(Matrix.Translation(-old_pivot))
ob.name = "weapon"
ob.data.name = "weapon"
ob.location = old_pivot
print("[bow] new: faces", len(me.polygons), "scale", round(k, 3))
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True,
                          export_materials="EXPORT", export_normals=True, export_texcoords=False,
                          export_animations=False)
print("[bow] ->", OUT, os.path.getsize(OUT) // 1024, "KB")
