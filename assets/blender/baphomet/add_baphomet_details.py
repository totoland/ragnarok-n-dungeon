# Baphomet detail pass: goat skull, spiralling ram horns, the bleached mane ruff and the
# molten fissures. Runs in the shared namespace after build_baphomet.py.


def ridge(name, P, T, r, thick, m, n=12):
    """A growth ring around a horn: a closed loop in the plane normal to T."""
    T = Vector(T).normalized()
    ref = Vector((0, 0, 1))
    if abs(T.dot(ref)) > .95:
        ref = Vector((1, 0, 0))
    u = T.cross(ref).normalized(); v = T.cross(u).normalized()
    pts = [P + r*(cos(2*pi*j/n)*u + sin(2*pi*j/n)*v) for j in range(n+1)]
    return tube(name, pts, thick, m, 6)


# ------------------------------------------------------------------ head
# Goat skull: short blocky muzzle rather than a snout, heavy brow, eyes set wide.
group = groups['03 Head & Horns']
ell('Skull | cranium', (0, .04, 4.26), (.30, .33, .30), fur, 24, 16)
ell('Skull | cheek mass L', (-.25, -.14, 4.14), (.145, .18, .165), fur, 16, 10)
ell('Skull | cheek mass R', (.25, -.14, 4.14), (.145, .18, .165), fur, 16, 10)
tube('Muzzle | tapered bridge', [(0, -.14, 4.20), (0, -.36, 4.11), (0, -.54, 4.03), (0, -.66, 3.97)],
     [.250, .222, .188, .150], fur, 18)
ell('Muzzle | brow ridge', (0, -.24, 4.31), (.275, .13, .105), fur_dark, 16, 10, False)
ell('Muzzle | jaw', (0, -.36, 3.97), (.205, .235, .135), fur_dark, 16, 10)
ell('Muzzle | nose pad', (0, -.70, 3.96), (.135, .085, .10), muzzle, 14, 10)
for s in [-1, 1]:
    ell('Muzzle | nostril %d' % s, (s*.062, -.735, 3.975), (.030, .024, .036), hide_deep, 10, 8)
    line('Muzzle | lip line %d' % s, [(s*.025, -.72, 3.905), (s*.125, -.60, 3.905), (s*.170, -.42, 3.95)], .024, muzzle)
    ell('Fang | lower canine %d' % s, (s*.090, -.60, 3.895), (.028, .032, .054), tooth, 8, 6, False)
    # Eyes: deep socket, saturated amber lens, horizontal goat pupil, hot core.
    ell('Eye | socket %d' % s, (s*.215, -.30, 4.23), (.112, .100, .100), hide_deep, 14, 10)
    ell('Eye | amber lens %d' % s, (s*.218, -.335, 4.232), (.092, .082, .082), eye_glow, 14, 10)
    ell('Eye | hot core %d' % s, (s*.222, -.392, 4.232), (.038, .030, .028), eye_core, 12, 8)
    ell('Eye | slit pupil %d' % s, (s*.226, -.408, 4.232), (.060, .030, .020), hide_deep, 10, 8)
    line('Brow | scowl crease %d' % s, [(s*.09, -.33, 4.38), (s*.25, -.27, 4.34), (s*.32, -.14, 4.26)], .030, fur_dark)
    # Drooping goat ear, swept back under the horn.
    a = Vector((s*.28, .06, 4.22)); b = Vector((s*.54, .24, 4.06)); c = Vector((s*.62, .38, 3.78))
    leaf('Ear | outer %d' % s, a, b, c, .105, .045, fur)
    leaf('Ear | inner %d' % s, a+Vector((0, -.02, 0)), b+Vector((0, -.03, 0)), c+Vector((0, -.03, 0)), .062, .022, hide_dark)
for j in range(7):
    x = -.09 + j*.03
    base = Vector((x, -.46, 3.86))
    leaf('Beard | chin strand %d' % j, base, base+Vector((x*.4, -.04, -.16)),
         base+Vector((x*1.1, -.02, -.34-.06*sin(j))), .042, .028, mane_dark)

# ------------------------------------------------------------------ horns
# Authored point by point rather than as a maths spiral: a circular curl kept dipping
# inside the ruff. Every control point stays above z=4.0 and outside |x|=0.78, which is
# what keeps the curl silhouetted against the background.
for side, s in [('L', -1), ('R', 1)]:
    ctrl = [(s*.24, .12, 4.40), (s*.50, .40, 4.58), (s*.90, .54, 4.54), (s*1.22, .36, 4.30),
            (s*1.32, .02, 4.08), (s*1.20, -.30, 4.10), (s*.96, -.44, 4.32),
            (s*.82, -.26, 4.52), (s*.86, .04, 4.58)]
    pts = spline(ctrl, 36)
    radii = [.215*(1-.80*(i/35))**1.05 for i in range(36)]
    tube('Horn | ram spiral '+side, pts, radii, horn, 18)
    ell('Horn | root boss '+side, pts[0], (.235, .235, .185), horn_dark, 16, 10)
    for i in range(1, 32, 2):
        ridge('Horn | growth ridge %s%d' % (side, i), pts[i], pts[i+1]-pts[i-1], radii[i]*1.11, radii[i]*.15, horn_lit)
    for i in range(3, 30, 6):
        ridge('Horn | deep annulus %s%d' % (side, i), pts[i], pts[i+1]-pts[i-1], radii[i]*1.17, radii[i]*.26, horn_dark)
    ell('Horn | worn tip '+side, pts[-1], (radii[-1]*1.2,)*3, horn_lit, 10, 8)

