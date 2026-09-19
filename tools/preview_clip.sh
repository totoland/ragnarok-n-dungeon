#!/usr/bin/env bash
# Render a clip onto an exported rig. See preview_clip.py.
#   tools/preview_clip.sh baphomet cast --json out.json --out /tmp/strip.png
set -euo pipefail
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PYTHONPATH="$HERE" "$BLENDER" --background --python "$HERE/preview_clip.py" -- "$@" 2>&1 \
  | grep -E "^(PV\||Error|Traceback|  File|[A-Za-z]*Error)" || true
