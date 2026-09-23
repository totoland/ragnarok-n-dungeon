"""Bake the static character models into limb-segmented, game-ready GLBs.

Heroes and the Baphomet boss share this one pipeline: they are all static posed models
with no rig, so the exporter re-groups meshes by limb and the game animates the limbs
procedurally.

The source .blend files (ragnarok-defender/assets/blender/) are static posed models
built from ~300 separate primitives grouped by *category* (Body / Armor / Hair / Cloth /
Sword). They have no rig. This script re-groups every mesh by *limb*, bakes modifiers,
joins each limb into a single mesh whose origin sits at its joint, parents the limbs into
a tiny hierarchy and exports one GLB per hero. The game then animates the limbs
procedurally (see src/render/heroes.js) - no skinning required.

Run headless, one hero per invocation:

    /Applications/Blender.app/Contents/MacOS/Blender -b <model>.blend -P tools/export_heroes.py -- knight assets/heroes

Output: <out>/<hero>.glb and a merged <out>/meta.json with pivots (glTF Y-up) and heights.

Hierarchy (every node's origin is its joint, all in the model's rest pose):

    root
    ├─ torso            pivot: hips        (lean / bob)
    │   ├─ head         pivot: neck
    │   ├─ armL         pivot: shoulder L  (Blender -X side; knight's sword arm, hunter's bow arm)
    │   │   └─ weapon   pivot: grip
    │   ├─ armR         pivot: shoulder R
    │   └─ cape         pivot: shoulders   (knight only)
    ├─ legL             pivot: hip L
    ├─ legR             pivot: hip R
    └─ falcon           pivot: body centre (hunter only; wingL / wingR are its children)
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------------------
# Per-hero recipe: which .blend scene, target height, joint pivots (Blender Z-up units)
# and the classifier that maps a mesh to a limb.
# --------------------------------------------------------------------------------------

def _side(x):
    return "L" if x < 0 else "R"


def _has(name, *keys):
    return any(k in name for k in keys)


def classify_knight(group, name, cx):
    if group.startswith("Sword"):
        return "weapon"
    if group.startswith("Katana"):       # add_katana.py; a sibling of the sword on the same grip
        return "weapon_katana"
    if group.startswith("Hair"):
        return "head"
    if name.startswith(("Face", "Ear")):
        return "head"
    if _has(name, "Cuisse", "Poleyn", "Knee", "chausses", "Greave", "Ankle", "Sabatons"):
        return "leg" + _side(cx)
    if _has(name, "Upper arm", "Couter", "Vambrace", "Arm |", "Grip", "Gauntlet", "leather fist"):
        return "arm" + _side(cx)
    if name.startswith(("Cape | sculpted", "Cape | gold side", "Cape | sweeping")):
        return "cape"
    return "torso"  # cuirass, gorget, pauldrons, mail, gambeson, belts, surcoat, clasps, neck


def classify_hunter(group, name, cx):
    if group.startswith("Falcon"):
        if name.startswith("Falcon | near"):
            return "wingR"
        if name.startswith("Falcon | far"):
            return "wingL"
        return "falcon"
    if group.startswith("Bow"):
        return "weapon" if name.startswith(("Bow", "Arrow")) else "torso"  # quiver rides the back
    if group.startswith("Hair"):
        return "head"
    if name.startswith(("Head", "Ear", "Nose")):
        return "head"
    if _has(name, "Trousers", "Boot", "Sole"):
        return "leg" + _side(cx)
    if _has(name, "Upper arm", "Forearm", "bracer", "Bracer", "Gloved palm", "Glove finger", "Sleeve binding"):
        return "arm" + _side(cx)
    return "torso"  # tunic, puff sleeves, scarf, harness, corslet, belt, satchels, tabard, neck


def classify_baphomet(group, name, cx):
    """Boss model. Collection names come from the edit-group empties in baphomet.blend.

    The mane is welded to the shoulders, so it rides the torso rather than the head -
    parenting it to the head makes the ruff swing with every nod.
    """
    if group.startswith("Scythe"):
        return "weapon"
    if group.startswith("Head"):
        return "head"
    if group.startswith("Fur"):
        return "torso"
    if _has(name, "Thigh", "Shank", "Cannon", "Hoof", "Stifle", "Hock", "Fetlock", "Dewclaw",
            "thigh shag", "hock shag"):
        return "leg" + _side(cx)
    if _has(name, "Upper arm", "Forearm", "Elbow", "Bicep", "Palm", "Finger", "Thumb", "forearm cuff"):
        return "arm" + _side(cx)
    return "torso"   # trunk, pelvis, pectoral, deltoid, lat, rib, abdomen, clavicle, fissures


def classify_moonraya(group, name, cx):
    """Phaelan's boss. Her meshes are sorted by collection, not by a parent empty, so `group`
    here is the collection name - see model_meshes().

    Two calls worth stating. The long hair that reaches her waist rides the torso and only
    the crown, fringe and face locks ride the head, the lesson the Baphomet's mane taught.
    And she carries a bell in each hand: the great one on its crescent handle is the weapon
    limb, and the little one simply rides the right arm, because the rig has one weapon slot
    and it is parented to the left.
    """
    if group == "Face":
        return "head"
    if group == "Ears and Tail":
        return "torso" if _has(name, "tail") else "head"
    if group == "Hair":
        if _has(name, "Back hair", "side flourish"):
            return "torso"
        return "head"
    if group == "Bells and Ribbons":
        if _has(name, "Great moon bell", "Left handle"):
            return "weapon"
        if _has(name, "Little moon bell"):
            return "armR"
        if _has(name, "Sleeve ribbon"):
            return "arm" + _side(cx)
        return "torso"                      # obi knots, bows, hanging ties
    if group == "Garments":
        if _has(name, "sleeve"):
            return "arm" + _side(cx)
        return "torso"                      # skirt, tabard, bodice, lapels, obi belt, panels
    if group == "Embroidery":
        return "torso"
    # Body.
    if _has(name, "Leg", "Foot", "Toe", "Ankle"):
        return "leg" + _side(cx)
    if _has(name, "Arm", "Palm", "Finger", "Thumb"):
        return "arm" + _side(cx)
    return "torso"                          # torso, neck


def classify_sandman(group, name, cx):
    """Morroc's boss, sculpted, sorted by collection like Moonraya - see model_meshes().

    He has no legs: below the waist he is a column of sand, so the recipe has no leg limbs
    and applyPose simply leaves them out. He carries two weapons and the rig has one slot,
    so the mace is the weapon limb and the lance rides the right arm.
    """
    if group.endswith("Mace"):
        return "weapon"
    if group.endswith("Lance"):
        return "armR"
    if group.endswith("Face") or group.endswith("Hair"):
        return "head"
    # _has matches case exactly, and the hems are "Sleeve hem" while the sleeves themselves
    # are "Short sleeve" - a hem left on the torso does not follow the arm it belongs to.
    if _has(name, "upper arm", "sleeve", "Sleeve"):
        return "arm" + _side(cx)
    return "torso"          # neck, shirt, the sand body and everything drifting off it


def classify_goat_samurai(group, name, cx):
    """The white ram samurai, which replaced the old Baphomet sculpt. Sorted by collection
    like the other two sculpts - see model_meshes().

    The mane around his shoulders rides the torso and everything else on the head rides the
    head, which is the same call the old Baphomet's mane needed: a ruff parented to the head
    swings through the shoulders on every nod. His katana is in his left hand, where the
    scythe used to be, so the clips that drive that arm still drive the arm holding the
    weapon.
    """
    if group.endswith("Sword"):
        return "weapon"
    if group.endswith("Horns") or group.endswith("Head"):
        return "head"
    if group.endswith("Mane"):
        return "torso" if _has(name, "Layered mane") else "head"
    if group.endswith("Markings"):
        if _has(name, "Face", "Forehead", "Sigil"):
            return "head"
        if _has(name, "arm", "Shoulder"):
            return "arm" + _side(cx)
        return "torso"                                  # the chest V
    if group.endswith("Clothing"):
        return "torso"
    if group.endswith("Fur"):
        if _has(name, "thigh fur", "fetlock"):
            return "leg" + _side(cx)
        if _has(name, "Arm pointed fur"):
            return "arm" + _side(cx)
        return "torso"                                  # the tail
    if _has(name, "leg", "hoof"):
        return "leg" + _side(cx)
    if _has(name, "palm", "finger", "thumb", "Arm construction"):
        return "arm" + _side(cx)
    if _has(name, "Cranium", "Muzzle", "Eye root"):
        return "head"
    return "torso"                                      # body, neck, throat


def classify_weapon(group, name, cx):
    """A wielded weapon: one rigid piece, like a hat, and for the same reason it gets its own
    file rather than being baked into the hero.

    Baking was how the Katana arrived, and it is what the rig wanted at the time: a weapon has
    to sit in a fist whose grip only that hero knows. But the grip is exactly what the hero's
    `weapon` node already is - an origin in the hand - so a weapon exported about its own grip
    drops straight into it, and the game gains a sword without re-exporting the character
    holding it. Ten weapons in the game and one model between them is what the old way cost.
    """
    return "weapon"


def classify_nerakos(group, name, cx):
    """Bairune's boss, the tidal warden. Sorted by collection like the other sculpts.

    He is one continuous body mesh from the talons to the neck - no seam to cut an arm or a
    leg out of - so the rig is the short one the Sandman uses: a torso that is the whole
    figure, a head, and the weapon. What carries the motion instead is the six dorsal
    tentacles, which ARE separable and become a limb of their own so the game can surge them.
    Their suckers ride with them; welded into the torso they would slide off the arms they sit
    on the moment the tentacles moved.

    The trident is parented to the torso rather than to an arm, because there is no arm node
    to hang it from - and that is the right answer here anyway: his hand never leaves the
    shaft, so a weapon fixed relative to the body is exactly what the sculpt shows, and the
    attack turns the trident about the grip, which is what the hand itself would do.
    """
    if group.endswith("Trident"):
        return "weapon"                     # haft, fork, and the drowned bell chained to it
    if group.endswith("Tentacles") or group.endswith("Suckers"):
        return "tentacles"
    if group.endswith("Crown") or group.endswith("Face"):
        return "head"
    if group.endswith("Fins"):
        # The ear fans and the chin barbels are on the head; every other fin hangs off a
        # shoulder, a hip or a calf, all of which are body.
        if name.startswith(("Ear \u2022", "Chin \u2022")):
            return "head"
        return "torso"
    if group.endswith("Luminescence"):
        if name.startswith(("Crown \u2022", "Face \u2022")):
            return "head"
        return "torso"
    # Anatomy (body, hands, talons) and Ridges (relief lines, the neck gills) are all body.
    return "torso"


def classify_gear(group, name, cx):
    """Worn gear is one rigid piece: there is nothing to segment, so every mesh is the part.

    A hat does not animate on its own - it rides the head node the game already poses - so
    the exporter's whole job here is to join, scale and set the origin where the head goes.
    """
    if "head band" in name:
        return None     # the sweatband lines the inside of the crown; a skull fills that space
    return "hat"


def classify_dark_sword(group, name, cx):
    """Orvane's boss, the obsidian knight. Sorted by collection like the other sculpts.

    Two calls the collections do not make for themselves. The Magic collection holds both the
    shards that orbit him and the violet fractures burning along his blade; the fractures have
    to ride the weapon or they hang in the air where the sword used to be. And his pauldrons
    ride the torso, not the arms - the same call the knight's do, because a shoulder dome that
    swings with the elbow reads as a loose plate rather than armour.
    """
    if group.endswith("Sword"):
        return "weapon"
    if group.endswith("Magic"):
        if name.startswith("Blade magic"):
            return "weapon"
        # The shards that orbit him are their own limb rather than part of the torso, so the
        # game can turn them: they idle slowly, and when he breaks in half they fly wide and
        # spin. Welded into the torso they could only follow his lean.
        return "shards"
    if group.endswith("Helmet"):
        return "head"
    if group.endswith("Arms") or group.endswith("Hands"):
        return "arm" + _side(cx)
    if group.endswith("Legs"):
        return "leg" + _side(cx)
    if group.endswith("Foundation"):
        if _has(name, "chausses"):
            return "leg" + _side(cx)
        if _has(name, "sleeve"):
            return "arm" + _side(cx)
        if _has(name, "Neck"):
            return "head"
        return "torso"                      # the padded torso under the cuirass
    return "torso"                          # cuirass, tassets, belts, coat, cowl, pauldrons


MODELS = {
    "knight": {
        "scene": "RO Knight | Studio",
        "height": 1.9,                      # game units, feet at 0
        "model_height": 3.75,               # Blender units, top of hair
        "classify": classify_knight,
        # weapon_* nodes are alternative weapons on the sword's grip: same parent, same pivot.
        # The game shows the one the hero wields and hides the rest (render/heroes.js).
        "parent": {"torso": "root", "head": "torso", "armL": "torso", "armR": "torso",
                   "cape": "torso", "weapon": "armL", "weapon_katana": "armL", "legL": "root", "legR": "root"},
        "pivot": {
            "root": (0, 0, 0),
            "torso": (0, 0, 1.68),
            "head": (0, 0, 2.90),
            "armL": (-0.47, 0.0, 2.45), "armR": (0.47, 0.0, 2.45),
            # Y on these two moved when assets/blender/ro_knight/thicken_knight.py deepened
            # the model: the cape scaled 1.12 about the centreline and the sword was
            # translated with the hand. A stale pivot here swings the sword about the wrong
            # point, which only shows up mid-attack.
            "cape": (0, 0.168, 2.70),
            "weapon": (-0.80, -0.408, 2.00), "weapon_katana": (-0.80, -0.408, 2.00),
            "legL": (-0.22, 0, 1.62), "legR": (0.24, 0, 1.62),
        },
    },
    "hunter": {
        "scene": "Hunter & Falcon | Studio",
        "height": 1.75,
        "model_height": 2.30,
        "classify": classify_hunter,
        "parent": {"torso": "root", "head": "torso", "armL": "torso", "armR": "torso",
                   "weapon": "armL", "legL": "root", "legR": "root",
                   "falcon": "root", "wingL": "falcon", "wingR": "falcon"},
        "pivot": {
            "root": (0, 0, 0),
            "torso": (0, 0, 1.05),
            "head": (0, 0, 1.72),
            "armL": (-0.36, 0.0, 1.50), "armR": (0.37, 0.0, 1.50),
            "weapon": (-0.68, -0.22, 1.33),
            "legL": (-0.16, 0, 1.05), "legR": (0.17, 0, 1.05),
            "falcon": (0.85, -0.02, 1.85),
            "wingL": (0.74, 0.0, 1.95), "wingR": (0.96, 0.0, 1.95),
        },
    },
    # The white ram samurai, which replaced the scripted Baphomet. Toto's sculpt, sorted
    # into collections with no parent empties, so it groups by collection like the other
    # two. Height stays 3.0 - the monster, its stats and its clips are unchanged, only the
    # body is new - and `baphometling` is still this sculpt at 0.58 and darkened.
    #
    # The old build scripts and baphomet.blend are still beside it; this file is what ships.
    "baphomet": {
        "scene": "White Ram Samurai",
        "height": 3.0,                      # game units; hurtbox h is 3.2 in sim/data/monsters.js
        "model_height": 7.05,               # Blender units, horn tips
        "classify": classify_goat_samurai,
        "collections": ["Ram \u2022 Anatomy", "Ram \u2022 Clothing", "Ram \u2022 Construction",
                        "Ram \u2022 Fur", "Ram \u2022 Head", "Ram \u2022 Horns",
                        "Ram \u2022 Mane", "Ram \u2022 Markings", "Ram \u2022 Sword"],
        # 128k as authored. The markings and the katana are small and carry the silhouette,
        # so they are left alone; the fur and the mane are where the count actually is.
        "decimate": {"Ram \u2022 Anatomy": 0.15, "Ram \u2022 Fur": 0.13, "Ram \u2022 Mane": 0.13,
                     "Ram \u2022 Construction": 0.2, "Ram \u2022 Head": 0.25,
                     "Ram \u2022 Horns": 0.22, "Ram \u2022 Clothing": 0.18, "*": 1},
        "parent": {"torso": "root", "head": "torso", "armL": "torso", "armR": "torso",
                   "weapon": "armL", "legL": "root", "legR": "root"},
        "pivot": {
            "root": (0, 0, 0),
            "torso": (0, 0, 3.00),          # hips
            "head": (0, 0, 4.60),           # neck
            "armL": (-0.50, 0, 4.40), "armR": (0.46, 0, 4.38),
            "weapon": (-1.60, 0, 3.82),     # his left palm, on the katana's grip
            "legL": (-0.36, 0, 3.05), "legR": (0.36, 0, 3.05),
        },
    },
    # Morroc's boss, and the second sculpt to arrive. No legs - he is a column of sand from
    # the waist down - so the rig has none, and the mace and lance take an arm each.
    "sandman": {
        "scene": "Sandman \u2022 Desert Colossus",
        "height": 3.4,                      # game units; hurtbox h is 3.0 in sim/data/monsters.js
        "model_height": 6.75,               # Blender units
        "classify": classify_sandman,
        "collections": ["Sandman \u2022 Anatomy", "Sandman \u2022 Face", "Sandman \u2022 Hair",
                        "Sandman \u2022 Lance", "Sandman \u2022 Mace", "Sandman \u2022 Sand Body",
                        "Sandman \u2022 Sand Details", "Sandman \u2022 Shirt"],
        # His head alone is 265k of the 346k he arrives with, from a remesh rather than from
        # anything visible, so it is thinned on its own and the rest is left readable.
        "decimate": {"Sandman \u2022 Face": 0.03, "Sandman \u2022 Shirt": 0.25,
                     "Sandman \u2022 Sand Body": 0.3, "Sandman \u2022 Sand Details": 0.45,
                     "Sandman \u2022 Hair": 0.35, "*": 1},
        "parent": {"torso": "root", "head": "torso", "armL": "torso", "armR": "torso",
                   "weapon": "armL"},
        "pivot": {
            "root": (0, 0, 0),
            "torso": (0, 0, 3.80),          # the waist, where the man meets the sand
            "head": (0, 0, 5.30),           # neck
            "armL": (-1.05, 0, 4.95), "armR": (1.05, 0, 4.95),
            "weapon": (-2.00, 0, 4.15),     # the mace on his left arm
        },
    },
    "moonraya": {
        "scene": "Moonraya \u2022 Phaelan",
        "height": 2.7,                      # game units; hurtbox h is 2.4 in sim/data/monsters.js
        "model_height": 5.60,               # Blender units, ear tips
        "classify": classify_moonraya,
        "collections": ["Body", "Face", "Hair", "Ears and Tail", "Garments",
                        "Bells and Ribbons", "Embroidery"],
        "decimate": 0.42,
        "parent": {"torso": "root", "head": "torso", "armL": "torso", "armR": "torso",
                   "weapon": "armL", "legL": "root", "legR": "root"},
        "pivot": {
            "root": (0, 0, 0),
            "torso": (0, 0, 2.55),          # hips, the bottom of the torso mesh
            "head": (0, 0, 3.70),           # neck
            "armL": (-0.33, -0.20, 3.58), "armR": (0.30, -0.20, 3.55),
            "weapon": (-1.12, -0.73, 2.99), # her left palm, on the crescent handle
            "legL": (-0.22, 0, 2.53), "legR": (0.22, 0, 2.53),
        },
    },
    # ---- Worn gear. Not a character: one rigid piece with no limbs, exported to its own
    # directory so a hat is fetched alongside the heroes rather than baked into both of them.
    # `height` is the hat's own overall height in game units (feather tip included), and the
    # pivot is the middle of the interior head band - the point the game drops onto a skull.
    "robinHat": {
        "scene": "Robin Hood Hat",
        "height": 0.37,                     # game units; the knight's whole head is 0.44
        "model_height": 0.3516,             # Blender units, brim underside to feather tip
        "classify": classify_gear,
        "collections": ["ROBIN HOOD • Hat"],   # the studio collection stays behind
        # Authored at subsurf 2, which is 60k verts for a hat. One level is already smooth
        # at the size it is drawn, and thinning after it costs less shape than decimating
        # a subdivided mesh down the same distance.
        "subsurf": 1,
        "decimate": 0.4,
        # Authored with the long brim lying across X and the feather at +X. A quarter turn
        # stands it up the way the hat is worn: the brim's point out over the brow, the
        # feather behind and leaning off to the wearer's left (glTF front +Z, so left is +X).
        "yaw": 90,
        "parent": {"hat": "root"},
        "pivot": {"root": (0, 0, 0), "hat": (0, 0, 0.0065)},
    },
    # ---- Wielded weapons. Exported about the grip, into assets/gear/ beside the hats, and
    # mounted on the hero's own `weapon` node at load (src/render/gear.js).
    "underWaterSword": {
        "scene": "Ashen Barbed Sword",
        # Blender units from the pommel to the tip. `height` is that length in game units:
        # the grip sits 1.30 of 8.07 up the blade, so at this scale 1.15 units of sword stand
        # above the fist against the knight's own 1.00 - longer in the hand, which is what a
        # two-hander should read as, without leaving the reach his attack boxes assume.
        "height": 1.37,
        "model_height": 8.07,
        "classify": classify_weapon,
        "collections": ["Sword \u2022 Blade", "Sword \u2022 Grip", "Sword \u2022 Guard",
                        "Sword \u2022 Inlays", "Sword \u2022 Pommel"],
        # Seven eighths of it is the inlay curves down the fuller - shape at render size,
        # a smear at the size a sword is drawn in a fist.
        "curve_res": (1, 0),
        "decimate": {"Sword \u2022 Grip": 0.5, "*": 1},
        # The inlays are 129 curve objects of crimson channel down the fuller, and they are
        # four fifths of the sword. At the size a sword is drawn in a fist they are colour,
        # not shape. The binding goes furthest because the hand closes over most of it.
        "curve_decimate": {"Sword \u2022 Inlays": 0.1, "Sword \u2022 Grip": 0.06,
                           "Sword \u2022 Pommel": 0.4, "Sword \u2022 Guard": 0.3, "*": 1},
        # The blade stands along +Z, so `yaw` here turns it about its OWN length: which way
        # the edge faces in the fist, and nothing else. At 0 the flat of the blade pointed
        # forward and the edge ran across the knight's body; a quarter turn puts the edge out
        # in front of him, which is the way a sword is carried.
        "yaw": 90,
        "parent": {"weapon": "root"},
        # The grip: the middle of the bound leather, where the fist closes. Authored standing
        # up with the blade along +Z, the frame the hero's own weapon node is already in.
        "pivot": {"root": (0, 0, 0), "weapon": (0, 0, 1.30)},
    },
    # Bairune's boss. One body mesh, so no arms and no legs - the tentacles are the rig.
    "nerakos": {
        "scene": "Abyssal Trident \u2022 Tidal Warden",
        "height": 3.5,                      # game units; hurtbox h is 3.0 in sim/data/monsters.js
        "model_height": 8.61,               # Blender units, the coral crown's tallest blade -
                                            # the trident reaches past it and is meant to
        "classify": classify_nerakos,
        "collections": ["AT \u2022 Anatomy", "AT \u2022 Crown", "AT \u2022 Face",
                        "AT \u2022 Fins", "AT \u2022 Luminescence", "AT \u2022 Ridges",
                        "AT \u2022 Suckers", "AT \u2022 Tentacles", "AT \u2022 Trident"],
        # 452k verts arrive, and 282k of them are the ten fin membranes - sheets, which is
        # the one thing decimation costs nothing on. The trident and the light organs are
        # left alone: they are small, they are already cheap, and they are what reads.
        "decimate": {"AT \u2022 Fins": 0.03, "AT \u2022 Anatomy": 0.10,
                     "AT \u2022 Face": 0.14, "AT \u2022 Tentacles": 0.22,
                     "AT \u2022 Suckers": 0.08, "AT \u2022 Crown": 0.22, "*": 1},
        # A tenth of him is bevelled curve - the glow streams down the body, the relief lines,
        # the sucker rims, the trident's collars - and they arrive authored barely above this,
        # so (3, 1) that was enough for the Dark Sword took almost nothing off. At (2, 0) a
        # glow line is a four-sided tube walked half as often, which at the size it is drawn
        # is the same line for a third of the vertices.
        "curve_res": (2, 0),
        "parent": {"torso": "root", "head": "torso", "weapon": "torso", "tentacles": "torso"},
        "pivot": {
            "root": (0, 0, 0),
            "torso": (0, 0.05, 2.75),       # the waist, the narrowest slab of the trunk
            "head": (0, -0.02, 6.40),       # the neck, under the jaw and above the gills
            "weapon": (-1.80, -0.36, 5.45), # his fist, closed on the shaft
            # the middle of where the six tentacles leave his back, so turning the node
            # surges them together instead of sweeping them off to one side
            "tentacles": (0, 0.50, 3.60),
        },
    },
    "darkSword": {
        "scene": "Dark Sword \u2022 Obsidian Knight",
        "height": 3.1,                      # game units; hurtbox h is 2.9 in sim/data/monsters.js
        "model_height": 7.43,               # Blender units, the crown of the helmet - the
                                            # shards float above it and are meant to read that way
        "classify": classify_dark_sword,
        "collections": ["DS \u2022 Arms", "DS \u2022 Belts", "DS \u2022 Cloth",
                        "DS \u2022 Cuirass", "DS \u2022 Foundation", "DS \u2022 Hands",
                        "DS \u2022 Helmet", "DS \u2022 Legs", "DS \u2022 Magic",
                        "DS \u2022 Shoulders", "DS \u2022 Sword"],
        # A third of him is the torn coat, which is folds rather than shape and thins well.
        # The sword and the magic are left alone: they are the silhouette and they are cheap.
        "decimate": {"DS \u2022 Cloth": 0.22, "DS \u2022 Foundation": 0.4,
                     "DS \u2022 Shoulders": 0.55, "DS \u2022 Legs": 0.6,
                     "DS \u2022 Cuirass": 0.7, "DS \u2022 Helmet": 0.7,
                     "DS \u2022 Hands": 0.5, "DS \u2022 Arms": 0.7, "*": 1},
        "curve_res": (3, 1),
        "parent": {"torso": "root", "head": "torso", "armL": "torso", "armR": "torso",
                   "weapon": "armL", "legL": "root", "legR": "root", "shards": "root"},
        "pivot": {
            "root": (0, 0, 0),
            "torso": (0, 0, 4.30),          # the waist, under the cuirass
            "head": (0, 0, 6.10),           # neck, below the gorget
            "armL": (-0.88, 0, 5.75), "armR": (0.88, 0, 5.75),
            "weapon": (-1.13, -0.33, 3.54), # his left fist, closed on the grip
            "legL": (-0.42, 0, 3.20), "legR": (0.42, 0, 3.20),
            # the middle of the cluster that orbits him, so turning the node turns them
            # around him rather than sweeping them off to one side
            "shards": (0, 0, 4.33),
        },
    },
}


# --------------------------------------------------------------------------------------

def _is_unset(col):
    """Is this fallback colour a colour anyone chose, or just what the socket came with?

    Two values mean "untouched": pure white, which is what an emission socket starts at, and
    the neutral 0.8 grey a Principled BSDF's base colour starts at. The Ashen Barbed Sword's
    seven materials are all the second - pitted steel, blackened iron, oxidised crimson, soot
    leather - every one of them a ramp over an untouched 0.8, so a threshold that only caught
    white read the fallback as the answer and exported the whole sword as one grey.

    A deliberate light grey is indistinguishable from the default, and for that one colour
    reading the ramp is the better guess anyway; anything below this is taken at face value.
    """
    lo, hi = min(col), max(col)
    return lo >= 0.79 and hi - lo < 0.01


def _flatten_socket(mat, inp, pick="mean"):
    """Resolve one linked colour socket to the single flat colour glTF can carry.

    `pick` says what to do with the stops when the fallback colour is white and the tree has
    to be read. "mean" averages them, which is right for a base colour: every stop describes
    the same surface and the flat answer is somewhere between them. "dark" takes the dimmest,
    which is right for emission: a glow ramp exists to pick a *fraction* of the surface out,
    and the average paints the whole body with what was meant for the veins.
    """
    if not inp or not inp.is_linked:
        return
    col = list(inp.default_value)[:3]
    if _is_unset(col):                       # the fallback says nothing either: read the tree
        stops = []
        seen = set()
        stack = [inp.links[0].from_node]
        while stack:
            n = stack.pop()
            if n.name in seen:
                continue
            seen.add(n.name)
            if n.type == "VALTORGB":
                stops.extend(list(e.color)[:3] for e in n.color_ramp.elements)
            elif n.type == "RGB":
                stops.append(list(n.outputs[0].default_value)[:3])
            for i in n.inputs:
                if i.is_linked:
                    stack.append(i.links[0].from_node)
                elif i.type == "RGBA" and hasattr(i, "default_value"):
                    stops.append(list(i.default_value)[:3])
        if stops:
            col = (min(stops, key=sum) if pick == "dark"
                   else [sum(c[i] for c in stops) / len(stops) for i in range(3)])
    for link in list(inp.links):
        mat.node_tree.links.remove(link)
    inp.default_value = (*col, 1)


def flatten_procedural_colour(mat):
    """Give a procedurally-coloured material the flat colours glTF can carry.

    A stripe pattern or a sand noise lives in a node tree, and glTF has nowhere to put one,
    so the material exports with its colour untouched - which is white. That is how the
    Sandman arrived in the game as a white statue: his shirt, his sand and both weapons are
    ramps, while his skin and eyes are plain colours and came through fine.

    Baking each one to a texture would be the faithful answer, but nothing else in this game
    is textured - it is flat colours on flat shading throughout - so a single colour is the
    right answer here and the cheap one. The author left a sensible colour sitting under each
    link, so use that; if it is white too, average the ramp stops feeding it instead.

    Emission needs the same treatment and is the worse of the two when it is missed. An
    unresolved base colour exports white and is lit like anything else; an unresolved
    emission exports white AND ignores the light, so the part glows. Nerakos' skin is a dark
    blue noise with a green bioluminescent ramp on the emission at strength 1.8 - flattening
    only the base colour left a white figure that no amount of tinting could darken, because
    the white was not coming from the light.

    It does not want the same *rule*, though. Averaging that ramp turned him from a white
    figure into a uniformly glowing green one, because the ramp is mostly black and only its
    crest is emerald: on the sculpt that is a vein, and flat it is the whole body. Emission
    therefore takes the dimmest stop, and the glow comes from where it is actually modelled -
    the light organs and the glow curves, which are their own objects with their own
    materials.
    """
    if not mat or not mat.use_nodes:
        return
    bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        return
    _flatten_socket(mat, bsdf.inputs.get("Base Color"))
    _flatten_socket(mat, bsdf.inputs.get("Emission Color"), pick="dark")


# What counts as model geometry. A curve with a bevel is geometry as much as a mesh is -
# the Dark Sword's etching, blade edges and violet fractures are all curves, a fifth of the
# model, and reading only meshes silently threw them away. bake_group evaluates whatever is
# here through the depsgraph, which hands back a mesh either way.
GEOMETRY = {"MESH", "CURVE", "SURFACE", "FONT"}


def model_meshes(scene, collections=None):
    """The geometry that makes up the model, skipping anything hidden from render.

    Two ways a source file can say which those are, and which group each belongs to.

    The heroes and the Baphomet hang everything off a '| model root' empty and sort meshes
    by the edit-group empty each is parented to. A file authored the other way - meshes left
    unparented and sorted into collections instead - says so with `collections` in its
    recipe, and then a mesh's collection is its group. Moonraya arrived that way.
    """
    out = []
    if collections:
        wanted = set(collections)
        for o in scene.objects:
            if o.type not in GEOMETRY or o.hide_render:
                continue
            if any(c.name in wanted for c in o.users_collection):
                out.append(o)
        return out
    for o in scene.objects:
        if o.type not in GEOMETRY or o.hide_render:
            continue
        p, top = o.parent, None
        while p is not None:
            top = p
            p = p.parent
        if top is not None and "model root" in top.name:
            out.append(o)
    return out


def mesh_group(o, collections):
    """A mesh's group: its collection when the recipe lists collections, else its parent."""
    if collections:
        wanted = set(collections)
        for c in o.users_collection:
            if c.name in wanted:
                return c.name
        return "?"
    return o.parent.name.split(" |")[0]


