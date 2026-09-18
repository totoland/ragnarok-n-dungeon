// Keyboard / gamepad / touch → sim input snapshots. `snapshot()` is called once per sim tick
// and returns the keys held now plus the keys pressed since the previous snapshot
// (edge-triggered), then clears the edge set. Nothing here knows about the game.
//
// Bindings come from src/settings.js rather than a const table, so the settings menu can
// rebind anything at runtime via `setBindings`.
import { loadSettings, lookup, DEFAULT_TOUCH } from './settings.js';

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
  const held = {};
  let pressed = {};
  let enabled = true;
  let capture = null;               // set while the settings menu is listening for a button
  const listeners = { confirm: [], mute: [], pause: [] };

  function rebuild() {
    keyMap = lookup(settings.keys);
    padMap = lookup(settings.pad);
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

  // Gamepad: polled once per snapshot. Movement is the left stick / d-pad and is not
  // rebindable; every face and shoulder button goes through padMap.
  const padHeld = {};
  let padPrev = {};
  const firstPad = () => {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    return pads && [...pads].find((p) => p && p.connected);
  };
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
      if (on && !padPrev['#' + i]) { if (listeners[k]) listeners[k].forEach((fn) => fn()); else pressed[k] = true; }
      if (!listeners[k]) padHeld[k] = padHeld[k] || on;
    }
    padPrev = now;
  }

  return {
    held,
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
    press(k) { if (listeners[k]) listeners[k].forEach((fn) => fn()); else { pressed[k] = true; } },
    set(k, on) { if (on && !held[k]) pressed[k] = true; held[k] = on; },
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
  const touch = root.getElementById('touch');
  if (!touch) return null;
  const stick = root.getElementById('stick');
  const knob = root.getElementById('stick-knob');
  const zone = root.getElementById('stick-zone');
  if (!stick || !knob || !zone) return null;

  let cfg = { ...DEFAULT_TOUCH, ...(opts.settings?.touch || {}) };
  let sid = null, cx = 0, cy = 0;

  const coarse = () => (typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
    : false);
  const wanted = () => (cfg.mode === 'on' ? true : cfg.mode === 'off' ? false : coarse());

  function layout() {
    const on = wanted();
    touch.hidden = !on;
    document.body.classList.toggle('touch', on);
    document.body.classList.toggle('touch-right', on && cfg.side === 'right');
    touch.style.setProperty('--stick-size', `${cfg.size}px`);
    touch.style.setProperty('--touch-alpha', String(cfg.opacity));
    stick.classList.toggle('floating', !!cfg.floating);
    if (!on) { release(); return; }
    // Floating mode hides the ring until touched; parked mode drops it back on its CSS anchor.
    if (cfg.floating) stick.style.opacity = '0';
    else { stick.style.opacity = ''; stick.style.left = ''; stick.style.top = ''; }
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

  zone.addEventListener('pointerdown', (e) => {
    if (sid !== null) return;
    sid = e.pointerId;
    if (cfg.floating) { cx = e.clientX; cy = e.clientY; place(cx, cy); }
    else {
      // Measured per gesture, never cached: the ring's centre moves when an overlay hides
      // the touch layer, when the phone rotates, and when a media query repositions it.
      // A centre cached at boot is measured while the title overlay still has the layer
      // display:none, which reads as (0,0) and makes every drag look like "down".
      const r = stick.getBoundingClientRect();
      if (r.width) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
      else { cx = e.clientX; cy = e.clientY; }
    }
    try { zone.setPointerCapture(sid); } catch { /* synthetic pointer */ }
    apply(e.clientX - cx, e.clientY - cy);
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== sid) return;
    apply(e.clientX - cx, e.clientY - cy);
    e.preventDefault();
  });
  const end = (e) => { if (e.pointerId === sid) release(); };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  zone.addEventListener('lostpointercapture', end);

  const buzz = (ms) => { if (cfg.haptics && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms); };
  for (const b of touch.querySelectorAll('.tbtn')) {
    const k = b.dataset.k;
    const edge = b.dataset.edge === '1';
    b.addEventListener('pointerdown', (e) => {
      if (edge) input.press(k); else input.set(k, true);
      b.classList.add('down');
      buzz(12);
      try { b.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      e.preventDefault();
    });
    const up = () => { if (!edge) input.set(k, false); b.classList.remove('down'); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Rotating a phone changes which media query applies, so the parked ring has to be put
  // back on its CSS position. Never re-layout mid-drag: a mobile browser also fires resize
  // when the URL bar collapses, and that would drop the stick under the player's thumb.
  const onResize = () => { if (sid === null) layout(); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => { onResize(); setTimeout(onResize, 250); });
  layout();

  return {
    get active() { return wanted(); },
    /** Re-read touch settings after the menu changes them. */
    refresh(settings) { cfg = { ...DEFAULT_TOUCH, ...(settings?.touch || {}) }; release(); layout(); },
    layout,
  };
}
