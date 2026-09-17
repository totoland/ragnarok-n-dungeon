import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, update, EMPTY_INPUT } from '../src/sim/game.js';
import { DUNGEON } from '../src/sim/data/dungeon.js';
import { MONSTERS } from '../src/sim/data/monsters.js';
import { HEROES } from '../src/sim/data/heroes.js';
import { createEnemy } from '../src/sim/enemies.js';

const hold = (...keys) => ({ held: Object.fromEntries(keys.map((k) => [k, true])), pressed: {} });
const steps = (g, n, input = EMPTY_INPUT) => { for (let i = 0; i < n; i++) update(g, input); };
const killAll = (g) => { for (const e of g.enemies) e.hp = 0; };

test('data is consistent: every hero skill and monster pattern references real things', () => {
  for (const [key, h] of Object.entries(HEROES)) {
    assert.ok(h.attacks[h.basic], `${key} basic`);
    for (const s of h.skills) assert.ok(h.attacks[s], `${key} skill ${s}`);
    for (const [id, a] of Object.entries(h.attacks)) {
      assert.ok(a.dur > 0 && a.cancelAt <= a.dur, `${id} timing`);
      if (a.next) assert.ok(h.attacks[a.next], `${id} next`);
      for (const hit of a.hits || []) assert.ok(hit.at < hit.until && hit.until <= a.dur, `${id} hit window`);
      for (const sp of a.spawns || []) assert.ok(sp.at <= a.dur, `${id} spawn time`);
    }
  }
  for (const room of DUNGEON.rooms) for (const wave of room.waves) for (const grp of wave) assert.ok(MONSTERS[grp.type], grp.type);
});

test('first wave spawns after a beat and enters from off-stage', () => {
  const g = createGame({ hero: 'knight', seed: 3 });
  assert.equal(g.enemies.length, 0);
  steps(g, 60);
  assert.ok(g.enemies.length >= 1, 'spawned');
  assert.ok(g.enemies[0].x > g.bounds.xMax, 'starts off-stage');
  steps(g, 240);
  assert.ok(g.enemies.every((e) => e.x <= g.bounds.xMax), 'walked in');
  assert.equal(g.enemies.length, 3);
});

test('rooms progress: waves → cleared → walk out → next room → boss → won', () => {
  const g = createGame({ hero: 'knight', seed: 5 });
  const rooms = DUNGEON.rooms.length;
  for (let r = 0; r < rooms; r++) {
    assert.equal(g.roomIndex, r);
    for (let w = 0; w < DUNGEON.rooms[r].waves.length; w++) {
      // wait for the whole wave to spawn, then kill it
      let guard = 0;
      while ((g.waveIndex !== w || g.spawnQueue.length) && guard++ < 2000) update(g, EMPTY_INPUT);
      assert.equal(g.waveIndex, w, `room ${r} wave ${w}`);
      killAll(g);
      steps(g, 90); // corpses linger, then the next wave or clear
    }
    assert.equal(g.phase, r === rooms - 1 ? 'won' : 'cleared', `room ${r} cleared`);
    if (g.phase === 'won') break;
    g.player.iframes = 99;
    let guard = 0;
    while (g.roomIndex === r && guard++ < 60 * 12) update(g, hold('right'));
    assert.equal(g.roomIndex, r + 1, 'walked into the next room');
    assert.equal(g.player.x, 1.5, 'player reset to the room entrance');
  }
  assert.equal(g.phase, 'won');
  assert.ok(g.events.some((e) => e.type === 'won'));
  assert.equal(g.roomIndex, rooms - 1);
});

test('boss spawns adds at half health', () => {
  const g = createGame({ hero: 'knight', seed: 1 });
  const last = DUNGEON.rooms.length - 1;
  g.roomIndex = last - 1; g.phase = 'cleared'; g.player.x = g.bounds.xMax;
  update(g, EMPTY_INPUT);
  assert.equal(g.roomIndex, last);
  steps(g, 400);
  const boss = g.enemies.find((e) => e.boss);
  assert.ok(boss, 'boss present');
  boss.hp = boss.hpMax * 0.4;
  steps(g, 120);
  assert.ok(g.enemies.filter((e) => !e.boss).length >= 2, 'adds arrived');
});

test('same seed and inputs give the same run; the event array is capped', () => {
  const run = () => {
    const g = createGame({ hero: 'hunter', seed: 42 });
    for (let i = 0; i < 900; i++) {
      update(g, i % 40 < 20 ? { held: { right: true }, pressed: { attack: i % 7 === 0 } } : { held: {}, pressed: { attack: i % 5 === 0 } });
    }
    return g;
  };
  const a = run(), b = run();
  assert.equal(JSON.stringify([a.player.x, a.player.hp, a.kills, a.score, a.enemies.map((e) => [e.x, e.hp])]),
    JSON.stringify([b.player.x, b.player.hp, b.kills, b.score, b.enemies.map((e) => [e.x, e.hp])]));
  assert.ok(a.events.length <= 256);
});

test('the hitstun loop: a comboed skeleton never gets its attack off', () => {
  const g = createGame({ hero: 'knight', dungeon: { rooms: [{ name: 't', width: 20, waves: [] }] } });
  const e = createEnemy(g, 'skeleton', 2.2, 0); e.state = 'chase'; e.cd = 0; g.enemies.push(e);
  const hpBefore = g.player.hp;
  for (let i = 0; i < 240; i++) update(g, { held: {}, pressed: { attack: i % 6 === 0 } });
  assert.ok(e.hp < e.hpMax * 0.4, 'skeleton took a beating');
  assert.equal(g.player.hp, hpBefore, 'never got hit while mashing');
});

test('monsters drop potions, walking over one heals and removes it, and the pity rule fires when low', () => {
  const g = createGame({ hero: 'knight', seed: 9, dungeon: { rooms: [{ name: 't', width: 20, waves: [] }] } });
  g.player.hp = 10; // low: 40 % chance per kill
  let drops = 0;
  for (let i = 0; i < 40; i++) {
    const e = createEnemy(g, 'poring', 3, 0); e.state = 'chase'; e.cd = 99; g.enemies.push(e);
    e.hp = 1;
    update(g, { held: {}, pressed: { attack: true } });
    steps(g, 40);
    drops = Math.max(drops, g.pickups.length);
    g.pickups.length = 0; g.enemies.length = 0;
  }
  assert.ok(drops >= 1, 'something dropped over 40 low-hp kills');
  const before = g.player.hp;
  g.pickups.push({ id: 999, kind: 'hp', x: g.player.x, z: g.player.z, y: 0, vy: 0, vx: 0, t: 0 });
  update(g, EMPTY_INPUT);
  assert.equal(g.pickups.length, 0, 'picked up');
  assert.equal(g.player.hp, before + Math.round(g.player.hpMax * 0.3));
  assert.ok(g.events.some((ev) => ev.type === 'pickup' && ev.kind === 'hp'));
  g.player.hp = g.player.hpMax;
  g.pickups.push({ id: 1000, kind: 'hp', x: g.player.x, z: g.player.z, y: 0, vy: 0, vx: 0, t: 0 });
  update(g, EMPTY_INPUT);
  assert.equal(g.player.hp, g.player.hpMax, 'never exceeds max');
});
