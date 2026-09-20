// On-screen performance readout, off unless the URL carries ?stats=1.
//
// Exists because the numbers that decide whether this game is viable on a phone cannot be
// measured anywhere else: a desktop browser has a different GPU, a different pixel ratio and
// a different thermal budget. This turns "it feels okay" into something that can be pasted
// into a conversation.

if (new URLSearchParams(location.search).has('stats')) init();

function init() {
  const box = document.createElement('div');
  box.id = 'perfbox';
  box.style.cssText = [
    'position:fixed', 'top:env(safe-area-inset-top,0px)', 'left:0', 'z-index:9999',
    'font:11px/1.45 ui-monospace,Menlo,Consolas,monospace', 'color:#cfe3f2',
    'background:rgba(8,10,14,.82)', 'padding:7px 9px', 'border-radius:0 0 4px 0',
    'white-space:pre', 'pointer-events:none', 'max-width:100vw',
  ].join(';');
  const btn = document.createElement('button');
  btn.textContent = 'Copy';
  btn.type = 'button';
  btn.style.cssText = [
    'position:fixed', 'top:calc(env(safe-area-inset-top,0px) + 4px)', 'left:190px', 'z-index:10000',
    'font:600 12px system-ui', 'padding:6px 12px', 'border-radius:4px',
    'border:1px solid #3a4a5a', 'background:#161d26', 'color:#e7edf2', 'pointer-events:auto',
  ].join(';');
  document.body.append(box, btn);

  const frames = [];
  const spikes = [];   // the last long frames, with what the game was doing
  let last = performance.now(), worst = 0, report = '';

  const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;
  const fmt = (n) => n.toLocaleString();

  function tick() {
    requestAnimationFrame(tick);
    const now = performance.now();
    const dt = now - last;
    last = now;
    // Ignore the first frame after a tab switch, which is arbitrarily long.
    if (dt < 500) {
      frames.push(dt); worst = Math.max(worst, dt);
      if (dt > 40) {
        const marks = window.__dro?.world?.marks || [];
        const near = marks.filter((m) => now - m.at < 400).map((m) => m.label);
        const g = window.__dro?.game;
        spikes.push(`${dt.toFixed(0)}ms ${near.length ? '@ ' + near.join(', ') : g ? `in ${g.room?.name} t=${g.t.toFixed(0)}s` : 'on title'}`);
        if (spikes.length > 5) spikes.shift();
      }
    }
    if (frames.length > 240) frames.shift();
    if (frames.length < 10 || frames.length % 15) return;

    const s = [...frames].sort((a, b) => a - b);
    const p50 = pct(s, 0.5), p95 = pct(s, 0.95);
    const w = window.__dro?.world;
    const r = w?.renderer;
    const i = r?.info;
    // Which GPU driver answers: Chrome names the adapter, Safari says "Apple GPU" and
    // nothing more - a difference worth seeing next to the frame numbers.
    let gpu = '';
    try {
      const gl = r?.getContext();
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? gl.getParameter(gl.RENDERER) : '';
    } catch { /* not every browser exposes it */ }
    const ua = navigator.userAgent;
    const engine = /CriOS/.test(ua) ? 'Chrome (iOS WebKit)' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'other';
    const heap = performance.memory
      ? ` · heap ${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : '';

    report = [
      `FPS ${(1000 / p50).toFixed(0)}   frame ${p50.toFixed(1)} / ${p95.toFixed(1)} ms (p50/p95)`,
      `worst ${worst.toFixed(0)} ms since load${w?.warmMs != null ? ` · warm-up ${w.warmMs} ms` : ''}${w?.longShare != null ? ` · long frames ${w.longShare}%/s` : ''}`,
      spikes.length ? `spikes ${spikes.join(' | ')}` : 'spikes none',
      i ? `draw ${i.render.calls}  tris ${fmt(i.render.triangles)}  tex ${i.memory.textures}  geo ${i.memory.geometries}` : 'renderer not up yet',
      r ? `dpr ${r.getPixelRatio()} of max ${w.dprMax ?? '?'} (device ${window.devicePixelRatio})  canvas ${r.domElement.width}x${r.domElement.height}` : '',
      w ? `refresh ~${w.refreshHz ?? '?'} Hz  pacing ${w.pacing ?? '-'}  touch ${w.coarse ? 'yes' : 'no'}  shadows ${r?.shadowMap?.type === 1 ? 'PCF' : 'PCFSoft'}` : '',
      `${engine}  gpu ${gpu || '?'}`,
      `css ${innerWidth}x${innerHeight}  cores ${navigator.hardwareConcurrency || '?'}${heap}`,
      navigator.userAgent,
    ].filter(Boolean).join('\n');
    box.textContent = report;
  }
  requestAnimationFrame(tick);

  btn.addEventListener('click', () => {
    const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1800); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(report).then(done, done);
    else done();
  });
}
