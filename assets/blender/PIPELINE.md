# Preparing a model in Blender for this game

What `tools/export_heroes.py` needs from a `.blend`, and the brief to hand an AI that is
doing the Blender work. Every rule here is one the exporter or the renderer actually enforces
— the "why" beside each is the bug that taught it.

The short version: **this game has no textures and no skeletons.** Colour is flat, per
material; movement is per named object. A model generator gives you the opposite of both — a
single merged mesh wearing one 4k texture — so the Blender pass exists to turn one into the
other.

---

## What the pipeline does for you

Don't spend Blender time on these. The recipe in `tools/export_heroes.py` handles them:

| | |
|---|---|
| Scale | `height` / `model_height` — model it at any size |
| Origins, joint pivots | `pivot`, measured per limb |
| Facing, if it is wrong | `yaw` |
| Polygon budget | `decimate` and `curve_decimate` per collection |
| Parent hierarchy | `parent` |

## What it cannot do for you

### 1 · Separate objects, or nothing moves

The game animates by moving **named nodes**, not bones. A limb that is not its own object
can never move.

Nerakos is the cautionary tale: he arrived as one continuous body mesh from the talons to
the neck, so he has no arms and no legs in the game. He leans and his tentacles surge,
and that is all he will ever do.

Split at least: `head`, `torso`, `armL`, `armR`, `legL`, `legR`, and `weapon` if it holds
one. Anything else that should move on its own — a cape, a tail, tentacles, floating
shards — gets its own object too.

The renderer looks for exactly these node names, and ignores anything else it is handed:

    torso  head  armL  armR  legL  legR  weapon  shards  tentacles
    (heroes also: cape  falcon  wingL  wingR)

You do not name the objects that, though — see below.

### 2 · Flat colours on real materials, not a texture

Every GLB the game ships has **0 images**. The exporter sets `export_texcoords=False`, so a
UV-mapped texture is thrown away on the way out and the model arrives grey.

Each visually distinct part needs its own material with a Principled BSDF whose **Base
Color is actually set**. Two values count as "not set" and make the exporter go reading the
node tree instead: pure white, and the `0.8, 0.8, 0.8` a new Principled starts at.

A procedural base colour (a ramp, a noise) is fine — the exporter flattens it. Emission is
flattened too, but by a different rule: it takes the **dimmest** stop, because a glow ramp
is mostly dark and averaging it paints the whole body with what was meant for the veins. So
put emission only on things that should actually glow, as their own objects.

### 3 · Naming, because names are what the classifier reads

The exporter sorts objects into limbs by **collection** and **object name**. The two most
recent models both use `" • "` (U+2022, space either side) between the part and its
description, and a numeric side suffix:

    Body • continuous muscular marine anatomy
    Hand • left gripping palm
    Foot • curved talon -1 0        <- -1 is the -X side, 1 is the +X side
    Crown • rising coral blade 07

Collections take a short prefix so several models can live in one file:

    AT • Anatomy   AT • Face   AT • Fins   AT • Trident
    AT • Studio    AT • Reference          <- excluded from the export by the recipe

### 4 · Orientation and stance

- **Up is +Z**, feet at about `z = 0`.
- **Front is −Y.** The glTF conversion is `[x, z, -y]`, so Blender −Y becomes the game's
  front. Check it: the eyes should sit at a negative Y.
- Pose it **standing**, arms clear of the body. The game poses limbs from this rest pose, so
  a crouch or a folded arm is baked in and fights every animation afterwards.
- No armature. A static posed model is what this pipeline wants; a rig is extra work that
  gets baked away.

### 5 · Curves are geometry, and poly splines are expensive

`CURVE`, `SURFACE` and `FONT` all export. A bevelled curve is a fine way to draw a trim
line. But a **poly** spline ignores `resolution_u` entirely — it is walked once per control
point — so a 600-point bound grip costs 600 rings however low the resolution is set. If you
draw with curves, keep the control points sparse, or expect the recipe to thin them.

---

## The brief to paste

> I have a GLB from a 3D model generator. Prepare it in Blender as a source file for a game
> with **flat-colour materials and no textures**, whose characters are animated by moving
> named objects rather than by a skeleton. Then save it as a `.blend`.
>
> 1. Import the GLB. Rename the scene to `<Name> • <Subtitle>`.
> 2. **Split the mesh into separate objects per body part**: head, torso, left arm, right
>    arm, left leg, right leg, and the weapon if it carries one — plus anything else that
>    should move independently (cape, tail, tentacles, floating pieces). Separate by
>    material or by loose part where that works, otherwise select the faces and press P.
>    This is the most important step: a part that is not its own object can never move.
> 3. **Name every object** `Part • description`, with `" • "` = U+2022 spaced. Use a `-1`
>    or `1` suffix for left/right pairs, where `-1` is the −X side. Examples:
>    `Head • horned skull`, `Hand • left gripping palm`, `Foot • curved talon -1 0`.
> 4. **Sort the objects into collections** named `XX • Group` with a consistent 2-letter
>    prefix, e.g. `XX • Anatomy`, `XX • Armour`, `XX • Weapon`. Put lights, cameras, floors
>    and reference images in `XX • Studio` and `XX • Reference` so they can be excluded.
> 5. **Replace the texture with flat materials.** Delete the image texture. Give each
>    visually distinct part its own material with a Principled BSDF and set its Base Color
>    to the colour that part reads as in the texture. Do not leave any Base Color at white
>    or at the default `0.8, 0.8, 0.8` — both are read as "unset". Put Emission only on
>    parts that should genuinely glow, and give those their own objects.
> 6. **Orientation**: up is +Z, front is −Y (the eyes must sit at a negative Y), feet at
>    about z = 0. Pose it standing with the arms clear of the body. Remove any armature.
> 7. Do not decimate, do not scale to a target size, and do not set origins — the game's
>    exporter does all three from a recipe.
> 8. Save as `.blend` and tell me: the scene name, the list of collections, and the object
>    name of the head, each arm, each leg and the weapon.

That last line is the part worth insisting on: those names go straight into the recipe's
classifier, and the pivots get measured off those objects.
