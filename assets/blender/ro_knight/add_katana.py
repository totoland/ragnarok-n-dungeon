# Katana: a second weapon for the Knight, built into ro_knight.blend next to the sword and
# exported as its own limb (`weapon_katana`, see tools/export_heroes.py). Runs standalone
# and headless, once, and is idempotent:
#
#     /Applications/Blender.app/Contents/MacOS/Blender -b ro_knight.blend -P add_katana.py
#
# The katana shares the sword's grip frame exactly - the hand closes around the same
# centre, the blade rises along the same axis - so every attack clip swings it the way it
# swings the sword. Nothing here touches the sword, the hand or the pivots.
#
# Frame (Blender units, Z up): H is the grip centre the exporter uses as the `weapon`
# pivot; g the blade axis (straight up, as raise_sword.py left it); a runs across the
# blade's width at the sword's 20° yaw; f is the flat's normal. The cutting edge sits at -a
# (away from the body), the spine at +a, and the sori bends the blade toward the spine.
import math
import os
from math import cos, sin, pi

import bpy
from mathutils import Vector

scene = bpy.data.scenes['RO Knight | Studio']
if bpy.context.window:
    bpy.context.window.scene = scene
root = bpy.data.objects['RO KNIGHT | model root']
coll = bpy.data.objects['Sword | leather grip'].users_collection[0]

for o in [o for o in bpy.data.objects if o.name.startswith('Katana |')]:
    bpy.data.objects.remove(o, do_unlink=True)

H = Vector((-0.80, -0.408, 2.00))
g = Vector((0, 0, 1))
yaw = math.radians(-20)
a = Vector((cos(yaw), sin(yaw), 0))
f = g.cross(a).normalized()


def P(t, w=0.0, d=0.0):
    return H + g * t + a * w + f * d


def existing(name):
    return bpy.data.materials[name]


def newmat(name, rgb, metallic, rough):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*rgb, 1)
    return m


steel = existing('Armor | polished pearl steel')
bright = existing('Armor | bevel highlights')
shadow = existing('Armor | lavender steel shadow')
black = existing('Leather | dark edges')
gold = existing('Armor | royal gold')
iron = newmat('Katana | iron fittings', (0.13, 0.13, 0.155), 0.7, 0.45)   # dark, but not lost against the gauntlet
ray = newmat('Katana | rayskin', (0.88, 0.84, 0.75), 0.0, 0.55)
brass = newmat('Katana | brass habaki', (0.66, 0.47, 0.17), 0.8, 0.32)

group = bpy.data.objects.new('Katana | edit group', None)
coll.objects.link(group)
group.parent = root
group.matrix_world = Vector(H).to_track_quat('Z', 'Y').to_matrix().to_4x4()
group.matrix_world.translation = H
group['Weapon'] = 'katana'
group['Grip center'] = list(H)
group['Blade direction'] = list(g)


