#!/usr/bin/env bash
# Read the client diagnostics back from an environment's nginx stdout.
#   ./deploy/logs.sh            last 30 minutes of lab reports, newest last, pretty
#   ./deploy/logs.sh prod 2h    prod, last two hours
#   ./deploy/logs.sh lab 1h raw one JSON per line (pipe to jq)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/.deployrc"
TARGET="${1:-lab}"; SINCE="${2:-30m}"; MODE="${3:-pretty}"
case "$TARGET" in lab) NS=$LAB_NAMESPACE ;; prod) NS=$PROD_NAMESPACE ;; *) echo "usage: $0 [lab|prod] [since] [raw]"; exit 2 ;; esac
LINES=$(ssh "$PI" "kubectl -n $NS logs deploy/$DEPLOYMENT --all-containers --since=$SINCE 2>/dev/null | grep '^{\"v\":'" || true)
if [ -z "$LINES" ]; then echo "(no reports in the last $SINCE on $TARGET)"; exit 0; fi
if [ "$MODE" = raw ]; then echo "$LINES"; exit 0; fi
echo "$LINES" | python3 -c '
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try: r = json.loads(line)
    except Exception: print("?", line[:120]); continue
    p = r.get("perf", {}); g = r.get("game") or {}; i = r.get("input", {})
    print(f"— {r.get(\"at\",\"\")[11:19]} {r.get(\"session\")}#{r.get(\"n\")} {r.get(\"reason\")} env={r.get(\"env\")} build={r.get(\"build\",\"\")[-12:]} {r.get(\"css\")}@{r.get(\"devicePR\")}")
    print(f"   fps {p.get(\"fps\")} p50 {p.get(\"p50\")} p95 {p.get(\"p95\")} worst {p.get(\"worst\")} dpr {p.get(\"dpr\")}/{p.get(\"dprMax\")} refresh {p.get(\"refreshHz\")} pacing {p.get(\"pacing\")} long {p.get(\"longShare\")}%")
    if r.get("spikes"): print("   spikes: " + " | ".join(r["spikes"]))
    if g: print(f"   game: {g.get(\"hero\")} {g.get(\"town\")}/{g.get(\"room\")} t={g.get(\"t\")} {g.get(\"phase\")} lv{g.get(\"level\")} hp{g.get(\"hp\")} state={g.get(\"state\")}/{g.get(\"attack\")} hold={g.get(\"hold\")}")
    raw = i.get("raw") or {}
    if raw: print(f"   input: held {raw.get(\"held\")} pad {raw.get(\"pad\")} padHeld {raw.get(\"padHeld\")}")
    tr = i.get("trace") or []
    if tr: print("   trace: " + "; ".join(f"{t}:{w}" for t, w in tr[-14:]))
    if r.get("errors"): print("   errors: " + " | ".join(r["errors"]))
    ua = r.get("ua", "")
    print("   ua: " + ua[:100])
'
