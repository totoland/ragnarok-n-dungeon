import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveHero, resolveMonster, BASE_MODS } from '../src/sim/resolve.js';
import { HEROES } from '../src/sim/data/heroes.js';
import { MONSTERS } from '../src/sim/data/monsters.js';
import { createGame, update } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { rollDamage } from '../src/sim/combat.js';
import { createRng } from '../src/sim/rng.js';
import { NGPLUS } from '../src/config.js';

const quiet = { rooms: [{ name: 't', width: 20, waves: [] }] };
const press = (...keys) => ({ held: {}, pressed: Object.fromEntries(keys.map((k) => [k, true])) });

test('an unmodified hero resolves to exactly the table, with nested data shared by reference', () => {
  const d = resolveHero(HEROES.knight);
  assert.equal(d.hp, 150); assert.equal(d.mp, 60); assert.equal(d.atk, 12); assert.equal(d.speed, 5.0);
  assert.deepEqual({ atkSpeed: d.atkSpeed, dodge: d.dodge, crit: d.crit, critDmg: d.critDmg }, { atkSpeed: 1, dodge: 0, crit: 0.08, critDmg: 1.6 });
  assert.equal(d.attacks, HEROES.knight.attacks, 'attacks are the same object, not a copy');
  assert.equal(d.passive, HEROES.knight.passive);
  assert.notEqual(d, HEROES.knight, 'but the def itself is a fresh object, so nothing can scribble on the table');
});

test('modifiers scale the scalars and set the baselines', () => {
  const d = resolveHero(HEROES.knight, { hp: 1.2, atk: 1.5, atkSpeed: 1.1, dodge: 0.1, crit: 0.3, critDmg: 2 });
  assert.equal(d.hp, 180); assert.equal(d.atk, 18); assert.equal(d.mp, 60, 'untouched mods stay at the baseline');
  assert.deepEqual({ a: d.atkSpeed, b: d.dodge, c: d.crit, e: d.critDmg }, { a: 1.1, b: 0.1, c: 0.3, e: 2 });
  assert.equal(d.mods.speed, BASE_MODS.speed);
});

test('a monster at tier 0 is the table itself; higher tiers scale hp, atk and speed and cap', () => {
  assert.equal(resolveMonster(MONSTERS.poring, 0), MONSTERS.poring, 'no copy at tier 0');
  const p2 = resolveMonster(MONSTERS.poring, 2);
  assert.equal(p2.hp, Math.round(MONSTERS.poring.hp * (1 + NGPLUS.hp * 2)));
  assert.ok(Math.abs(p2.atk - MONSTERS.poring.atk * (1 + NGPLUS.atk * 2)) < 1e-9);
  assert.ok(Math.abs(p2.speed - MONSTERS.poring.speed * (1 + NGPLUS.speed * 2)) < 1e-9);
  assert.equal(p2.ai, MONSTERS.poring.ai, 'everything else passes through');
  assert.equal(resolveMonster(MONSTERS.poring, 99).tier, NGPLUS.maxTier, 'capped');
});

test('createGame takes a loadout and a tier, and every spawn reads the tier', () => {
  const g = createGame({ hero: 'knight', dungeon: quiet, mods: { hp: 2, atk: 1.25 }, tier: 2 });
  assert.equal(g.player.hp, 300); assert.equal(g.player.hpMax, 300); assert.equal(g.player.atk, 15);
  const e = createEnemy(g, 'skeleton', 3, 0);
  assert.equal(e.hp, Math.round(MONSTERS.skeleton.hp * (1 + NGPLUS.hp * 2)));
  assert.equal(e.def.tier, 2);
  const plain = createGame({ hero: 'knight', dungeon: quiet });
  assert.equal(plain.player.hp, 150, 'the default run is the game it always was');
  assert.equal(createEnemy(plain, 'skeleton', 3, 0).def, MONSTERS.skeleton);
});

test('crit rate and multiplier come from the resolved hero, and reach every hit path', () => {
  const rng = createRng(1);
  assert.ok([...Array(50)].every(() => rollDamage(10, 1, rng, 1, 3).crit), 'crit 1.0 always crits');
  assert.ok([...Array(50)].every(() => !rollDamage(10, 1, rng, 0, 3).crit), 'crit 0 never does');
  const big = rollDamage(10, 1, createRng(2), 1, 3).dmg, small = rollDamage(10, 1, createRng(2), 0, 3).dmg;
  assert.ok(big >= small * 2.7, `critDmg 3x applied (${big} vs ${small})`);

  // Through the sim: a sure-crit loadout lands a crit on the first melee hit.
  const g = createGame({ hero: 'knight', dungeon: quiet, seed: 4, mods: { crit: 1 } });
  const e = createEnemy(g, 'skeleton', 2.2, 0); e.state = 'chase'; e.cd = 99; e.hp = 1e9; g.enemies.push(e);
  let hit = null;
  for (let i = 0; i < 40 && !hit; i++) { update(g, press('attack')); hit = g.events.find((ev) => ev.type === 'hit' && ev.target === 'enemy'); g.events.length = 0; }
  assert.ok(hit && hit.crit, 'the melee path honours the hero crit rate');
});

test('gear baselines and timed buffs fold in one place', () => {
  const g = createGame({ hero: 'knight', dungeon: quiet, mods: { atkSpeed: 1.1, dodge: 0.1 } });
  const p = g.player;
  assert.ok(Math.abs(p.atkSpeed - 1.1) < 1e-9 && Math.abs(p.dodge - 0.1) < 1e-9, 'baseline applies from the first tick');
  update(g, press('skill1'));                       // Quicken: x1.3 on top
  assert.ok(Math.abs(p.atkSpeed - 1.43) < 1e-9, `1.1 x 1.3 (${p.atkSpeed})`);
  p.buffs.windWalk = { t: 5, atkSpeed: 1, dodge: 0.2 };
  update(g, { held: {}, pressed: {} });
  assert.ok(Math.abs(p.dodge - (1 - 0.9 * 0.8)) < 1e-9, `dodges stack as independent chances (${p.dodge})`);
});
