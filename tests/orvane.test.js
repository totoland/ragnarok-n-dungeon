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
import { xpAtLevel } from '../src/sim/progress.js';
import { LEVEL, REFINE } from '../src/config.js';
import { itemMods, wearMods } from '../src/sim/data/items.js';
import { HEROES } from '../src/sim/data/heroes.js';

const steps = (g, n, input = EMPTY_INPUT) => { for (let i = 0; i < n; i++) update(g, input); };

// Put one monster in reach and hit it, without waiting for a wave or walking anywhere.
function rigged(gear, { rate = null } = {}) {
  // Capped level on purpose: a proc that reads ATK must not have ATK move under it, and the
  // room's own wave would otherwise level the hero mid-swing - three flat points at a time.
  const g = createGame({ hero: 'knight', seed: 11, dungeon: ORVANE, gear, xp: xpAtLevel(LEVEL.max) });
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

test('Orvane is a town in the table and its boss drops a weapon per class', () => {
  assert.ok(Object.keys(TOWNS).includes('orvane'), 'Orvane is in the table');
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
  assert.equal(armed.atk, base.atk + ITEMS.meteorEdge.mods.atkAdd);
  assert.equal(armed.meteor, 0.10);
  // A duplicate refines the weapon's own ATK, not just the hero's dozen - so the gain is a
  // share of the blade, whatever the blade is currently worth.
  const plus5 = resolveHero(HEROES.knight, mergeMods(itemMods({ id: 'meteorEdge', plus: 5 })));
  const gain = ITEMS.meteorEdge.mods.atkAdd * REFINE.atk * 5;
  assert.ok(Math.abs(plus5.atk - (armed.atk + gain)) < 1e-9, `refined ${plus5.atk} vs ${armed.atk} + ${gain}`);
  const bow = resolveHero(HEROES.hunter, mergeMods(itemMods({ id: 'twinshot', plus: 0 })));
  assert.equal(bow.atk, resolveHero(HEROES.hunter, mergeMods()).atk + ITEMS.twinshot.mods.atkAdd);
  assert.equal(bow.double, 0.15);
});

test('a charm adds to the same rate the weapon grants, and the pool is capped', () => {
  const charm = { id: 'runeSigil', main: { stat: 'meteor', v: 0.03 }, sub: { stat: 'atkHi', v: 12 } };
  const mods = mergeMods(itemMods({ id: 'meteorEdge', plus: 0 }), ...wearMods({ accessory: charm }));
  const h = resolveHero(HEROES.knight, mods);
  assert.equal(Math.round(h.meteor * 100), 13);          // 10 % from the sword, 3 % from the charm
  assert.equal(h.atk, resolveHero(HEROES.knight, mergeMods()).atk + ITEMS.meteorEdge.mods.atkAdd + 12);
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
  const { g, e } = rigged({ id: 'meteorEdge', plus: 0 }, { rate: { meteor: 1, double: 0, spDrain: 0 } });
  const events = swing(g, 120);
  const called = events.filter((e) => e.type === 'autoMeteor');
  const landed = events.filter((e) => e.type === 'meteor');
  assert.ok(called.length > 0, 'a meteor was called');
  assert.ok(landed.length > 0, 'a meteor landed');
  // A tenth of the hero's ATK, and it does not crit.
  const expected = Math.max(1, Math.round(g.player.atk * 0.1));
  for (const m of landed) assert.equal(m.dmg, expected);
  for (const h of events.filter((e) => e.attack === 'autoMeteor')) assert.equal(h.crit, false);
  // And it leaves the thing it hit somewhere. A meteor carries no knockback, which used to
  // mean a NaN in vx and a monster drawn at no position at all (see tests/combat.test.js).
  assert.ok(Number.isFinite(e.x) && Number.isFinite(e.vx), `x ${e.x}, vx ${e.vx}`);
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

test('Bairune is a complete town: five monsters, a boss, five hats and a cape', async () => {
  const { BAIRUNE } = await import('../src/sim/data/dungeon.js');
  const { MONSTERS } = await import('../src/sim/data/monsters.js');
  assert.equal(BAIRUNE.rooms.length, 4);
  // Every monster it spawns is defined, and the last room ends on exactly one boss.
  const used = new Set();
  for (const room of BAIRUNE.rooms) for (const wave of room.waves) for (const g of wave) used.add(g.type);
  for (const t of used) assert.ok(MONSTERS[t], `${t} defined`);
  const bosses = BAIRUNE.rooms.at(-1).waves.flat().map((g) => g.type).filter((t) => MONSTERS[t]?.boss);
  assert.deepEqual(bosses, ['nerakos']);
  for (const move of ['attack', 'charge', 'slam', 'cast', 'adds']) assert.ok(MONSTERS.nerakos[move], `boss has ${move}`);
  assert.ok(MONSTERS[MONSTERS.nerakos.adds.type], 'adds type defined');

  // The town that finally fills the hat slot: one from each of its five, plus the cape.
  const hats = new Set(), capes = new Set();
  for (const t of used) for (const d of MONSTERS[t].drops || []) {
    if (ITEMS[d.item]?.slot === 'hat') hats.add(d.item);
    if (ITEMS[d.item]?.slot === 'cape') capes.add(d.item);
  }
  assert.equal(hats.size, 5, `five hats, got ${[...hats]}`);
  assert.deepEqual([...capes], ['everwave']);
  // And the boss pays a weapon per class, like every other boss.
  for (const [hero, id] of Object.entries(BAIRUNE.loot)) {
    assert.equal(ITEMS[id].slot, 'weapon');
    assert.ok(fits(id, hero));
  }
  // Whatever the boss is not paying has to still be reachable, or it leaves the game.
  const { MONSTERS: M } = await import('../src/sim/data/monsters.js');
  const paid = new Set(Object.values(BAIRUNE.loot));
  for (const id of ['tidecleaver', 'coralbow', 'underWaterSword']) {
    const dropped = Object.values(M).some((m) => (m.drops || []).some((d) => d.item === id));
    assert.ok(paid.has(id) || dropped, `${id} is obtainable`);
  }
});

test('the weapon curve, as it actually stands', async () => {
  const { TOWNS } = await import('../src/sim/data/dungeon.js');
  const curve = (hero) => Object.values(TOWNS).map((t) => ITEMS[t.loot[hero]].mods.atkAdd);
  // The hunter's climbs the way the towns do.
  assert.deepEqual(curve('hunter'), [6, 16, 30, 50, 95]);
  // The knight's does not, and the reason is worth keeping next to the number rather than in
  // a commit message. A curve that only ever climbs means the newest town is always the only
  // one worth playing: every earlier map is strictly worse loot, so nobody goes back to one.
  // Nerakos therefore pays a SIDEGRADE - 45 ATK against Orvane's 55, bought back with 15%
  // attack speed, a Cold Bolt that freezes, half again against Fire, and the only card slot
  // in the game. Which sword a knight carries out of Bairune is a choice, and the 95 that
  // used to be handed to him is now a thing to go and find (Shellora, 4%).
  //
  // So this is not a step down waiting to be fixed. Raising it to 95 would flatten the
  // decision back into a number, which is the thing being avoided. Asserted exactly so that
  // changing it stays deliberate.
  assert.deepEqual(curve('knight'), [6, 16, 30, 55, 45]);
});

test("the Under Water Sword is Nerakos's payout, and its Cold Bolt lands as magic", async () => {
  const { BAIRUNE } = await import('../src/sim/data/dungeon.js');
  const { MONSTERS } = await import('../src/sim/data/monsters.js');
  // It started on Shellora's table and moved onto the boss when it got its model. The two
  // swords swapped: whichever one the boss is not paying is the one that is found.
  assert.equal(BAIRUNE.loot.knight, 'underWaterSword', 'the boss pays it');
  const found = Object.entries(MONSTERS).filter(([, m]) => (m.drops || []).some((d) => d.item === 'tidecleaver'));
  assert.equal(found.length, 1, 'and Tidecleaver took its place on a drop table');

  const g = createGame({ hero: 'knight', seed: 7, dungeon: BAIRUNE, xp: xpAtLevel(LEVEL.max), gear: { id: 'underWaterSword', plus: 0 } });
  assert.equal(g.player.bolt, ITEMS.underWaterSword.mods.boltAdd, 'the sword grants the rate');
  assert.equal(g.player.freeze, ITEMS.underWaterSword.mods.freezeAdd, 'and the freeze that rides on it');
  g.player.bolt = 1; g.player.pull = 0; g.player.meteor = 0; g.player.double = 0; g.player.spDrain = 0;
  g.player.freeze = 0;
  steps(g, 2);
  const { createEnemy: mk } = await import('../src/sim/enemies.js');
  const e = mk(g, 'craboon', g.player.x + 1.2, 0);
  e.hp = 1e6;
  g.enemies.push(e);
  const events = swing(g, 120);
  const called = events.filter((ev) => ev.type === 'autoBolt');
  const landed = events.filter((ev) => ev.type === 'coldBolt');
  assert.ok(called.length > 0, 'a bolt was called');
  assert.ok(landed.length > 0, 'a bolt landed');
  const expected = Math.max(1, Math.round(g.player.atk * 0.1));
  for (const b of landed) assert.equal(b.dmg, expected);
  // Magic: it never crits, and it never rolls another one off its own hit.
  for (const h of events.filter((ev) => ev.attack === 'autoBolt')) assert.equal(h.crit, false);
  assert.ok(landed.length <= called.length, `${landed.length} landed from ${called.length} called`);
  // It falls around the hero, not on what was hit - which is what makes it a different
  // spell from the meteor rather than the same one in another colour. Checked against where
  // the hero was on the frame it was called: he walks while he swings.
  const g2 = createGame({ hero: 'knight', seed: 7, dungeon: BAIRUNE, xp: xpAtLevel(LEVEL.max), gear: { id: 'underWaterSword', plus: 0 } });
  steps(g2, 2);
  g2.player.bolt = 1; g2.player.freeze = 0; g2.player.pull = 0; g2.player.meteor = 0; g2.player.double = 0;
  const foe = mk(g2, 'craboon', g2.player.x + 1.2, 0);
  foe.hp = 1e6;
  g2.enemies.push(foe);
  // The sim never drains g.events - the renderer does (main.js) - so only the ones added
  // this frame are new, and comparing the older ones against a hero who has walked on since
  // is how this read as a failure twice before it read as a pass.
  let checked = 0, seen = g2.events.length;
  for (let i = 0; i < 120; i++) {
    const wasAt = g2.player.x;
    update(g2, i % 12 === 0 ? { held: {}, pressed: { attack: true } } : EMPTY_INPUT);
    for (const ev of g2.events.slice(seen)) {
      if (ev.type !== 'autoBolt') continue;
      checked++;
      // A frame of slack either side: the proc resolves partway through the update.
      assert.ok(Math.abs(ev.x - wasAt) < 0.2, `called at ${ev.x}, hero was at ${wasAt}`);
    }
    seen = g2.events.length;
  }
  assert.ok(checked > 0, 'at least one bolt was checked');

  // And "around" means around: it reaches behind the hero as well as in front, which is the
  // whole of what separates it from the meteor. One monster each side, both magicked.
  const g3 = createGame({ hero: 'knight', seed: 7, dungeon: BAIRUNE, xp: xpAtLevel(LEVEL.max), gear: { id: 'underWaterSword', plus: 0 } });
  g3.cheats = { invuln: true };
  steps(g3, 2);
  g3.player.bolt = 1; g3.player.freeze = 0; g3.player.pull = 0; g3.player.meteor = 0; g3.player.double = 0;
  const ahead = mk(g3, 'craboon', g3.player.x + 1.1, 0);
  const behind = mk(g3, 'craboon', g3.player.x - 1.6, 0);
  for (const m of [ahead, behind]) { m.hp = 1e6; m.frozen = 99; g3.enemies.push(m); }  // held still, so they stay put
  swing(g3, 150);
  assert.ok(ahead.hp < 1e6, 'the one in front was hit');
  assert.ok(behind.hp < 1e6, 'and so was the one behind, which no melee swing reached');
});

test('a Cold Bolt can freeze what it lands on, and a boss shrugs it off', async () => {
  const { BAIRUNE } = await import('../src/sim/data/dungeon.js');
  const { createEnemy: mk } = await import('../src/sim/enemies.js');
  const { MONSTERS } = await import('../src/sim/data/monsters.js');
  for (const [type, shouldFreeze] of [['craboon', true], ['nerakos', false]]) {
    const g = createGame({ hero: 'knight', seed: 4, dungeon: BAIRUNE, xp: xpAtLevel(LEVEL.max), gear: { id: 'underWaterSword', plus: 0 } });
    g.cheats = { invuln: true };
    steps(g, 2);
    g.player.bolt = 1; g.player.freeze = 1; g.player.pull = 0; g.player.meteor = 0; g.player.double = 0;
    const e = mk(g, type, g.player.x + 1.2, 0);
    e.hp = 1e9;
    g.enemies.push(e);
    const events = swing(g, 150);
    const froze = events.filter((ev) => ev.type === 'freeze');
    assert.equal(froze.length > 0, shouldFreeze, `${type} froze ${froze.length} times`);
    if (!shouldFreeze) assert.ok(MONSTERS[type].mass >= 3, 'and it is hyper armour that spared it');
  }
});

test('a frozen monster stops doing anything until it thaws', async () => {
  const { BAIRUNE } = await import('../src/sim/data/dungeon.js');
  const { createEnemy: mk } = await import('../src/sim/enemies.js');
  const { updateEnemy } = await import('../src/sim/enemies.js');
  const g = createGame({ hero: 'knight', seed: 9, dungeon: BAIRUNE, xp: xpAtLevel(LEVEL.max) });
  steps(g, 2);
  const e = mk(g, 'craboon', g.player.x + 3, 0);
  g.enemies.push(e);
  e.frozen = 0.5;
  const x0 = e.x;
  for (let i = 0; i < 20; i++) updateEnemy(g, e, 1 / 60);   // a third of a second, still frozen
  assert.equal(e.state, 'frozen');
  assert.equal(e.x, x0, 'it did not walk');
  // It is still an object in the world: a shove moves it.
  e.vx = -4;
  for (let i = 0; i < 6; i++) updateEnemy(g, e, 1 / 60);
  assert.ok(e.x < x0, 'a block of ice slides');
  // And it thaws.
  for (let i = 0; i < 60; i++) updateEnemy(g, e, 1 / 60);
  assert.ok(e.frozen <= 0 && e.state !== 'frozen', `state ${e.state}`);
});

test('the element bonus multiplies only against the element it names', async () => {
  const { elementMult } = await import('../src/sim/combat.js');
  const { BAIRUNE } = await import('../src/sim/data/dungeon.js');
  const { createEnemy: mk } = await import('../src/sim/enemies.js');
  const { MONSTERS } = await import('../src/sim/data/monsters.js');
  const g = createGame({ hero: 'knight', seed: 2, dungeon: BAIRUNE, gear: { id: 'underWaterSword', plus: 0 } });
  const plain = mk(g, 'craboon', 5, 0);
  assert.equal(elementMult(g.player, plain), 1, 'a monster with no element takes no bonus');
  // Nothing in the game is Fire yet, so the bonus is proved on one made for the purpose -
  // which is the whole point of having the plumbing before the elements.
  const fiery = { ...plain, def: { ...plain.def, element: 'fire' } };
  assert.equal(elementMult(g.player, fiery), ITEMS.underWaterSword.mods.vsFire);
  const bare = createGame({ hero: 'knight', seed: 2, dungeon: BAIRUNE });
  assert.equal(elementMult(bare.player, fiery), 1, 'and a weapon that does not claim it gets nothing');
  assert.ok(!Object.values(MONSTERS).some((m) => m.element), 'no monster has an element yet');
});

test('Undertow drags what it hits back towards the hero', async () => {
  const { BAIRUNE } = await import('../src/sim/data/dungeon.js');
  const { createEnemy: mk } = await import('../src/sim/enemies.js');
  const g = createGame({ hero: 'knight', seed: 5, dungeon: BAIRUNE, xp: xpAtLevel(LEVEL.max), gear: { id: 'tidecleaver', plus: 0 } });
  assert.ok(g.player.pull > 0, 'the weapon grants it');
  g.player.pull = 1;
  steps(g, 2);
  const e = mk(g, 'craboon', g.player.x + 1.2, 0);
  e.hp = 1e6;
  g.enemies.push(e);
  const events = swing(g, 60);
  const pulls = events.filter((ev) => ev.type === 'undertow');
  assert.ok(pulls.length > 0, 'it fired');
  // It pulls rather than pushes: the monster's velocity points back at the hero.
  assert.ok(Math.sign(e.vx) === Math.sign(g.player.x - e.x) || e.vx === 0, `vx ${e.vx}`);
});
