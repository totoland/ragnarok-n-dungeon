# Knight depth pass. The model was authored almost entirely from the front, so in side view
# it reads as a cardboard cutout: the legs are flat slabs, the pelvis and neck have no
# front-to-back volume, and the face is a thin wedge. Overall depth/width was 0.54.
#
# This scales world Y per body part about the centreline (y=0), which keeps the front/back
# layering of the armour plates intact - a plate that sat proud of the chest still does,
# just further proud. The sword is translated rather than scaled so the blade stays a blade
# and the grip stays in the hand.
#
# Run standalone, it is re-runnable only on an unmodified file:
#   blender -b ro_knight.blend -P thicken_knight.py -- --out <out.blend>
import bpy, sys
from mathutils import Vector

SCENE = 'RO Knight | Studio'

# Per-part depth multipliers. The legs are the worst offender by a distance, so they get the
# most; the cape already has volume and only needs a little to stay in proportion.
FACTOR = {'leg': 1.62, 'torso': 1.38, 'arm': 1.34, 'head': 1.28, 'cape': 1.12}


def part_of(name):
    """Same name rules the GLB limb classifier uses, so the two never disagree."""
    has = lambda *keys: any(k in name for k in keys)
    if name.startswith('Sword') or has('Sword |'):
        return 'sword'
    if name.startswith(('Cape |', 'Surcoat')):
        return 'cape'
    if name.startswith(('Face', 'Ear', 'Hair', 'Neck')) or has('Hair |'):
        return 'head'
    if has('Cuisse', 'Poleyn', 'Knee', 'chausses', 'Greave', 'Ankle', 'Sabatons'):
        return 'leg'
    if has('Upper arm', 'Couter', 'Vambrace', 'Arm |', 'Grip', 'Gauntlet', 'leather fist'):
        return 'arm'
    return 'torso'


def main():
    # Own flag, so this can be chained after another -P script that also reads '--'.
    argv = []
    if '--out' in sys.argv:
        argv = [sys.argv[sys.argv.index('--out') + 1]]
    sc = bpy.data.scenes[SCENE]
    bpy.context.window.scene = sc
    meshes = [o for o in sc.objects
              if o.type == 'MESH' and 'Display |' not in o.name and 'Studio |' not in o.name]

    # The grip moves with the arm, so measure it before anything is touched and translate the
    # sword by the same delta afterwards. Note the sword hand is NOT 'Gauntlet | leather fist L'
    # any more - adjust_sword_grip.py replaced that fist with the 'Grip | ...' palm and fingers.
    hand = next((o for o in meshes if o.name.startswith('Grip | leather palm')), None)
    hand_y = None
    if hand:
        pts = [(hand.matrix_world @ Vector(c)).y for c in hand.bound_box]
        hand_y = sum(pts) / len(pts)
    dy = (FACTOR['arm'] - 1.0) * hand_y if hand_y is not None else 0.0

    counts = {}
    for o in meshes:
        part = part_of(o.name)
        counts[part] = counts.get(part, 0) + 1
        mw = o.matrix_world.copy()
        mwi = mw.inverted()
        if part == 'sword':
            for v in o.data.vertices:
                w = mw @ v.co
                w.y += dy
                v.co = mwi @ w
        else:
            k = FACTOR[part]
            for v in o.data.vertices:
                w = mw @ v.co
                w.y *= k
                v.co = mwi @ w
        o.data.update()

    print('THICKEN', {k: (counts.get(k, 0), FACTOR.get(k, 'translate')) for k in
                      ['leg', 'torso', 'arm', 'head', 'cape', 'sword']}, 'sword dy %.4f' % dy)

    pts = []
    for o in meshes:
        for c in o.bound_box:
            pts.append(o.matrix_world @ Vector(c))
    xs = [p.x for p in pts]; ys = [p.y for p in pts]
    print('NEW DEPTH/WIDTH %.3f' % ((max(ys) - min(ys)) / (max(xs) - min(xs))))

    if argv:
        bpy.ops.wm.save_as_mainfile(filepath=argv[0])
        print('SAVED', argv[0])


main()
