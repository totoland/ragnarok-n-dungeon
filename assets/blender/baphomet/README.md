# Baphomet

Stylized editable 3D model of the dungeon boss, based on the supplied Baphomet illustration,
created in Blender 5.2.2. Built the same way as `ro_knight` and `hunter_falcon`: a static
posed mesh assembled from primitives, grouped by category, with no animation rig.

- `baphomet.blend`: finished scene, separate from the hero models.
- `baphomet_preview.png`: portrait render.
- `reference_baphomet.jpg`: the supplied illustration, also packed into the Blender file.

Includes spiralling ram horns with growth ridges, a bleached mane ruff over the shoulders,
sun-baked hide with molten fissures, a short-muzzled goat skull with amber furnace eyes and a
horizontal goat pupil, digitigrade legs ending in cloven hooves, clawed hands, and a crescent
scythe whose haft the raised hand actually grips.

Body, fur and mane, head and horns, and the scythe have separate collections and parent
handles under `BAPHOMET | model root`. The studio collection (plinth, amethyst shards, ember
motes, camera and lights) is deliberately left outside that root so it never exports.

| Collection        | Meshes | Verts |
|-------------------|-------:|------:|
| 01 Body           |    138 |  9444 |
| 02 Fur & Mane     |    127 |  9202 |
| 03 Head & Horns   |     82 |  8098 |
| 04 Scythe         |     15 |   915 |

Build scripts run inside Blender in a shared namespace in this order: `build_baphomet.py`,
`add_baphomet_details.py`, `finish_baphomet.py`. Unlike the knight, the reference path is
resolved relative to this folder, so the chain rebuilds on any machine without editing.

## Scale

Feet sit at z=0. The character reaches z=4.85 at the horn tips; the scythe blade carries the
silhouette to z=6.09. For comparison the knight is 3.75 Blender units for 1.9 game units, so
the same ratio puts Baphomet at roughly 2.45 game units, against the 2.9 hurtbox height the
boss currently uses in `src/sim/data/monsters.js`. Scale to taste when wiring up an export.

## Not yet wired into the game

`tools/export_heroes.py` only knows the two heroes, and monsters are still drawn from
primitives in `src/render/monsters.js`, where the boss is the Orc Lord. Nothing in `src/`
references this model yet.
