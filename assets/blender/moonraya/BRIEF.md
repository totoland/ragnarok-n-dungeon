# Moonraya — sculpt brief

She is sculpted and in the game: `build_moonraya.py` beside this file builds her, the export
is `assets/monsters/moonraya.glb`, and the primitive stand-in that stood in for her has been
deleted. This is a base to refine, not a finished model — open `moonraya.blend` and work on
it, or edit the script and re-run it, whichever suits the change.

```
/Applications/Blender.app/Contents/MacOS/Blender -b -P assets/blender/moonraya/build_moonraya.py
sh tools/export_heroes.sh
```

The script rebuilds its own scene from scratch, so re-running it replaces the model rather
than stacking a second one on the first — which also means hand edits to the .blend are lost
on the next run. Past a certain point, stop running it and edit the .blend.

## Known rough edges in the sculpt

- The hands are inside the sleeves and never read; fingers would show at the cuff.
- The robe is a smooth loft with no fold or panel break down the front.
- The gold embroidery in the reference is not modelled at all — it wants a texture rather
  than geometry.
- The tail is one tube and a ball; it wants layered fur clumps to read as fur.

## What she is

The Moon Fox Queen, at the end of Phaelan, in an abandoned shrine courtyard under the moon.

## From the reference

- **Ears** — tall white fox ears, pink inside, set high and angled slightly outward.
- **Hair** — silver, straight, falling well past the waist, with a blunt fringe.
- **Eyes** — amber, and the only warm colour on her face.
- **Robe** — ivory kimono with deep red lining and trim, gold embroidery through the panels,
  the collar showing the red as a V at the chest. Floor length, trailing behind.
- **Sash** — a wide black obi with a red cord tied across it and a knot at the front.
- **Sleeves** — wide and hanging, open at the wrist, red at the cuff. Off the shoulder, with
  a red ribbon tie on each upper arm.
- **Tail** — one, white, and large enough to be half her silhouette from the side.
- **Medallion** — a gold circle with a crescent inside it, on the front panel of the robe.
- **Left hand** — a gold crescent on a staff head with a large bell hung inside it and long
  red tassels below.
- **Right hand** — a small gold bell on a red cord.
- **Feet** — bare.
- **Foxfire** — two cold blue spirit flames floating beside her. These are the game's own
  effect (`foxfire` in `src/render/fx.js`), not geometry: do not model them.

## What the exporter needs

The same pipeline as the Katana and Baphomet — `tools/export_heroes.py` cuts the sculpt into
limbs by name, so the rig has to be named before the export, not after.

- Limb groups: `root`, `torso`, `head`, `armL`, `armR`, `legL`, `legR`, and `weapon` for the
  crescent staff. Each limb's origin is its joint.
- Height 3.0 game units, same as Baphomet, facing `+z`.
- Export to `assets/monsters/moonraya.glb` with an entry in `assets/monsters/meta.json`
  giving `height`, `front` and the pivot of every limb.
- Load it in `loadMonsterAssets()` beside `baphomet.glb`, and point the `moonraya` entry in
  `BUILDERS` at the GLB build instead of the stand-in.

## Her fight, for reference while posing

| Move | What she does |
|---|---|
| Moon Dash | charges through the player, not at them |
| Spirit Bell | rings the bell; the shockwave answers on both sides at once |
| Foxfire | three blue flames down the lanes |
| Blood moon | below 40 % health she stops arriving alone — two fox shades at a time |
