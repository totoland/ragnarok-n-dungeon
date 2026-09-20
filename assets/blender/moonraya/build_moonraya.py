# Moonraya | the Moon Fox Queen, boss of Phaelan. Built to Toto's reference: tall white fox
# ears, silver hair past the waist, an ivory kimono lined in deep red over a black obi, one
# large tail, bare feet, a gold crescent with a bell in her left hand and a small bell in her
# right. The two blue spirit flames in the reference are the game's own effect and are not
# modelled.
#
# Runs inside Blender. Standalone and idempotent: it builds its own scene, so re-running it
# replaces the model rather than stacking a second one on the first.
#
#   /Applications/Blender.app/Contents/MacOS/Blender -b -P assets/blender/moonraya/build_moonraya.py
#
# Collection names are what tools/export_heroes.py groups limbs by - see classify_moonraya.
import bpy, math, os
from mathutils import Vector
from math import sin, cos, pi

OUT = os.path.dirname(os.path.abspath(__file__))

for s in list(bpy.data.scenes):
    if s.name.startswith('Moonraya'):
        bpy.data.scenes.remove(s)
scene = bpy.data.scenes.new('Moonraya | Studio')
bpy.context.window.scene = scene
groups = {}
for name in ['01 Body', '02 Robe', '03 Hair', '04 Ears', '05 Tail', '06 Bell', '07 Studio']:
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    groups[name] = c
group = groups['01 Body']


def _lin(h):
    rgb = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    return [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]


def mat(name, h, metallic=0, rough=.65):
    rgb = _lin(h)
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    n = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = (*rgb, 1)
    n.inputs['Roughness'].default_value = rough
    n.inputs['Metallic'].default_value = metallic
    return m


def glow(name, h, strength=6.0, rough=.4):
    m = mat(name, h, 0, rough)
    n = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    rgb = _lin(h)
    for key in ('Emission Color', 'Emission'):
        if key in n.inputs:
            n.inputs[key].default_value = (*rgb, 1)
            break
    if 'Emission Strength' in n.inputs:
        n.inputs['Emission Strength'].default_value = strength
    return m


def move(o, name, m):
    o.name = name
    for c in list(o.users_collection):
        c.objects.unlink(o)
    group.objects.link(o)
    if m:
        o.data.materials.append(m)
    return o


def mesh(name, vs, fs, m):
    d = bpy.data.meshes.new(name)
    d.from_pydata(vs, [], fs)
    d.update()
    o = bpy.data.objects.new(name, d)
    group.objects.link(o)
    if m:
        d.materials.append(m)
    return o


def ell(name, p, s, m, seg=20, rings=12, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=p)
    o = move(bpy.context.object, name, m)
    o.scale = s
    for f in o.data.polygons:
        f.use_smooth = smooth
    return o


def box(name, p, s, m):
    bpy.ops.mesh.primitive_cube_add(location=p)
    o = move(bpy.context.object, name, m)
    o.scale = s
    return o


def tube(name, pts, radii, m, n=10, elliptic=1, smooth=True):
    pts = [Vector(p) for p in pts]; vs = []; fs = []
    for i, p in enumerate(pts):
        t = (pts[min(i+1, len(pts)-1)] - pts[max(0, i-1)]).normalized()
        ref = Vector((0, 1, 0))
        if abs(t.dot(ref)) > .95:
            ref = Vector((1, 0, 0))
        u = t.cross(ref).normalized(); v = t.cross(u).normalized()
        r = radii[i] if isinstance(radii, (list, tuple)) else radii
        for j in range(n):
            vs.append(p + r*(cos(j*2*pi/n)*u + sin(j*2*pi/n)*v*elliptic))
    for i in range(len(pts)-1):
        for j in range(n):
            a = i*n+j; b = i*n+(j+1) % n; fs.append((a, b, b+n, a+n))
    fs.extend([tuple(reversed(range(n))), tuple((len(pts)-1)*n+j for j in range(n))])
    o = mesh(name, vs, fs, m)
    for f in o.data.polygons:
        f.use_smooth = smooth
    return o


def loft(name, rings, m, n=20, smooth=True):
    vs = []; fs = []
    for z, rx, ry, x, y in rings:
        for i in range(n):
            a = 2*pi*i/n; vs.append((x+rx*cos(a), y+ry*sin(a), z))
    for k in range(len(rings)-1):
        for j in range(n):
            a = k*n+j; b = k*n+(j+1) % n; fs.append((a, b, b+n, a+n))
    fs.extend([tuple(reversed(range(n))), tuple((len(rings)-1)*n+j for j in range(n))])
    o = mesh(name, vs, fs, m)
    for f in o.data.polygons:
        f.use_smooth = smooth
    return o