def mesh(name, verts, faces, mats, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    for m in (mats if isinstance(mats, list) else [mats]):
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = smooth
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    o.parent = group
    o.matrix_parent_inverse = group.matrix_world.inverted()   # verts stay in world space
    return o


def loft(name, rings, mats, cap=True, smooth=True, side_mat=None):
    """Rings of equal length, quads between them, optional caps. side_mat(j) picks the
    material of the strip between ring point j and j+1."""
    n = len(rings[0])
    verts = [p for r in rings for p in r]
    faces, idx = [], []
    for i in range(len(rings) - 1):
        for j in range(n):
            faces.append((i * n + j, i * n + (j + 1) % n, (i + 1) * n + (j + 1) % n, (i + 1) * n + j))
            idx.append(side_mat(j) if side_mat else 0)
    if cap:
        faces.append(tuple(range(n))[::-1]); idx.append(0)
        faces.append(tuple((len(rings) - 1) * n + j for j in range(n))); idx.append(0)
    o = mesh(name, verts, faces, mats, smooth)
    for k, p in enumerate(o.data.polygons):
        p.material_index = idx[k]
    return o


def oval(t, rw, rd, n=16, w0=0.0, d0=0.0, lobes=0.0):
    pts = []
    for k in range(n):
        th = 2 * pi * k / n
        m = 1 + lobes * cos(4 * th)
        pts.append(P(t, w0 + rw * m * cos(th), d0 + rd * m * sin(th)))
    return pts


def ellipsoid(name, centre, size, mat, n=12, rings=8):
    rs = []
    for i in range(1, rings):
        ph = pi * i / rings
        r = sin(ph)
        rs.append([centre + a * (size[0] * r * cos(2 * pi * k / n)) + f * (size[1] * r * sin(2 * pi * k / n)) + g * (size[2] * cos(ph)) for k in range(n)])
    return loft(name, rs, mat)


# ------------------------------------------------------------------ blade
T0, T1 = 0.46, 2.34            # habaki top to tip, along g. The fittings sit clear of the
                               # gauntlet, which rises well past the leather grip's top.
L = T1 - T0
SORI = 0.12                    # how far the tip drifts toward the spine
rings = []
N = 44
for i in range(N + 1):
    u = i / N
    t = T0 + L * u
    bend = SORI * u * u
    if u < 0.84:
        w = 0.105 - 0.018 * (u / 0.84)          # gentle taper along the body
        d = 0.026 - 0.010 * (u / 0.84)
    else:
        k = (u - 0.84) / 0.16                    # kissaki: the edge sweeps up to the spine
        w = 0.087 * math.sqrt(max(0.0, 1 - k * k)) + 0.004
        d = 0.016 - 0.011 * k
    spine = bend + w / 2
    ridge = bend + w / 2 - w * 0.42               # shinogi, the thickest line
    edge = bend - w / 2
    rings.append([P(t, spine, d / 2), P(t, ridge, d * 0.58), P(t, edge, 0.0), P(t, ridge, -d * 0.58), P(t, spine, -d / 2)])
blade = loft('Katana | curved single-edge blade', rings, [steel, bright, shadow], cap=True, smooth=True,
             side_mat=lambda j: [0, 1, 1, 0, 2][j])
# The polish line: a bright hair along the shinogi on the front face.

# ------------------------------------------------------------------ fittings at the guard
# Habaki: a brass collar hugging the blade root.
loft('Katana | brass habaki', [oval(0.395, 0.074, 0.032, 12), oval(0.44, 0.077, 0.033, 12), oval(0.53, 0.070, 0.029, 12)], brass, smooth=False)
# Tsuba: a dark iron disc, four-lobed, with a bright rim showing between two seppa.
loft('Katana | iron tsuba', [oval(0.362, 0.235, 0.235, 40, lobes=0.045), oval(0.396, 0.235, 0.235, 40, lobes=0.045)], iron, smooth=False)
loft('Katana | tsuba rim', [oval(0.370, 0.246, 0.246, 40, lobes=0.045), oval(0.388, 0.246, 0.246, 40, lobes=0.045)], bright, smooth=False)
for t in (0.345, 0.402):
    loft('Katana | seppa %.3f' % t, [oval(t, 0.105, 0.105, 24), oval(t + 0.012, 0.105, 0.105, 24)], bright, smooth=False)

# ------------------------------------------------------------------ tsuka (handle)
TB, TT = -0.62, 0.345
core = loft('Katana | rayskin core', [oval(TB + 0.02, 0.050, 0.034), oval(TT, 0.058, 0.040)], ray)
# The silk wrap: a black sleeve, slightly proud of the core, with the diamond windows of
# rayskin showing through as thin ivory rhombi on the front and back faces.
loft('Katana | black silk wrap', [oval(TB + 0.03, 0.055, 0.038), oval(TT - 0.03, 0.063, 0.044)], black)
step = 0.115
k = 0
for side in (1, -1):
    t = TT - 0.09 - (0.5 * step if side < 0 else 0)
    while t > TB + 0.09:
        rd = 0.044 - 0.006 * (TT - t) / (TT - TB)
        c = P(t, 0, side * (rd + 0.003))
        pts = [c + g * 0.048, c + a * 0.026, c - g * 0.048, c - a * 0.026]
        mesh('Katana | rayskin window %d' % k, pts, [(0, 1, 2), (0, 2, 3)] if side > 0 else [(0, 2, 1), (0, 3, 2)], ray, smooth=False)
        k += 1
        t -= step
# Fuchi at the guard end and kashira capping the pommel, both iron; menuki under the wrap.
loft('Katana | iron fuchi', [oval(0.275, 0.066, 0.047), oval(0.345, 0.068, 0.048)], iron, smooth=False)
loft('Katana | iron kashira', [oval(TB - 0.045, 0.030, 0.020), oval(TB - 0.02, 0.052, 0.036), oval(TB + 0.035, 0.058, 0.040)], iron)
ellipsoid('Katana | gold menuki front', P(-0.10, 0.0, 0.046), (0.030, 0.011, 0.052), gold)
ellipsoid('Katana | gold menuki back', P(-0.30, 0.0, -0.046), (0.030, 0.011, 0.052), gold)

scene['Katana'] = 'Second weapon, exported as weapon_katana. Built by add_katana.py.'
bpy.context.view_layer.update()
n = len([o for o in bpy.data.objects if o.name.startswith('Katana |')])
print('KATANA BUILT', n, 'objects; tip at', tuple(round(c, 3) for c in rings[-1][0]))
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
