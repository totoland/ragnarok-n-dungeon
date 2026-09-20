import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachTouch, createInput, stickAxes } from '../src/input.js';
import { defaultSettings, bind } from '../src/settings.js';

// Stand-in for `window`: collects listeners so tests can fire synthetic key events. The
// mouse listeners attach to `target.document`, so that is carried too, with its own map.
function fakeTarget() {
  const map = {}, dmap = {};
  const firer = (m) => (type, ev = {}) => {
    let prevented = false;
    const e = { repeat: false, button: 0, ...ev, preventDefault() { prevented = true; } };
    for (const fn of m[type] || []) fn(e);
    return prevented;
  };
  return {
    addEventListener(type, fn) { (map[type] ||= []).push(fn); },
    fire: firer(map),
    document: { addEventListener(type, fn) { (dmap[type] ||= []).push(fn); } },
    fireDoc: firer(dmap),
  };
}

// input.js only accepts clicks that land on the canvas, which it decides with closest().
const hit = (re) => ({ target: { closest: (sel) => (re.test(sel) ? {} : null) } });
const onCanvas = () => hit(/#view/);
const onButton = () => hit(/button/);
const mk = (over) => {
  const t = fakeTarget();
  const s = defaultSettings();
  over?.(s);
  return { t, s, input: createInput(t, { settings: s }) };
};

test('stick deadzone is radial and diagonals stay reachable', () => {
  const dirs = (dx, dy) => {
    const a = stickAxes(dx, dy, 45, 0.22);
    return ['left', 'right', 'up', 'down'].filter((k) => a[k]).join('+') || 'centre';
  };
  assert.equal(dirs(0, 0), 'centre');
  assert.equal(dirs(7, 5), 'centre', 'a wobble inside the deadzone reads as centred');
  assert.equal(dirs(40, 0), 'right');
  assert.equal(dirs(-40, 0), 'left');
  assert.equal(dirs(0, -40), 'up');
  assert.equal(dirs(0, 40), 'down');
  assert.equal(dirs(30, -30), 'right+up', 'true diagonals fire both axes');
  assert.equal(dirs(40, 9), 'right', 'a shallow angle snaps to the dominant axis');
  const far = stickAxes(400, 0, 45, 0.22);
  assert.equal(Math.round(far.x * 100) / 100, 1, 'displacement past the ring is clamped to 1');
});

test('bound keys become held state and clear on keyup', () => {
  const { t, input } = mk();
  t.fire('keydown', { code: 'KeyJ' });
  assert.equal(input.held.attack, true);
  let snap = input.snapshot();
  assert.equal(snap.pressed.attack, true, 'the first frame sees the edge');
  assert.equal(snap.held.attack, true);
  snap = input.snapshot();
  assert.equal(snap.pressed.attack, undefined, 'the edge is consumed once');
  assert.equal(snap.held.attack, true, 'but it is still held');
  t.fire('keyup', { code: 'KeyJ' });
  assert.equal(input.held.attack, false);
});

test('unbound keys are ignored and never swallow the browser default', () => {
  const { t, input } = mk();
  assert.equal(t.fire('keydown', { code: 'F5' }), false, 'preventDefault is not called');
  assert.deepEqual(input.snapshot().pressed, {});
});

test('key-only events (no code) still resolve', () => {
  const { t, input } = mk();
  t.fire('keydown', { key: 'j' });
  assert.equal(input.held.attack, true);
  t.fire('keydown', { key: 'ArrowLeft' });
  assert.equal(input.held.left, true);
});

test('edge actions call listeners instead of entering held state', () => {
  const { t, input } = mk();
  let pauses = 0;
  input.on('pause', () => { pauses++; });
  t.fire('keydown', { code: 'KeyP' });
  assert.equal(pauses, 1);
  t.fire('keydown', { code: 'KeyP', repeat: true });
  assert.equal(pauses, 1, 'auto-repeat does not re-fire');
  assert.equal(input.held.pause, undefined, 'pause never becomes a held direction');
});

test('rebinding takes effect live and drops the old key', () => {
  const { t, s, input } = mk();
  bind(s.keys, 'jump', 0, 'KeyJ');
  input.setBindings(s);
  t.fire('keydown', { code: 'KeyJ' });
  assert.equal(input.held.jump, true);
  assert.ok(!input.held.attack, 'the old owner no longer responds');
});

test('disabling input stops gameplay keys and clears what was held', () => {
  const { t, input } = mk();
  t.fire('keydown', { code: 'KeyD' });
  assert.equal(input.held.right, true);
  input.setEnabled(false);
  assert.equal(input.held.right, false, 'a key held when the menu opened does not stick');
  t.fire('keydown', { code: 'KeyD' });
  assert.equal(input.held.right, false);
  assert.deepEqual(input.snapshot().pressed, {});
  input.setEnabled(true);
  t.fire('keydown', { code: 'KeyD' });
  assert.equal(input.held.right, true);
});

test('capture intercepts the next key without feeding the game', () => {
  const { t, input } = mk();
  let got = null;
  input.setEnabled(false);
  input.captureNext((ev) => { got = ev; });
  assert.equal(input.capturing, true);
  t.fire('keydown', { code: 'KeyQ' });
  assert.deepEqual(got, { type: 'key', code: 'KeyQ', repeat: false });
  assert.equal(input.capturing, false, 'capture resolves once');
  assert.equal(input.held.attack, undefined);
  // A cancelled capture leaves nothing armed.
  const cancel = input.captureNext(() => { got = 'second'; });
  cancel();
  t.fire('keydown', { code: 'KeyW' });
  assert.equal(got.code, 'KeyQ', 'the cancelled handler never ran');
});

test('set and press drive the same state the touch layer uses', () => {
  const { input } = mk();
  let pauses = 0;
  input.on('pause', () => { pauses++; });
  input.set('left', true);
  assert.equal(input.held.left, true);
  assert.equal(input.snapshot().pressed.left, true);
  input.set('left', false);
  assert.equal(input.held.left, false);
  input.press('pause');
  assert.equal(pauses, 1, 'edge actions route to listeners');
  input.press('attack');
  assert.equal(input.snapshot().pressed.attack, true);
});

test('mouse buttons drive attack and skills, and only over the canvas', () => {
  const { t, input } = mk();
  const click = (button, where = onCanvas()) => {
    t.fireDoc('mousedown', { button, ...where });
    const snap = input.snapshot();
    t.fireDoc('mouseup', { button, ...where });
    return Object.keys(snap.pressed);
  };

  assert.deepEqual(click(0), ['attack'], 'left click is the swing');
  assert.deepEqual(click(2), ['skill1'], 'right click is the first skill');
  assert.deepEqual(click(1), [], 'middle click is unbound by default');

  // The whole reason clicks are filtered by target: binding attack to left click must not
  // make choosing a hero, or opening settings, also swing.
  assert.deepEqual(click(0, onButton()), [], 'a click on a UI button fires nothing');

  // Repeats have to land - a held flag that never cleared would swallow every click but one.
  assert.deepEqual([click(0), click(0), click(0)], [['attack'], ['attack'], ['attack']]);
});

test('a held mouse button releases, and right-click keeps its menu shut only over the canvas', () => {
  const { t, input } = mk();
  t.fireDoc('mousedown', { button: 0, ...onCanvas() });
  assert.equal(input.held.attack, true, 'held while down');
  t.fireDoc('mouseup', { button: 0, ...onCanvas() });
  assert.equal(input.held.attack, false, 'released on mouseup');

  assert.equal(t.fireDoc('contextmenu', onCanvas()), true, 'suppressed over the game');
  assert.equal(t.fireDoc('contextmenu', onButton()), false, 'left alone over the UI');
});

test('rebinding a mouse button steals it, like every other binding', () => {
  const { t, s, input } = mk((st) => bind(st.mouse, 'jump', 0, 'Mouse0'));
  input.setBindings(s);
  assert.deepEqual(s.mouse.attack, [], 'attack lost the button it shared');
  t.fireDoc('mousedown', { button: 0, ...onCanvas() });
  assert.deepEqual(Object.keys(input.snapshot().pressed), ['jump']);
});

// A minimal DOM for the touch layer: elements with listeners, classes, style, dataset, and
// a window that carries the touch events. Enough to prove the release paths.
function fakeEl(id, extra = {}) {
  const listeners = {};
  const cls = new Set();
  return {
    id, hidden: false, style: { setProperty() {} }, dataset: extra.dataset || {},
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) },
    addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
    dispatch(t, ev = {}) { for (const fn of listeners[t] || []) fn({ type: t, preventDefault() {}, ...ev }); },
    setPointerCapture() {}, getBoundingClientRect: () => ({ left: 100, top: 100, width: 150, height: 150 }),
    querySelectorAll: () => extra.buttons || [],
    ...extra,
  };
}
function fakeTouchDom() {
  const attack = fakeEl('b-attack', { dataset: { k: 'attack' } });
  const touch = fakeEl('touch', { buttons: [attack] });
  const stick = fakeEl('stick'), knob = fakeEl('stick-knob'), zone = fakeEl('stick-zone');
  const byId = { touch, stick, 'stick-knob': knob, 'stick-zone': zone };
  const root = { getElementById: (id) => byId[id] || null, querySelector: () => null, addEventListener() {}, hidden: false, body: { classList: { toggle() {} } } };
  const win = fakeEl('window', { matchMedia: () => ({ matches: true }), setInterval: (fn) => { win.tick = fn; return 1; }, ontouchstart: null });
  return { attack, zone, root, win };
}
const touchEv = (ids, changed = ids) => ({ touches: ids.map((identifier) => ({ identifier })), changedTouches: changed.map((identifier) => ({ identifier, clientX: 260, clientY: 175 })) });

