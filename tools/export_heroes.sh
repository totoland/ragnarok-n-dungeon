#!/bin/sh
# Re-bake the character GLBs from the source .blend files (see tools/export_heroes.py).
#
# Every source .blend now lives in this repo under assets/blender (override with SRC). The
# heroes used to come from the sibling ragnarok-defender repo, which is no longer present -
# a shipped GLB has to stay rebuildable from a clone.
set -e
cd "$(dirname "$0")/.."
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
SRC=${SRC:-assets/blender}
# No `rm meta.json` here: each hero merges its own entry, and a machine without the Knight's
# clips keeps his.
# The Knight is skinned: his GLB carries the Mixamo skeleton and clips (export_skinned_hero.py).
# The animation FBXs are local-only (see .gitignore), so a clone keeps the committed GLB.
KA=assets/blender/mixamo   # the shared Mixamo library - see its README.md
if [ -f "$KA/Standard_Walk.fbx" ]; then
  sh tools/export_skinned_hero.sh knight "$SRC/knight_tripo/knight_tripo_skinned.blend" \
    walk=$KA/Standard_Walk.fbx slash1=$KA/Great_Sword_Slash_1.fbx slash2=$KA/Sword_And_Shield_Slash_2.fbx \
    slash3=$KA/Sword_And_Shield_Slash_3.fbx jump=$KA/Jumping_Up.fbx dead=$KA/Standing_Death_Forward_02.fbx \
    idle=$KA/Unarmed_Idle_Looking_Ver_2.fbx powerup=$KA/Sword_And_Shield_Power_Up.fbx hurt=$KA/Standing_React_Small_From_Front_02.fbx
else
  echo "[export_heroes] knight: Mixamo clips not on this machine - keeping the committed GLB"
fi
"$BLENDER" -b "$SRC/hunter_falcon/hunter_falcon.blend" -P tools/export_heroes.py -- hunter assets/heroes 2>&1 | grep -E "^\[export_heroes\]|^    |Error"

# No `rm meta.json`: every exporter merges its own entry, and the skinned ones may be skipped.
# Baphomet is skinned too (tools/tripo_to_skinned.py baphomet), on clips from the shared library.
if [ -f "$KA/Standard_Walk.fbx" ]; then
  sh tools/export_skinned_hero.sh baphomet assets/blender/baphomet_tripo/baphomet_skinned.blend \
    walk=$KA/Standard_Walk.fbx idle=$KA/Unarmed_Idle_Looking_Ver_2.fbx dead=$KA/Standing_Death_Forward_02.fbx \
    cast=$KA/Standing_2H_Magic_Attack_01.fbx run=$KA/Standing_Run_Forward.fbx \
    slash1=$KA/Great_Sword_Slash_1.fbx slash3=$KA/Sword_And_Shield_Slash_3.fbx powerup=$KA/Sword_And_Shield_Power_Up.fbx hurt=$KA/Standing_React_Small_From_Front_02.fbx
else
  echo "[export_heroes] baphomet: Mixamo clips not on this machine - keeping the committed GLB"
fi
# Moonraya is skinned (tools/tripo_to_skinned.py -> export_skinned_hero.py). Her clips are the
# Knight's Mixamo set until her own arrive, and like his they are local-only.
if [ -f "$KA/Standard_Walk.fbx" ]; then
  sh tools/export_skinned_hero.sh moonraya assets/blender/moonraya_tripo/moonraya_skinned.blend \
    walk=$KA/Standard_Walk.fbx idle=$KA/Unarmed_Idle_Looking_Ver_2.fbx dead=$KA/Standing_Death_Forward_02.fbx \
    cast=$KA/Standing_2H_Magic_Attack_01.fbx run=$KA/Standing_Run_Forward.fbx \
    powerup=$KA/Sword_And_Shield_Power_Up.fbx hurt=$KA/Standing_React_Small_From_Front_02.fbx
else
  echo "[export_heroes] moonraya: Mixamo clips not on this machine - keeping the committed GLB"
fi
"$BLENDER" -b assets/blender/sandman/sandman.blend -P tools/export_heroes.py -- sandman assets/monsters 2>&1 | grep -E "^\[export_heroes\]|^    |Error"
"$BLENDER" -b assets/blender/dark_sword/dark_sword.blend -P tools/export_heroes.py -- darkSword assets/monsters 2>&1 | grep -E "^\[export_heroes\]|^    |Error"
"$BLENDER" -b assets/blender/nerakos/abyssal_trident.blend -P tools/export_heroes.py -- nerakos assets/monsters 2>&1 | grep -E "^\[export_heroes\]|^    |Error"

# Worn gear: its own directory, so a hat is fetched alongside the heroes rather than baked
# into both of them.
rm -f assets/gear/meta.json
"$BLENDER" -b assets/blender/robin_hood_hat/robin_hood_hat.blend -P tools/export_heroes.py -- robinHat assets/gear 2>&1 | grep -E "^\[export_heroes\]|^    |Error"
"$BLENDER" -b assets/blender/under_water_sword/ashen_barbed_sword.blend -P tools/export_heroes.py -- underWaterSword assets/gear 2>&1 | grep -E "^\[export_heroes\]|^    |Error"
# King Orc's source is local-only (see .gitignore), so a clone skips him and keeps the GLB
# already committed rather than failing the whole re-bake on a file it was never given.
if [ -f assets/blender/dwarf_warrior_game_source.blend ]; then
  "$BLENDER" -b assets/blender/dwarf_warrior_game_source.blend -P tools/export_heroes.py -- kingOrc assets/monsters 2>&1 | grep -E "^\[export_heroes\]|^    |Error"
else
  echo "[export_heroes] kingOrc: source not on this machine - keeping the committed GLB"
fi
