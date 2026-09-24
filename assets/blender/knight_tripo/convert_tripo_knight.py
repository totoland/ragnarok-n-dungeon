"""Turn Tripo's rigged Knight GLB into a source .blend the hero exporter can read.

    Blender -b -P assets/blender/knight_tripo/convert_tripo_knight.py

Tripo hands over the opposite of what this game draws (see assets/blender/PIPELINE.md): one
continuous skinned mesh wearing a 1k texture. The rig is what makes the conversion possible,
and it is thrown away once it has done three jobs:

1. **Re-pose.** Tripo rigs in an A-pose. The game's rest pose is whatever the geometry is
   baked in, and every clip in render/heroes.js is written against a Knight whose arms hang
   and whose sword fist sits in front of his hip. The Mixamo bones swing the arms there and
   close the sword hand; the posed mesh is then applied.
2. **Split.** A limb is whichever bones hold most of a face's weight. The one exception is the
   cape: Tripo's auto-rig skins it to the ARMS, so weights cannot find it. It is found by
   colour and by distance from the skeleton instead, pinned to the chest before the arms move
   (or lowering them would drag it along), and becomes its own `cape` node.
3. Nothing - the armature is deleted.

The texture becomes flat colour: every face samples the base-colour map, the samples are
clustered into `CLUSTERS` colours, and each cluster is one Principled material.

The Knight carries no sword in this model. The Sword and the Katana are lifted out of the
previous knight.glb, which already holds them about their grip, and put in the new fist -
unrotated, so a weapon mounted from assets/gear lines up exactly as it did before.

Re-run it only to rebuild knight_tripo.blend from scratch; the .blend is the source file.
"""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
SRC = os.path.join(HERE, "fantasy_knight_rigged.glb")
OLD = os.path.join(REPO, "assets", "heroes", "knight.glb")   # the previous Knight: weapons only
OUT = os.path.join(HERE, "knight_tripo.blend")
DEBUG = "--debug" in sys.argv                                 # also render a label preview
# --skinned keeps the rig: one mesh on the Mixamo skeleton, saved as knight_skinned.blend for
# tools/export_skinned_hero.py, instead of the rigid limbs the recipe exporter reads.
SKINNED = "--skinned" in sys.argv
CLUSTERS = 16
OLD_HEIGHT = 1.9                                              # game units the old GLB is in
CAPE_HINGE = (0.0, 0.06, 0.78)                                # across the back of the collar

# Mixamo bone -> limb. The game's L is the -X side, which is the model's RIGHT hand.
def limb_of(bone):
    b = bone.replace("mixamorig:", "")
    if b.startswith(("Neck", "Head")):
        return "head"
    if b.startswith("Right") and any(k in b for k in ("Arm", "Hand")):
        return "armL"
    if b.startswith("Left") and any(k in b for k in ("Arm", "Hand")):
        return "armR"
    if b.startswith("Right") and any(k in b for k in ("Leg", "Foot", "Toe")):
        return "legL"
    if b.startswith("Left") and any(k in b for k in ("Leg", "Foot", "Toe")):
        return "legR"
    return "torso"                    # hips, spine, clavicles


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Knight • Tripo"

# ------------------------------------------------------------------ the old weapons
bpy.ops.import_scene.gltf(filepath=OLD)
old = {o.name: o for o in scene.objects}
weapons = {}
for key in ("weapon", "weapon_katana"):
    node = old[key]
    parts = [node] + [c for c in node.children_recursive if c.type == "MESH"]
    pivot = node.matrix_world.translation.copy()
    meshes = []
    for p in parts:
        if p.type != "MESH":
            continue
        me = p.data.copy()
        me.transform(Matrix.Translation(-pivot) @ p.matrix_world)   # about the grip, game units
        meshes.append(me)
    weapons[key] = meshes
for o in list(scene.objects):
    bpy.data.objects.remove(o)

