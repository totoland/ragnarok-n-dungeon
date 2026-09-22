// Skills: ten levels, two points a level, and a branch at the top.
//
// The branch is the part worth guarding. It is data - a sparse patch over the attack - and it
// has to reach the sim only when it has actually been earned, survive a save that claims one
// it has not, and change what the skill does rather than only how big its number is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, update, EMPTY_INPUT } from '../src/sim/game.js';
import { HEROES, SKILL_BRANCH, branchesOf } from '../src/sim/data/heroes.js';
import { SKILL } from '../src/config.js';
import { skillPointsAt } from '../src/sim/progress.js';
import { defaultProfile, normalize, setBranch, spendSkillPoint, heroOf } from '../src/profile.js';
import { xpAtLevel } from '../src/sim/progress.js';

const attackOf = (hero, skill, level, branches) =>
  createGame({ hero, seed: 5, skills: { [skill]: level }, branches }).player.def.attacks[skill];

test('the cap is reachable: two points a level, and a full clear pays for one branch', () => {
  assert.equal(SKILL.maxLevel, 10);
  assert.equal(SKILL.perLevel, 2);
  // A run through all four towns ends around hero level 9. That has to buy one skill to the
  // cap with points to spare, or the branch tier is something no player ever sees.
  const atNine = skillPointsAt(9);
  assert.ok(atNine >= SKILL.maxLevel, `${atNine} points at level 9 cannot reach a ${SKILL.maxLevel}-point skill`);
  assert.ok(atNine < SKILL.maxLevel * 3, 'but not enough to max everything, or there is no choice');
});

test('every slotted skill offers exactly two branches, and each is a real patch', () => {
  for (const [hero, def] of Object.entries(HEROES)) {
    for (const id of def.skills) {
      const picks = branchesOf(id);
      assert.equal(picks.length, 2, `${hero} ${id}`);
      for (const key of picks) {
        const b = SKILL_BRANCH[id][key];
        assert.ok(b.name && b.tip, `${id}/${key} is described`);
        assert.ok(b.attack && Object.keys(b.attack).length, `${id}/${key} changes something`);
        // Whatever it patches has to be a field the base attack already had, or it is a typo
        // that would sit there doing nothing.
        for (const k of Object.keys(b.attack)) assert.ok(k in def.attacks[id], `${id}/${key} patches unknown field ${k}`);
      }
    }
  }
});

test('a branch reaches the sim only once the skill is at the cap', () => {
  const base = attackOf('knight', 'bowlingBash', SKILL.maxLevel, null);
  const below = attackOf('knight', 'bowlingBash', SKILL.maxLevel - 1, { bowlingBash: 'breaker' });
  const at = attackOf('knight', 'bowlingBash', SKILL.maxLevel, { bowlingBash: 'breaker' });
  assert.deepEqual(below.hits, base.hits, 'one level short buys nothing');
  assert.notDeepEqual(at.hits, base.hits, 'at the cap it applies');
  // An id the skill does not offer is ignored rather than crashing or half-applying.
  const bogus = attackOf('knight', 'bowlingBash', SKILL.maxLevel, { bowlingBash: 'nonsense' });
  assert.deepEqual(bogus.hits, base.hits);
});

