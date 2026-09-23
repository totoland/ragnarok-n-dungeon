"""Fetch telemetry lines from Loki and print them oldest-first, one JSON per line.

`kubectl logs` can only show what the running pod still holds: a restart, a redeploy or a
rotation and the reports are gone, which is exactly when you want them. Loki is already
scraping the pod's stdout - the telemetry format writes the report body and nothing else
(deploy/nginx.conf), so the lines land there as they are, with no change to the app.

Used by logs.sh when LOKI_URL is set; without it the script falls back to kubectl.

    python3 logs_loki.py <url> <namespace> <since> [logql-filter]

`since` takes the same shorthand as kubectl: 30m, 2h, 3d.
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request

LIMIT = 5000            # Loki's per-query cap; anything longer is paged
UNITS = {"s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}


def seconds(since):
    m = re.fullmatch(r"(\d+)([smhdw])", since.strip())
    if not m:
        sys.exit(f"logs_loki: cannot read a duration from {since!r} (try 30m, 2h, 3d)")
    return int(m.group(1)) * UNITS[m.group(2)]


def fetch(url, query, start_ns, end_ns):
    q = urllib.parse.urlencode({
        "query": query, "start": start_ns, "end": end_ns,
        "limit": LIMIT, "direction": "backward",
    })
    with urllib.request.urlopen(f"{url}/loki/api/v1/query_range?{q}", timeout=30) as r:
        body = json.load(r)
    if body.get("status") != "success":
        sys.exit(f"logs_loki: {body.get('status')}: {str(body)[:200]}")
    return [(int(ts), line) for s in body["data"]["result"] for ts, line in s["values"]]


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    url = sys.argv[1].rstrip("/")
    namespace, since = sys.argv[2], sys.argv[3]
    extra = sys.argv[4] if len(sys.argv) > 4 else ""
    # Backticks, not quotes: LogQL reads a backticked string raw, so the JSON in the filter
    # needs no escaping on its way through the shell, python and Loki.
    query = '{namespace="%s"} |= `{"v":`%s' % (namespace, (" " + extra) if extra else "")

    end_ns = int(time.time() * 1e9)
    start_ns = end_ns - seconds(since) * 1_000_000_000
    seen, rows = set(), []
    # Page backwards. Each round asks for everything up to the oldest line the last one
    # returned, so a long window is not silently truncated at Loki's cap.
    while True:
        batch = fetch(url, query, start_ns, end_ns)
        if not batch:
            break
        fresh = [(ts, line) for ts, line in batch if (ts, line) not in seen]
        seen.update(fresh)
        rows.extend(fresh)
        if len(batch) < LIMIT:
            break
        oldest = min(ts for ts, _ in batch)
        if oldest <= start_ns:
            break
        end_ns = oldest                     # exclusive of nothing; the dedupe covers the overlap

    rows.sort(key=lambda r: r[0])           # oldest first, the way logs.sh has always printed
    out = sys.stdout
    for _, line in rows:
        out.write(line.rstrip("\n") + "\n")


if __name__ == "__main__":
    main()
