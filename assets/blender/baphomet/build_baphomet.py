# Baphomet | dungeon boss. Body pass: cloven-hoofed digitigrade legs, hunched torso,
# clawed arms. Runs inside Blender; add_baphomet_details.py and finish_baphomet.py
# continue in the same namespace.
import bpy, math, random, os
from mathutils import Vector
from math import sin, cos, pi

OUT = os.path.dirname(os.path.abspath(__file__))
random.seed(66)
scene = bpy.data.scenes.new('Baphomet | Studio')
bpy.context.window.scene = scene
groups = {}
for name in ['01 Body', '02 Fur & Mane', '03 Head & Horns', '04 Scythe', '05 Studio']:
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


def glow(name, h, strength=8.0, rough=.45):
    # Principled emission; input names differ across Blender versions.
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


def box(name, p, s, m, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p)
    o = move(bpy.context.object, name, m)
    for v in o.data.vertices:
        v.co.x *= s[0]; v.co.y *= s[1]; v.co.z *= s[2]
    if bevel:
        mod = o.modifiers.new('Soft edges', 'BEVEL'); mod.width = bevel; mod.segments = 2
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


def line(name, pts, r, m):
    return tube(name, pts, r, m, 8)


def leaf(name, a, b, c, w, d, m):
    a, b, c = Vector(a), Vector(b), Vector(c)
    pts = []; rs = []
    for i in range(9):
        t = i/8
        pts.append((1-t)**2*a + 2*(1-t)*t*b + t*t*c)
        rs.append(max(.001, w*(sin(pi*(.08+.92*t)))**.7))
    return tube(name, pts, rs, m, 8, d/w, False)


def loft(name, rings, m, n=16):
    vs = []; fs = []
    for z, rx, ry, x, y in rings:
        for i in range(n):
            a = 2*pi*i/n; vs.append((x+rx*cos(a), y+ry*sin(a), z))
    for k in range(len(rings)-1):
        for j in range(n):
            a = k*n+j; b = k*n+(j+1) % n; fs.append((a, b, b+n, a+n))
    fs.extend([tuple(reversed(range(n))), tuple((len(rings)-1)*n+j for j in range(n))])
    return mesh(name, vs, fs, m)


def band(name, z, rx, ry, h, m, x=0, y=0):
    return loft(name, [(z-h/2, rx, ry, x, y), (z+h/2, rx, ry, x, y)], m, 32)


def spline(ctrl, n=34):
    """Catmull-Rom through authored control points; used for the ram horns."""
    P = [Vector(p) for p in ctrl]
    P = [P[0]] + P + [P[-1]]
    segs = len(P) - 3
    out = []
    for i in range(n):
        u = i/(n-1)*segs
        k = min(int(u), segs-1)
        t = u - k
        p0, p1, p2, p3 = P[k], P[k+1], P[k+2], P[k+3]
        out.append(.5*((2*p1) + (-p0+p2)*t + (2*p0-5*p1+4*p2-p3)*t*t + (-p0+3*p1-3*p2+p3)*t*t*t))
    return out


def plate(name, outline, y, depth, m, ridge=.025, trim=None):
    count = len(outline); cx = sum(p[0] for p in outline)/count; cz = sum(p[1] for p in outline)/count
    vs = [(x, y, z) for x, z in outline] + [(cx, y-ridge, cz)] + [(x, y+depth, z) for x, z in outline]
    fs = []
    for i in range(count):
        j = (i+1) % count; fs.extend([(i, j, count), (i, count+1+i, count+1+j, j)])
    fs.append(tuple(count+1+i for i in reversed(range(count))))
    o = mesh(name, vs, fs, m)
    if trim:
        line(name+' | edge', [(x, y-.003, z) for x, z in outline] + [(outline[0][0], y-.003, outline[0][1])], .014, trim)
    return o


