// Orvane's gear, which is the first in the game that does something rather than raising a
// number. Three rates fire off a landed hit (sim/game.js rollGearProcs), and they sum across
// the weapon and every charm worn, so the tests here are as much about the merge as the roll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, update, EMPTY_INPUT } from '../src/sim/game.js';
import { ORVANE, TOWNS } from '../src/sim/data/dungeon.js';
import { MONSTERS } from '../src/sim/data/monsters.js';
import { ITEMS, ATTRS, rollItem, fits } from '../src/sim/data/items.js';
import { createEnemy } from '../src/sim/enemies.js';
import { resolveHero, mergeMods } from '../src/sim/resolve.js';
import { itemMods, wearMods } from '../src/sim/data/items.js';
import { HEROES } from '../src/sim/data/heroes.js';

const steps = (g, n, input = EMPTY_INPUT) => { for (let i = 0; i < n; i++) update(g, input); };

// Put one monster in reach and hit it, without waiting for a wave or walking anywhere.
function rigged(gear, { rate = null } = {}) {
  const g = createGame({ hero: 'knight', seed: 11, dungeon: ORVANE, gear });
  steps(g, 2);
  if (rate) for (const k in rate) g.player[k] = rate[k];
  const e = createEnemy(g, 'stringen', g.player.x + 1.2, 0);
  e.hp = 1e6;                       // it has to survive being hit, or the proc has no target
  g.enemies.push(e);
  return { g, e };
}

const swing = (g, n) => {
  const events = [];
  for (let i = 0; i < n; i++) {
    update(g, i % 12 === 0 ? { held: {}, pressed: { attack: true } } : EMPTY_INPUT);
    events.push(...g.events);
  }
  return events;
};

test('Orvane is the fourth town and its boss drops a weapon per class', () => {
  assert.equal(Object.keys(TOWNS).at(-1), 'orvane');
  assert.equal(ORVANE.rooms.length, 5);
  assert.equal(ORVANE.rooms.at(-1).waves.at(-1)[0].type, 'darkSword');
  for (const [hero, id] of Object.entries(ORVANE.loot)) {
    assert.ok(ITEMS[id], `${id} exists`);
    assert.equal(ITEMS[id].slot, 'weapon');
    assert.ok(fits(id, hero), `${id} fits ${hero}`);
  }
});

test('every Orvane monster is reachable from its rooms, and the boss adds are real', () => {
  const used = new Set();
  for (const room of ORVANE.rooms) for (const wave of room.waves) for (const grp of wave) used.add(grp.type);
  for (const type of used) assert.ok(MONSTERS[type], `${type} defined`);
  const boss = MONSTERS.darkSword;
  assert.ok(MONSTERS[boss.adds.type], 'adds type defined');
  // Every move the boss AI can pick has to be there, or it stands still on that branch.
  for (const move of ['attack', 'charge', 'slam', 'cast', 'adds']) assert.ok(boss[move], `boss has ${move}`);
});

test('the boss weapons give flat ATK on top of the level, and refine scales it', () => {
  const base = resolveHero(HEROES.knight, mergeMods());
  const armed = resolveHero(HEROES.knight, mergeMods(itemMods({ id: 'meteorEdge', plus: 0 })));
  assert.equal(armed.atk, base.atk + 100);
  assert.equal(armed.meteor, 0.10);
  // A duplicate refines it: the hundred grows, not just the hero's own dozen.
  const plus5 = resolveHero(HEROES.knight, mergeMods(itemMods({ id: 'meteorEdge', plus: 5 })));
  assert.ok(plus5.atk > armed.atk + 10, `refined ${plus5.atk} vs ${armed.atk}`);
  const bow = resolveHero(HEROES.hunter, mergeMods(itemMods({ id: 'twinshot', plus: 0 })));
  assert.equal(bow.atk, resolveHero(HEROES.hunter, mergeMods()).atk + 90);
  assert.equal(bow.double, 0.15);
});

