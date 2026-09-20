import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, ITEM_IDS, itemMods, itemName, glowOf, DEFAULT_WEAPON, wearMods, SLOTS, auraOf, AURA_STOPS, ATTRS, ATTR_IDS, rollItem, attrText, isRolled, fits } from '../src/sim/data/items.js';
import { createRng } from '../src/sim/rng.js';
import { resolveHero, mergeMods } from '../src/sim/resolve.js';
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
  for (const id of ITEM_IDS) assert.ok(!ITEMS[id].hero || HEROES[ITEMS[id].hero], `${id} is for a hero that exists`);
  for (const [key, town] of Object.entries(TOWNS)) {
    for (const h of Object.keys(HEROES)) {
      const id = town.loot?.[h];
      assert.ok(id && ITEMS[id], `${key} drops something for the ${h}`);
      assert.ok(fits(id, h), `${key}'s ${id} is usable by the ${h} it drops for`);
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
  const realDrops = MONSTERS.poring.drops;
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
  } finally { delete ITEMS.testCape; MONSTERS.poring.drops = realDrops; }
});

test('the refine aura: none below +5, white at +5, blue at +7, gold at +9, blended between, weapons only', () => {
  assert.equal(auraOf({ id: 'katana', plus: 4 }), null);
  assert.equal(auraOf(null), null);
  const w = auraOf({ id: 'katana', plus: 5 }); assert.deepEqual(w.color, [1, 1, 1]); assert.equal(w.name, 'white');
  const b = auraOf({ id: 'katana', plus: 7 }); assert.deepEqual(b.color, AURA_STOPS[1].color); assert.equal(b.name, 'blue');
  const g = auraOf({ id: 'katana', plus: 9 }); assert.deepEqual(g.color, AURA_STOPS[2].color); assert.equal(g.name, 'gold');
  const mid = auraOf({ id: 'katana', plus: 6 });
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(mid.color[i] - (1 + AURA_STOPS[1].color[i]) / 2) < 1e-9, 'half way white → blue');
  assert.equal(mid.name, 'white-blue');
  assert.ok(auraOf({ id: 'katana', plus: 10 }).strength === 1 && auraOf({ id: 'katana', plus: 5 }).strength < 0.2);
  ITEMS.testCape = { name: 'c', slot: 'cape', mods: {}, tip: '' };
  try { assert.equal(auraOf({ id: 'testCape', plus: 9 }), null, 'a cape has no blade'); } finally { delete ITEMS.testCape; }
});

test('accessories roll a fixed main and a random secondary inside their ranges, deterministically', () => {
  for (const id of ['ring', 'clip', 'bell', 'brooch', 'amulet']) assert.ok(isRolled(id) && ITEMS[id].slot === 'accessory');
  const seen = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const r = rollItem('ring', createRng(seed));
    assert.equal(r.id, 'ring'); assert.equal(r.main.stat, 'atk');
    assert.ok(Number.isInteger(r.main.v) && r.main.v >= 1 && r.main.v <= 3, `ring atk ${r.main.v}`);
    assert.notEqual(r.sub.stat, 'atk');
    const a = ATTRS[r.sub.stat];
    assert.ok(r.sub.v >= a.min - 1e-9 && r.sub.v <= a.max + 1e-9, `${r.sub.stat} ${r.sub.v} in range`);
    seen.add(r.sub.stat);
  }
  assert.ok(seen.size >= 6, `secondaries vary (${[...seen].join(',')})`);
  assert.deepEqual(rollItem('bell', createRng(7)), rollItem('bell', createRng(7)), 'same rng, same roll');
  assert.equal(attrText({ stat: 'atk', v: 2 }), '+2 ATK'); assert.equal(attrText({ stat: 'crit', v: 0.04 }), '+4% Crit rate');
  assert.equal(itemName({ id: 'ring', main: { stat: 'atk', v: 2 }, sub: { stat: 'hp', v: 0.02 } }), 'Ring · +2 ATK');
});

test('rolled attributes reach the hero: flat ATK and rates add, HP / SP / ASPD multiply, on top of the weapon', () => {
  const ring = { id: 'ring', uid: 'a1', main: { stat: 'atk', v: 2 }, sub: { stat: 'crit', v: 0.04 } };
  assert.deepEqual(itemMods(ring), { atkAdd: 2, critAdd: 0.04 });
  const bell = { id: 'bell', uid: 'a2', main: { stat: 'aspd', v: 0.08 }, sub: { stat: 'hp', v: 0.02 } };
  assert.deepEqual(itemMods(bell), { atkSpeed: 1.08, hp: 1.02 });
  const m = mergeMods({ atkAdd: 2, critAdd: 0.04 }, { atkAdd: 1, critAdd: 0.03, atkSpeed: 1.1 }, { atkSpeed: 1.05 });
  assert.equal(m.atkAdd, 3); assert.ok(Math.abs(m.critAdd - 0.07) < 1e-9); assert.ok(Math.abs(m.atkSpeed - 1.155) < 1e-9);
  const wear = { cape: null, hat: null, accessory: ring };
  const g = createGame({ hero: 'knight', dungeon: quiet, gear: { id: 'katana', plus: 0 }, wear });
  assert.equal(g.player.atk, HEROES.knight.atk + 2, 'flat ATK after the multiplier');
  assert.ok(Math.abs(g.player.crit - 0.34) < 1e-9, 'katana 30% + ring 4%');
  const d = resolveHero(HEROES.knight, { dodgeAdd: 0.9, critDmgAdd: 0.1 });
  assert.equal(d.dodge, 0.75, 'dodge is capped'); assert.ok(Math.abs(d.critDmg - 1.7) < 1e-9);
});

test('a monster drop table pays out near its rate and every hit is a rolled instance', () => {
  const g = createGame({ hero: 'knight', dungeon: quiet, seed: 21 });
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const e = createEnemy(g, 'poring', 4, 0); g.enemies.push(e); e.hp = 0;
    g.onEnemyHit(e, 1, false, true, 'slash1');
    g.enemies.length = 0; g.events.length = 0;
  }
  const rings = g.loot.filter((l) => typeof l === 'object' && l.id === 'ring');
  assert.equal(rings.length, g.loot.length, 'porings drop rings and nothing else');
  assert.ok(rings.length > N * 0.02 && rings.length < N * 0.04, `~3% (${rings.length}/${N})`);
  assert.ok(rings.every((r) => r.main.stat === 'atk' && r.sub && r.sub.stat !== 'atk'));
});