test('touch: a button whose pointerup never came still lets go when the last finger leaves the glass', () => {
  const { attack, zone, root, win } = fakeTouchDom();
  const input = createInput(fakeTarget(), { settings: defaultSettings() });
  attachTouch(input, { root, win, settings: { touch: { mode: 'on', floating: false } } });
  win.dispatch('touchstart', touchEv([7]));
  attack.dispatch('touchstart', touchEv([7]));
  win.dispatch('touchstart', touchEv([7, 8], [8]));
  zone.dispatch('touchstart', touchEv([7, 8], [8]));
  let snap = input.snapshot();
  assert.equal(snap.held.attack, true, 'attack held'); assert.equal(snap.held.right, true, 'stick pushed right');
  // the buttons' own touchends went missing; a window touchend with no fingers left still arrives
  win.dispatch('touchend', touchEv([], [7, 8]));
  snap = input.snapshot();
  assert.equal(snap.held.attack, false, 'attack released'); assert.equal(snap.held.right, false, 'stick released');
  assert.equal(attack.classList.contains('down'), false);
});

test('touch: the watchdog frees a touch press with no finger down, and leaves a mouse press alone', () => {
  const { attack, root, win } = fakeTouchDom();
  const input = createInput(fakeTarget(), { settings: defaultSettings() });
  attachTouch(input, { root, win, settings: { touch: { mode: 'on' } } });
  attack.dispatch('touchstart', touchEv([1]));  // the window never counted this finger: nothing on the glass
  assert.equal(input.snapshot().held.attack, true);
  win.tick();
  assert.equal(input.snapshot().held.attack, false, 'lost release recovered');
  attack.dispatch('pointerdown', { pointerId: 2, pointerType: 'mouse' });
  win.tick();
  assert.equal(input.snapshot().held.attack, true, 'a mouse hold is not a lost touch');
  attack.dispatch('pointerup', { pointerId: 2 });
  assert.equal(input.snapshot().held.attack, false);
});

