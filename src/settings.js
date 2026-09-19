// Persisted player settings: key / gamepad bindings and virtual-stick layout.
// Pure data plus localStorage I/O, so the sim and the tests can use it without a DOM.
// Everything here is defensive: a corrupt or half-written store must never brick the game,
// so `normalize` rebuilds anything it does not recognise from the defaults.

export const STORE_KEY = 'dro.settings.v1';
export const SLOTS = 3;              // bindings shown per action

export const GROUPS = { move: 'Movement', fight: 'Combat', system: 'System' };

export const ACTIONS = [
  { id: 'left', label: 'Move left', group: 'move' },
  { id: 'right', label: 'Move right', group: 'move' },
  { id: 'up', label: 'Move back', group: 'move' },
  { id: 'down', label: 'Move forward', group: 'move' },
  { id: 'attack', label: 'Attack', group: 'fight' },
  { id: 'jump', label: 'Jump', group: 'fight' },
  { id: 'dash', label: 'Dash', group: 'fight' },
  { id: 'skill1', label: 'Skill 1', group: 'fight' },
  { id: 'skill2', label: 'Skill 2', group: 'fight' },
  { id: 'skill3', label: 'Skill 3', group: 'fight' },
  { id: 'confirm', label: 'Confirm / start', group: 'system' },
  { id: 'pause', label: 'Pause', group: 'system' },
  { id: 'mute', label: 'Mute', group: 'system' },
];

export const ACTION_IDS = ACTIONS.map((a) => a.id);

export const DEFAULT_KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  attack: ['KeyJ', 'KeyZ', 'Space'],
  jump: ['KeyK', 'KeyX'],
  dash: ['KeyL', 'ShiftLeft', 'KeyC'],
  skill1: ['KeyU', 'Digit1'],
  skill2: ['KeyI', 'Digit2'],
  skill3: ['KeyO', 'Digit3'],
  confirm: ['Enter'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
};

// MouseEvent.button, as `Mouse<n>`. Its own map rather than extra key slots: a mouse is a
// third device like the pad, and folding it into `keys` would spend one of the three key
// slots an action gets. Movement is deliberately absent - there is nothing to aim at in a
// belt-scroller, so the mouse is a pair of extra fire buttons and nothing more.
export const DEFAULT_MOUSE = {
  left: [], right: [], up: [], down: [],
  attack: ['Mouse0'], jump: [], dash: [],
  skill1: ['Mouse2'], skill2: [], skill3: [],
  confirm: [], pause: [], mute: [],
};

// Standard-mapping gamepad button indexes. Movement is the stick and d-pad, which are read
// directly as axes in input.js and are deliberately not rebindable.
export const DEFAULT_PAD = {
  left: [], right: [], up: [], down: [],
  attack: [2], jump: [0], dash: [1],
  skill1: [3], skill2: [5], skill3: [4],
  confirm: [9], pause: [8], mute: [],
};

// Controls the player can reposition. Order is the order the edit overlay walks them.
export const TOUCH_CONTROLS = [
  { key: 'stick', label: 'Stick', sel: '#stick' },
  { key: 'attack', label: 'Attack', sel: '.tbtn[data-k="attack"]' },
  { key: 'jump', label: 'Jump', sel: '.tbtn[data-k="jump"]' },
  { key: 'dash', label: 'Dash', sel: '.tbtn[data-k="dash"]' },
  { key: 'skill1', label: 'Skill 1', sel: '.tbtn[data-k="skill1"]' },
  { key: 'skill2', label: 'Skill 2', sel: '.tbtn[data-k="skill2"]' },
  { key: 'skill3', label: 'Skill 3', sel: '.tbtn[data-k="skill3"]' },
  { key: 'pause', label: 'Pause', sel: '#tbtn-pause' },
];
export const TOUCH_KEYS = TOUCH_CONTROLS.map((c) => c.key);

export const DEFAULT_TOUCH = {
  mode: 'auto',      // auto (coarse pointers only) | on (always) | off
  side: 'left',      // side of the screen the stick lives on
  floating: true,    // stick springs to wherever the thumb lands
  size: 150,         // stick diameter, px
  deadzone: 0.22,    // fraction of the stick radius that reads as centred
  opacity: 0.85,
  haptics: true,
  // Per-control positions as a fraction of the viewport, {x, y} of the control's centre.
  // Empty means "use the CSS defaults"; the edit overlay seeds every control at once so the
  // layout is never half grid and half absolute. Fractions rather than pixels so a layout
  // survives rotation and different screen sizes.
  layout: {},
};

const TOUCH_RANGE = { size: [110, 220], deadzone: [0.05, 0.5], opacity: [0.25, 1] };
const LAYOUT_RANGE = [0.04, 0.96];
const MODES = ['auto', 'on', 'off'];
const SIDES = ['left', 'right'];

