import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTION_IDS, SLOTS, defaultSettings, normalize, loadSettings, saveSettings, clearSettings,
  lookup, bind, unbind, unbound, keyLabel, padLabel, hintLine, STORE_KEY,
  TOUCH_KEYS, TOUCH_CONTROLS,
} from '../src/settings.js';

// Minimal localStorage stand-in; the real one is only reachable in a browser.
function fakeStore(seed = null) {
  let v = seed;
  return {
    getItem: () => v,
    setItem: (_, next) => { v = next; },
    removeItem: () => { v = null; },
    get raw() { return v; },
  };
}

test('defaults bind every action and map cleanly to codes', () => {
  const s = defaultSettings();
  assert.deepEqual(Object.keys(s.keys).sort(), [...ACTION_IDS].sort());
  assert.equal(unbound(s).length, 0, 'no action ships unbound');
  const map = lookup(s.keys);
  assert.equal(map.KeyJ, 'attack');
  assert.equal(map.ArrowLeft, 'left');
  assert.equal(lookup(s.pad)[2], 'attack');
});

test('normalize survives garbage and clamps touch values', () => {
  assert.deepEqual(normalize(null), defaultSettings());
  assert.deepEqual(normalize('nope'), defaultSettings());
  const s = normalize({
    keys: { attack: ['KeyQ', 7, null, 'KeyR', 'KeyT', 'KeyY'], nonsense: ['KeyZ'] },
    pad: { jump: [1, 99, -3, 2] },
    touch: { mode: 'sideways', side: 'right', size: 9000, deadzone: -1, opacity: 0.5, haptics: 'yes' },
  });
  assert.deepEqual(s.keys.attack, ['KeyQ', 'KeyR', 'KeyT'], 'non-strings dropped, capped at SLOTS');
  assert.equal(s.keys.attack.length <= SLOTS, true);
  assert.equal('nonsense' in s.keys, false, 'unknown actions are not carried over');
  assert.deepEqual(s.pad.jump, [1, 2], 'out-of-range button indexes dropped');
  assert.equal(s.touch.mode, 'auto', 'invalid enum falls back');
  assert.equal(s.touch.side, 'right', 'valid enum kept');
  assert.equal(s.touch.size, 220, 'size clamped to range');
  assert.equal(s.touch.deadzone, 0.05, 'deadzone clamped to range');
  assert.equal(s.touch.haptics, true, 'non-boolean flag falls back to default');
});

test('settings round-trip through a store, and unreadable data falls back', () => {
  const store = fakeStore();
  const s = defaultSettings();
  bind(s.keys, 'attack', 0, 'KeyQ');
  saveSettings(s, store);
  assert.equal(loadSettings(store).keys.attack[0], 'KeyQ');
  assert.deepEqual(loadSettings(fakeStore('{ not json')), defaultSettings());
  assert.deepEqual(loadSettings(fakeStore('null')), defaultSettings());
  assert.equal(JSON.parse(store.raw) && STORE_KEY.length > 0, true);
  assert.deepEqual(clearSettings(store), defaultSettings());
  assert.equal(store.raw, null);
});

test('binding a code steals it from whatever held it', () => {
  const s = defaultSettings();
  assert.equal(lookup(s.keys).KeyJ, 'attack');
  bind(s.keys, 'jump', 0, 'KeyJ');
  assert.equal(lookup(s.keys).KeyJ, 'jump');
  assert.equal(s.keys.attack.includes('KeyJ'), false, 'attack lost the key it shared');
  assert.equal(s.keys.jump[0], 'KeyJ');
  // Rebinding a slot to what it already holds is a no-op, not a self-steal.
  bind(s.keys, 'jump', 0, 'KeyJ');
  assert.deepEqual(s.keys.jump[0], 'KeyJ');
});

test('unbinding can empty an action, and unbound reports it', () => {
  const s = defaultSettings();
  while (s.keys.jump.length) unbind(s.keys, 'jump', 0);
  while (s.pad.jump.length) unbind(s.pad, 'jump', 0);
  assert.deepEqual(unbound(s), ['jump']);
  bind(s.keys, 'jump', 0, 'KeyB');
  assert.deepEqual(unbound(s), []);
});

test('labels are human readable and the hint follows the bindings', () => {
  assert.equal(keyLabel('KeyJ'), 'J');
  assert.equal(keyLabel('Digit1'), '1');
  assert.equal(keyLabel('ArrowLeft'), '←');
  assert.equal(keyLabel('ShiftLeft'), 'L Shift');
  assert.equal(keyLabel('Space'), 'Space');
  assert.equal(keyLabel(undefined), '');
  assert.equal(keyLabel('F5'), 'F5', 'unknown codes pass through');
  assert.equal(padLabel(0), 'A / ✕');
  assert.equal(padLabel(31), 'Btn 31');
  const s = defaultSettings();
  assert.match(hintLine(s), /Attack J/);
  bind(s.keys, 'attack', 0, 'KeyQ');
  assert.match(hintLine(s), /Attack Q/);
});

test('touch layout ships empty and every control is addressable', () => {
  const s = defaultSettings();
  assert.deepEqual(s.touch.layout, {}, 'empty means "use the CSS defaults"');
  assert.equal(TOUCH_KEYS.length, 8);
  assert.deepEqual(TOUCH_KEYS, TOUCH_CONTROLS.map((c) => c.key));
  for (const c of TOUCH_CONTROLS) {
    assert.ok(c.sel && c.label, `${c.key} needs a selector and a label`);
  }
});

test('a saved layout is clamped back on screen and junk is dropped', () => {
  const s = normalize({
    touch: {
      layout: {
        attack: { x: 4.2, y: -9 },          // saved on a much larger screen, or corrupted
        jump: { x: 0.5, y: 0.8 },           // fine
        dash: { x: 'left', y: 0.5 },        // wrong type
        skill1: { x: 0.3 },                 // missing y
        nonsense: { x: 0.5, y: 0.5 },       // not a control
      },
    },
  });
  const L = s.touch.layout;
  assert.deepEqual(L.attack, { x: 0.96, y: 0.04 }, 'clamped into reach, not discarded');
  assert.deepEqual(L.jump, { x: 0.5, y: 0.8 });
  assert.equal('dash' in L, false);
  assert.equal('skill1' in L, false);
  assert.equal('nonsense' in L, false);
});

test('a hand-placed layout survives a save and load round trip', () => {
  let v = null;
  const store = { getItem: () => v, setItem: (_, n) => { v = n; }, removeItem: () => { v = null; } };
  const s = defaultSettings();
  s.touch.layout = { attack: { x: 0.498, y: 0.769 }, jump: { x: 0.2, y: 0.9 } };
  saveSettings(s, store);
  const back = loadSettings(store);
  assert.deepEqual(back.touch.layout, s.touch.layout);
  // and clearing it returns to the default grid rather than leaving a half layout
  back.touch.layout = {};
  saveSettings(back, store);
  assert.deepEqual(loadSettings(store).touch.layout, {});
});