def band(name, z, rx, ry, h, m, x=0, y=0):
    return loft(name, [(z-h/2, rx, ry, x, y), (z+h/2, rx, ry, x, y)], m, 32)


def ribbon(name, a, b, w, m, thick=.012):
    """A flat strip between two points: cords, tassels, the red trim on a collar."""
    a, b = Vector(a), Vector(b)
    d = (b-a).normalized()
    side = d.cross(Vector((0, 1, 0)))
    if side.length < .3:
        side = d.cross(Vector((1, 0, 0)))
    side = side.normalized()*w/2
    f = Vector((0, thick, 0))
    vs = [a-side-f, a+side-f, b+side-f, b-side-f, a-side+f, a+side+f, b+side+f, b-side+f]
    fs = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return mesh(name, vs, fs, m)


# ------------------------------------------------------------------ palette
skin = mat('Skin', 'f6e3d8', 0, .55)
cloth = mat('Robe | ivory', 'efe3c6', 0, .78)
red = mat('Robe | red lining', '9e1d2a', 0, .62)
obi = mat('Obi | black', '17141a', 0, .7)
fur = mat('Fur | white', 'fbf8fc', 0, .9)
tailf = mat('Fur | tail', 'e7e2ef', 0, .95)   # a shade cooler, so it separates from the robe
inner = mat('Fur | inner ear', 'e3aeb4', 0, .95)
hairm = mat('Hair | silver', 'd6d1de', 0, .52)
gold = mat('Gold', 'd4a437', .85, .26)
amber = glow('Eye | amber', 'f0ad2c', 4.0)

HIP_Z = 1.72
SHOULDER_Z = 2.74
JOINT = {
    'hipL': Vector((-.16, 0, HIP_Z)), 'hipR': Vector((.16, 0, HIP_Z)),
    'shoulderL': Vector((-.34, 0, SHOULDER_Z)), 'shoulderR': Vector((.34, 0, SHOULDER_Z)),
    'handL': Vector((-.5, .06, 1.98)), 'handR': Vector((.5, .06, 1.98)),
    'neck': Vector((0, 0, 2.94)), 'head': Vector((0, 0, 3.26)),
}

# ------------------------------------------------------------------ legs (bare feet)
group = groups['01 Body']
for side, s in [('L', -1), ('R', 1)]:
    hip = JOINT['hip'+side]
    knee = Vector((s*.17, .01, .86))
    ankle = Vector((s*.16, -.01, .11))
    tube('Thigh '+side, [hip, (hip+knee)/2, knee], [.145, .125, .095], skin, 12)
    tube('Shin '+side, [knee, (knee+ankle)/2, ankle], [.095, .08, .062], skin, 12)
    ell('Foot | bare '+side, (s*.16, -.06, .055), (.075, .13, .055), skin, 14, 9)
    for t in range(4):                                  # toes, because she is barefoot
        ell('Toe %s%d' % (side, t), (s*(.11+t*.033), -.17, .04), (.018, .022, .017), skin, 8, 6)

# ------------------------------------------------------------------ torso
tube('Torso | trunk', [Vector((0, 0, HIP_Z-.05)), Vector((0, -.02, 2.2)), Vector((0, -.01, 2.5)),
                       Vector((0, 0, SHOULDER_Z+.04))], [.2, .175, .195, .215], skin, 16)
tube('Neck', [JOINT['neck']-Vector((0, 0, .1)), JOINT['neck']+Vector((0, 0, .2))], [.078, .066], skin, 10)
for side, s in [('L', -1), ('R', 1)]:
    sh = JOINT['shoulder'+side]
    elbow = Vector((s*.42, .04, 2.3))
    hand = JOINT['hand'+side]
    ell('Shoulder '+side, sh, (.1, .1, .09), skin, 12, 8)
    tube('Upper arm '+side, [sh, elbow], [.072, .058], skin, 10)
    tube('Forearm '+side, [elbow, hand], [.058, .044], skin, 10)
    ell('Hand '+side, hand + Vector((0, 0, -.05)), (.05, .04, .06), skin, 10, 7)

