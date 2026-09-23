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

// This is the boss that disappeared when you hit it. A hit with no knockback passes 0 where
// a [x, y] pair goes; indexing that gave undefined, undefined * dir * k gave NaN, and NaN
// went into vx and then into x, where it stayed. The monster kept its health, kept its place
// in the wave and kept being drawn - at no position at all. Only Orvane's gear ever did it,
// because Auto Meteor and Double Attack are the only hits in the game that carry no shove.
test('a hit that carries no knockback leaves the target somewhere', () => {
  const mk = (mass) => ({ x: 4, z: 0, y: 0, vx: 0, vy: 0, hp: 500, hitstun: 0, flash: 0, mass });
  for (const mass of [1, 5.8]) {                 // a minion and a boss: the boss returns early
    const e = mk(mass);
    applyHit(e, 30, 0, 0, 1, mass);
    assert.ok(Number.isFinite(e.vx), `vx is ${e.vx} at mass ${mass}`);
    assert.ok(Number.isFinite(e.vy), `vy is ${e.vy} at mass ${mass}`);
    assert.equal(e.hp, 470, 'and it still took the damage');
  }
  // A shove that was already in flight is not cancelled by a spell landing on top of it.
  const moving = mk(1);
  moving.vx = 7;
  applyHit(moving, 10, 0, 0, 1, 1);
  assert.equal(moving.vx, 7);
  // An ordinary pair still knocks exactly as it did.
  const shoved = mk(1);
  applyHit(shoved, 10, [8, 4], 0.2, -1, 1);
  assert.equal(shoved.vx, -8);
  assert.ok(shoved.vy > 0 && shoved.launched);
});

// The net behind the fix above. Whatever puts a NaN in a position next - and something will,
// eventually - the monster must not be lost: it is alive, it holds up the wave, and it is
// drawn at no position at all, which is indistinguishable from a monster that is not there.
test('a monster whose position goes NaN is put back rather than lost', async () => {
  const { createGame, update, EMPTY_INPUT } = await import('../src/sim/game.js');
  const { createEnemy } = await import('../src/sim/enemies.js');
  const { BAIRUNE } = await import('../src/sim/data/dungeon.js');
  const g = createGame({ hero: 'knight', seed: 3, dungeon: BAIRUNE });
  for (let i = 0; i < 4; i++) update(g, EMPTY_INPUT);
  const e = createEnemy(g, 'craboon', g.player.x + 4, 0);
  g.enemies.push(e);
  for (let i = 0; i < 10; i++) update(g, EMPTY_INPUT);
  const wasNear = e.x;
  e.vx = NaN;                                      // however it got there
  for (let i = 0; i < 4; i++) update(g, EMPTY_INPUT);
  assert.ok(Number.isFinite(e.x), `x is ${e.x}`);
  assert.ok(Math.abs(e.x - wasNear) < 2, `and near where it was: ${e.x} vs ${wasNear}`);
  assert.ok(g.events.some((ev) => ev.type === 'nanRescue'), 'and it said so, so telemetry sees it');
});

// A boss's second wind. It is the one thing in the game that moves a health bar the wrong
// way, so it gets held to three promises: it happens once, it is worth what it says, and it
// can be taken away from the boss by hitting hard enough during the tell.
test('a boss heals once near death, and only once', async () => {
  const { createGame, update, EMPTY_INPUT } = await import('../src/sim/game.js');
  const { createEnemy } = await import('../src/sim/enemies.js');
  const { MONSTERS } = await import('../src/sim/data/monsters.js');
  const { ORVANE } = await import('../src/sim/data/dungeon.js');
  const def = MONSTERS.darkSword;
  const g = createGame({ hero: 'knight', seed: 2, dungeon: ORVANE });
  g.cheats = { invuln: true };
  for (let i = 0; i < 4; i++) update(g, EMPTY_INPUT);
  const e = createEnemy(g, 'darkSword', g.player.x + 6, 0);
  g.enemies.push(e);
  e.hp = e.hpMax * (def.heal.at - 0.01);          // just across the line
  const low = e.hp;
  for (let i = 0; i < 60 * 4; i++) update(g, EMPTY_INPUT);
  const healed = g.events.filter((ev) => ev.type === 'bossHeal');
  assert.equal(healed.length, 1, 'exactly one second wind');
  assert.ok(e.hp > low, `${low} -> ${e.hp}`);
  assert.ok(Math.abs(healed[0].amount - e.hpMax * def.heal.amount) < 2, `healed ${healed[0].amount}`);
  // Down through the threshold a second time buys nothing.
  e.hp = e.hpMax * 0.05;
  for (let i = 0; i < 60 * 5; i++) update(g, EMPTY_INPUT);
  assert.equal(g.events.filter((ev) => ev.type === 'bossHeal').length, 1, 'still one');
});

