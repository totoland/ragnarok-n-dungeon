// Keyboard / gamepad / touch → sim input snapshots. `snapshot()` is called once per sim tick
// and returns the keys held now plus the keys pressed since the previous snapshot
// (edge-triggered), then clears the edge set. Nothing here knows about the game.
//
// Bindings come from src/settings.js rather than a const table, so the settings menu can
// rebind anything at runtime via `setBindings`.
import { loadSettings, lookup, DEFAULT_TOUCH } from './settings.js';
import { applyLayout } from './render/touch-layout.js';

// Events that carry `key` but no `code` (some automation harnesses, a few IMEs) still need to
// resolve, so every bound code gets a `key`-shaped alias too.
function fallbackKey(code) {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return ' ';
  if (code.startsWith('Shift')) return 'shift';
  if (code.startsWith('Control')) return 'control';
  if (code.startsWith('Alt')) return 'alt';
  return code.toLowerCase();
}

/**
 * Stick displacement → the four digital directions the sim understands.
 * Deadzone is radial, not per-axis, so a small thumb wobble near centre never fires a
 * direction and diagonals stay reachable.
 */
export function stickAxes(dx, dy, radius = 45, deadzone = DEFAULT_TOUCH.deadzone) {
  const dist = Math.hypot(dx, dy);
  const dead = radius * deadzone;
  if (dist <= dead) return { x: 0, y: 0, dist, left: false, right: false, up: false, down: false };
  const k = dist > radius ? radius / dist : 1;
  const x = (dx * k) / radius, y = (dy * k) / radius;
  // A direction counts once it owns at least ~40 % of the other axis, which gives eight
  // usable sectors instead of four fighting over the diagonals.
  const gate = 0.38;
  return {
    x, y, dist,
    left: x < 0 && Math.abs(x) > gate * Math.abs(y) - 1e-9 && Math.abs(x) > deadzone * 0.5,
    right: x > 0 && Math.abs(x) > gate * Math.abs(y) - 1e-9 && Math.abs(x) > deadzone * 0.5,
    up: y < 0 && Math.abs(y) > gate * Math.abs(x) - 1e-9 && Math.abs(y) > deadzone * 0.5,
    down: y > 0 && Math.abs(y) > gate * Math.abs(x) - 1e-9 && Math.abs(y) > deadzone * 0.5,
  };
}

