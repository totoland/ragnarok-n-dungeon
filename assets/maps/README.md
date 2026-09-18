# Painted map backdrops

Every other surface in this game is a procedural canvas texture (`src/render/textures.js`).
These are the exception: a hand-painted backdrop for an outdoor map, where a tiling brick
pattern cannot say "forest".

A theme opts in with `bg` in the `THEMES` table in `src/render/scene.js`. The backdrop plane
is unlit (`MeshBasicMaterial`, `toneMapped: false`) because the art already has its own light
baked in; letting torches or the key light touch it makes the distance read as a nearby wall.

## Sizing, measured from the live camera

The back wall is **28 units wide**. How much of its height the camera actually frames was
measured in-game, not guessed:

| Viewport | Wall height visible | Share of a 12-unit backdrop |
|---|---:|---:|
| Desktop, laptop, phone landscape | 4.88 units | bottom 41% |
| Phone portrait (camera zooms out) | 11.22 units | bottom 94% |

So `bgH: 12` and an image aspect of **28 / 12 = 2.33 : 1** map 1:1 with no stretch, and the
top ~6% is a safe margin nobody sees.

## What that means for the art

Compose from the bottom edge upward:

- **0-25%** — ground-level detail sitting right on the horizon line.
- **25-41%** — the treeline. This band is the only part most players ever see, so whatever
  makes the map recognisable has to live here.
- **41-94%** — canopy, hills, distant landmarks, sky. A portrait-phone bonus.
- **top 6%** — open sky.

**Do not paint the ground into the backdrop.** The floor is separate 3D geometry. A backdrop
containing a grass field renders as a vertical wall of grass standing behind the play area.
`prontera-forest.png` was generated with a field in the bottom 42% and that part was cropped
off; the horizon now lands exactly on the floor plane.

If a generated image has ground in it, crop at the horizon and pad the sky upward to reach
the 2.33:1 target rather than stretching.
