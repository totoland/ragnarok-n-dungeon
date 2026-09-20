"""Pretty-print telemetry lines (one JSON object per line) from stdin. Used by logs.sh."""
import json
import sys

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        r = json.loads(line)
    except Exception:
        print('?', line[:120])
        continue
    p = r.get('perf') or {}
    g = r.get('game') or {}
    i = r.get('input') or {}
    at = (r.get('at') or '')[11:19]
    # The last twelve characters of "ios-<sha>-dirty" are neither the tag nor the commit,
    # which cost a round of wondering whether the device was running the fix at all.
    build = (r.get('build') or '')
    print(f"— {at} {r.get('session')}#{r.get('n')} {r.get('reason')} env={r.get('env')} build={build} {r.get('css')}@{r.get('devicePR')}")
    print(f"   fps {p.get('fps')} p50 {p.get('p50')} p95 {p.get('p95')} worst {p.get('worst')} dpr {p.get('dpr')}/{p.get('dprMax')} "
          f"refresh {p.get('refreshHz')} pacing {p.get('pacing')} long {p.get('longShare')}%")
    gpu = p.get('gpu') or {}
    if gpu:
        print(f"   gpu: programs {gpu.get('programs')} geometries {gpu.get('geometries')} "
              f"textures {gpu.get('textures')} calls {gpu.get('calls')} tris {gpu.get('tris')}")
    if r.get('spikes'):
        print('   spikes: ' + ' | '.join(r['spikes']))
    if g:
        print(f"   game: {g.get('hero')} {g.get('town')}/{g.get('room')} t={g.get('t')} {g.get('phase')} lv{g.get('level')} "
              f"hp{g.get('hp')} state={g.get('state')}/{g.get('attack')} hold={g.get('hold')} "
              f"enemies={g.get('alive')}/{g.get('enemies')}")
    raw = i.get('raw') or {}
    if raw:
        print(f"   input: held {raw.get('held')} pad {raw.get('pad')} padHeld {raw.get('padHeld')}")
    tr = i.get('trace') or []
    if tr:
        print('   trace: ' + '; '.join(f'{t}:{w}' for t, w in tr[-14:]))
    if r.get('errors'):
        print('   errors: ' + ' | '.join(r['errors']))
    print('   ua: ' + (r.get('ua') or '')[:100])
