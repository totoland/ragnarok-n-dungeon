import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, ITEM_IDS, itemMods, itemName, glowOf, DEFAULT_WEAPON, wearMods, SLOTS } from '../src/sim/data/items.js';
import { MONSTERS } from '../src/sim/data/monsters.js';
import { HEROES } from '../src/sim/data/heroes.js';
import { TOWNS } from '../src/sim/data/dungeon.js';
import { BASE_MODS } from '../src/sim/resolve.js';
import { REFINE, SKILL } from '../src/config.js';
import { createGame, update, EMPTY_INPUT, setGear } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { xpAtLevel } from '../src/sim/progress.js';

const quiet = { rooms: [{ name: 't', width: 20, waves: [] }] };
const press = (...keys) => ({ held: {}, pressed: Object.fromEntries(keys.map((k) => [k, true])) });

test('every item belongs to a real hero and every town boss drops one per hero', () => {
  for (const id of ITEM_IDS) assert.ok(HEROES[ITEMS[id].hero], `${id} is for a hero that exists`);
  for (const [key, town] of Object.entries(TOWNS)) {
    for (const h of Object.keys(HEROES)) {
      const id = town.loot?.[h];
      assert.ok(id && ITEMS[id], `${key} drops something for the ${h}`);
      assert.equal(ITEMS[id].hero, h, `${key}'s ${id} is usable by the ${h} it drops for`);
    }
  }
});

test('refining: +N multiplies the ATK share, +5 and up adds crit damage; names and glow follow', () => {
  assert.deepEqual(itemMods(null), {});
  assert.deepEqual(itemMods({ id: 'katana', plus: 0 }), ITEMS.katana.mods);
  const p3 = itemMods({ id: 'katana', plus: 3 });
  assert.equal(p3.atk, 1 + REFINE.atk * 3); assert.equal(p3.crit, 0.30); assert.equal(p3.critDmg, undefined);
  const p5 = itemMods({ id: 'tsurugi', plus: 5 });
  assert.equal(p5.atk, 1.15 * (1 + REFINE.atk * 5));
  assert.equal(p5.critDmg, BASE_MODS.critDmg * (1 + REFINE.critDmg));
  assert.equal(itemMods({ id: 'katana', plus: 99 }).atk, 1 + REFINE.atk * REFINE.max, 'plus clamps to the cap');
  assert.equal(itemName(null), 'Bare hands'); assert.equal(itemName(null, 'knight'), DEFAULT_WEAPON.knight); assert.equal(itemName({ id: 'katana', plus: 1 }, 'knight'), 'Katana +1'); assert.equal(itemName({ id: 'katana', plus: 0 }), 'Katana'); assert.equal(itemName({ id: 'katana', plus: 7 }), 'Katana +7');
  assert.equal(glowOf({ id: 'katana', plus: 4 }), 0); assert.ok(glowOf({ id: 'katana', plus: 5 }) > 0); assert.equal(glowOf({ id: 'katana', plus: 10 }), 1);
});

test('a wielded weapon reaches the hero through the resolve step, merged with the level', () => {
  const bare = createGame({ hero: 'knight', dungeon: quiet, xp: xpAtLevel(3) });
  const armed = createGame({ hero: 'knight', dungeon: quiet, xp: xpAtLevel(3), gear: { id: 'katana', plus: 2 } });
  assert.equal(armed.player.crit, 0.30); assert.equal(bare.player.crit, BASE_MODS.crit);
  assert.equal(armed.player.atkSpeed, 1.10);
  assert.ok(Math.abs(armed.player.atk - bare.player.atk * (1 + REFINE.atk * 2)) < 1e-9, 'level share × refine share');
  assert.deepEqual(armed.player.gear, { id: 'katana', plus: 2 }, 'the renderer can read the weapon off the player');
  // a level-up mid-run keeps the weapon
  armed.player.level = 1; armed.xp = 0;
  const e = createEnemy(armed, 'poring', 4, 0); armed.enemies.push(e); e.hp = 0;
  armed.xp = xpAtLevel(4) - 1;
  armed.onEnemyHit(e, 1, false, true, 'slash1');
  assert.equal(armed.player.level, 4); assert.equal(armed.player.crit, 0.30);
});

test('skill levels: an attack skill hits harder, a buff lasts longer, the basic combo is untouched', () => {
  const lv = { magnumBreak: 3, quicken: 2 };
  const g = createGame({ hero: 'knight', dungeon: quiet, seed: 4, skills: lv });
  const p = g.player;
  assert.equal(p.skillLv, lv);
  update(g, press('skill1'));
  assert.equal(p.attack, 'quicken');
  assert.ok(Math.abs(p.buffs.quicken.t - 15 * (1 + SKILL.buffDur * 2)) < 1e-9, 'Quicken at level 2 lasts longer');
  assert.equal(p.buffs.quicken.dur, p.buffs.quicken.t);
  // Damage: compare the same rng draw with and without a level on Magnum Break.
  const dmgOf = (skills) => {
    const h = createGame({ hero: 'knight', dungeon: quiet, seed: 11, skills });
    const e = createEnemy(h, 'skeleton', 2.5, 0); e.state = 'chase'; h.enemies.push(e);
    h.player.mp = 999;
    update(h, press('skill2'));
    let guard = 0;
    while (e.hp === e.hpMax && guard++ < 80) { update(h, EMPTY_INPUT); e.x = 2.5; h.player.x = 1.5; }
    return e.hpMax - e.hp;
  };
  const plain = dmgOf({}), leveled = dmgOf({ magnumBreak: 5 });
  assert.ok(plain > 0, 'the burst connects');
  assert.ok(Math.abs(leveled / plain - (1 + SKILL.dmg * 5)) < 0.06, `level 5 deals ~${1 + SKILL.dmg * 5}× (${leveled} vs ${plain})`);
});

