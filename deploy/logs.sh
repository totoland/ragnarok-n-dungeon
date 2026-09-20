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
echo "$LINES" | python3 "$SCRIPT_DIR/logs_fmt.py"