# ------------------------------------------------------------------ mane
# Solid underfur first so no scalp shows through, then four rings of narrow strands that
# fall rather than radiate - wide flat blades read as flower petals, not fur.
group = groups['02 Fur & Mane']
loft('Mane | packed underfur', [
    (3.10, .70, .52, 0, -.06), (3.34, .84, .60, 0, -.10), (3.58, .86, .62, 0, -.12),
    (3.80, .70, .52, 0, -.12), (3.98, .50, .40, 0, -.10)], mane_dark, 26)
# Wider, fewer, jittered strands: narrow blades read as a fringe of teeth, overlapping
# ones read as a pelt. Ring 0 sits high enough to hide the packed underfur beneath.
RINGS = [
    (3.98, .40, 16, Vector((0, .14, -.16)), .20, .080),
    (3.86, .52, 20, Vector((0, .12, -.24)), .26, .092),
    (3.70, .68, 24, Vector((0, .06, -.38)), .38, .102),
    (3.46, .82, 26, Vector((0, 0, -.54)), .52, .110),
    (3.22, .76, 24, Vector((0, -.06, -.64)), .48, .098),
]
random.seed(31)
for ri, (z, rad, count, drift, length, width) in enumerate(RINGS):
    for j in range(count):
        a = 2*pi*j/count + ri*.15 + .10*(random.random()-.5)
        radial = Vector((cos(a), sin(a)*.78, 0))
        base = Vector((rad*cos(a), -.10 + rad*sin(a)*.78, z + .03*(random.random()-.5)))
        L = length*(.70 + .60*random.random())
        jitter = Vector((.05*(random.random()-.5), .05*(random.random()-.5), .06*(random.random()-.5)))
        mid = base + radial*L*.50 + drift*.45 + jitter
        tip = base + radial*L*.86 + drift + jitter*1.6
        m = (mane_lit if (j + ri) % 4 == 0 else mane if (j + ri) % 4 in (1, 2) else mane_dark)
        leaf('Mane | ruff strand %d-%d' % (ri, j), base, mid, tip, width*(.85+.3*random.random()), width*.55, m)
for j in range(9):
    x = -.40 + j*.10
    base = Vector((x, -.52, 3.44))
    leaf('Mane | chest fall %d' % j, base, base+Vector((x*.2, -.16, -.26)), base+Vector((x*.5, -.20, -.62)), .085, .05, mane)
for j in range(7):
    x = -.30 + j*.10
    base = Vector((x, .40, 3.56))
    leaf('Mane | spine crest %d' % j, base, base+Vector((x*.2, .14, -.20)), base+Vector((x*.4, .20, -.52)), .075, .045, mane_dark)

# ------------------------------------------------------------------ molten fissures
# Sited just proud of the limb surfaces the portrait camera sees (+X / -Y), otherwise the
# glow renders inside the muscle volume and never shows.
group = groups['01 Body']
FISSURES = [
    ('deltoid R', (.92, -.36, 3.72), (1.03, -.24, 3.56), (.97, -.10, 3.40), .085),
    ('bicep R', (1.06, -.44, 3.26), (1.14, -.36, 3.12), (1.08, -.26, 2.98), .062),
    ('flank R', (.62, -.44, 3.02), (.72, -.34, 2.86), (.64, -.22, 2.70), .058),
    ('chest', (.30, -.62, 3.40), (.18, -.66, 3.24), (.28, -.60, 3.08), .055),
    ('thigh R', (.66, -.50, 2.34), (.78, -.40, 2.14), (.70, -.26, 1.94), .078),
    ('thigh L', (-.52, -.60, 2.30), (-.60, -.52, 2.12), (-.54, -.40, 1.94), .066),
]
for name, a, b, c, w in FISSURES:
    leaf('Fissure | scorched rim %s' % name, a, b, c, w*1.45, w*.55, hide_deep)
    # The glow has to sit proud of its own rim, otherwise the wider rim tube encloses it
    # and the fissure renders as a plain dark gash.
    out = Vector((a[0], a[1] + .12, 0))
    out = out.normalized()*(w*.85) if out.length > 1e-6 else Vector((0, -w, 0))
    leaf('Fissure | molten %s' % name, Vector(a)+out, Vector(b)+out, Vector(c)+out, w*.72, w*.38, ember)

print('BAPHOMET DETAILS BUILT', len(scene.objects))
