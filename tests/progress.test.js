import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xpToNext, xpAtLevel, levelFromXp, levelProgress, levelMods, skillPointsAt, xpForKill } from '../src/sim/progress.js';
import { resolveHero, mergeMods } from '../src/sim/resolve.js';
import { HEROES } from '../src/sim/data/heroes.js';
import { MONSTERS } from '../src/sim/data/monsters.js';
import { DUNGEON } from '../src/sim/data/dungeon.js';
import { LEVEL, NGPLUS } from '../src/config.js';
import { createGame, update } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';

test('the curve starts at level 1 for 0 xp, grows monotonically and caps', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(xpAtLevel(1), 0);
  let prev = 0;
  for (let l = 1; l < LEVEL.max; l++) {
    const n = xpToNext(l);
    assert.ok(n > prev, `level ${l} costs more than the one before`);
    prev = n;
    assert.equal(xpAtLevel(l + 1), xpAtLevel(l) + n);
    assert.equal(levelFromXp(xpAtLevel(l + 1)), l + 1, 'reaching the threshold is the level');
    assert.equal(levelFromXp(xpAtLevel(l + 1) - 1), l, 'one short is still the level before');
  }
  assert.equal(xpToNext(LEVEL.max), 0);
  assert.equal(levelFromXp(1e12), LEVEL.max, 'no level past the cap');
  assert.equal(levelProgress(1e12), 1);
  assert.equal(levelProgress(xpAtLevel(3) + xpToNext(3) / 2), 0.5);
});

test('a first Prontera clear is worth a few levels, not one and not twenty', () => {
  // Sum of every kill in the dungeon at tier 0, brood included - the number the curve is
  // tuned against. If a wave table changes enough to move this, the tuning note in config.js
  // should move with it.
  let total = 0;
  for (const room of DUNGEON.rooms) for (const wave of room.waves) for (const { type, count } of wave) {
    const def = MONSTERS[type];
    total += count * xpForKill(def);
    if (def.adds) total += count * def.adds.count * xpForKill(MONSTERS[def.adds.type]);
  }
  const lv = levelFromXp(total);
  assert.ok(lv >= 3 && lv <= 6, `one clear (${total} xp) lands at level ${lv}`);
});

test('level 1 is the table; each level adds its share; sparse mods merge with gear', () => {
  assert.deepEqual(levelMods(1), {});
  assert.deepEqual(resolveHero(HEROES.knight, levelMods(1)), resolveHero(HEROES.knight));
  const m = levelMods(6);
  assert.equal(m.hp, 1 + LEVEL.hp * 5); assert.equal(m.atk, 1 + LEVEL.atk * 5);
  assert.equal(skillPointsAt(1), 0); assert.equal(skillPointsAt(6), 5);
  // a Katana-shaped set: multipliers multiply, rates replace
  const merged = mergeMods(levelMods(6), { atkSpeed: 1.1, crit: 0.3 }, { atk: 1.5 });
  assert.equal(merged.atk, (1 + LEVEL.atk * 5) * 1.5);
  assert.equal(merged.atkSpeed, 1.1); assert.equal(merged.crit, 0.3);
  assert.equal(mergeMods(undefined, null, {}).hp, undefined, 'nothing named, nothing set');
});

test('xp per kill is the score, up by the tier bonus', () => {
  assert.equal(xpForKill(MONSTERS.poring), 10);
  assert.equal(xpForKill(MONSTERS.baphomet, 2), Math.round(650 * (1 + NGPLUS.xp * 2)));
  assert.equal(xpForKill({ score: 10, xp: 99 }), 99, 'an explicit xp field wins over score');
});

test('a kill mid-run levels the hero up on the spot: bigger maxima, a full refill, an event', () => {
  const quiet = { rooms: [{ name: 't', width: 20, waves: [] }] };
  const g = createGame({ hero: 'knight', seed: 3, dungeon: quiet, xp: xpAtLevel(2) - 5 });
  const p = g.player;
  assert.equal(p.level, 1);
  assert.equal(p.hpMax, HEROES.knight.hp);
  p.hp = 20; p.mp = 5;
  const e = createEnemy(g, 'poring', 4, 0);
  g.enemies.push(e);
  e.hp = 1;
  g.onEnemyHit(e, 1, false, true, 'slash1');
  assert.equal(g.xp, xpAtLevel(2) + 5);
  assert.equal(p.level, 2);
  assert.equal(p.hpMax, Math.round(HEROES.knight.hp * (1 + LEVEL.hp)));
  assert.equal(p.hp, p.hpMax, 'level up heals to full'); assert.equal(p.mp, p.mpMax);
  assert.ok(g.events.some((ev) => ev.type === 'levelUp' && ev.level === 2));
  assert.equal(p.def.attacks, HEROES.knight.attacks, 'the re-resolved def still shares the table');
  update(g, { held: {}, pressed: {} });
  assert.equal(p.level, 2, 'and stays there');
});

test('starting xp sets the level and the two runs from one seed still match', () => {
  const a = createGame({ hero: 'hunter', seed: 9, xp: xpAtLevel(5) });
  assert.equal(a.player.level, 5);
  assert.equal(a.player.hpMax, Math.round(HEROES.hunter.hp * (1 + LEVEL.hp * 4)));
  const b = createGame({ hero: 'hunter', seed: 9, xp: xpAtLevel(5) });
  for (let i = 0; i < 600; i++) { update(a, { held: { right: true }, pressed: { attack: i % 7 === 0 } }); update(b, { held: { right: true }, pressed: { attack: i % 7 === 0 } }); }
  assert.deepEqual([a.xp, a.player.hp, a.kills], [b.xp, b.player.hp, b.kills]);
});
