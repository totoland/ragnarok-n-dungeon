#!/bin/sh
# Bake Mixamo animations onto a skinned hero and export its GLB. See export_skinned_hero.py.
#   tools/export_skinned_hero.sh knight assets/blender/knight_tripo/knight_tripo_skinned.blend walk=anims/walk.fbx
set -e
cd "$(dirname "$0")/.."
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
hero=$1; blend=$2; shift 2
"$BLENDER" -b "$blend" -P tools/export_skinned_hero.py -- "$hero" "$@" 2>&1 | grep -E "^\[skinned\]|Error|Traceback|  File"