# ------------------------------------------------------------------ robe
group = groups['02 Robe']
# The skirt: from under the obi to the floor, flaring out and trailing behind.
loft('Robe | skirt', [
    (2.02, .245, .21, 0, 0), (1.7, .265, .23, 0, -.01), (1.2, .31, .275, 0, -.02),
    (.62, .37, .33, 0, -.04), (.12, .42, .38, 0, -.06), (.01, .435, .4, 0, -.07),
], cloth, 24)
loft('Robe | hem lining', [(.01, .44, .405, 0, -.07), (.1, .43, .395, 0, -.065)], red, 24)
# The train: the reference has the robe pooling behind her heels.
loft('Robe | train', [(.02, .5, .3, 0, -.5), (.015, .42, .24, 0, -.72), (.01, .3, .16, 0, -.9)], red, 20)
# The bodice, and the red lining showing as a V at the chest.
loft('Robe | bodice', [(2.02, .27, .23, 0, 0), (2.45, .25, .215, 0, 0),
                      (2.68, .27, .225, 0, 0), (2.78, .24, .2, 0, 0)], cloth, 20)
for s in (-1, 1):
    ribbon('Robe | collar %s' % ('L' if s < 0 else 'R'),
           (s*.055, -.19, 2.42), (s*.17, -.15, 2.82), .09, red, .02)
band('Robe | collar band', 2.8, .23, .205, .06, red)
# Obi: wide, black, with a red cord across it and the knot at the front.
band('Obi | sash', 2.06, .285, .245, .3, obi)
band('Obi | cord', 2.13, .295, .255, .035, red)
ell('Obi | knot', (0, -.25, 2.06), (.075, .05, .06), red, 12, 8)
for s in (-1, 1):
    ribbon('Obi | tassel %s' % ('L' if s < 0 else 'R'), (s*.05, -.27, 2.03), (s*.08, -.26, 1.6), .035, red)
# The gold crescent medallion on the front panel.
mcx = [(sin(a*pi/18)*.095, -.3, 1.66+cos(a*pi/18)*.095) for a in range(36)]
tube('Robe | moon medallion', mcx + [mcx[0]], .016, gold, 8)
# Sleeves: narrow at the shoulder, wide and open at the wrist.
for side, s in [('L', -1), ('R', 1)]:
    loft('Sleeve %s' % side, [
        (2.76, .1, .1, s*.33, .01), (2.5, .13, .125, s*.37, .02),
        (2.2, .165, .155, s*.43, .035), (1.99, .185, .175, s*.47, .045),
    ], cloth, 18)
    loft('Sleeve cuff %s' % side, [(1.99, .19, .18, s*.47, .045), (2.04, .185, .175, s*.465, .04)], red, 18)
    # The drape: the open half of the sleeve falls below the wrist, which is the shape that
    # makes a kimono sleeve read as one.
    loft('Sleeve drape %s' % side, [
        (2.2, .165, .155, s*.43, .035), (1.86, .2, .17, s*.45, .03), (1.62, .17, .14, s*.44, .02),
    ], cloth, 14)
    ribbon('Sleeve tie %s' % side, (s*.3, -.1, 2.6), (s*.44, -.08, 2.58), .07, red, .018)
    ell('Sleeve knot %s' % side, (s*.38, -.13, 2.59), (.035, .03, .03), red, 8, 6)

# ------------------------------------------------------------------ hair
group = groups['03 Hair']
# The crown sits BACK of the skull, not on top of it. Centred on the head it swallowed her
# whole - the first render was a cone with ears and no face anywhere on it.
ell('Hair | crown', (0, .075, 3.37), (.21, .2, .195), hairm, 20, 14)
for i, dx in enumerate((-.12, -.04, .04, .12)):
    box('Hair | fringe %d' % i, (dx, -.175, 3.43 - abs(dx)*.12), (.05, .05, .07), hairm)
for s in (-1, 1):
    tube('Hair | side lock %s' % ('L' if s < 0 else 'R'),
         [Vector((s*.15, -.08, 3.26)), Vector((s*.185, -.08, 2.8)), Vector((s*.17, -.05, 2.42))],
         [.045, .04, .026], hairm, 8)
# The long fall. It reaches the obi, so it rides the torso rather than the head - a head
# parent would have the whole length whipping on every nod.
loft('Hair | fall', [
    (3.3, .19, .13, 0, .1), (3.0, .22, .15, 0, .13), (2.6, .23, .15, 0, .15),
    (2.2, .21, .13, 0, .16), (1.86, .16, .1, 0, .16), (1.72, .1, .06, 0, .15),
], hairm, 18)