test('touch events drive a button and the stick by touch identifier; synthesised pointer events are ignored', () => {
  const { attack, zone, root, win } = fakeTouchDom();
  const input = createInput(fakeTarget(), { settings: defaultSettings() });
  attachTouch(input, { root, win, settings: { touch: { mode: 'on', floating: false } } });
  win.dispatch('touchstart', touchEv([1]));
  attack.dispatch('touchstart', touchEv([1]));
  attack.dispatch('pointerdown', { pointerId: 3, pointerType: 'touch' });   // Safari's synthesised twin: ignored
  assert.equal(input.snapshot().held.attack, true);
  win.dispatch('touchstart', touchEv([1, 2], [2]));
  zone.dispatch('touchstart', touchEv([1, 2], [2]));
  assert.equal(input.snapshot().held.right, true, 'second finger drives the stick');
  attack.dispatch('pointerup', { pointerId: 3, pointerType: 'touch' });     // ignored too
  assert.equal(input.snapshot().held.attack, true, 'a synthesised pointerup does not release a touch hold');
  attack.dispatch('touchend', touchEv([2], [1]));
  win.dispatch('touchend', touchEv([2], [1]));
  let snap = input.snapshot();
  assert.equal(snap.held.attack, false, 'its own touchend releases it'); assert.equal(snap.held.right, true, 'the stick finger is untouched');
  zone.dispatch('touchend', touchEv([], [2]));
  win.dispatch('touchend', touchEv([], [2]));
  assert.equal(input.snapshot().held.right, false);
});

test('touch: a new finger on an otherwise empty glass clears a hold whose release was lost', () => {
  const { attack, root, win } = fakeTouchDom();
  const input = createInput(fakeTarget(), { settings: defaultSettings() });
  attachTouch(input, { root, win, settings: { touch: { mode: 'on' } } });
  win.dispatch('touchstart', touchEv([1]));
  attack.dispatch('touchstart', touchEv([1]));
  assert.equal(input.snapshot().held.attack, true);
  // the release for finger 1 never arrives; later a fresh finger 5 lands somewhere else
  win.dispatch('touchstart', touchEv([5], [5]));
  assert.equal(input.snapshot().held.attack, false, 'the stale hold is dropped before the new press');
});
