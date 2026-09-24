"""Bake Mixamo animations onto a skinned hero and export the GLB the game plays.

    tools/export_skinned_hero.sh knight assets/blender/knight_tripo/knight_tripo_skinned.blend \\
        walk=anims/Standard_Walk.fbx [idle=...] ...

The rigid heroes (export_heroes.py) are posed by turning whole limbs. A hero that arrives with
a skeleton - Tripo's Mixamo-preset rig - is kept on it instead, so its knees and elbows bend,
and a Mixamo animation can be dropped onto it rather than approximated. See
src/render/heroes.js (skinned heroes) for how the game plays these clips and still drives the
same bones from the procedural channels for everything no clip covers.

Retargeting. The two skeletons share bone NAMES but not their rest poses - Mixamo rests in a
T-pose, Tripo in an A-pose, and the hero's bind pose is its game stance with the arms down -
and not necessarily their bone rolls. Copying local rotations would carry all of that
across. So each bone is matched in world space instead:

    C  = the turn that points the target bone's rest direction along the source's rest one
    D  = the source bone's world rotation now, relative to its own rest
    W  = D · C · rest(target)

At the source's rest, D is identity and the target stands in the source's T-pose - which is
what the clip was authored against. C is the shortest arc, so the target keeps its own twist.
The hips also carry translation: the vertical bob and sideways sway, scaled to the hero's leg
length; the forward travel is dropped, because the sim moves the hero, not the clip.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

M = "mixamorig:"
HEIGHT = {"knight": 1.9}          # game units, as the rigid recipes had them


def rot3(m):
    return m.to_3x3().normalized()


def depth(b):
    n = 0
    while b.parent:
        b, n = b.parent, n + 1
    return n


def retarget(target, fbx, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=fbx)
    imported = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in imported if o.type == "ARMATURE")
    act = src.animation_data.action
    lo, hi = (int(round(x)) for x in act.frame_range)

    sw, tw = src.matrix_world, target.matrix_world
    sw3, tw3 = rot3(sw), rot3(tw)
    names = sorted((b.name for b in target.data.bones if b.name in src.data.bones),
                   key=lambda n: depth(target.data.bones[n]))

    def rest_dir(arm, w, n):
        b = arm.data.bones[n]
        return ((w @ b.tail_local) - (w @ b.head_local)).normalized()

    corr, rest_s, rest_t = {}, {}, {}
    for n in names:
        rest_s[n] = sw3 @ rot3(src.data.bones[n].matrix_local)
        rest_t[n] = tw3 @ rot3(target.data.bones[n].matrix_local)
        corr[n] = rest_dir(target, tw, n).rotation_difference(rest_dir(src, sw, n)).to_matrix()

    hips = M + "Hips"
    s_hips0 = sw @ src.data.bones[hips].head_local
    t_hips0 = tw @ target.data.bones[hips].head_local
    leg = t_hips0.z / s_hips0.z

    scene = bpy.context.scene
    info = {}
    # A jump's shape, off the source hips (the target's drop the rise - the sim does the
    # lifting): leaving the ground, the top, and touching down again.
    zs = []
    for f in range(lo, hi + 1):
        scene.frame_set(f)
        zs.append((sw @ src.pose.bones[hips].head).z)
    base, top = zs[0], max(zs)
    if top - base > 0.15 * s_hips0.z:
        apex = zs.index(top)
        cut = base + 0.25 * (top - base)
        up = next(i for i in range(apex, -1, -1) if zs[i] < cut)
        down = next((i for i in range(apex, len(zs)) if zs[i] < cut), len(zs) - 1)
        fps = scene.render.fps
        info["takeoff"], info["apex"], info["land"] = up / fps, apex / fps, down / fps
        info["airborne"] = True
    new = bpy.data.actions.new(name)
    new.use_fake_user = True
    target.animation_data_create()
    target.animation_data.action = new
    for pb in target.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.matrix_basis = Matrix.Identity(4)

    scene = bpy.context.scene
    tinv = tw.inverted()
    for f in range(lo, hi + 1):
        scene.frame_set(f)
        for n in names:
            pb = target.pose.bones[n]
            d = rot3(sw @ src.pose.bones[n].matrix) @ rest_s[n].inverted()
            want = d @ corr[n] @ rest_t[n]
            head = tw @ pb.head if n != hips else None
            if n == hips:
                sh = sw @ src.pose.bones[hips].head
                off = sh - s_hips0
                # Drop the forward travel; on a jump drop the rise too - the sim flies the hero,
                # and hips the clip also lifts would double the jump.
                head = t_hips0 + Vector((off.x, 0.0, 0.0 if info.get("airborne") else off.z)) * leg
            pb.matrix = tinv @ (Matrix.Translation(head) @ want.to_4x4())
            bpy.context.view_layer.update()
        for n in names:
            pb = target.pose.bones[n]
            pb.keyframe_insert("rotation_quaternion", frame=f - lo)
            if n == hips:
                pb.keyframe_insert("location", frame=f - lo)
    # The strike: the frame the sword hand is moving fastest. The game lands a slash's hit at
    # a fixed moment of a much shorter attack, so the clip is time-warped to put this frame
    # there (render/heroes.js) - otherwise the number pops while the blade is still overhead.
    hand, speed, prev = target.pose.bones[M + "RightHand"], [], None
    for f in range(0, hi - lo + 1):
        scene.frame_set(f)
        p = tw @ hand.head
        speed.append(0.0 if prev is None else (p - prev).length)
        prev = p
    new["strike"] = max(range(len(speed)), key=lambda i: speed[i]) / scene.render.fps
    for k, v in info.items():
        new[k] = v

    for o in imported:
        bpy.data.objects.remove(o, do_unlink=True)
    print(f"[skinned] {name}: {hi - lo + 1} frames from {os.path.basename(fbx)}, {len(names)} bones, leg x{leg:.2f}")
    return new


def main():
    argv = sys.argv[sys.argv.index("--") + 1:]
    hero, anims = argv[0], dict(a.split("=", 1) for a in argv[1:])
    target = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    scene = bpy.context.scene
    scene.render.fps = 30

    actions = [retarget(target, path, name) for name, path in anims.items()]
    # Anchors are solved against the REST skeleton: no action, no NLA yet - with the strips in
    # place Blender evaluates them all at once and the hat lands wherever that pose put the head.
    target.animation_data.action = None
    for pb in target.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    top = scene["knight_top"]
    s = HEIGHT[hero] / top
    target.scale = (s, s, s)
    bpy.context.view_layer.update()
    # What rides a bone must not grow with the skeleton: the hat is fitted in game units off
    # the neck and a weapon from assets/gear in game units about its grip, exactly as on the
    # rigid heroes. So the anchors go back to scale 1 in the world, and so do their blades.
    for o in bpy.data.objects:
        if o.parent is target and o.parent_type == "BONE":
            o.matrix_world = Matrix.Translation(o.matrix_world.translation)
    bpy.context.view_layer.update()
    for o in bpy.data.objects:
        if o.parent is not None and o.parent.parent is target and o.parent.parent_type == "BONE":
            o.scale = (1, 1, 1)
    bpy.context.view_layer.update()

    # Every action goes out as its own glTF animation, named after it.
    for a in actions:
        tr = target.animation_data.nla_tracks.new()
        tr.name = a.name
        tr.strips.new(a.name, 0, a)

    for o in bpy.data.objects:
        o.select_set(o is target or o.parent is not None)
    bpy.context.view_layer.objects.active = target
    out = os.path.join("assets", "heroes", f"{hero}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out, export_format="GLB", use_selection=True, export_yup=True,
        export_skins=True, export_animations=True, export_animation_mode="NLA_TRACKS",
        export_force_sampling=True, export_frame_range=False,
        export_materials="EXPORT", export_normals=True, export_texcoords=False, export_extras=False,
        export_lights=False, export_cameras=False,
    )

    def yup(v):
        return [round(v[0] * s, 4), round(v[2] * s, 4), round(-v[1] * s, 4)]

    meta_path = os.path.join("assets", "heroes", "meta.json")
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    meta[hero] = {
        "height": HEIGHT[hero], "front": "+z", "skinned": True,
        "pivot": {"root": [0, 0, 0], "head": yup(scene["knight_neck"]), "weapon": yup(scene["knight_fist"])},
        # The nodes riding the skeleton, by name - tools/items_doc.mjs reads a baked weapon
        # variant (weapon_katana) off this list.
        "parts": {o.name: {} for o in bpy.data.objects
                  if o.parent is not None and o.parent.parent is target and o.type == "MESH"},
        "clips": {a.name: {"dur": round((a.frame_range[1] - a.frame_range[0]) / scene.render.fps, 3),
                           "strike": round(a["strike"], 3),
                           **{k: round(a[k], 3) for k in ("takeoff", "apex", "land") if k in a}} for a in actions},
    }
    json.dump(meta, open(meta_path, "w"), indent=2)
    print(f"[skinned] {hero}: -> {out} ({os.path.getsize(out) // 1024} KB), clips {list(meta[hero]['clips'])}")


main()
