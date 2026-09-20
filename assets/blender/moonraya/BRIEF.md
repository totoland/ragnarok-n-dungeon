# Moonraya — the sculpt

The shipped model is `moonraya.blend`, sculpted by Toto (via Codex) from the reference
illustration. It replaced a primitive stand-in that had been scripted here to keep the fight
playable; that script is gone, because it saved over this same filename and would have
destroyed the sculpt the first time anyone re-ran it. Its history is in git.

Re-export after any edit:

```
sh tools/export_heroes.sh
```

## How this file is wired to the game

Unlike the heroes and the Baphomet, her meshes are **not** parented to a `| model root`
empty. They sit unparented in collections, so the recipe in `tools/export_heroes.py` lists
`collections` and the exporter takes each mesh's collection as its group. Keep meshes in the
right collection and the export keeps working; move one and it changes limb.

| Collection | Goes to |
|---|---|
| `Face` | head |
| `Hair` | head, except `Back hair *` and `Outer hair side flourish` which ride the torso |
| `Ears and Tail` | head, except anything named `tail` |
| `Body` | legs, arms and torso by mesh name and by side |
| `Garments` | arms for the sleeves, torso for everything else |
| `Bells and Ribbons` | the great bell and its crescent handle are the weapon; the little bell rides the right arm |
| `Embroidery` | torso |

`Foxfire`, `Studio`, `Reference` and `Collection` are left out of the export. The two blue
flames are the game's own effect (`foxfire` in `src/render/fx.js`), so modelled ones would
be drawn twice.

Her long hair rides the torso rather than the head on purpose: parented to the head, the
whole length whips on every nod. The Baphomet's mane taught that.

## Numbers

- 98k verts as authored, thinned to 42k at export by `decimate: 0.42` in the recipe. The
  Baphomet is 28k, and she shares a room with everything else, so the thinning matters.
- 5.60 Blender units tall at the ear tips, 2.7 game units in play.
- Pivots are measured off the mesh, not authored: hips at the bottom of the torso, neck at
  3.70, shoulders at the inner top of each arm, the weapon at her left palm.

## Her fight, for reference while posing

| Move | What she does |
|---|---|
| Moon Dash | charges through the player, not at them |
| Spirit Bell | rings the bell; the shockwave answers on both sides at once |
| Foxfire | three blue flames down the lanes |
| Blood moon | below 40 % health she stops arriving alone — two fox shades at a time |
