#!/bin/sh
# Re-bake the character GLBs from the source .blend files (see tools/export_heroes.py).
#
# The two heroes are sourced from the sibling ragnarok-defender repo (override with SRC).
# Baphomet's .blend lives in this repo under assets/blender/baphomet, because its GLB is a
# shipped asset and had to stay rebuildable from a clone.
set -e
cd "$(dirname "$0")/.."
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
SRC=${SRC:-../ragnarok-defender/assets/blender}
rm -f assets/heroes/meta.json
"$BLENDER" -b "$SRC/ro_knight/ro_knight.blend" -P tools/export_heroes.py -- knight assets/heroes 2>&1 | grep -E "^\[export_heroes\]|^    |Error"
"$BLENDER" -b "$SRC/hunter_falcon/hunter_falcon.blend" -P tools/export_heroes.py -- hunter assets/heroes 2>&1 | grep -E "^\[export_heroes\]|^    |Error"

rm -f assets/monsters/meta.json
"$BLENDER" -b assets/blender/baphomet/baphomet.blend -P tools/export_heroes.py -- baphomet assets/monsters 2>&1 | grep -E "^\[export_heroes\]|^    |Error"