export function createInput(target = window, opts = {}) {
  let settings = opts.settings || loadSettings();
  let keyMap = lookup(settings.keys);
  let altMap = {};
  let padMap = lookup(settings.pad);
  let mouseMap = lookup(settings.mouse || {});
  const held = {};
  let pressed = {};
  let enabled = true;
  // A short trace of what the input layer saw - pad edges, touch presses, releases and
  // why - for the diagnostics report. Ring of the last 80 entries, stamped in ms.
  const trace = [];
  const note = (what) => { trace.push([Math.round(typeof performance !== 'undefined' ? performance.now() : Date.now()), what]); if (trace.length > 80) trace.shift(); };
  let capture = null;               // set while the settings menu is listening for a button
  const listeners = { confirm: [], mute: [], pause: [], padStale: [], padLive: [] };

  function rebuild() {
    keyMap = lookup(settings.keys);
    padMap = lookup(settings.pad);
    mouseMap = lookup(settings.mouse || {});
    altMap = {};
    for (const [code, action] of Object.entries(keyMap)) altMap[fallbackKey(code)] = action;
    for (const k in held) held[k] = false;
  }
  rebuild();

  const keyOf = (e) => keyMap[e.code] || altMap[(e.key || '').toLowerCase()];

  target.addEventListener('keydown', (e) => {
    if (capture) {
      e.preventDefault();
      const fn = capture; capture = null;
      fn({ type: 'key', code: e.code || e.key, repeat: e.repeat });
      return;
    }
    const k = keyOf(e);
    if (!k || !enabled) return;
    e.preventDefault();
    if (listeners[k]) { if (!e.repeat) listeners[k].forEach((fn) => fn()); return; }
    if (!held[k]) pressed[k] = true;
    held[k] = true;
  });
  target.addEventListener('keyup', (e) => {
    const k = keyOf(e);
    if (k) { held[k] = false; if (enabled) e.preventDefault(); }
  });
  target.addEventListener('blur', () => { for (const k in held) held[k] = false; });

  // ------------------------------------------------------------------ mouse
  // Only clicks that land on the canvas count. #hud is pointer-events: none so it never
  // swallows them, but the title screen, the settings overlay and the touch buttons are all
  // real controls - binding attack to left click must not make choosing a hero also swing.
  const onCanvas = (e) => {
    const el = e.target;
    if (!el || !el.closest) return false;
    if (el.closest('button, .overlay, #settings, #touch, #skills')) return false;
    return !!el.closest('#view, #frame');
  };

  const doc = target.document || (typeof document !== 'undefined' ? document : null);
  if (doc) {
    doc.addEventListener('mousedown', (e) => {
      const code = `Mouse${e.button}`;
      if (capture) {
        if (!onCanvas(e) && e.button === 0) return;   // the click that opened the slot
        e.preventDefault();
        const fn = capture; capture = null;
        fn({ type: 'mouse', code });
        return;
      }
      if (!enabled || !onCanvas(e)) return;
      const k = mouseMap[code];
      if (!k) return;
      e.preventDefault();
      if (listeners[k]) { listeners[k].forEach((fn) => fn()); return; }
      if (!held[k]) pressed[k] = true;
      held[k] = true;
    });
    doc.addEventListener('mouseup', (e) => {
      const k = mouseMap[`Mouse${e.button}`];
      if (k && !listeners[k]) held[k] = false;
    });
    // Right-click is worth having as a skill button, but only if the context menu stays shut.
    doc.addEventListener('contextmenu', (e) => {
      if ((mouseMap.Mouse2 || capture) && onCanvas(e)) e.preventDefault();
    });
  }

  // Gamepad: polled once per snapshot. Movement is the left stick / d-pad and is not
  // rebindable; every face and shoulder button goes through padMap.
  const padHeld = {};
  let padPrev = {};
  // Which pad is read, and whether it is alive. iPadOS Safari was seen handing back a
  // Gamepad whose state had frozen mid-fight - attack pressed, every other button dead -
  // for a minute at a time, while the controller itself was fine. Two defences: the pad
  // with the newest timestamp is the one read (a re-enumerated controller shows up as a
  // second entry, and the frozen one's clock stops), and a pad whose clock has not moved
  // for `padStaleMs` while it claims a button is down is treated as released until it
  // moves again. The clock also stands still through an honest steady hold, so the limit
  // is generous - eight seconds, longer than any hold-to-attack in practice - and when the
  // pad comes back its buttons are taken as already down, never as fresh presses.
  const padStaleMs = opts.padStaleMs ?? 8000;
  let padIndex = -1, padStamp = -1, padStampAt = 0, padStale = false;
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const firstPad = () => {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let best = null;
    for (const p of pads || []) if (p && p.connected && (!best || (p.timestamp || 0) > (best.timestamp || 0))) best = p;
    return best;
  };
  if (target.addEventListener) {
    target.addEventListener('gamepadconnected', (e) => { note(`pad connected #${e.gamepad?.index} ${e.gamepad?.id || ''}`); padPrev = {}; padIndex = -1; });
    target.addEventListener('gamepaddisconnected', (e) => { note(`pad disconnected #${e.gamepad?.index}`); padPrev = {}; padIndex = -1; });
  }
  function pollPad() {
    for (const k in padHeld) padHeld[k] = false;
    const pad = firstPad();
    if (!pad) return;
    if (capture) {
      for (let i = 0; i < pad.buttons.length; i++) {
        if (pad.buttons[i]?.pressed && !padPrev['#' + i]) {
          const fn = capture; capture = null;
          padPrev = {};
          for (let j = 0; j < pad.buttons.length; j++) padPrev['#' + j] = !!pad.buttons[j]?.pressed;
          fn({ type: 'pad', index: i });
          return;
        }
      }
      for (let j = 0; j < pad.buttons.length; j++) padPrev['#' + j] = !!pad.buttons[j]?.pressed;
      return;
    }
    if (!enabled) return;
    if (pad.index !== padIndex) { if (padIndex !== -1) note(`pad switch #${pad.index} ${pad.id || ''}`); padIndex = pad.index; padPrev = {}; padStamp = -1; }
    // Liveness: the clock moves on every change; a pad claiming a button while its clock
    // stands still for too long is frozen, and its buttons are read as up until it moves.
    const t = nowMs();
    if (pad.timestamp !== padStamp) {
      padStamp = pad.timestamp; padStampAt = t;
      if (padStale) {
        padStale = false;
        note('pad live again');
        listeners.padLive.forEach((fn) => fn());
        padPrev = {};
        for (let i = 0; i < pad.buttons.length; i++) padPrev['#' + i] = !!pad.buttons[i]?.pressed;   // held through, not pressed anew
      }
    }
    const anyDown = [...pad.buttons].some((b) => b?.pressed);
    if (!padStale && anyDown && t - padStampAt > padStaleMs) { padStale = true; note(`pad stale ${Math.round(padStaleMs / 1000)}s - released`); listeners.padStale.forEach((fn) => fn()); }
    if (padStale) { padPrev = {}; return; }
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    padHeld.left = ax < -0.4 || !!pad.buttons[14]?.pressed;
    padHeld.right = ax > 0.4 || !!pad.buttons[15]?.pressed;
    padHeld.up = ay < -0.4 || !!pad.buttons[12]?.pressed;
    padHeld.down = ay > 0.4 || !!pad.buttons[13]?.pressed;
    const now = {};
    for (let i = 0; i < pad.buttons.length; i++) {
      const on = !!pad.buttons[i]?.pressed;
      now['#' + i] = on;
      const k = padMap[i];
      if (!k) continue;
      if (on && !padPrev['#' + i]) { note(`pad #${i} ${k} down`); if (listeners[k]) listeners[k].forEach((fn) => fn()); else pressed[k] = true; }
      else if (!on && padPrev['#' + i]) note(`pad #${i} ${k} up`);
      if (!listeners[k]) padHeld[k] = padHeld[k] || on;
    }
    padPrev = now;
  }

  // ------------------------------------------------------------------ menus
  // An overlay turns gameplay input off, which is right - but pollPad() returns early when
  // it is off, so the pad went completely dead and the Profile panel could not be used with
  // a controller at all. This reads the pad for a menu instead: edge-triggered directions
  // with a repeat, confirm and back, no bindings involved, and nothing written into the
  // sim's held or pressed state.
  const NAV_DELAY = 380, NAV_REPEAT = 130;
  const navNextAt = {};
  let navPrev = {};
  function menuNav() {
    const out = { up: false, down: false, left: false, right: false, confirm: false, back: false };
    const pad = firstPad();
    if (!pad) { navPrev = {}; return out; }
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    const btn = (i) => !!pad.buttons[i]?.pressed;
    const now = {
      left: ax < -0.45 || btn(14), right: ax > 0.45 || btn(15),
      up: ay < -0.45 || btn(12), down: ay > 0.45 || btn(13),
      // A and B in the standard mapping, plus whatever the player bound to confirm.
      confirm: btn(0) || btn(9) || Object.keys(padMap).some((i) => padMap[i] === 'confirm' && btn(+i)),
      back: btn(1) || btn(8),
    };
    const t = nowMs();
    for (const k in now) {
      if (!now[k]) { navNextAt[k] = 0; navPrev[k] = false; continue; }
      if (!navPrev[k]) {                        // the press itself, always
        out[k] = true;
        navNextAt[k] = t + NAV_DELAY;
      } else if (k !== 'confirm' && k !== 'back' && t >= navNextAt[k]) {
        // Only the directions repeat. Holding A should press a button once, not forever.
        out[k] = true;
        navNextAt[k] = t + NAV_REPEAT;
      }
      navPrev[k] = true;
    }
    return out;
  }

  return {
    held,
    /** Pad edges for an overlay, which works while gameplay input is disabled. */
    menuNav,
    get settings() { return settings; },
    /** Swap in edited bindings. Clears held state so a key released while rebinding cannot stick. */
    setBindings(next) { settings = next; rebuild(); },
    /** Gameplay input off while a menu owns the keyboard; capture still works. */
    setEnabled(on) { enabled = on; if (!on) { for (const k in held) held[k] = false; pressed = {}; } },
    get enabled() { return enabled; },
    /** Resolve the next key or pad button to `fn`, for the rebind UI. Returns a canceller. */
    captureNext(fn) { capture = fn; return () => { if (capture === fn) capture = null; }; },
    get capturing() { return !!capture; },
    /** Drive the pad poll while the sim loop is not running (settings menu open). */
    pollCapture() { pollPad(); },
    press(k) { note(`press ${k}`); if (listeners[k]) listeners[k].forEach((fn) => fn()); else { pressed[k] = true; } },
    set(k, on) { if (on !== !!held[k]) note(`set ${k} ${on ? 'on' : 'off'}`); if (on && !held[k]) pressed[k] = true; held[k] = on; },
    note,
    /** The trace and the raw state, for the diagnostics report. */
    trace() { return trace.slice(); },
    raw() {
      const pad = firstPad();
      return {
        held: Object.keys(held).filter((k) => held[k]),
        pad: pad ? { id: pad.id, buttons: [...pad.buttons].map((b, i) => (b?.pressed ? i : -1)).filter((i) => i >= 0), axes: [...pad.axes].map((a) => Math.round(a * 100) / 100) } : null,
        padHeld: Object.keys(padHeld).filter((k) => padHeld[k]),
      };
    },
    snapshot() {
      pollPad();
      const merged = { ...held };
      for (const k in padHeld) if (padHeld[k]) merged[k] = true;
      const snap = { held: merged, pressed };
      pressed = {};
      return snap;
    },
    on(name, fn) { listeners[name].push(fn); },
  };
}

