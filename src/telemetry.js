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
      spikes.push(`${dt.toFixed(0)}ms ${near.length ? '@ ' + near.join(', ') : g ? `in ${g.room?.name} t=${g.t.toFixed(0)}s` : 'title'}`);
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
      perf: { fps: s.length ? Math.round(1000 / pct(0.5)) : 0, p50: +pct(0.5).toFixed(1), p95: +pct(0.95).toFixed(1), worst: Math.round(worst), frames: s.length, dpr: world.dpr, dprMax: world.dprMax, refreshHz: world.refreshHz, pacing: world.pacing, longShare: world.longShare, warmMs: world.warmMs, canvas: r ? `${r.domElement.width}x${r.domElement.height}` : '' },
      spikes: spikes.slice(),
      marks: (world.marks || []).slice(-8).map((m) => m.label),
      game: g ? { hero: g.player.hero, town: g.dungeon.town, room: g.room?.name, t: +g.t.toFixed(1), phase: g.phase, level: g.player.level, hp: Math.round(g.player.hp), state: g.player.state, attack: g.player.attack, hold: g.player.holdAttack } : null,
      input: { raw: input.raw(), trace: input.trace().slice(-40) },
      errors: errors.slice(),
      ...(extra ? extra() : {}),
    };
    frames.length = 0; worst = 0;
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    if (!(navigator.sendBeacon && navigator.sendBeacon('/__log', blob))) {
      fetch('/__log', { method: 'POST', body: blob, keepalive: true }).catch(() => {});
    }
  }

  function start() {
    if (timer) return;
    requestAnimationFrame(tick);
    timer = setInterval(() => report('periodic'), PERIOD);
    document.addEventListener('visibilitychange', () => { if (document.hidden) report('hidden'); });
    window.addEventListener('pagehide', () => report('pagehide'));
    console.info(`[telemetry] on (${env}) - reporting every ${PERIOD / 1000}s to /__log`);
  }

  // The server names the environment; lab reports by default.
  fetch('/__env', { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((t) => {
    env = (t || '').trim() || 'dev';
    if (on || env === 'lab') start();
  }).catch(() => { env = 'dev'; if (on) start(); });

  return { get on() { return !!timer; }, report };
}