def world_center(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return sum(pts, Vector()) / 8


def bake_group(scene, name, objects, scale, pivot, yaw=0.0, thin=None):
    """Evaluate (modifiers applied), bake world transforms, join into one object at `pivot`.

    `yaw` turns the model about Z on the way out, for a source file whose front does not point
    the way the game's does. It is baked rather than left to the renderer so the GLB alone is
    correct wherever it is loaded - the live hero, a plinth, the profile turntable.
    """
    dg = bpy.context.evaluated_depsgraph_get()
    turn = Matrix.Rotation(yaw, 4, "Z") if yaw else Matrix.Identity(4)
    parts = []
    for o in objects:
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
        me.transform(Matrix.Scale(scale, 4) @ turn @ o.matrix_world)
        part = bpy.data.objects.new(f"__{name}_{o.name}", me)
        scene.collection.objects.link(part)
        # A curve cannot take a DECIMATE modifier, but the mesh it has just become can - and
        # `curve_res` alone cannot always reach it. A bevelled POLY spline ignores
        # resolution_u entirely and is walked once per control point, so the sword's grip
        # binding costs 600 rings whatever that is set to. This is the only handle left.
        r = thin(o) if thin else 1
        if r and r < 1:
            part.modifiers.new("__curve_decimate", "DECIMATE").ratio = r
            thinned = bpy.data.meshes.new_from_object(
                part.evaluated_get(bpy.context.evaluated_depsgraph_get()),
                preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get())
            part.modifiers.clear()
            part.data = thinned
            bpy.data.meshes.remove(me)
        parts.append(part)
    active = parts[0]
    if len(parts) > 1:
        with bpy.context.temp_override(active_object=active, selected_editable_objects=parts,
                                       selected_objects=parts, object=active):
            bpy.ops.object.join()
    me = active.data
    # The pivot is written in the SOURCE file's frame - "the middle of the head band", "the
    # fist" - but by here the geometry has already been turned by `yaw`. Turn the pivot the
    # same way before subtracting it, or the origin lands wherever that point used to be.
    # Latent until now: every pivot a turned model has had sits on the Z axis, which a yaw
    # leaves where it is.
    turned = (turn @ Vector(pivot)) * scale
    me.transform(Matrix.Translation(-turned))
    active.name = name
    me.name = name
    active.location = turned
    return active


def curve_thinner(cdec, cols):
    """How hard to thin one object's curve geometry, or None when the recipe does not say."""
    if cdec is None:
        return None
    def thin(o):
        if o.type == "MESH":
            return 1                      # meshes are thinned by their own DECIMATE, above
        g = mesh_group(o, cols)
        return cdec.get(g, cdec.get("*", 1)) if isinstance(cdec, dict) else cdec
    return thin


def export(model_key, out_dir):
    recipe = MODELS[model_key]
    scene = bpy.data.scenes[recipe["scene"]]
    bpy.context.window.scene = scene
    scale = recipe["height"] / recipe["model_height"]
    classify = recipe["classify"]

    cols = recipe.get("collections")
    # A sculpted model can arrive far denser than the game wants to draw every frame, and a
    # boss shares the screen with a room full of everything else. `decimate` thins it at
    # export and leaves the source file alone. One number thins everything equally; a dict
    # keyed by group thins per part, with "*" as the default - which is what a model needs
    # when the density is not spread evenly. The Sandman's head is 265k verts of the 346k he
    # arrives with, from a remesh rather than from detail anyone can see, and thinning the
    # whole figure hard enough to fix that would take the lance and the spikes with it.
    dec = recipe.get("decimate")
    yaw = math.radians(recipe.get("yaw", 0))
    # A subdivision level costs four times the verts of the one below it, and a model authored
    # for a render sits a level or two above what the game draws. Capping the modifier is a
    # better trade than decimating afterwards: it never had the vertices to lose.
    sub = recipe.get("subsurf")
    # (resolution_u, bevel_resolution) cap for curves - how finely a bevelled curve is walked
    # along its path and around its ring. Authored for a render, both sit far above what a
    # trim line needs at the size the game draws it.
    res = recipe.get("curve_res")
    # Thinning for geometry DECIMATE cannot be hung on in the source: curves. Keyed by group
    # like `decimate`, and opt-in, so a recipe that does not ask keeps exactly what it baked
    # before this existed.
    cdec = recipe.get("curve_decimate")
    groups = {}
    for o in model_meshes(scene, cols):
        for slot in o.material_slots:
            flatten_procedural_colour(slot.material)
        g = mesh_group(o, cols)
        limb = classify(g, o.name, world_center(o).x)
        if limb is None:
            continue                # a classifier returning None drops the mesh from the bake
        groups.setdefault(limb, []).append(o)
        if sub is not None:
            for m in o.modifiers:
                if m.type == "SUBSURF":
                    m.levels = m.render_levels = min(m.render_levels, sub)
        if o.type == "CURVE" and res:
            o.data.resolution_u = min(o.data.resolution_u, res[0])
            o.data.bevel_resolution = min(o.data.bevel_resolution, res[1])
        ratio = dec.get(g, dec.get("*", 1)) if isinstance(dec, dict) else dec
        # DECIMATE is a mesh modifier. A curve is thinned by dropping its resolution above,
        # which is the same trade as capping a subdivision and costs less shape.
        if ratio and ratio < 1 and o.type == "MESH":
            o.modifiers.new("__export_decimate", "DECIMATE").ratio = ratio

    for limb in recipe["parent"]:
        if limb not in groups:
            raise SystemExit(f"{model_key}: recipe expects limb '{limb}' but no mesh was classified into it")
    unknown = set(groups) - set(recipe["parent"])
    if unknown:
        raise SystemExit(f"{model_key}: classifier produced limbs without a parent: {sorted(unknown)}")

    root = bpy.data.objects.new("root", None)
    scene.collection.objects.link(root)
    nodes = {"root": root}
    for limb, objs in groups.items():
        nodes[limb] = bake_group(scene, limb, objs, scale, recipe["pivot"][limb], yaw,
                                 thin=curve_thinner(cdec, cols))

    # Parent so every node's local translation is joint-to-joint in the rest pose.
    for limb, parent in recipe["parent"].items():
        child, par = nodes[limb], nodes[parent]
        child.parent = par
        child.matrix_parent_inverse = Matrix.Identity(4)
        child.location = (Vector(recipe["pivot"][limb]) - Vector(recipe["pivot"][parent])) * scale

    for o in scene.objects:
        o.select_set(o in nodes.values())
    bpy.context.view_layer.objects.active = root

    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{model_key}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, use_active_scene=True, export_apply=True,
        export_yup=True, export_animations=False, export_lights=False, export_cameras=False,
        export_materials="EXPORT", export_normals=True, export_texcoords=False, export_extras=False,
    )

    def yup(v):  # Blender Z-up -> glTF Y-up
        return [round(v[0] * scale, 4), round(v[2] * scale, 4), round(-v[1] * scale, 4)]

    meta = {
        "height": recipe["height"],
        "front": "+z",
        "pivot": {k: yup(v) for k, v in recipe["pivot"].items()},
        "parts": {limb: {"meshes": len(objs), "verts": len(nodes[limb].data.vertices)} for limb, objs in groups.items()},
    }
    meta_path = os.path.join(out_dir, "meta.json")
    all_meta = {}
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            all_meta = json.load(f)
    all_meta[model_key] = meta
    with open(meta_path, "w") as f:
        json.dump(all_meta, f, indent=2)

    total = sum(p["verts"] for p in meta["parts"].values())
    print(f"[export_heroes] {model_key}: {len(groups)} limbs, {total} verts -> {path} ({os.path.getsize(path) // 1024} KB)")
    for limb, p in sorted(meta["parts"].items()):
        print(f"    {limb:8} {p['meshes']:4} meshes {p['verts']:6} verts")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) != 2 or argv[0] not in MODELS:
        raise SystemExit(f"usage: blender -b <model>.blend -P export_heroes.py -- <{'|'.join(MODELS)}> <out_dir>")
    export(argv[0], argv[1])
