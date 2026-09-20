import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_KEY, TOWN_KEYS, HERO_KEYS, defaultProfile, normalize, loadProfile, saveProfile, clearProfile,
  heroOf, isUnlocked, tierFor, nextTown, prevTown, recordRun, dropFor, setEquip, spendSkillPoint, skillPointsLeft,
} from '../src/profile.js';
import { xpAtLevel } from '../src/sim/progress.js';
import { NGPLUS, DROPS, REFINE, SKILL } from '../src/config.js';
import { ITEMS } from '../src/sim/data/items.js';

function fakeStore(seed = null) {
  let v = seed;
  return { getItem: () => v, setItem: (_, next) => { v = next; }, removeItem: () => { v = null; }, get raw() { return v; } };
}
const finished = (phase, xp, xpStart = 0, score = 1000) => ({ phase, xp, xpStart, score });

test('a fresh profile: every hero at level 1, only the first town open, tier 0 everywhere', () => {
  const p = defaultProfile();
  assert.deepEqual(Object.keys(p.heroes), HERO_KEYS);
  for (const h of HERO_KEYS) {
    assert.deepEqual(heroOf(p, h), { xp: 0, level: 1, skillPoints: 0, towns: p.heroes[h].towns, items: {}, skills: p.heroes[h].skills, equip: p.heroes[h].equip, gear: null, wear: { cape: null, hat: null, accessory: null } });
    assert.deepEqual(p.heroes[h].equip, { weapon: null, cape: null, hat: null, accessory: null });
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

test('loot: the first weapon is held and wielded, a duplicate refines it, the cap holds', () => {
  const p = defaultProfile();
  assert.deepEqual(dropFor(p, 'knight', 'prontera'), { item: 'katana', chance: 1 }, 'first clear: guaranteed');
  assert.equal(dropFor(p, 'knight', 'nowhere'), null);
  const r = recordRun(p, { ...finished('won', 500), loot: ['katana'] }, { hero: 'knight', town: 'prontera' });
  assert.deepEqual(r.loot, [{ id: 'katana', plus: 0, merged: false }]);
  assert.deepEqual(p.heroes.knight.items, { katana: { plus: 0 } });
  assert.equal(p.heroes.knight.equip.weapon, 'katana');
  assert.deepEqual(heroOf(p, 'knight').gear, { id: 'katana', plus: 0 });
  assert.equal(dropFor(p, 'knight', 'prontera').chance, DROPS.boss.chance, 'after the first clear: a chance');
  const r2 = recordRun(p, { ...finished('won', 900, 500), loot: ['katana'] }, { hero: 'knight', town: 'prontera' });
  assert.deepEqual(r2.loot, [{ id: 'katana', plus: 1, merged: true }]);
  assert.deepEqual(heroOf(p, 'knight').gear, { id: 'katana', plus: 1 });
  recordRun(p, { ...finished('won', 1), loot: ['tsurugi'] }, { hero: 'knight', town: 'morroc' });
  assert.equal(p.heroes.knight.equip.weapon, 'katana', 'a second weapon does not swap what is wielded');
  assert.ok(p.heroes.knight.items.tsurugi);
  recordRun(p, { ...finished('won', 1), loot: ['gakkung'] }, { hero: 'knight', town: 'prontera' });
  assert.equal(p.heroes.knight.items.gakkung, undefined, 'a bow is not the knight\'s to keep');
  for (let i = 0; i < 20; i++) recordRun(p, { ...finished('won', 1), loot: ['katana'] }, { hero: 'knight', town: 'prontera' });
  assert.equal(p.heroes.knight.items.katana.plus, REFINE.max);
  assert.equal(setEquip(p, 'knight', 'tsurugi'), true); assert.equal(heroOf(p, 'knight').gear.id, 'tsurugi');
  assert.equal(setEquip(p, 'knight', 'gakkung'), false, 'cannot wield what is not held');
  assert.equal(setEquip(p, 'knight', null), true); assert.equal(heroOf(p, 'knight').gear, null);
  const back = normalize(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(back.heroes.knight.items, p.heroes.knight.items);
  const odd = normalize({ heroes: { knight: { items: { katana: { plus: 99 }, gakkung: { plus: 1 }, junk: 1 }, equip: 'tsurugi' } } });
  assert.deepEqual(odd.heroes.knight.items, { katana: { plus: REFINE.max } });
  assert.equal(odd.heroes.knight.equip.weapon, null, 'an unheld equip is dropped');
  const old = normalize({ heroes: { knight: { items: { katana: { plus: 2 } }, equip: 'katana' } } });
  assert.equal(old.heroes.knight.equip.weapon, 'katana', 'the pre-slot save shape (equip as the weapon id) still loads');
  const wrong = normalize({ heroes: { knight: { items: { katana: { plus: 2 } }, equip: { cape: 'katana' } } } });
  assert.equal(wrong.heroes.knight.equip.cape, null, 'a weapon cannot sit in the cape slot');
});

test('slots: a worn item goes in its own slot, can be taken off, and a drop fills an empty slot', () => {
  // A stand-in cape and accessory so the slot rules can be exercised before real ones exist.
  ITEMS.testCape = { name: 'Test Cape', slot: 'cape', mods: { hp: 1.08 }, tip: 't' };
  ITEMS.testRing = { name: 'Test Ring', slot: 'accessory', hero: 'hunter', mods: { atk: 1.05 }, tip: 't' };
  try {
    const p = defaultProfile();
    const r = recordRun(p, { ...finished('won', 10), loot: ['testCape', 'testRing', 'katana'] }, { hero: 'knight', town: 'prontera' });
    assert.deepEqual(r.loot.map((l) => l.id), ['testCape', 'katana'], 'the hunter-only ring is not kept');
    assert.deepEqual(p.heroes.knight.equip, { weapon: 'katana', cape: 'testCape', hat: null, accessory: null });
    const h = heroOf(p, 'knight');
    assert.deepEqual(h.wear, { cape: { id: 'testCape', plus: 0 }, hat: null, accessory: null });
    assert.equal(setEquip(p, 'knight', null, 'cape'), true);
    assert.equal(p.heroes.knight.equip.cape, null);
    assert.equal(setEquip(p, 'knight', 'testCape'), true, 'slot inferred from the item');
    assert.equal(setEquip(p, 'knight', 'testCape', 'hat'), false, 'a cape is not a hat');
    assert.equal(setEquip(p, 'knight', 'nothing', 'cape'), false);
    recordRun(p, { ...finished('won', 10), loot: ['testCape'] }, { hero: 'knight', town: 'prontera' });
    assert.equal(p.heroes.knight.items.testCape.plus, 1, 'worn things refine too');
    const back = normalize(JSON.parse(JSON.stringify(p)));
    assert.deepEqual(back.heroes.knight.equip, p.heroes.knight.equip);
  } finally { delete ITEMS.testCape; delete ITEMS.testRing; }
});

test('skill points: one per level, spent one at a time, capped per skill, refunded if the save is over budget', () => {
  const p = defaultProfile();
  assert.equal(skillPointsLeft(p, 'knight'), 0);
  assert.equal(spendSkillPoint(p, 'knight', 'quicken'), false, 'nothing to spend at level 1');
  p.heroes.knight.xp = xpAtLevel(4);
  assert.equal(skillPointsLeft(p, 'knight'), 3);
  assert.equal(spendSkillPoint(p, 'knight', 'quicken'), true);
  assert.equal(spendSkillPoint(p, 'knight', 'bash'), false, 'not one of the hero\'s slotted skills');
  assert.equal(spendSkillPoint(p, 'knight', 'quicken'), true);
  assert.equal(spendSkillPoint(p, 'knight', 'magnumBreak'), true);
  assert.equal(spendSkillPoint(p, 'knight', 'magnumBreak'), false, 'out of points');
  assert.deepEqual(heroOf(p, 'knight').skills, { quicken: 2, magnumBreak: 1, bowlingBash: 0 });
  p.heroes.knight.xp = xpAtLevel(30);
  for (let i = 0; i < 9; i++) spendSkillPoint(p, 'knight', 'quicken');
  assert.equal(p.heroes.knight.skills.quicken, SKILL.maxLevel);
  const over = normalize({ heroes: { hunter: { xp: xpAtLevel(2), skills: { windWalk: 3, arrowShower: 2 } } } });
  assert.deepEqual(over.heroes.hunter.skills, { windWalk: 0, arrowShower: 0, blitzBeat: 0 }, 'over budget → refunded');
  const ok = normalize({ heroes: { hunter: { xp: xpAtLevel(6), skills: { windWalk: 3, arrowShower: 2, bogus: 4 } } } });
  assert.deepEqual(ok.heroes.hunter.skills, { windWalk: 3, arrowShower: 2, blitzBeat: 0 });
});
