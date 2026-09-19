#!/usr/bin/env bash
# Retarget a Mixamo FBX onto the rigid-limb clip format. See mixamo_to_clip.py.
#   tools/mixamo_to_clip.sh anim.fbx --name cast --split auto --keys 5
set -euo pipefail
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# Blender is loud on FBX import (one warning per unsupported user property); the tool's own
# output is prefixed RET| and the emitted clip is everything that is not a warning.
"$BLENDER" --background --python "$HERE/mixamo_to_clip.py" -- "$@" 2>&1 \
  | grep -vE "^(WARNING: User property|Warning: |Info: |Read prefs|found bundled|FBX version|BlenderMCP|Blender quit)"
