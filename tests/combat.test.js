import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxHits, rollDamage, applyHit } from '../src/sim/combat.js';
import { createRng } from '../src/sim/rng.js';

const target = (x, z = 0, y = 0) => ({ x, z, y, hurtbox: { r: 0.5, h: 1.8 } });
const src = { x: 0, z: 0, y: 0 };
const box = { x0: 0.2, x1: 1.8, y0: -0.2, y1: 2.0 };

test('boxHits respects facing', () => {
  assert.ok(boxHits(src, 1, box, target(1.2)));
  assert.ok(!boxHits(src, 1, box, target(-1.2)));
  assert.ok(boxHits(src, -1, box, target(-1.2)));
});

test('boxHits uses the hurtbox radius at the edges', () => {
  assert.ok(boxHits(src, 1, box, target(2.2)), 'radius reaches back into the box');
  assert.ok(!boxHits(src, 1, box, target(2.4)));
});

test('boxHits needs the target on a nearby depth lane', () => {
  assert.ok(boxHits(src, 1, box, target(1, 0.6)));
  assert.ok(!boxHits(src, 1, box, target(1, 1.4)));
  assert.ok(boxHits(src, 1, box, target(1, 1.4), 2.0), 'explicit depth widens it');
});

test('boxHits checks height so a grounded slash misses a launched target', () => {
  assert.ok(!boxHits(src, 1, box, target(1, 0, 2.5)));
  assert.ok(boxHits(src, 1, { ...box, y1: 4 }, target(1, 0, 2.5)));
});

test('radial (both) boxes hit either side', () => {
  const radial = { x0: -2, x1: 2, y0: -0.5, y1: 2.5, both: true };
  assert.ok(boxHits(src, 1, radial, target(-1.5)));
  assert.ok(boxHits(src, 1, radial, target(1.5)));
  assert.ok(!boxHits(src, 1, radial, target(2.8)));
});

test('rollDamage is deterministic for a seed and stays within the variance band', () => {
  const a = createRng(7), b = createRng(7);
  for (let i = 0; i < 50; i++) {
    const ra = rollDamage(10, 1, a), rb = rollDamage(10, 1, b);
    assert.deepEqual(ra, rb);
    assert.ok(ra.dmg >= 9 && ra.dmg <= 18, `dmg ${ra.dmg}`);
    if (!ra.crit) assert.ok(ra.dmg <= 11);
  }
});

test('applyHit launches on upward knockback and scales knockback by mass', () => {
  const light = { hp: 50, vx: 0, vy: 0, hitstun: 0, flash: 0 };
  const heavy = { hp: 50, vx: 0, vy: 0, hitstun: 0, flash: 0 };
  assert.equal(applyHit(light, 10, [6, 5], 0.4, 1, 0.5), false);
  assert.equal(applyHit(heavy, 10, [6, 5], 0.4, 1, 4), false);
  assert.equal(light.hp, 40);
  assert.ok(light.launched);
  assert.ok(light.vx > heavy.vx, 'heavier target is pushed less');
  assert.ok(light.vy > heavy.vy);
  assert.equal(light.hitstun, 0.4);
  assert.equal(applyHit(light, 100, [1, 0], 0.1, -1, 1), true, 'reports the kill');
  assert.equal(light.hp, 0);
});