# Palette read off the reference: sun-baked hide, pale mane, amber horn, ember light.
hide = mat('Hide | sun baked tan', '9A6330', 0, .74)
hide_lit = mat('Hide | lit muscle', 'C0854A', 0, .68)
hide_dark = mat('Hide | umber shadow', '5A3418', 0, .8)
hide_deep = mat('Hide | deep crevice', '2E1A0E', 0, .86)
fur = mat('Fur | ochre pelt', '7C4F27', 0, .9)
fur_dark = mat('Fur | shadowed pelt', '46290F', 0, .92)
mane = mat('Mane | bleached cream', 'CDB183', 0, .88)
mane_lit = mat('Mane | sunlit tips', 'ECDCB4', 0, .82)
mane_dark = mat('Mane | dusty underfur', '6B5430', 0, .92)
horn = mat('Horn | amber keratin', '8A6A33', 0, .52)
horn_lit = mat('Horn | polished ridge', 'C2A05E', 0, .44)
horn_dark = mat('Horn | root shadow', '4C3517', 0, .62)
hoof = mat('Hoof | black keratin', '221A1E', 0, .46)
claw = mat('Claw | charred keratin', '271D20', 0, .44)
muzzle = mat('Muzzle | dark leather', '3F2A1E', 0, .72)
tooth = mat('Teeth | bone', 'E7DCC4', 0, .5)
ember = glow('Ember | molten fissure', 'FF4A0E', 7.0, .5)
eye_glow = glow('Eyes | furnace amber', 'FF3D00', 1.6, .3)
eye_core = glow('Eyes | white hot core', 'FF8A2B', 2.6, .25)
steel = mat('Scythe | pitted steel', '4A4A56', .38, .5)
steel_lit = mat('Scythe | honed edge', 'C8C8D6', .8, .22)
steel_dark = mat('Scythe | blackened spine', '242229', .55, .54)
haft = mat('Scythe | charred haft', '4A3327', 0, .78)
bind = mat('Scythe | leather binding', '6B4B33', 0, .8)

# The scythe axis is fixed here because the raised hand is built to grip it.
SCYTHE_DIR = Vector((2.85, -.65, -1.95)).normalized()

# ------------------------------------------------------------------ joints
HIP_Z, CHEST_Z, SHOULDER_Z = 2.42, 3.45, 3.62
JOINT = {
    'hipL': Vector((-.46, .02, HIP_Z)), 'hipR': Vector((.46, .02, HIP_Z)),
    'shoulderL': Vector((-.74, -.06, SHOULDER_Z)), 'shoulderR': Vector((.74, -.06, SHOULDER_Z)),
    'handL': Vector((-1.38, .08, 4.69)), 'handR': Vector((.98, -.88, 2.42)),
    'neck': Vector((0, -.10, 3.90)), 'head': Vector((0, -.06, 4.22)),
}

# ------------------------------------------------------------------ legs
# Digitigrade: femur forward to the stifle, tibia back to the hock, cannon straight
# down to a cloven hoof. Crouched, so every joint sits low and wide.
for side, s in [('L', -1), ('R', 1)]:
    hip = JOINT['hip'+side]
    knee = Vector((s*.54, -.40, 2.02))
    hock = Vector((s*.52, .52, 1.36))
    fet = Vector((s*.48, .02, .56))
    tube('Thigh | massive flexor '+side, [hip, (hip+knee)/2 + Vector((s*.06, -.06, 0)), knee], [.42, .40, .29], fur, 16)
    tube('Shank | drawn tendon '+side, [knee, (knee+hock)/2 + Vector((0, .10, 0)), hock], [.29, .245, .19], fur, 16)
    tube('Cannon | bone shaft '+side, [hock, (hock+fet)/2 + Vector((0, -.10, 0)), fet], [.17, .135, .115], fur_dark, 14)
    ell('Stifle | knee bulge '+side, knee, (.30, .30, .27), fur, 16, 10)
    ell('Hock | angled joint '+side, hock, (.215, .25, .235), fur_dark, 16, 10)
    ell('Fetlock | ankle knot '+side, fet, (.135, .135, .125), fur_dark, 14, 9)
    # Cloven hoof: two keratin toes with a split down the middle.
    for t, tx in [('outer', s*.085), ('inner', -s*.075)]:
        pts = [(fet.x+tx, fet.y, .50), (fet.x+tx*1.1, fet.y-.10, .28), (fet.x+tx*1.15, fet.y-.20, .055)]
        tube('Hoof | %s toe %s' % (t, side), pts, [.105, .115, .085], hoof, 12, 1, False)
        plate('Hoof | %s nail %s' % (t, side), [(fet.x+tx-.08, .22), (fet.x+tx+.08, .22), (fet.x+tx+.09, .03), (fet.x+tx, -.01), (fet.x+tx-.09, .03)], fet.y-.23, .07, hoof, .03, hide_deep)
    ell('Dewclaw | vestigial spur '+side, (fet.x+s*.13, fet.y+.17, .70), (.055, .075, .10), hoof, 10, 8, False)
    # Shaggy fur breaking over the hock and knee.
    for j in range(7):
        a = 2*pi*j/7 + .3
        base = hock + Vector((.19*cos(a), .23*sin(a), .04))
        leaf('Pelt | hock shag %s%d' % (side, j), base, base+Vector((.04*cos(a), .05*sin(a), -.13)), base+Vector((.08*cos(a), .09*sin(a), -.27)), .05, .032, fur_dark)
    for j in range(9):
        a = 2*pi*j/9
        base = Vector((hip.x+.34*cos(a), hip.y+.28*sin(a), HIP_Z-.62))
        leaf('Pelt | thigh shag %s%d' % (side, j), base, base+Vector((.03*cos(a), .04*sin(a), -.16)), base+Vector((.07*cos(a), .08*sin(a), -.34)), .062, .04, fur)