# ------------------------------------------------------------------ ears
group = groups['04 Ears']
for side, s in [('L', -1), ('R', 1)]:
    base = Vector((s*.15, .04, 3.36))
    tip = Vector((s*.42, -.02, 3.82))
    tube('Ear %s' % side, [base, base.lerp(tip, .4), tip], [.17, .1, .016], fur, 10, .55)
    tube('Ear inner %s' % side, [base + Vector((0, -.05, .01)), base.lerp(tip, .4) + Vector((0, -.035, 0)), tip.lerp(base, .16)],
         [.1, .055, .012], inner, 8, .55)

# ------------------------------------------------------------------ tail
group = groups['05 Tail']
# One tail, and large: from the small of the back, out and up past her shoulder height.
tail_pts = [Vector((.06, .2, 1.85)), Vector((.16, .58, 1.82)), Vector((.26, .95, 2.02)),
            Vector((.32, 1.2, 2.45)), Vector((.3, 1.24, 2.92))]
tube('Tail', tail_pts, [.16, .27, .31, .27, .17], tailf, 16)
ell('Tail | tip', (.29, 1.2, 3.04), (.15, .15, .15), fur, 14, 10)   # the white flash at the end

# ------------------------------------------------------------------ bell and crescent
group = groups['06 Bell']
# Her left hand: a gold crescent on a short haft, the bell hung inside it, tassels below.
hl = JOINT['handL']
tube('Bell | haft', [hl + Vector((0, 0, -.1)), hl + Vector((0, 0, .34))], [.022, .02], gold, 8)
cres = []
for a in range(26):
    t = -pi*.78 + a*(pi*1.56)/25
    cres.append((hl.x + sin(t)*.17, hl.y, hl.z + .5 + cos(t)*.17))
tube('Bell | crescent', cres, .032, gold, 8)
ell('Bell | large', (hl.x, hl.y, hl.z + .44), (.085, .085, .095), gold, 14, 10)
tube('Bell | large crown', [Vector((hl.x, hl.y, hl.z+.52)), Vector((hl.x, hl.y, hl.z+.57))], [.03, .022], gold, 8)
for t in (-.05, .05):
    ribbon('Bell | tassel %d' % (1 if t > 0 else 0), (hl.x+t, hl.y, hl.z+.34), (hl.x+t*1.4, hl.y-.02, hl.z-.34), .03, red)
# Her right hand: a small bell on a cord.
hr = JOINT['handR']
ribbon('Bell | small cord', (hr.x, hr.y, hr.z-.06), (hr.x+.02, hr.y, hr.z-.28), .022, red)
ell('Bell | small', (hr.x+.03, hr.y, hr.z-.34), (.055, .055, .06), gold, 12, 9)

# ------------------------------------------------------------------ face
group = groups['01 Body']
ell('Head', JOINT['head'], (.2, .205, .22), skin, 20, 14)
ell('Nose', (0, -.17, 3.23), (.022, .022, .022), skin, 8, 6)
for s in (-1, 1):
    ell('Eye %s' % ('L' if s < 0 else 'R'), (s*.078, -.185, 3.24), (.038, .026, .032), amber, 10, 8)

# ------------------------------------------------------------------ the export root
group = groups['07 Studio']
root = bpy.data.objects.new('Moonraya | model root', None)
groups['07 Studio'].objects.link(root)
root.empty_display_size = .4
# One empty per part, under the root. tools/export_heroes.py reads a mesh's group off the
# name of the empty it hangs from - not off its collection - so these names are the contract
# with classify_moonraya, and renaming one here means renaming it there.
EDIT_GROUPS = {'01 Body': 'Body', '02 Robe': 'Robe', '03 Hair': 'Hair',
               '04 Ears': 'Ears', '05 Tail': 'Tail', '06 Bell': 'Bell'}
for c, label in EDIT_GROUPS.items():
    e = bpy.data.objects.new('%s | edit group' % label, None)
    groups['07 Studio'].objects.link(e)
    e.empty_display_size = .15
    e.parent = root
    for o in list(groups[c].objects):
        if o.parent is None:
            o.parent = e

top = max((o.matrix_world @ Vector(c)).z for o in scene.objects if o.type == 'MESH' for c in o.bound_box)
print('[moonraya] meshes=%d  top=%.3f' % (sum(1 for o in scene.objects if o.type == 'MESH'), top))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'moonraya.blend'))
print('[moonraya] saved', os.path.join(OUT, 'moonraya.blend'))
