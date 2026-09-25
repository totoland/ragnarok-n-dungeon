# Mixamo animation library

Every Mixamo animation Toto has downloaded for the game, in one place, so a new character on
the Mixamo skeleton can reuse any of them without downloading them again.

The `.fbx` files are **local-only** (gitignored — ~9 MB each, and they are Mixamo's files, not
ours to republish). This README is committed. If a clone is missing the files, the committed
GLBs still carry everything baked into them; only a re-bake needs the FBXs.

All of them were downloaded as **FBX, Without Skin** (some came with a Paladin skin attached,
which the exporter ignores). The walks are **In Place** or have their forward travel dropped by
the exporter anyway.

## Any skeleton, any clip

Every skinned character here uses the standard 65-bone Mixamo skeleton (Tripo auto-rig with
the Mixamo preset, or Mixamo's own auto-rigger). `tools/export_skinned_hero.py` retargets by
bone name in world space, so **every clip below fits every one of those characters** — T-pose
or A-pose, tall or small, male or female. Bake one onto a character with:

    tools/export_skinned_hero.sh <character> <its _skinned.blend> <name>=assets/blender/mixamo/<file>.fbx ...

and name the clip in that character's move table (`KNIGHT.skinned` in `src/render/heroes.js`,
`SKIN_MOVES` in `src/render/monsters.js`).

## The clips

`dur` is the whole clip; `strike` is the frame the right hand moves fastest, which the game
lines up with the moment a hit lands (render/skin.js `attackClipTime`).

| File | What it is | dur | strike | Used by |
|---|---|---|---|---|
| `Standard_Walk.fbx` | Plain walk cycle, arms swinging | 1.17 s | — | Knight + Baphomet `walk` (sword arm held), Moonraya `walk` (placeholder) |
| `Unarmed_Idle_Looking_Ver_2.fbx` | Standing, breathing, looking around | 7.83 s | — | Knight + Baphomet `idle` (sword arm held), Moonraya `idle` (placeholder) |
| `Great_Sword_Slash_1.fbx` | Two-handed overhead chop | 1.27 s | 0.57 s | Knight `slash1`, Baphomet `slash1` (slam) |
| `Sword_And_Shield_Slash_2.fbx` | One-handed combo with a leap — long; the game uses one swing of it | 3.53 s | 0.70 s | Knight `slash2` |
| `Sword_And_Shield_Slash_3.fbx` | Overhead then downward cut | 1.50 s | 0.60 s | Knight `slash3`, Baphomet `slash3` (attack) |
| `Jumping_Up.fbx` | Crouch, jump, apex; takeoff 0.53 s, apex 0.77 s, land 0.83 s | 0.83 s | — | Knight `jump` (the sim does the lifting) |
| `Standing_Death_Forward_02.fbx` | Hit, stagger, fall forward, lie still | 2.37 s | — | Knight, Moonraya, Baphomet `dead` |
| `Standing_2H_Magic_Attack_01.fbx` | Crouch, both arms over the head, throw forward | 2.70 s | 1.13 s | Moonraya `cast` (Foxfire), Baphomet `cast` (Hellfire) |
| `Standing_Run_Forward.fbx` | A run cycle from the first frame (~4 m/s), loops | 0.77 s | — | Moonraya `run` (Moon Dash, looped), Baphomet `run` (charge) |
| `Standing_React_Small_From_Front_02.fbx` | Struck from the front: flinch back a step and recover | 0.77 s | — | Knight, Moonraya, Baphomet `hurt` (played ~1.3-1.5x, from the moment of the hit) |
| `Sword_And_Shield_Power_Up.fbx` | Sword up to the sky, down, chest out and tense, relax | 2.37 s | 0.50 s | Knight `powerup` (Quicken, the raise only), Moonraya + Baphomet `powerup` (second-wind heal, played straight through) |

## Good fits for what is still missing

- **Bosses' melee / charge / slam**: the three slashes above suit Dark Sword; `Great_Sword_Slash_1`
  suits Baphomet's scythe.
- **Any caster's spell**: `Standing_2H_Magic_Attack_01` (Baphomet's Hellfire, Dark Sword's
  Mirror Bolt).
- **Any death**: `Standing_Death_Forward_02`.
- **Any charge / dash**: `Standing_Run_Forward`, looped (Baphomet's and Dark Sword's charges).

Still wanted from Mixamo: a female walk and idle for Moonraya, a knock-down /
get-up, Moonraya's melee and Spirit Bell, and the Knight's dash, air slash, Magnum Break and
Bowling Bash.