# ------------------------------------------------------------------ torso
# Hunched forward: upper rings drift toward -Y so the chest overhangs the hips.
loft('Torso | hunched trunk', [
    (2.26, .50, .35, 0, .04), (2.48, .56, .39, 0, .01), (2.72, .52, .36, 0, -.04),
    (2.96, .50, .35, 0, -.09), (3.22, .58, .39, 0, -.13), (3.45, .66, .43, 0, -.16),
    (3.66, .63, .39, 0, -.17), (3.86, .46, .30, 0, -.14)], hide, 26)
ell('Pelvis | haunch mass', (0, .06, 2.38), (.56, .42, .34), fur, 22, 14)
for s in [-1, 1]:
    ell('Pectoral | slab %d' % s, (s*.30, -.36, 3.44), (.29, .21, .21), hide_lit, 18, 12)
    ell('Deltoid | shoulder cap %d' % s, (s*.70, -.08, 3.58), (.31, .31, .29), hide_lit, 18, 12)
    ell('Lat | flank wedge %d' % s, (s*.50, .10, 3.10), (.22, .30, .38), hide, 16, 10)
    line('Rib | floating arch %d' % s, [(s*.10, -.40, 3.18), (s*.38, -.30, 3.12), (s*.50, -.08, 3.05)], .028, hide_dark)
