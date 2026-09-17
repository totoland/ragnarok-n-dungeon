#!/bin/sh
# Re-bake both hero GLBs from the source .blend files (see tools/export_heroes.py).
set -e
cd "$(dirname "$0")/.."
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
SRC=${SRC:-../ragnarok-defender/assets/blender}
rm -f assets/heroes/meta.json
"$BLENDER" -b "$SRC/ro_knight/ro_knight.blend" -P tools/export_heroes.py -- knight assets/heroes 2>&1 | grep -E "^\[export_heroes\]|^    |Error"
"$BLENDER" -b "$SRC/hunter_falcon/hunter_falcon.blend" -P tools/export_heroes.py -- hunter assets/heroes 2>&1 | grep -E "^\[export_heroes\]|^    |Error"
