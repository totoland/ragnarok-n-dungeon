// Menu navigation: the geometry a stick push turns into a change of focus.
//
// This is the part that is easy to get subtly wrong and hard to notice - a slightly bad score
// does not throw, it just quietly skips the button you were aiming at. The first version of
// it scored a heavy penalty for horizontal offset, which is right on a grid and wrong on a
// column of centred rows: pushing down on the title screen jumped straight past Profile and
// past the start button. So the rule gets a test with real screen shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveFocus } from '../src/render/menu-nav.js';

// A stand-in for a button: only a rect and a focus() the helper can call.
function fake(name, x, y, w = 100, h = 40) {
  const b = {
    name,
    focused: false,
    getBoundingClientRect: () => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h }),
    focus() { for (const o of all) o.focused = false; this.focused = true; doc.activeElement = this; },
  };
  all.push(b);
  return b;
}
let all = [];
const doc = { activeElement: null };

// moveFocus reads document.activeElement, so the module gets a document with one.
globalThis.document = doc;

const at = () => doc.activeElement?.name ?? null;

test('a push lands on the nearest thing that way, not the one that lines up best', () => {
  all = [];
  // The title screen's shape: two hero cards side by side, one centred button under them,
  // then a row of four towns. Pushing down off the right-hand hero must reach the centred
  // button, which is nearer, and not skip to the town row because it lines up better.
  const knight = fake('knight', 690, 270, 260, 120);
  const hunter = fake('hunter', 968, 270, 260, 120);
  const profile = fake('profile', 805, 405, 310, 40);
  const towns = ['prontera', 'morroc', 'phaelan', 'orvane'].map((n, i) => fake(n, 545 + i * 212, 465, 200, 84));
  const list = [knight, hunter, profile, ...towns];

  hunter.focus();
  moveFocus(list, 'down');
  assert.equal(at(), 'profile', 'down from a hero reaches the button under it');
  moveFocus(list, 'down');
  assert.equal(at(), 'morroc', 'and down again reaches the row below');
  moveFocus(list, 'left');
  assert.equal(at(), 'prontera');
  moveFocus(list, 'right');
  assert.equal(at(), 'morroc', 'left then right comes back');
  moveFocus(list, 'up');
  assert.equal(at(), 'profile', 'up retraces the way down');
});

test('a push goes nowhere when there is nothing that way', () => {
  all = [];
  const a = fake('a', 100, 100);
  const b = fake('b', 300, 100);
  const list = [a, b];
  a.focus();
  moveFocus(list, 'left');
  assert.equal(at(), 'a', 'nothing to the left, so focus stays');
  moveFocus(list, 'up');
  assert.equal(at(), 'a');
  moveFocus(list, 'right');
  assert.equal(at(), 'b');
});

test('anything far enough off the push is not that way at all', () => {
  all = [];
  const cur = fake('cur', 500, 500);
  // Directly below but a long way across: past the cone, so a push down must not take it.
  const farAside = fake('farAside', 1800, 560);
  const list = [cur, farAside];
  cur.focus();
  moveFocus(list, 'down');
  assert.equal(at(), 'cur', 'almost due sideways is not "down"');
  moveFocus(list, 'right');
  assert.equal(at(), 'farAside', 'but it is "right"');
});

test('with nothing focused, the first press takes the first button', () => {
  all = [];
  const a = fake('a', 10, 10);
  const b = fake('b', 10, 80);
  doc.activeElement = null;
  moveFocus([a, b], 'down');
  assert.equal(at(), 'a');
});

test('a grid still walks in straight lines', () => {
  all = [];
  // Four across, three down, of the shape the inventory uses - the case the original scoring
  // was built for, which must keep working now that the rule has changed.
  const cells = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) cells.push(fake(`r${r}c${c}`, 100 + c * 90, 100 + r * 90, 80, 80));
  const byName = (n) => cells.find((x) => x.name === n);
  byName('r1c1').focus();
  moveFocus(cells, 'right');
  assert.equal(at(), 'r1c2');
  moveFocus(cells, 'down');
  assert.equal(at(), 'r2c2');
  moveFocus(cells, 'left');
  assert.equal(at(), 'r2c1');
  moveFocus(cells, 'up');
  assert.equal(at(), 'r1c1', 'four presses around a square come home');
});
