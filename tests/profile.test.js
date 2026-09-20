import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_KEY, TOWN_KEYS, HERO_KEYS, defaultProfile, normalize, loadProfile, saveProfile, clearProfile,
  heroOf, isUnlocked, tierFor, nextTown, prevTown, recordRun,
} from '../src/profile.js';
import { xpAtLevel } from '../src/sim/progress.js';
import { NGPLUS } from '../src/config.js';

function fakeStore(seed = null) {
  let v = seed;
  return { getItem: () => v, setItem: (_, next) => { v = next; }, removeItem: () => { v = null; }, get raw() { return v; } };
}
const finished = (phase, xp, xpStart = 0, score = 1000) => ({ phase, xp, xpStart, score });

test('a fresh profile: every hero at level 1, only the first town open, tier 0 everywhere', () => {
  const p = defaultProfile();
  assert.deepEqual(Object.keys(p.heroes), HERO_KEYS);
  for (const h of HERO_KEYS) {
    assert.deepEqual(heroOf(p, h), { xp: 0, level: 1, skillPoints: 0, towns: p.heroes[h].towns });
    for (const t of TOWN_KEYS) assert.equal(tierFor(p, h, t), 0);
  }
  assert.equal(isUnlocked(p, TOWN_KEYS[0]), true);
  assert.equal(isUnlocked(p, 'morroc'), false);
  assert.equal(isUnlocked(p, 'nowhere'), false);
  assert.equal(nextTown('prontera'), 'morroc'); assert.equal(nextTown('morroc'), null);
  assert.equal(prevTown('prontera'), null); assert.equal(prevTown('morroc'), 'prontera');
});

test('normalize rebuilds anything odd and never trusts a locked last town', () => {
  assert.deepEqual(normalize(null), defaultProfile());
  assert.deepEqual(normalize('junk'), defaultProfile());
  const p = normalize({ heroes: { knight: { xp: -5, towns: { prontera: { clears: 2.7, best: 'x' }, bogus: { clears: 9 } } }, ghost: { xp: 99 } }, last: { hero: 'ghost', town: 'morroc' } });
  assert.equal(p.heroes.knight.xp, 0);
  assert.equal(p.heroes.knight.towns.prontera.clears, 2);
  assert.equal(p.heroes.knight.towns.prontera.best, 0);
  assert.equal(p.heroes.ghost, undefined);
  assert.equal(p.heroes.knight.towns.bogus, undefined);
  assert.equal(p.last.hero, 'knight', 'unknown hero falls back');
  assert.equal(p.last.town, 'morroc', 'the knight cleared prontera, so morroc is a valid last town');
  const q = normalize({ last: { town: 'morroc' } });
  assert.equal(q.last.town, 'prontera', 'a locked last town is not honoured');
});

test('load / save round-trip through a store; garbage and no store fall back', () => {
  const store = fakeStore();
  const p = loadProfile(store);
  p.heroes.hunter.xp = 1234;
  saveProfile(p, store);
  assert.equal(JSON.parse(store.raw).heroes.hunter.xp, 1234);
  assert.equal(loadProfile(store).heroes.hunter.xp, 1234);
  assert.deepEqual(loadProfile(fakeStore('{ not json')), defaultProfile());
  assert.deepEqual(loadProfile({ getItem() { throw new Error('nope'); } }), defaultProfile());
  assert.deepEqual(clearProfile(store), defaultProfile());
  assert.equal(store.raw, null);
  assert.deepEqual(loadProfile(null), defaultProfile(), 'no storage at all (node) still boots');
  assert.equal(PROFILE_KEY, 'dro.profile.v1');
});

test('a won run: xp banked, the town cleared, the next one unlocked once, tier climbs to the cap', () => {
  const p = defaultProfile();
  const r = recordRun(p, finished('won', xpAtLevel(4) + 10), { hero: 'knight', town: 'prontera' });
  assert.deepEqual([r.xpGained, r.levelBefore, r.levelAfter, r.skillPoints], [xpAtLevel(4) + 10, 1, 4, 3]);
  assert.equal(r.won, true); assert.equal(r.firstClear, true); assert.equal(r.unlocked, 'morroc'); assert.equal(r.next, 'morroc');
  assert.equal(r.tier, 1, 'the next Prontera run is NG+1');
  assert.equal(heroOf(p, 'knight').level, 4);
  assert.equal(p.heroes.knight.towns.prontera.best, 1000);
  assert.equal(isUnlocked(p, 'morroc'), true);
  assert.equal(tierFor(p, 'hunter', 'prontera'), 0, 'the hunter has her own tier');
  assert.equal(heroOf(p, 'hunter').level, 1, 'and her own level');

  const r2 = recordRun(p, finished('won', xpAtLevel(4) + 500, xpAtLevel(4) + 10, 400), { hero: 'knight', town: 'prontera' });
  assert.equal(r2.unlocked, null, 'unlocks announce once');
  assert.equal(r2.firstClear, false);
  assert.equal(p.heroes.knight.towns.prontera.best, 1000, 'best keeps the higher score');
  for (let i = 0; i < 10; i++) recordRun(p, finished('won', 1), { hero: 'knight', town: 'prontera' });
  assert.equal(tierFor(p, 'knight', 'prontera'), NGPLUS.maxTier);
  assert.equal(p.heroes.knight.xp, xpAtLevel(4) + 500, 'xp never goes backwards');

  const last = recordRun(p, finished('won', 1), { hero: 'knight', town: 'morroc' });
  assert.equal(last.next, null, 'nothing after the last town yet');
});

test('a lost run keeps its xp and clears nothing; recording twice is harmless', () => {
  const p = defaultProfile();
  const g = finished('dead', 300, 0);
  const r = recordRun(p, g, { hero: 'hunter', town: 'prontera' });
  assert.equal(r.won, false); assert.equal(r.xpGained, 300); assert.equal(r.unlocked, null);
  assert.equal(p.heroes.hunter.xp, 300);
  assert.equal(p.heroes.hunter.towns.prontera.clears, 0);
  assert.equal(isUnlocked(p, 'morroc'), false);
  recordRun(p, g, { hero: 'hunter', town: 'prontera' });
  assert.equal(p.heroes.hunter.xp, 300, 'the sim carries the lifetime total, so a re-record does not double it');
});