test('a charm adds to the same rate the weapon grants, and the pool is capped', () => {
  const charm = { id: 'runeSigil', main: { stat: 'meteor', v: 0.03 }, sub: { stat: 'atkHi', v: 12 } };
  const mods = mergeMods(itemMods({ id: 'meteorEdge', plus: 0 }), ...wearMods({ accessory: charm }));
  const h = resolveHero(HEROES.knight, mods);
  assert.equal(Math.round(h.meteor * 100), 13);          // 10 % from the sword, 3 % from the charm
  assert.equal(h.atk, resolveHero(HEROES.knight, mergeMods()).atk + 112);
  // Nothing worn stacks past a half: a full set is a surprise, not the way the hero attacks.
  const stacked = {};
  for (let i = 0; i < 40; i++) stacked.meteorAdd = (stacked.meteorAdd || 0) + 0.03;
  assert.equal(resolveHero(HEROES.knight, mergeMods(stacked)).meteor, 0.5);
});

test('Orvane charms roll only their own secondaries', () => {
  for (const id of ['runeSigil', 'echoBand', 'manaClasp']) {
    const allowed = new Set(ITEMS[id].secondary);
    for (let i = 0; i < 12; i++) {
      let n = i / 12;
      const inst = rollItem(id, { next: () => { n = (n + 0.37) % 1; return n; }, chance: () => false });
      assert.equal(inst.main.stat, ITEMS[id].main);
      assert.ok(allowed.has(inst.sub.stat), `${id} rolled ${inst.sub.stat}`);
      assert.ok(inst.sub.v >= ATTRS[inst.sub.stat].min && inst.sub.v <= ATTRS[inst.sub.stat].max);
    }
  }
});

test('Double Attack lands a second hit on the same target for the same blow', () => {
  const { g } = rigged({ id: 'twinshot', plus: 0 }, { rate: { double: 1, meteor: 0, spDrain: 0 } });
  const events = swing(g, 90);
  const hits = events.filter((e) => e.type === 'hit' && e.target === 'enemy');
  const doubled = hits.filter((e) => e.attack === 'doubleAttack');
  assert.ok(hits.length > 0, 'the hero connected at all');
  assert.ok(doubled.length > 0, 'a doubled hit landed');
  // It must not feed itself: a doubled hit never rolls another one, or one swing becomes a
  // screenful. Every doubled hit has an ordinary hit of its own ahead of it.
  assert.ok(doubled.length <= hits.length - doubled.length, `${doubled.length} doubles vs ${hits.length - doubled.length} normals`);
});

test('Auto Meteor is queued on the hit and lands a beat later, as magic', () => {
  const { g } = rigged({ id: 'meteorEdge', plus: 0 }, { rate: { meteor: 1, double: 0, spDrain: 0 } });
  const events = swing(g, 120);
  const called = events.filter((e) => e.type === 'autoMeteor');
  const landed = events.filter((e) => e.type === 'meteor');
  assert.ok(called.length > 0, 'a meteor was called');
  assert.ok(landed.length > 0, 'a meteor landed');
  // A tenth of the hero's ATK, and it does not crit.
  const expected = Math.max(1, Math.round(g.player.atk * 0.1));
  for (const m of landed) assert.equal(m.dmg, expected);
  for (const h of events.filter((e) => e.attack === 'autoMeteor')) assert.equal(h.crit, false);
});

test('SP Drain returns SP on a hit and never overfills', () => {
  const { g } = rigged(null, { rate: { spDrain: 1, meteor: 0, double: 0 } });
  g.player.mp = 0;
  const events = swing(g, 90);
  const drains = events.filter((e) => e.type === 'drain');
  assert.ok(drains.length > 0, 'SP was drained');
  for (const d of drains) assert.equal(d.hp, 0);       // the charm takes SP only
  assert.ok(g.player.mp > 0 && g.player.mp <= g.player.mpMax);
});

test('a run through Orvane is deterministic and reaches the Dark Sword', () => {
  const play = () => {
    const g = createGame({ hero: 'knight', seed: 7, dungeon: ORVANE });
    const seen = [];
    for (let r = 0; r < ORVANE.rooms.length; r++) {
      for (let i = 0; i < 4000 && g.roomIndex === r; i++) {
        for (const e of g.enemies) e.hp = 0;
        update(g, { held: { right: true }, pressed: {} });
      }
      seen.push(g.room?.name);
      if (g.phase === 'cleared' || g.phase === 'over') break;
    }
    return seen;
  };
  const a = play(), b = play();
  assert.deepEqual(a, b);
  assert.ok(a.includes('Hall of Mirrors'), a.join(' -> '));
});
