// Diagnostics the game sends home by itself, so a stutter or a stuck button on someone
// else's tablet can be read after the fact instead of copied off the screen in time.
//
// On by itself on lab (the server says so at /__env), or anywhere with ?log=1 (sticky,
// ?log=0 forgets). Every 10 s, and when the page hides, one small JSON report goes to
// /__log with navigator.sendBeacon: frame times, the last spikes with what the game was
// doing, the pixel ratio, the input layer's trace and raw state, the run's state, and any
// script error. nginx writes each line to its stdout; deploy/logs.sh reads them back.
const KEY = 'dro.log';
const PERIOD = 10000;

// Where the reports go. Empty on the web: /__log sits on the same origin the page came from.
// The native build has no origin to report to, so build-web.mjs stamps an absolute one into
// <meta name="log-endpoint">; reports then reach lab from a device with nothing plugged in.
const ENDPOINT = (document.querySelector('meta[name="log-endpoint"]')?.content || '').replace(/\/+$/, '');
const NATIVE = !!(window.Capacitor?.isNativePlatform?.() ?? window.Capacitor?.isNative)
  || location.protocol === 'capacitor:';

export function createTelemetry({ world, input, game: getGame, extra }) {
  const params = new URLSearchParams(location.search);
  let on = false;
  try {
    if (params.has('log')) { on = params.get('log') !== '0'; localStorage.setItem(KEY, on ? '1' : '0'); }
    else on = localStorage.getItem(KEY) === '1';
  } catch { /* storage unavailable */ }
  const session = Math.random().toString(36).slice(2, 8);
  const frames = [];
  const spikes = [];
  const errors = [];
  let last = performance.now(), worst = 0, env = '?', timer = 0, sent = 0;
  // A small badge so a tester can see it is on and counting; it lives outside the HUD.
  const badge = document.createElement('div');
  badge.id = 'telemetry-badge';
  badge.hidden = true;
  document.body.appendChild(badge);
  const showBadge = () => { badge.hidden = false; badge.textContent = `● log ${env} · ${sent} sent`; };

  window.addEventListener('error', (e) => { errors.push(`${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`); if (errors.length > 5) errors.shift(); });
  window.addEventListener('unhandledrejection', (e) => { errors.push(`rejection: ${String(e.reason).slice(0, 120)}`); if (errors.length > 5) errors.shift(); });

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = now - last;
    last = now;
    if (dt >= 500) return;
    frames.push(dt); worst = Math.max(worst, dt);
    if (frames.length > 600) frames.shift();
    if (dt > 40) {
      const near = (world.marks || []).filter((m) => now - m.at < 400).map((m) => m.label);
      const g = getGame();
      // The ring holds the last six spikes of the whole session, so a report keeps showing
      // the same ones long after they happened - and reading old spikes as new ones cost two
      // rounds of chasing something that had already been fixed. Stamp each with the page
      // clock, and the report says how long ago beside it.
      spikes.push(`[${(now / 1000).toFixed(0)}s] ${dt.toFixed(0)}ms ${near.length ? '@ ' + near.join(', ') : g ? `in ${g.room?.name} t=${g.t.toFixed(0)}s` : 'title'}`);
      if (spikes.length > 6) spikes.shift();
    }
  }

  function report(reason) {
    const s = [...frames].sort((a, b) => a - b);
    const pct = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0);
    const g = getGame();
    const r = world.renderer;
    const body = {
      v: 1, session, n: sent++, reason, at: new Date().toISOString(), env, build: (document.querySelector('meta[name="build"]')?.content) || '',
      ua: navigator.userAgent, css: `${innerWidth}x${innerHeight}`, devicePR: devicePixelRatio,
      perf: { fps: s.length ? Math.round(1000 / pct(0.5)) : 0, p50: +pct(0.5).toFixed(1), p95: +pct(0.95).toFixed(1), worst: Math.round(worst), frames: s.length, dpr: world.dpr, dprMax: world.dprMax, refreshHz: world.refreshHz, pacing: world.pacing, longShare: world.longShare, warmMs: world.warmMs, canvas: r ? `${r.domElement.width}x${r.domElement.height}` : '',
        // Shader programs compiled and still live. A number that climbs during a fight is
        // the renderer recompiling what it just threw away, which shows up as draw time.
        gpu: r ? { programs: r.info.programs?.length || 0, geometries: r.info.memory.geometries, textures: r.info.memory.textures, calls: r.info.render.calls, tris: r.info.render.triangles } : null },
      spikes: spikes.slice(),
      upSec: Math.round(performance.now() / 1000),
      marks: (world.marks || []).slice(-8).map((m) => m.label),
      game: g ? { hero: g.player.hero, town: g.dungeon.town, room: g.room?.name, t: +g.t.toFixed(1), phase: g.phase, level: g.player.level, hp: Math.round(g.player.hp), state: g.player.state, attack: g.player.attack, hold: g.player.holdAttack, enemies: g.enemies.length, alive: g.enemies.filter((e) => !e.dead).length } : null,
      input: { raw: input.raw(), trace: input.trace().slice(-40) },
      errors: errors.slice(),
      ...(extra ? extra() : {}),
    };
    frames.length = 0; worst = 0;
    showBadge();
    badge.classList.remove('blink'); void badge.offsetWidth; badge.classList.add('blink');
    // text/plain, not JSON: a cross-origin beacon with a JSON type needs a preflight that
    // sendBeacon cannot send, and the report would never leave the device. Both servers log
    // the raw body regardless of what it calls itself.
    const blob = new Blob([JSON.stringify(body)], { type: 'text/plain;charset=UTF-8' });
    const url = `${ENDPOINT}/__log`;
    if (!(navigator.sendBeacon && navigator.sendBeacon(url, blob))) {
      fetch(url, { method: 'POST', body: blob, keepalive: true, mode: 'no-cors' }).catch(() => {});
    }
  }

  function start() {
    if (timer) return;
    requestAnimationFrame(tick);
    timer = setInterval(() => report('periodic'), PERIOD);
    document.addEventListener('visibilitychange', () => { if (document.hidden) report('hidden'); });
    window.addEventListener('pagehide', () => report('pagehide'));
    showBadge();
    console.info(`[telemetry] on (${env}) - reporting every ${PERIOD / 1000}s to ${ENDPOINT}/__log`);
  }

  if (ENDPOINT) {
    // A build with an endpoint stamped in was built to be watched: there is no /__env to ask
    // and no address bar to put ?log=1 in, so it reports from the first frame.
    env = NATIVE ? (window.Capacitor?.getPlatform?.() || 'native') : 'packaged';
    start();
  } else {
    // The server names the environment; lab reports by default.
    fetch('/__env', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((t) => {
      env = (t || '').trim() || 'dev';
      if (on || env === 'lab') start();
    }).catch(() => { env = 'dev'; if (on) start(); });
  }

  return { get on() { return !!timer; }, get sent() { return sent; }, report };
}