test('the branches do what they say', () => {
  const max = SKILL.maxLevel;
  const base = attackOf('knight', 'bowlingBash', max, null);
  const breaker = attackOf('knight', 'bowlingBash', max, { bowlingBash: 'breaker' });
  assert.equal(base.hits.length, 1);
  assert.equal(breaker.hits.length, 2, 'Breaker lands twice');
  const sweep = attackOf('knight', 'bowlingBash', max, { bowlingBash: 'sweep' });
  assert.ok(sweep.hits[0].box.x1 > base.hits[0].box.x1, 'Sweep is wider');
  assert.ok(sweep.hits[0].knock[1] > base.hits[0].knock[1], 'and launches harder');

  const talon = attackOf('hunter', 'blitzBeat', max, { blitzBeat: 'talon' });
  const flock = attackOf('hunter', 'blitzBeat', max, { blitzBeat: 'flock' });
  assert.equal(talon.hits.length, 1, 'Talon is one dive');
  assert.equal(flock.hits.length, 4, 'Flock is four');
  assert.ok(talon.hits[0].dmg > flock.hits.reduce((a, h) => a + h.dmg, 0) / 2, 'and Talon puts it all in one');

  const haste = attackOf('knight', 'quicken', max, { quicken: 'haste' });
  const edge = attackOf('knight', 'quicken', max, { quicken: 'edge' });
  const plain = attackOf('knight', 'quicken', max, null);
  assert.ok(haste.buff.dur > plain.buff.dur, 'Haste lasts longer');
  assert.ok(edge.buff.crit > 0 && edge.buff.dur < haste.buff.dur, 'Edge trades duration for crit');
});

test("Quicken's Edge puts its crit on the hero while the buff is up, and takes it back after", () => {
  const g = createGame({ hero: 'knight', seed: 3, skills: { quicken: SKILL.maxLevel }, branches: { quicken: 'edge' } });
  // The hero has to outlive the buff to watch it end, and a dead hero's timers stop - which
  // is what made the first version of this test wait forever on a buff frozen at 0.07.
  g.cheats = { invuln: true };
  const p = g.player;
  const before = p.crit;
  for (let i = 0; i < 4; i++) update(g, i === 0 ? { held: {}, pressed: { skill1: true } } : EMPTY_INPUT);
  assert.ok(p.buffs.quicken, 'the buff is up');
  assert.ok(p.crit > before, `crit rose from ${before} to ${p.crit}`);
  // Run it out and the crit goes with it. Long enough to outlast the buff at the cap,
  // where skill levels have stretched it well past its base duration.
  for (let i = 0; i < 60 * 90; i++) update(g, EMPTY_INPUT);
  assert.ok(!p.buffs.quicken, 'the buff expired');
  assert.equal(p.crit, before, 'and took its crit with it');
});

test('the profile only keeps a branch the hero has earned', () => {
  const p = defaultProfile();
  p.heroes.knight.xp = xpAtLevel(2);
  assert.equal(setBranch(p, 'knight', 'bowlingBash', 'breaker'), false, 'not at the cap');
  p.heroes.knight.xp = xpAtLevel(30);
  for (let i = 0; i < SKILL.maxLevel; i++) spendSkillPoint(p, 'knight', 'bowlingBash');
  assert.equal(setBranch(p, 'knight', 'bowlingBash', 'nonsense'), false, 'not a branch it offers');
  assert.equal(setBranch(p, 'knight', 'bowlingBash', 'breaker'), true);
  assert.equal(heroOf(p, 'knight').branches.bowlingBash, 'breaker');
  // The pick can be changed: the tier is a build decision, not a trap.
  assert.equal(setBranch(p, 'knight', 'bowlingBash', 'sweep'), true);
  assert.equal(p.heroes.knight.branches.bowlingBash, 'sweep');
  // A save claiming a branch on a skill that is not at the cap loses it.
  const forged = normalize({ heroes: { knight: { xp: xpAtLevel(30), skills: { bowlingBash: 3 }, branches: { bowlingBash: 'sweep' } } } });
  assert.deepEqual(forged.heroes.knight.branches, {});
});

test('a branch survives the round trip through a saved profile', () => {
  const p = defaultProfile();
  p.heroes.hunter.xp = xpAtLevel(30);
  for (let i = 0; i < SKILL.maxLevel; i++) spendSkillPoint(p, 'hunter', 'blitzBeat');
  setBranch(p, 'hunter', 'blitzBeat', 'talon');
  const back = normalize(JSON.parse(JSON.stringify(p)));
  assert.equal(back.heroes.hunter.branches.blitzBeat, 'talon');
});
