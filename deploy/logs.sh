#!/usr/bin/env bash
# Read the client diagnostics back from an environment.
#   ./deploy/logs.sh                  last 30 minutes of lab reports, newest last, pretty
#   ./deploy/logs.sh prod 2h          prod, last two hours
#   ./deploy/logs.sh lab 1h raw       one JSON per line (pipe to jq)
#   ./deploy/logs.sh lab 3d pretty '|= "ios"'     any extra LogQL, Loki only
#
# Two sources. With LOKI_URL set in .deployrc the reports come from Loki, which is already
# scraping the pod's stdout - so they survive a restart, a redeploy and a rotation, and the
# window can be days rather than whatever the live pod still holds. Without it the script
# falls back to `kubectl logs` over ssh, which is where it started and still works alone.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/.deployrc"
TARGET="${1:-lab}"; SINCE="${2:-30m}"; MODE="${3:-pretty}"; FILTER="${4:-}"
case "$TARGET" in lab) NS=$LAB_NAMESPACE ;; prod) NS=$PROD_NAMESPACE ;; *) echo "usage: $0 [lab|prod] [since] [raw] [logql]"; exit 2 ;; esac

if [ -n "${LOKI_URL:-}" ]; then
  SOURCE="loki"
  LINES=$(python3 "$SCRIPT_DIR/logs_loki.py" "$LOKI_URL" "$NS" "$SINCE" "$FILTER")
else
  [ -n "$FILTER" ] && { echo "a LogQL filter needs LOKI_URL in .deployrc"; exit 2; }
  SOURCE="kubectl (live pod only - set LOKI_URL in .deployrc for history)"
  LINES=$(ssh "$PI" "kubectl -n $NS logs deploy/$DEPLOYMENT --all-containers --since=$SINCE 2>/dev/null | grep '^{\"v\":'" || true)
fi

if [ -z "$LINES" ]; then echo "(no reports in the last $SINCE on $TARGET, via $SOURCE)"; exit 0; fi
if [ "$MODE" = raw ]; then echo "$LINES"; exit 0; fi
echo "$LINES" | python3 "$SCRIPT_DIR/logs_fmt.py"
echo "($(echo "$LINES" | wc -l | tr -d ' ') reports from $TARGET over $SINCE, via $SOURCE)"