test('hitting hard enough during the tell breaks the heal', async () => {
  const { createGame, update, EMPTY_INPUT } = await import('../src/sim/game.js');
  const { createEnemy } = await import('../src/sim/enemies.js');
  const { MONSTERS } = await import('../src/sim/data/monsters.js');
  const { ORVANE } = await import('../src/sim/data/dungeon.js');
  const def = MONSTERS.darkSword;
  const g = createGame({ hero: 'knight', seed: 2, dungeon: ORVANE });
  g.cheats = { invuln: true };
  for (let i = 0; i < 4; i++) update(g, EMPTY_INPUT);
  const e = createEnemy(g, 'darkSword', g.player.x + 6, 0);
  g.enemies.push(e);
  e.hp = e.hpMax * (def.heal.at - 0.01);
  // wait for the wind-up to start, then take off more than `brk` of its maximum
  for (let i = 0; i < 60 * 2 && e.move !== 'heal'; i++) update(g, EMPTY_INPUT);
  assert.equal(e.move, 'heal', 'it started the second wind');
  e.hp -= e.hpMax * (def.heal.brk + 0.01);
  const before = e.hp;
  for (let i = 0; i < 60 * 4; i++) update(g, EMPTY_INPUT);
  assert.equal(g.events.filter((ev) => ev.type === 'bossHeal').length, 0, 'no heal landed');
  assert.equal(g.events.filter((ev) => ev.type === 'healBroken').length, 1, 'it broke');
  assert.ok(e.hp <= before, 'and it did not creep back up');
});

test('every boss has a second wind, and it cannot outrun the fight', async () => {
  const { MONSTERS } = await import('../src/sim/data/monsters.js');
  for (const [key, m] of Object.entries(MONSTERS)) {
    if (!m.boss) continue;
    assert.ok(m.heal, `${key} has one`);
    const h = m.heal;
    assert.ok(h.at > 0 && h.at < 0.5, `${key} heals near death, not in the middle: ${h.at}`);
    assert.ok(h.amount > 0 && h.amount <= 0.4, `${key} heals a share, not a reset: ${h.amount}`);
    // The tell has to be long enough to answer, and breaking it has to be possible with a
    // skill rather than with the whole health bar.
    assert.ok(h.windup >= 1.2, `${key} telegraphs it: ${h.windup}`);
    assert.ok(h.brk > 0 && h.brk < h.amount, `${key} is breakable for less than it gains: ${h.brk} vs ${h.amount}`);
  }
});

// The boss at the door. A monster spawns off-stage and walks in; the walk used to be an
// approach towards the hero, which stops at attack range. With the hero stood near the far
// wall, a boss spawning behind him stopped 2.5 away - still outside the room, so still
// "entering", so never attacking - and the hero could not follow, being already at the edge
// of the floor he is allowed on. Both stood still until the run timed out.
test('a monster spawned outside the room walks in even when the hero is against the wall', async () => {
  const { createGame, update, EMPTY_INPUT } = await import('../src/sim/game.js');
  const { createEnemy } = await import('../src/sim/enemies.js');
  const { ORVANE } = await import('../src/sim/data/dungeon.js');
  const g = createGame({ hero: 'knight', seed: 3, dungeon: ORVANE });
  g.cheats = { invuln: true };
  for (let i = 0; i < 4; i++) update(g, EMPTY_INPUT);
  // hero hard against the right-hand wall, boss just past it - the exact shape of the stall
  g.player.x = g.bounds.xMax - 1.4;
  const e = createEnemy(g, 'darkSword', g.bounds.xMax + 1.1, g.player.z);
  g.enemies.push(e);
  assert.equal(e.state, 'enter');
  for (let i = 0; i < 60 * 8; i++) update(g, EMPTY_INPUT);
  assert.notEqual(e.state, 'enter', 'it got into the room');
  assert.ok(e.x < g.bounds.xMax, `and is inside it: x ${e.x} vs xMax ${g.bounds.xMax}`);
  // and it is doing something about the hero rather than standing there
  let acted = false;
  for (let i = 0; i < 60 * 12 && !acted; i++) { update(g, EMPTY_INPUT); if (e.state === 'windup' || e.state === 'attack') acted = true; }
  assert.ok(acted, `the boss never attacked; state ${e.state} at x ${e.x}`);
});