# ------------------------------------------------------------------ the Tripo knight
bpy.ops.import_scene.gltf(filepath=SRC)
for o in list(scene.objects):
    if o.type == "MESH" and not o.vertex_groups:
        bpy.data.objects.remove(o)                                  # Tripo leaves an Icosphere
arm = next(o for o in scene.objects if o.type == "ARMATURE")
body = next(o for o in scene.objects if o.type == "MESH")
me = body.data
world = arm.matrix_world

img = next(i for i in bpy.data.images if "basecolor" in i.name)
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[:, :, :3]   # sRGB-encoded
nf = len(me.polygons)
uv = np.zeros(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get("uv", uv)
uv = uv.reshape(-1, 2)
ls = np.zeros(nf, np.int32); me.polygons.foreach_get("loop_start", ls)
assert all(len(p.vertices) == 3 for p in me.polygons), "expects a triangulated mesh"

def sample(u):
    x = np.clip((u[:, 0] % 1) * W, 0, W - 1).astype(int)
    y = np.clip((u[:, 1] % 1) * H, 0, H - 1).astype(int)
    return px[y, x]

centre_uv = (uv[ls] + uv[ls + 1] + uv[ls + 2]) / 3
colour = (sample(uv[ls]) + sample(uv[ls + 1]) + sample(uv[ls + 2]) + 2 * sample(centre_uv)) / 5
cen = np.zeros(nf * 3); me.polygons.foreach_get("center", cen); cen = cen.reshape(-1, 3)
cen = np.array([list(body.matrix_world @ Vector(c)) for c in cen])

# Per-vertex limb weight, then per face the limb that holds most of it.
LIMBS = ["torso", "head", "armL", "armR", "legL", "legR"]
gname = {g.index: g.name for g in body.vertex_groups}
vlimb = np.zeros((len(me.vertices), len(LIMBS)))
for v in me.vertices:
    for g in v.groups:
        vlimb[v.index, LIMBS.index(limb_of(gname[g.group]))] += g.weight
fv = np.array([list(p.vertices) for p in me.polygons])
face_limb = np.array(LIMBS)[(vlimb[fv[:, 0]] + vlimb[fv[:, 1]] + vlimb[fv[:, 2]]).argmax(1)]

# ------------------------------------------------------------------ the cape
bones = {b.name.replace("mixamorig:", ""): b for b in arm.data.bones}
def seg(name):
    b = bones[name]
    return np.array(world @ b.head_local), np.array(world @ b.tail_local)

def dist_to(points, a, b):
    ab = b - a
    t = np.clip(((points - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
    return np.linalg.norm(points - (a + t[:, None] * ab), axis=1)

def nearest(points, names):
    return np.min([dist_to(points, *seg(n)) for n in names], axis=0)

# The fingers too: they reach well past the hand bone, and without them the fingertips read as
# "far from the skeleton", get pinned to the chest with the cape, and stretch into spikes.
ARMS = [n for n in bones if n.startswith(("Left", "Right")) and ("Arm" in n or "Hand" in n)]
LEGS = [f"{s}{p}" for s in ("Left", "Right") for p in ("UpLeg", "Leg", "Foot")]
SPINE = ["Hips", "Spine", "Spine1", "Spine2"]
d_arm, d_leg, d_spine = nearest(cen, ARMS), nearest(cen, LEGS), nearest(cen, SPINE)

r, g, b = colour[:, 0], colour[:, 1], colour[:, 2]
blue = (b > r + 0.08) & (b > g + 0.04)
crimson = (r > g + 0.12) & (r > b + 0.02) & (g < 0.35)
cape = np.zeros(nf, bool)
# The cloth colours, anywhere clear of the limbs - the arms' own padding is blue too.
cape |= (blue | crimson) & (d_arm > 0.055) & (d_leg > 0.07) & (cen[:, 2] < 0.80)
# Anything hanging well off the skeleton: the hem, the fringe, the gold edging.
cape |= (d_arm > 0.08) & (d_leg > 0.10) & (d_spine > 0.13) & (cen[:, 2] < 0.74)
# The upper back, where the cape lies close over the shoulders: behind the plate, it is cloth.
cape |= blue & (cen[:, 1] > 0.07) & (cen[:, 2] < 0.79)
# The chest emblem is crimson and sits on the tabard, in front of the spine.
cape &= ~((cen[:, 1] < -0.06) & (np.abs(cen[:, 0]) < 0.12) & (cen[:, 2] > 0.35))

# Smooth: a face follows the majority of its edge neighbours, a few times over.
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)   # glTF splits verts at UV seams
bm.faces.ensure_lookup_table()
nbr = [[l.index for e in f.edges for l in e.link_faces if l.index != f.index] for f in bm.faces]
bm.free()
for _ in range(4):
    votes = np.array([np.mean(cape[n]) if n else cape[i] for i, n in enumerate(nbr)])
    cape = np.where(votes > 0.5, True, np.where(votes < 0.5, False, cape))

# Then islands: a patch of either side smaller than a hand is a stray - a dark crease in the
# cloth read as not-blue, a gold rivet read as hem - and joins whatever surrounds it.
def flip_small(mask, limit=40, strays_below=None):
    """Clear the components of `mask` smaller than `limit`. With `strays_below`, also every
    component but the largest that sits below that height: a buckle the cape closed around
    is cut off from the body, and left alone it would ride whichever limb it was weighted to."""
    seen, comps = np.zeros(nf, bool), []
    for s in range(nf):
        if seen[s] or not mask[s]:
            continue
        comp, stack = [], [s]; seen[s] = True
        while stack:
            f = stack.pop(); comp.append(f)
            for n in nbr[f]:
                if mask[n] and not seen[n]:
                    seen[n] = True; stack.append(n)
        comps.append(comp)
    biggest = max(comps, key=len)
    for comp in comps:
        low = strays_below is not None and comp is not biggest and cen[comp, 2].max() < strays_below
        if len(comp) < limit or low:
            mask[comp] = False
    return mask
body_mask = flip_small(~cape, strays_below=0.75)    # the eyes are islands of their own
cape = flip_small(~body_mask)

face_part = np.where(cape, "cape", face_limb)
print("[knight_tripo] faces per part:", {p: int((face_part == p).sum()) for p in LIMBS + ["cape"]})

# Pin the cape to the chest so lowering the arms leaves it hanging where it is. On the skinned
# Knight it gets a bone of its own instead, hinged across the collar, so it can stream back
# the way the rigid cape node does.
if SKINNED:
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    inv = world.inverted()
    cb = arm.data.edit_bones.new("mixamorig:Cape")
    cb.head, cb.tail = inv @ Vector(CAPE_HINGE), inv @ Vector((CAPE_HINGE[0], CAPE_HINGE[1] + 0.05, 0.35))
    cb.parent = arm.data.edit_bones["mixamorig:Spine2"]
    bpy.ops.object.mode_set(mode="OBJECT")
    body.vertex_groups.new(name="mixamorig:Cape")
spine2 = body.vertex_groups["mixamorig:Cape" if SKINNED else "mixamorig:Spine2"]
cape_verts = sorted(set(fv[cape].ravel().tolist()))
for vi in cape_verts:
    for g in list(me.vertices[vi].groups):
        body.vertex_groups[g.group].remove([vi])
    spine2.add([vi], 1.0, "REPLACE")

# ------------------------------------------------------------------ re-pose
pb = arm.pose.bones
def aim(name, direction):
    """Swing a bone so its length points along `direction` (world), keeping its head."""
    bone = pb["mixamorig:" + name]
    m = world @ bone.matrix
    cur = (m.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = cur.rotation_difference(Vector(direction).normalized())
    new = Matrix.Translation(m.translation) @ q.to_matrix().to_4x4() @ m.to_3x3().to_4x4()
    bone.matrix = world.inverted() @ new
    bpy.context.view_layer.update()

def H(n):
    return world @ pb["mixamorig:" + n].head

def turn_bone(name, axis, angle):
    """Rotate a bone about a world axis through its own head."""
    bone = pb["mixamorig:" + name]
    m = world @ bone.matrix
    r = Matrix.Rotation(angle, 4, Vector(axis).normalized())
    bone.matrix = world.inverted() @ (Matrix.Translation(m.translation) @ r @ Matrix.Translation(-m.translation) @ m)
    bpy.context.view_layer.update()

def fist_up(side):
    """Roll the hand about its own length until the knuckles stand vertical, index on top -
    the only way a fist holds a grip that points straight up."""
    f = (world @ pb[f"mixamorig:{side}Hand"].matrix).to_3x3().col[1].normalized()
    k = H(f"{side}HandIndex1") - H(f"{side}HandPinky1")
    k_flat = (k - f * k.dot(f)).normalized()
    up = Vector((0, 0, 1)); up = (up - f * up.dot(f)).normalized()
    ang = k_flat.angle(up)
    if k_flat.cross(up).dot(f) < 0:
        ang = -ang
    turn_bone(f"{side}Hand", f, ang)

def make_fist(side, joints, thumb):
    """Close the fingers towards the palm, joint by joint. The palm is found from the knuckle
    line and the hand's length, mirrored for the left hand."""
    f = (world @ pb[f"mixamorig:{side}Hand"].matrix).to_3x3().col[1].normalized()
    k = (H(f"{side}HandIndex1") - H(f"{side}HandPinky1")).normalized()
    palm = (k.cross(f) if side == "Right" else f.cross(k)).normalized()
    axis = f.cross(palm)
    for finger in ("Index", "Middle", "Ring", "Pinky"):
        for j, deg in zip((1, 2, 3), joints):
            turn_bone(f"{side}Hand{finger}{j}", axis, math.radians(deg))
    for j, deg in zip((1, 2, 3), thumb):
        turn_bone(f"{side}HandThumb{j}", axis, math.radians(deg))

# Sword arm (the model's right, -X): upper arm down at the side, forearm out front, fist at
# the hip - where the old Knight held his grip, so the clips land the blade where they did.
aim("RightArm", (-0.28, -0.12, -1.0))
aim("RightForeArm", (-0.08, -1.0, -0.30))
aim("RightHand", (-0.05, -1.0, -0.25))
fist_up("Right")
make_fist("Right", (75, 95, 70), thumb=(20, 45, 40))
# Free arm: relaxed, a little forward.
aim("LeftArm", (0.26, -0.02, -1.0))
aim("LeftForeArm", (0.16, -0.30, -1.0))
aim("LeftHand", (0.10, -0.30, -1.0))
make_fist("Left", (25, 30, 20), thumb=(0, 10, 10))           # relaxed, half closed

# The middle of the grip: the hollow the curled middle finger rings.
fist = sum((H(f"RightHandMiddle{j}") for j in (1, 2, 3, 4)), Vector()) / 4

dg = bpy.context.evaluated_depsgraph_get()
posed = bpy.data.meshes.new_from_object(body.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
posed.transform(body.matrix_world)
# Skinned to an arm yet, once the arm is down, nowhere near it: slivers of the cape's front edge
# the auto-rig gave the arm, now hanging off at the knee. Dropped - there are a handful.
pc = np.zeros(nf * 3); posed.polygons.foreach_get("center", pc); pc = pc.reshape(-1, 3)
def posed_seg(n):
    bone = pb["mixamorig:" + n]
    return np.array(world @ bone.head), np.array(world @ bone.tail)
d_posed = np.min([dist_to(pc, *posed_seg(n)) for n in ARMS], axis=0)
stray = np.isin(face_part, ["armL", "armR"]) & (d_posed > 0.08)
face_part = np.where(stray, "drop", face_part)
print("[knight_tripo] dropped", int(stray.sum()), "stray arm faces")
# ------------------------------------------------------------------ flat colour
X = colour.astype(np.float64)
rng = np.random.default_rng(7)
C = X[rng.choice(len(X), CLUSTERS, replace=False)]
for _ in range(60):
    lab = ((X[:, None, :] - C[None]) ** 2).sum(-1).argmin(1)
    C = np.array([X[lab == k].mean(0) if (lab == k).any() else C[k] for k in range(CLUSTERS)])

def linear(c):
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]

mats = []
for k in range(CLUSTERS):
    m = bpy.data.materials.new(f"KN • tone {k:02d}")
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    rgb = linear(C[k])
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    grey = max(C[k]) - min(C[k]) < 0.06 and np.mean(C[k]) > 0.45
    bsdf.inputs["Metallic"].default_value = 0.35 if grey else 0.0          # the plate steel
    bsdf.inputs["Roughness"].default_value = 0.45 if grey else 0.7
    m.diffuse_color = (*rgb, 1)
    mats.append(m)
# Tripo's textured material still holds slot 0; leave it there and every index is one off.
posed.materials.clear()
for m in mats:
    posed.materials.append(m)
posed.polygons.foreach_set("material_index", lab.astype(np.int32))
posed.update()


if SKINNED:
    # The posed mesh becomes the bind pose: swap it in, then make the pose the rest pose, so
    # the skeleton's rest IS the stance and every bone reads zero there.
    bm = bmesh.new(); bm.from_mesh(posed); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f, fp in zip(bm.faces, face_part) if fp == "drop"], context="FACES")
    bm.to_mesh(posed); bm.free()
    old_mesh = body.data
    body.data = posed
    posed.name = "Knight • skinned body"
    body.name = "Knight • skinned body"
    body.matrix_world = Matrix.Identity(4)
    bpy.data.meshes.remove(old_mesh)
    for im in list(bpy.data.images):
        bpy.data.images.remove(im)
    for m in list(bpy.data.materials):
        if not m.name.startswith("KN •"):
            bpy.data.materials.remove(m)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    top = max(v.co.z for v in posed.vertices)
    k = top / OLD_HEIGHT
    def bone_child(name, bone, at):
        """An empty riding `bone`, at `at`, with no rotation in model space - so what hangs
        off it is oriented exactly as it was on the rigid Knight."""
        e = bpy.data.objects.new(name, None)
        scene.collection.objects.link(e)
        e.parent, e.parent_type, e.parent_bone = arm, "BONE", "mixamorig:" + bone
        # Twice: the first assignment is solved against a bone matrix Blender has not finished
        # re-evaluating after armature_apply, and lands a few centimetres off.
        for _ in range(3):
            bpy.context.view_layer.update()
            e.matrix_world = Matrix.Translation(at)
        bpy.context.view_layer.update()
        print(f"[knight_tripo] {name} on {bone}: {[round(c, 4) for c in e.matrix_world.translation]}")
        return e
    grip = bone_child("grip", "RightHand", fist)
    for key, meshes in weapons.items():
        wm = meshes[0]
        for extra in meshes[1:]:
            wm_bm = bmesh.new(); wm_bm.from_mesh(wm); wm_bm.from_mesh(extra); wm_bm.to_mesh(wm); wm_bm.free()
        # The blade stays in game units - the space every weapon in assets/gear was fitted in -
        # and the object carries the shrink to this file's units. export_skinned_hero.py
        # undoes both once the skeleton is scaled up to the hero's height.
        ob = bpy.data.objects.new(key, wm)
        scene.collection.objects.link(ob)
        ob.parent = grip
        ob.matrix_parent_inverse = Matrix.Identity(4)
        ob.location = (0, 0, 0)
        ob.scale = (k, k, k)
    bone_child("head", "Head", joints_neck := world @ pb["mixamorig:Neck"].head)
    scene["knight_top"] = round(top, 4)
    scene["knight_fist"] = [round(c, 4) for c in fist]
    scene["knight_neck"] = [round(c, 4) for c in joints_neck]
    out = OUT.replace(".blend", "_skinned.blend")
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print("[knight_tripo] saved", out, "top", round(top, 4))
    sys.exit(0)

joints = {n: world @ pb["mixamorig:" + n].matrix.translation for n in
          ("Hips", "Neck", "Spine2", "RightArm", "LeftArm", "RightUpLeg", "LeftUpLeg")}
for o in list(scene.objects):
    bpy.data.objects.remove(o)
for im in list(bpy.data.images):
    bpy.data.images.remove(im)

# ------------------------------------------------------------------ objects and collections
col_body = bpy.data.collections.new("KN • Body"); scene.collection.children.link(col_body)
col_weap = bpy.data.collections.new("KN • Weapon"); scene.collection.children.link(col_weap)
NAMES = {
    "torso": "Torso • cuirass tabard and belt", "head": "Head • face and hair",
    "armL": "Arm • sword arm -1", "armR": "Arm • free arm 1",
    "legL": "Leg • greave and sabaton -1", "legR": "Leg • greave and sabaton 1",
    "cape": "Cape • blue mantle crimson lining",
}
for part, name in NAMES.items():
    pm = posed.copy()
    bm = bmesh.new(); bm.from_mesh(pm); bm.faces.ensure_lookup_table()
    drop = [f for f, fp in zip(bm.faces, face_part) if fp != part]
    bmesh.ops.delete(bm, geom=drop, context="FACES")
    bm.to_mesh(pm); bm.free()
    pm.name = name
    ob = bpy.data.objects.new(name, pm)
    col_body.objects.link(ob)

top = max(v.co.z for v in posed.vertices)
k = top / OLD_HEIGHT          # old game units -> these: the same share of the hero's height
for key, meshes in weapons.items():
    label = "Sword • knight's longsword" if key == "weapon" else "Katana • curved blade"
    for i, wm in enumerate(meshes):
        wm.transform(Matrix.Translation(fist) @ Matrix.Scale(k, 4))
        ob = bpy.data.objects.new(f"{label} {i:02d}", wm)
        col_weap.objects.link(ob)

# The joints the recipe's pivots come from, recorded where a person can read them.
scene["knight_joints"] = {n: [round(c, 4) for c in v] for n, v in joints.items()}
scene["knight_fist"] = [round(c, 4) for c in fist]
scene["knight_top"] = round(top, 4)
print("[knight_tripo] top of hair", round(top, 4))
print("[knight_tripo] fist", [round(c, 4) for c in fist])
for n, v in joints.items():
    print(f"[knight_tripo] {n:11} {[round(c, 4) for c in v]}")

bpy.data.meshes.remove(posed)
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print("[knight_tripo] saved", OUT)

if DEBUG:
    scene.render.resolution_x, scene.render.resolution_y = 600, 800
    wd = bpy.data.worlds.new("w"); scene.world = wd; wd.use_nodes = True
    bg = next(n for n in wd.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.8, 0.8, 0.8, 1); bg.inputs[1].default_value = 1.5
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scene.collection.objects.link(cam)
    scene.camera = cam; cam.data.type = "ORTHO"; cam.data.ortho_scale = 1.15
    out = os.environ.get("KN_DEBUG_OUT", "/tmp/kn_debug")
    for view, ang in (("front", 0), ("side", 90), ("back", 180), ("q", 35)):
        a = math.radians(ang)
        cam.location = (math.sin(a) * 3, -math.cos(a) * 3, 0.5)
        cam.rotation_euler = (math.radians(90), 0, a)
        scene.render.filepath = f"{out}_{view}.png"
        bpy.ops.render.render(write_still=True)
    capeob = next(o for o in scene.objects if o.name.startswith("Cape"))
    for hide in (True, False):
        for o in scene.objects:
            if o.type == "MESH":
                o.hide_render = (o is capeob) == hide
        for view, ang in (("front", 0), ("back", 180)):
            a = math.radians(ang)
            cam.location = (math.sin(a) * 3, -math.cos(a) * 3, 0.5)
            cam.rotation_euler = (math.radians(90), 0, a)
            scene.render.filepath = f"{out}_{'nocape' if hide else 'capeonly'}_{view}.png"
            bpy.ops.render.render(write_still=True)
