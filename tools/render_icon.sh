#!/usr/bin/env bash
# Render the launcher icons from a character GLB. See render_icon.py.
#   tools/render_icon.sh assets/heroes/knight.glb
# Writes assets/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png
set -euo pipefail
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
GLB="${1:-assets/heroes/knight.glb}"
OUT="$REPO/assets/icons"
TMP="$(mktemp -d)"
mkdir -p "$OUT"

render() {  # render <padding> <outfile>
  "$BLENDER" --background --python "$HERE/render_icon.py" -- "$REPO/$GLB" "$1" --pad "$2" --size 1024 \
    2>&1 | grep -E "^ICON\||Error|Traceback" || true
}

# Ground + vignette are composited here rather than lit in Blender: the game's own #07060a
# with a warm falloff, so the icon sits in a dock the way the game sits on screen.
compose() {  # compose <render.png> <out.png> <size>
  ffmpeg -y -loglevel error \
    -f lavfi -i "color=c=0x0d0b12:s=1024x1024" \
    -i "$1" \
    -filter_complex "[0:v]vignette=a=0.62:x0=512:y0=430[bg];[bg][1:v]overlay=0:0,scale=$3:$3:flags=lanczos" \
    -frames:v 1 "$2"
}

render "$TMP/full.png" 1.0
render "$TMP/safe.png" 1.5          # maskable: subject inside the 40% safe circle

compose "$TMP/full.png" "$OUT/icon-512.png"          512
compose "$TMP/full.png" "$OUT/icon-192.png"          192
compose "$TMP/full.png" "$OUT/apple-touch-icon.png"  180
compose "$TMP/safe.png" "$OUT/icon-maskable-512.png" 512

rm -rf "$TMP"
ls -la "$OUT"
