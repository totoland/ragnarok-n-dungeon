// Keyboard → sim input snapshots. `snapshot()` is called once per sim tick and returns the
// keys held now plus the keys pressed since the previous snapshot (edge-triggered), then
// clears the edge set. Nothing here knows about the game.
const MAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  KeyJ: 'attack', KeyZ: 'attack', Space: 'attack',
  KeyK: 'jump', KeyX: 'jump',
  KeyL: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash', KeyC: 'dash',
  KeyU: 'skill1', Digit1: 'skill1',
  KeyI: 'skill2', Digit2: 'skill2',
  KeyO: 'skill3', Digit3: 'skill3',
  Enter: 'confirm', KeyM: 'mute', KeyP: 'pause', Escape: 'pause',
};

// Fallback for events that carry `key` but no `code` (some automation / IMEs).
const KEY_MAP = {
  arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
  j: 'attack', z: 'attack', ' ': 'attack', k: 'jump', x: 'jump', l: 'dash', shift: 'dash', c: 'dash',
  u: 'skill1', 1: 'skill1', i: 'skill2', 2: 'skill2', o: 'skill3', 3: 'skill3', enter: 'confirm', m: 'mute', p: 'pause', escape: 'pause',
};
const keyOf = (e) => MAP[e.code] || KEY_MAP[(e.key || '').toLowerCase()];

export function createInput(target = window) {
  const held = {};
  let pressed = {};
  const listeners = { confirm: [], mute: [], pause: [] };

  target.addEventListener('keydown', (e) => {
    const k = keyOf(e);
    if (!k) return;
    e.preventDefault();
    if (listeners[k]) { if (!e.repeat) listeners[k].forEach((fn) => fn()); return; }
    if (!held[k]) pressed[k] = true;
    held[k] = true;
  });
  target.addEventListener('keyup', (e) => {
    const k = keyOf(e);
    if (k) { held[k] = false; e.preventDefault(); }
  });
  target.addEventListener('blur', () => { for (const k in held) held[k] = false; });

  // Gamepad: polled once per snapshot; standard mapping (X attack, A jump, B dash, Y/RB/LB skills).
  const PAD = { 2: 'attack', 0: 'jump', 1: 'dash', 3: 'skill1', 5: 'skill2', 4: 'skill3', 9: 'confirm', 8: 'pause' };
  const padHeld = {};
  let padPrev = {};
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && [...pads].find((p) => p && p.connected);
    for (const k in padHeld) padHeld[k] = false;
    if (!pad) return;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    padHeld.left = ax < -0.4 || pad.buttons[14]?.pressed;
    padHeld.right = ax > 0.4 || pad.buttons[15]?.pressed;
    padHeld.up = ay < -0.4 || pad.buttons[12]?.pressed;
    padHeld.down = ay > 0.4 || pad.buttons[13]?.pressed;
    const now = {};
    for (const [i, k] of Object.entries(PAD)) {
      const on = !!pad.buttons[i]?.pressed;
      now[k] = on;
      if (on && !padPrev[k]) { if (listeners[k]) listeners[k].forEach((fn) => fn()); else pressed[k] = true; }
      if (!listeners[k]) padHeld[k] = on;
    }
    padPrev = now;
  }

  return {
    held,
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

// Virtual stick + buttons for coarse pointers. Returns true when enabled.
export function attachTouch(input, root = document) {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const touch = root.getElementById('touch');
  if (!touch) return false;
  if (!coarse && !('ontouchstart' in window)) return false;
  touch.hidden = false;
  document.body.classList.add('touch');

  const stick = root.getElementById('stick'), knob = root.getElementById('stick-knob');
  let sid = null, cx = 0, cy = 0;
  const R = 45;
  const apply = (dx, dy) => {
    const d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const dead = 12;
    input.set('left', dx < -dead); input.set('right', dx > dead);
    input.set('up', dy < -dead); input.set('down', dy > dead);
  };
  const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* synthetic or already-released pointer */ } };
  stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; capture(stick, sid); apply(e.clientX - cx, e.clientY - cy); e.preventDefault(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) { apply(e.clientX - cx, e.clientY - cy); e.preventDefault(); } });
  const release = (e) => { if (e.pointerId === sid) { sid = null; apply(0, 0); } };
  stick.addEventListener('pointerup', release);
  stick.addEventListener('pointercancel', release);

  for (const b of touch.querySelectorAll('.tbtn')) {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', (e) => { input.set(k, true); b.classList.add('down'); capture(b, e.pointerId); e.preventDefault(); });
    const up = () => { input.set(k, false); b.classList.remove('down'); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  return true;
}