test('the boss drops its weapon at the run\'s chance, deterministically, only when a drop is set', () => {
  const kill = (g) => { const e = createEnemy(g, 'baphomet', 6, 0); g.enemies.push(e); e.hp = 0; g.onEnemyHit(e, 1, false, true, 'slash1'); return g; };
  const sure = kill(createGame({ hero: 'knight', dungeon: quiet, seed: 2, drop: { item: 'katana', chance: 1 } }));
  assert.deepEqual(sure.loot, ['katana']);
  assert.ok(sure.events.some((ev) => ev.type === 'bossDrop' && ev.item === 'katana'));
  const never = kill(createGame({ hero: 'knight', dungeon: quiet, seed: 2, drop: { item: 'katana', chance: 0 } }));
  assert.deepEqual(never.loot, []);
  const none = kill(createGame({ hero: 'knight', dungeon: quiet, seed: 2 }));
  assert.deepEqual(none.loot, []);
  // a chance in between: the same seed always answers the same way, and both answers occur
  const roll = (seed) => kill(createGame({ hero: 'knight', dungeon: quiet, seed, drop: { item: 'katana', chance: 0.35 } })).loot.length;
  const rolls = Array.from({ length: 40 }, (_, i) => roll(i + 1));
  assert.ok(rolls.includes(1) && rolls.includes(0));
  assert.equal(roll(7), roll(7));
  // a regular monster never drops a weapon
  const g = createGame({ hero: 'knight', dungeon: quiet, seed: 2, drop: { item: 'katana', chance: 1 } });
  const e = createEnemy(g, 'poring', 4, 0); g.enemies.push(e); e.hp = 0; g.onEnemyHit(e, 1, false, true, 'slash1');
  assert.deepEqual(g.loot, []);
});

test('setGear swaps the weapon mid-run: stats re-resolve, HP keeps its fraction, the view can see it', () => {
  const g = createGame({ hero: 'knight', dungeon: quiet, xp: xpAtLevel(3), gear: { id: 'katana', plus: 2 } });
  const p = g.player;
  const atkBefore = p.atk;
  p.hp = Math.round(p.hpMax / 2);
  setGear(g, null);
  assert.equal(p.gear, null); assert.equal(g.gear, null);
  assert.equal(p.crit, BASE_MODS.crit); assert.equal(p.atkSpeed, 1);
  assert.ok(Math.abs(p.atk - atkBefore / (1 + REFINE.atk * 2)) < 1e-9, 'the refine share comes off');
  assert.equal(p.hp, Math.round(p.hpMax / 2), 'half health stays half');
  assert.ok(g.events.some((ev) => ev.type === 'equip' && ev.item === null));
  setGear(g, { id: 'tsurugi', plus: 5 });
  assert.equal(p.crit, 0.15); assert.equal(p.critDmg, BASE_MODS.critDmg * (1 + REFINE.critDmg));
  assert.deepEqual(p.gear, { id: 'tsurugi', plus: 5 });
  const n = g.events.length;
  setGear(g, { id: 'tsurugi', plus: 5 });
  assert.equal(g.events.length, n, 'same weapon again is a no-op');
  update(g, EMPTY_INPUT);
  assert.equal(p.level, 3);
});

test('worn slots: a cape refines into HP not ATK, never glows, and reaches the hero merged with the weapon', () => {
  ITEMS.testCape = { name: 'Test Cape', slot: 'cape', mods: { hp: 1.08 }, tip: 't' };
  MONSTERS.poring.drops = [{ item: 'testCape', chance: 1 }];
  try {
    for (const id of ITEM_IDS) assert.ok(SLOTS.includes(ITEMS[id].slot), `${id} has a slot`);
    const m = itemMods({ id: 'testCape', plus: 3 });
    assert.ok(Math.abs(m.hp - 1.08 * (1 + REFINE.hp * 3)) < 1e-9); assert.equal(m.atk, undefined);
    assert.equal(glowOf({ id: 'testCape', plus: 9 }), 0);
    assert.deepEqual(wearMods(null), [{}, {}, {}]);
    const wear = { cape: { id: 'testCape', plus: 0 }, hat: null, accessory: null };
    const g = createGame({ hero: 'knight', dungeon: quiet, gear: { id: 'katana', plus: 0 }, wear });
    assert.equal(g.player.hpMax, Math.round(HEROES.knight.hp * 1.08)); assert.equal(g.player.crit, 0.30);
    assert.equal(g.player.wear, wear, 'the renderer can read what is worn');
    setGear(g, g.gear, { ...wear, cape: null });
    assert.equal(g.player.hpMax, HEROES.knight.hp, 'taking the cape off mid-run drops the HP share');
    // a monster's own drop table
    const e = createEnemy(g, 'poring', 4, 0); g.enemies.push(e); e.hp = 0; g.onEnemyHit(e, 1, false, true, 'slash1');
    assert.deepEqual(g.loot, ['testCape']);
    assert.ok(g.events.some((ev) => ev.type === 'itemDrop' && ev.item === 'testCape' && ev.monster === 'poring'));
  } finally { delete ITEMS.testCape; delete MONSTERS.poring.drops; }
});