export function defaultSettings() {
  return {
    keys: Object.fromEntries(ACTION_IDS.map((id) => [id, [...(DEFAULT_KEYS[id] || [])]])),
    pad: Object.fromEntries(ACTION_IDS.map((id) => [id, [...(DEFAULT_PAD[id] || [])]])),
    mouse: Object.fromEntries(ACTION_IDS.map((id) => [id, [...(DEFAULT_MOUSE[id] || [])]])),
    touch: { ...DEFAULT_TOUCH, layout: {} },
  };
}

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/** Rebuild a settings object from untrusted input, keeping whatever is usable. */
export function normalize(raw) {
  const out = defaultSettings();
  if (!raw || typeof raw !== 'object') return out;
  for (const field of ['keys', 'pad', 'mouse']) {
    const src = raw[field];
    if (!src || typeof src !== 'object') continue;
    for (const id of ACTION_IDS) {
      if (!Array.isArray(src[id])) continue;
      const ok = field === 'pad'
        ? (v) => Number.isInteger(v) && v >= 0 && v < 32
        : field === 'mouse'
          ? (v) => typeof v === 'string' && /^Mouse[0-4]$/.test(v)
          : (v) => typeof v === 'string' && !!v;
      const valid = src[id].filter(ok).slice(0, SLOTS);
      out[field][id] = [...new Set(valid)];
    }
  }
  const t = raw.touch;
  if (t && typeof t === 'object') {
    if (MODES.includes(t.mode)) out.touch.mode = t.mode;
    if (SIDES.includes(t.side)) out.touch.side = t.side;
    for (const flag of ['floating', 'haptics']) if (typeof t[flag] === 'boolean') out.touch[flag] = t[flag];
    for (const num of ['size', 'deadzone', 'opacity']) {
      if (Number.isFinite(t[num])) out.touch[num] = clamp(t[num], TOUCH_RANGE[num]);
    }
    if (t.layout && typeof t.layout === 'object') {
      for (const key of TOUCH_KEYS) {
        const p = t.layout[key];
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        // Clamped so a control saved off-screen, or saved on a much wider device, can still
        // be reached and dragged back.
        out.touch.layout[key] = { x: clamp(p.x, LAYOUT_RANGE), y: clamp(p.y, LAYOUT_RANGE) };
      }
    }
  }
  return out;
}

const store = (given) => given || (typeof localStorage !== 'undefined' ? localStorage : null);

export function loadSettings(given) {
  const s = store(given);
  if (!s) return defaultSettings();
  try {
    return normalize(JSON.parse(s.getItem(STORE_KEY)));
  } catch {
    return defaultSettings();    // unreadable or not JSON: fall back rather than throw at boot
  }
}

export function saveSettings(settings, given) {
  const s = store(given);
  if (!s) return settings;
  try {
    s.setItem(STORE_KEY, JSON.stringify(settings));
  } catch { /* private mode / quota: settings stay in memory for this session */ }
  return settings;
}

export function clearSettings(given) {
  const s = store(given);
  try { s?.removeItem(STORE_KEY); } catch { /* ignore */ }
  return defaultSettings();
}

/** `{ action: [code] }` -> `{ code: action }` for O(1) event lookup. */
export function lookup(bindings) {
  const map = {};
  for (const id of ACTION_IDS) for (const code of bindings[id] || []) map[code] = id;
  return map;
}

/**
 * Bind `code` to `action` at `slot`, removing it from wherever else it was bound so one
 * physical button never drives two actions. Mutates and returns `bindings`.
 */
export function bind(bindings, action, slot, code) {
  if (!ACTION_IDS.includes(action)) return bindings;
  for (const id of ACTION_IDS) {
    const list = bindings[id];
    if (!list) continue;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] === code && !(id === action && i === slot)) list.splice(i, 1);
    }
  }
  const list = bindings[action];
  while (list.length < slot) list.push(undefined);
  list[slot] = code;
  bindings[action] = list.filter((v) => v !== undefined && v !== null).slice(0, SLOTS);
  return bindings;
}

export function unbind(bindings, action, slot) {
  const list = bindings[action];
  if (Array.isArray(list) && slot < list.length) list.splice(slot, 1);
  return bindings;
}

/** Actions left with nothing bound, so the UI can warn instead of silently losing a control. */
export function unbound(settings) {
  return ACTION_IDS.filter((id) => !(settings.keys[id] || []).length
    && !(settings.pad[id] || []).length && !(settings.mouse?.[id] || []).length);
}

const NAMED = {
  Space: 'Space', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: 'Bksp', Delete: 'Del',
  ShiftLeft: 'L Shift', ShiftRight: 'R Shift', ControlLeft: 'L Ctrl', ControlRight: 'R Ctrl',
  AltLeft: 'L Alt', AltRight: 'R Alt', MetaLeft: 'L Meta', MetaRight: 'R Meta',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Backquote: '`',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
};

/** Human label for a KeyboardEvent.code. */
export function keyLabel(code) {
  if (!code) return '';
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

const MOUSE_NAMED = {
  Mouse0: 'L Click', Mouse1: 'M Click', Mouse2: 'R Click',
  Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
};

/** Human label for a `Mouse<n>` code. */
export function mouseLabel(code) { return MOUSE_NAMED[code] || code || ''; }

const PAD_NAMED = {
  0: 'A / ✕', 1: 'B / ○', 2: 'X / □', 3: 'Y / △', 4: 'LB / L1', 5: 'RB / R1',
  6: 'LT / L2', 7: 'RT / R2', 8: 'Select', 9: 'Start', 10: 'L Stick', 11: 'R Stick',
  12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right', 16: 'Home',
};

/** Human label for a gamepad button index. */
export function padLabel(index) {
  return PAD_NAMED[index] ?? `Btn ${index}`;
}

/** One-line control hint for the HUD, built from the live bindings. */
export function hintLine(settings) {
  const k = (id) => keyLabel((settings.keys[id] || [])[0]) || '—';
  return `Move ${k('left')} ${k('up')} ${k('right')} ${k('down')} · Attack ${k('attack')} · Jump ${k('jump')}`
    + ` · Dash ${k('dash')} · Skills ${k('skill1')} ${k('skill2')} ${k('skill3')} · Pause ${k('pause')}`;
}