// --------------------------------------------------------------------------------------
// Virtual stick + buttons for coarse pointers.
// The stick is driven from a whole-half-screen zone rather than the ring itself: on a phone
// the thumb rarely lands exactly on a 150 px circle, and in floating mode the ring springs to
// wherever it does land. Returns a handle, or null when touch controls are off.
// --------------------------------------------------------------------------------------
export function attachTouch(input, opts = {}) {
  const root = opts.root || document;
  const win = opts.win || (typeof window !== 'undefined' ? window : null);
  const touch = root.getElementById('touch');
  if (!touch) return null;
  const stick = root.getElementById('stick');
  const knob = root.getElementById('stick-knob');
  const zone = root.getElementById('stick-zone');
  if (!stick || !knob || !zone) return null;

  let cfg = { ...DEFAULT_TOUCH, ...(opts.settings?.touch || {}) };
  let sid = null, sidType = 'touch', cx = 0, cy = 0;
  // On a touch screen the buttons and the stick are driven by Touch Events, not the pointer
  // events synthesised from them: a touch always reports back to the element it began on,
  // which is the capture pointer events promise and iOS Safari does not always keep - a
  // pointerup lost mid-fight is a button that never lets go. Pointer events still serve a
  // mouse or a pen, and are ignored for touch-type pointers when Touch Events are in play.
  const useTouch = !!(win && 'ontouchstart' in win);
  const synthetic = (e) => useTouch && e.pointerType === 'touch';

  const coarse = () => (win && win.matchMedia
    ? win.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in win
    : false);
  const wanted = () => (cfg.mode === 'on' ? true : cfg.mode === 'off' ? false : coarse());

  function layout() {
    const on = wanted();
    touch.hidden = !on;
    const body = root.body || (typeof document !== 'undefined' ? document.body : null);
    body?.classList.toggle('touch', on);
    body?.classList.toggle('touch-right', on && cfg.side === 'right');
    touch.style.setProperty('--stick-size', `${cfg.size}px`);
    touch.style.setProperty('--touch-alpha', String(cfg.opacity));
    stick.classList.toggle('floating', !!cfg.floating);
    if (!on) { release(); return; }
    // Floating mode hides the ring until touched; parked mode drops it back on its CSS anchor.
    if (cfg.floating) stick.style.opacity = '0';
    else { stick.style.opacity = ''; stick.style.left = ''; stick.style.top = ''; }
    applyLayout({ touch: cfg }, root);
  }

  function apply(dx, dy) {
    const R = cfg.size * 0.29;   // ring radius minus the knob's own radius (knob is 42 % wide)
    const a = stickAxes(dx, dy, R, cfg.deadzone);
    knob.style.transform = `translate(${a.x * R}px, ${a.y * R}px)`;
    input.set('left', a.left); input.set('right', a.right);
    input.set('up', a.up); input.set('down', a.down);
  }

  function release() {
    sid = null;
    apply(0, 0);
    input.set('left', false); input.set('right', false); input.set('up', false); input.set('down', false);
    if (cfg.floating) stick.style.opacity = '0';
  }

  function place(x, y) {
    stick.style.left = `${x - cfg.size / 2}px`;
    stick.style.top = `${y - cfg.size / 2}px`;
    stick.style.opacity = '';
  }

  function beginStick(id, type, x, y) {
    sid = id;
    sidType = type;
    if (cfg.floating) { cx = x; cy = y; place(cx, cy); }
    else {
      // Measured per gesture, never cached: the ring's centre moves when an overlay hides
      // the touch layer, when the phone rotates, and when a media query repositions it.
      // A centre cached at boot is measured while the title overlay still has the layer
      // display:none, which reads as (0,0) and makes every drag look like "down".
      const r = stick.getBoundingClientRect();
      if (r.width) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
      else { cx = x; cy = y; }
    }
    apply(x - cx, y - cy);
  }
  zone.addEventListener('pointerdown', (e) => {
    if (sid !== null || synthetic(e)) return;
    beginStick(e.pointerId, e.pointerType || 'mouse', e.clientX, e.clientY);
    try { zone.setPointerCapture(sid); } catch { /* synthetic pointer */ }
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== sid || synthetic(e)) return;
    apply(e.clientX - cx, e.clientY - cy);
    e.preventDefault();
  });
  const end = (e) => { if (e.pointerId === sid && !synthetic(e)) release(); };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  zone.addEventListener('lostpointercapture', end);
  if (useTouch) {
    zone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      if (sid === null) beginStick(t.identifier, 'touch', t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      if (sid === null) return;
      for (const t of e.changedTouches) if (t.identifier === sid) { apply(t.clientX - cx, t.clientY - cy); e.preventDefault(); }
    }, { passive: false });
    const tend = (e) => { for (const t of e.changedTouches) if (t.identifier === sid) release(); };
    zone.addEventListener('touchend', tend);
    zone.addEventListener('touchcancel', tend);
  }

  const buzz = (ms) => { if (cfg.haptics && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms); };
  // Every button currently down, by its release function, so the layer can let go of all
  // of them at once. iOS Safari drops the odd pointerup - a finger that slid off the glass,
  // a second finger the system read as a gesture - and a hold-to-attack button then stays
  // down with nothing on it. Touch events are the reliable channel there: when the last
  // finger leaves the screen nothing can still be held, so everything releases.
  const down = new Map();       // release fn -> pointerType
  let touches = 0;              // fingers on the glass, from the touch events
  const releaseAll = (why = 'release-all') => { if (down.size || sid !== null) input.note(`touch ${why}`); for (const fn of [...down.keys()]) fn(); release(); };
  for (const b of touch.querySelectorAll('.tbtn')) {
    const k = b.dataset.k;
    const edge = b.dataset.edge === '1';
    let tid = null;   // the touch identifier holding this button, when Touch Events drive it
    const up = () => { if (!edge) input.set(k, false); b.classList.remove('down'); down.delete(up); tid = null; };
    const start = (type) => {
      if (edge) input.press(k); else input.set(k, true);
      b.classList.add('down');
      down.set(up, type);
      buzz(12);
    };
    b.addEventListener('pointerdown', (e) => {
      if (synthetic(e)) return;
      start(e.pointerType || 'mouse');
      try { b.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      e.preventDefault();
    });
    const pup = (e) => { if (!synthetic(e)) up(); };
    b.addEventListener('pointerup', pup);
    b.addEventListener('pointercancel', pup);
    b.addEventListener('lostpointercapture', pup);
    if (useTouch) {
      b.addEventListener('touchstart', (e) => {
        const t = e.changedTouches && e.changedTouches[0];
        if (t && tid === null) { tid = t.identifier; start('touch'); }
        e.preventDefault();
      }, { passive: false });
      const tend = (e) => { for (const t of e.changedTouches) if (t.identifier === tid) up(); };
      b.addEventListener('touchend', tend);
      b.addEventListener('touchcancel', tend);
    }
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  if (win) {
    const count = (e) => { touches = e.touches ? e.touches.length : 0; if (touches === 0 && e.type !== 'touchstart') releaseAll('no fingers'); };
    for (const t of ['touchstart', 'touchend', 'touchcancel']) win.addEventListener(t, count, { passive: true });
    // A finger arriving on a glass the browser says is otherwise empty means every hold we
    // still think is down lost its release somewhere; let go before the new press lands.
    win.addEventListener('touchstart', (e) => {
      if (e.touches && e.changedTouches && e.touches.length === e.changedTouches.length && (down.size || sid !== null)) releaseAll('stale hold');
    }, { capture: true, passive: true });
    win.addEventListener('blur', () => releaseAll('blur'));
    if (root.addEventListener) root.addEventListener('visibilitychange', () => { if (root.hidden) releaseAll('hidden'); });
    // Hold watchdog: a touch-pressed button still down while no finger is on the glass is
    // a lost release, whatever event went missing. Mouse presses (touch controls forced on
    // at a desk) are left alone - a mouse is not a touch.
    if (win.setInterval) win.setInterval(() => {
      if (touches !== 0) return;
      let freed = false;
      for (const [fn, type] of down) if (type === 'touch') { fn(); freed = true; }
      if (sid !== null && sidType === 'touch') { release(); freed = true; }
      if (freed) input.note('touch watchdog');
    }, 200);
  }

  // Rotating a phone changes which media query applies, so the parked ring has to be put
  // back on its CSS position. Never re-layout mid-drag: a mobile browser also fires resize
  // when the URL bar collapses, and that would drop the stick under the player's thumb.
  const onResize = () => { if (sid === null) layout(); };
  if (win) {
    win.addEventListener('resize', onResize);
    win.addEventListener('orientationchange', () => { onResize(); setTimeout(onResize, 250); });
  }
  layout();

  return {
    get active() { return wanted(); },
    /** Re-read touch settings after the menu changes them. */
    refresh(settings) { cfg = { ...DEFAULT_TOUCH, ...(settings?.touch || {}) }; release(); layout(); },
    layout,
  };
}