# Abdominal blocks down the front of the hunch.
for row in range(4):
    z = 3.12 - row*.21
    for s in [-1, 1]:
        w = .17 - row*.017
        plate('Abdomen | block %d%d' % (row, (s+1)//2), [(s*.04, z+.09), (s*(.04+w), z+.07), (s*(.05+w), z-.07), (s*.04, z-.09)], -.34 + row*.035, .05, hide_lit, .045)
line('Abdomen | linea alba', [(0, -.40, 3.22), (0, -.39, 2.60), (0, -.34, 2.34)], .018, hide_dark)
line('Clavicle | yoke', [(-.60, -.26, 3.74), (0, -.34, 3.66), (.60, -.26, 3.74)], .05, hide_lit)

# ------------------------------------------------------------------ arms
ARMS = {
    'L': dict(shoulder=JOINT['shoulderL'], elbow=Vector((-1.22, .18, 4.05)), hand=JOINT['handL']),
    'R': dict(shoulder=JOINT['shoulderR'], elbow=Vector((1.12, -.42, 3.00)), hand=JOINT['handR']),
}
for side, A in ARMS.items():
    sh, el, hd = A['shoulder'], A['elbow'], A['hand']
    tube('Upper arm | triceps mass '+side, [sh, (sh+el)/2, el], [.31, .265, .215], hide, 16)
    tube('Forearm | corded flexor '+side, [el, (el+hd)/2, hd], [.225, .19, .145], hide, 16)
    ell('Elbow | knotted joint '+side, el, (.21, .21, .20), hide_dark, 16, 10)
    ell('Bicep | swollen belly '+side, (sh+el)/2 + Vector((0, -.11, .03)), (.20, .18, .24), hide_lit, 16, 10)
    for j in range(9):
        a = 2*pi*j/9
        base = el + Vector((.20*cos(a), .20*sin(a), 0))
        d = (hd-el).normalized()
        leaf('Pelt | forearm cuff %s%d' % (side, j), base, base + d*.16 + Vector((.03*cos(a), .03*sin(a), 0)),
             base + d*.34 + Vector((.09*cos(a), .09*sin(a), 0)), .055, .035, fur)
    ell('Palm | broad pad '+side, hd, (.17, .19, .15), hide, 16, 10)

# Raised hand: fingers wrap the haft instead of splaying, so the grip reads as a grip.
GRIP = JOINT['handL']
_ref = Vector((0, 0, 1))
u = SCYTHE_DIR.cross(_ref).normalized(); v = SCYTHE_DIR.cross(u).normalized()
a0 = -.55
for i in range(4):
    off = GRIP + SCYTHE_DIR*(-.13 + i*.085)
    pts = []; radii = []
    for k in range(4):
        a = a0 + k*.66
        r = .115 + .012*k
        pts.append(off + u*(cos(a)*r) + v*(sin(a)*r))
        radii.append(.060 - .006*k)
    tube('Finger | L%d' % i, pts, radii, hide, 8)
    tip = pts[-1]; d = (pts[-1]-pts[-2]).normalized()
    tube('Finger | L%d claw' % i, [tip, tip+d*.05, tip+d*.10], [.042, .026, .010], claw, 8, 1, False)
thumb_a = a0 + 3.05
tp = [GRIP + SCYTHE_DIR*.10 + u*(cos(thumb_a)*.12) + v*(sin(thumb_a)*.12)]
tp.append(tp[0] + SCYTHE_DIR*(-.13) + u*.05 + v*.04)
tp.append(tp[0] + SCYTHE_DIR*(-.24) + u*.10 + v*.06)
tube('Thumb | L', tp, [.068, .058, .046], hide, 8)
tube('Thumb | L claw', [tp[-1], tp[-1]+SCYTHE_DIR*(-.06), tp[-1]+SCYTHE_DIR*(-.11)], [.042, .026, .010], claw, 8, 1, False)

# Reaching hand: heavy fingers, short nails.
HR = JOINT['handR']
fanR = Vector((.10, -1, -.35)).normalized()
for j in range(4):
    spread = (j-1.5)*.26
    d = (fanR + Vector((spread*.50, 0, spread*.18))).normalized()
    base = HR + d*.13
    pts = [base]; radii = [.086]
    cur = base.copy(); dirv = d.copy()
    for k, L in enumerate([.19, .15, .11]):
        cur = cur + dirv*L
        pts.append(cur.copy()); radii.append(.086*(1-.19*(k+1)))
        dirv = (dirv - Vector((0, 0, .26))).normalized()
    tube('Finger | R%d' % j, pts, radii, hide, 8)
    tip = pts[-1]
    tube('Finger | R%d claw' % j, [tip, tip+dirv*.055, tip+dirv*.11 - Vector((0, 0, .035))], [.047, .028, .010], claw, 8, 1, False)
tR = (fanR + Vector((-.85, .25, .10))).normalized()
tpR = [HR + tR*.11, HR + tR*.28 - Vector((0, 0, .05)), HR + tR*.42 - Vector((0, 0, .13))]
tube('Thumb | R', tpR, [.090, .076, .060], hide, 8)
tube('Thumb | R claw', [tpR[-1], tpR[-1]+tR*.055 - Vector((0, 0, .03)), tpR[-1]+tR*.10 - Vector((0, 0, .07))], [.047, .028, .010], claw, 8, 1, False)

print('BAPHOMET BODY BUILT', len(scene.objects))
