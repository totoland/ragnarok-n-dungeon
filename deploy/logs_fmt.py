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
        # Spikes are stamped with the page clock; show how long before this report each was,
        # so a stale one stops reading like a fresh one.
        up = r.get('upSec')
        out = []
        for sp in r['spikes']:
            if up is not None and sp.startswith('['):
                try:
                    at = int(sp[1:sp.index('s]')])
                    out.append(f"({up - at}s ago) {sp[sp.index(']') + 2:]}")
                    continue
                except (ValueError, IndexError):
                    pass
            out.append(sp)
        print(f"   spikes (now {up}s in): " + ' | '.join(out))
    if g:
        print(f"   game: {g.get('hero')} {g.get('town')}/{g.get('room')} t={g.get('t')} {g.get('phase')} lv{g.get('level')} "
              f"hp{g.get('hp')} state={g.get('state')}/{g.get('attack')} hold={g.get('hold')} "
              f"enemies={g.get('alive')}/{g.get('enemies')}")
        # Every live monster, which the report has carried since the boss went missing and
        # this never printed - so the one field added to answer that question was only
        # readable through `raw` and jq. A coordinate that arrives as None is a NaN: JSON has
        # no way to write one, and a monster at NaN is alive, counted and drawn nowhere.
        for m in g.get('mobs') or []:
            bad = ' <- NaN' if None in (m.get('x'), m.get('y'), m.get('z')) else ''
            far = ' offscreen' if (m.get('off') or 0) > 9 else ''
            print(f"     {m.get('t'):<12} ({m.get('x')},{m.get('y')},{m.get('z')}) "
                  f"hp{m.get('hp')}% {m.get('s')}/{m.get('m')} off {m.get('off')}{far}{bad}")
    sk = r.get('soak') or {}
    if sk:
        print(f"   soak: loop {sk.get('loops')} wave {sk.get('wave')} kills {sk.get('kills')}")
    raw = i.get('raw') or {}
    if raw:
        print(f"   input: held {raw.get('held')} pad {raw.get('pad')} padHeld {raw.get('padHeld')}")
    tr = i.get('trace') or []
    if tr:
        print('   trace: ' + '; '.join(f'{t}:{w}' for t, w in tr[-14:]))
    if r.get('errors'):
        print('   errors: ' + ' | '.join(r['errors']))
    print('   ua: ' + (r.get('ua') or '')[:100])
