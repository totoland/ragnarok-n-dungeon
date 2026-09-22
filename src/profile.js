// Persistent progress: XP per hero, town clears per hero, and the last pick. Pure data plus
// localStorage I/O in the settings.js mould, so the tests drive it with a fake store.
//
// The store holds as little as it can. A hero's level, skill points, which towns are open
// and a town's New Game+ tier are all derived from two integers per hero-town (xp, clears),
// so there is almost no invariant a half-written save can break, and `normalize` rebuilds
// anything it does not recognise from the defaults rather than ever throwing at boot.
//
// Progress is per hero, like a character in RO: a hero the shop unlocks later starts at
// level 1 on tier 0 and grows into the towns. Unlocking a town is account-wide though - one
// clear of Prontera by anyone opens Morroc for everyone, so a second hero is not sent back
// through the culvert just to see the desert.
import { HEROES, branchesOf } from './sim/data/heroes.js';
import { TOWNS } from './sim/data/dungeon.js';
import { ITEMS, ATTRS, SLOTS, slotOf, fits, isRolled } from './sim/data/items.js';
import { NGPLUS, DROPS, REFINE, SKILL } from './config.js';
import { levelFromXp, skillPointsAt } from './sim/progress.js';

export const PROFILE_KEY = 'dro.profile.v1';
export const HERO_KEYS = Object.keys(HEROES);
export const TOWN_KEYS = Object.keys(TOWNS);       // unlock order

const townRow = () => ({ clears: 0, best: 0 });
// items: { itemId: { plus } } - one of each, refined by duplicates. bag: rolled instances
// (accessories), each { uid, id, main, sub }, as many as drop. equip: what is worn in each
// slot - an item id, or for the accessory slot a bag uid, or null (a null weapon is the
// hero's own). skills: { skillId: level } for the points spent.
const emptyEquip = () => Object.fromEntries(SLOTS.map((s) => [s, null]));
const heroRow = (hero) => ({
  xp: 0,
  towns: Object.fromEntries(TOWN_KEYS.map((t) => [t, townRow()])),
  items: {}, bag: [], seq: 0, equip: emptyEquip(),
  skills: Object.fromEntries((HEROES[hero]?.skills || []).map((id) => [id, 0])),
  // { skillId: branchId } - only meaningful for a skill standing at SKILL.maxLevel.
  branches: {},
});
const ROLLED_SLOTS = new Set(['accessory']);

function cleanAttr(a, allowed) {
  if (!a || typeof a !== 'object' || !ATTRS[a.stat] || !allowed(a.stat)) return null;
  const d = ATTRS[a.stat];
  const v = Number(a.v);
  if (!Number.isFinite(v)) return null;
  return { stat: a.stat, v: Math.max(d.min, Math.min(d.max, Math.round(v * 1000) / 1000)) };
}

export function defaultProfile() {
  return {
    v: 1,
    heroes: Object.fromEntries(HERO_KEYS.map((h) => [h, heroRow(h)])),
    last: { hero: HERO_KEYS[0], town: TOWN_KEYS[0] },
  };
}

const int = (v, max = Number.MAX_SAFE_INTEGER) => (Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);

export function normalize(raw) {
  const p = defaultProfile();
  if (!raw || typeof raw !== 'object') return p;
  for (const h of HERO_KEYS) {
    const src = raw.heroes?.[h];
    if (!src || typeof src !== 'object') continue;
    const row = p.heroes[h];
    row.xp = int(src.xp);
    for (const t of TOWN_KEYS) {
      const ts = src.towns?.[t];
      if (!ts || typeof ts !== 'object') continue;
      row.towns[t].clears = int(ts.clears);
      row.towns[t].best = int(ts.best);
    }
    // Only items this hero can use, each at a legal refine; anything worn must be held and
    // sit in its own slot. `equip` used to be the weapon id alone; that shape still loads.
    if (src.items && typeof src.items === 'object') {
      for (const [id, it] of Object.entries(src.items)) {
        if (fits(id, h) && it && typeof it === 'object') row.items[id] = { plus: int(it.plus, REFINE.max) };
      }
    }
    // The bag: only well-formed rolled instances of accessory kinds, values clamped to their
    // ranges, uids unique.
    row.seq = int(src.seq);
    const uids = new Set();
    for (const it of Array.isArray(src.bag) ? src.bag : []) {
      if (!it || typeof it !== 'object' || !isRolled(it.id) || !fits(it.id, h) || typeof it.uid !== 'string' || uids.has(it.uid)) continue;
      const main = cleanAttr(it.main, (st) => st === ITEMS[it.id].main);
      const sub = cleanAttr(it.sub, (st) => st !== ITEMS[it.id].main);
      if (!main) continue;
      uids.add(it.uid);
      row.bag.push({ uid: it.uid, id: it.id, main, sub });
    }
    const eq = typeof src.equip === 'string' ? { weapon: src.equip } : src.equip;
    if (eq && typeof eq === 'object') {
      for (const slot of SLOTS) {
        const ref = eq[slot];
        if (typeof ref !== 'string') continue;
        if (ROLLED_SLOTS.has(slot) ? uids.has(ref) : (row.items[ref] && slotOf(ref) === slot)) row.equip[slot] = ref;
      }
    }
    // Skill levels clamp per skill; points spent beyond what the level grants (a curve or
    // cap change) refund everything rather than guess which to keep.
    if (src.skills && typeof src.skills === 'object') {
      for (const id of Object.keys(row.skills)) row.skills[id] = int(src.skills[id], SKILL.maxLevel);
    }
    // A branch is kept only where the skill it belongs to is still at the cap and the id is
    // one the skill actually offers - so a save written before a rebalance cannot smuggle in
    // an upgrade the hero has not earned.
    if (src.branches && typeof src.branches === 'object') {
      for (const [id, pick] of Object.entries(src.branches)) {
        if (row.skills[id] >= SKILL.maxLevel && branchesOf(id).includes(pick)) row.branches[id] = pick;
      }
    }
    if (skillPointsLeft(p, h) < 0) for (const id of Object.keys(row.skills)) row.skills[id] = 0;
  }
  if (HERO_KEYS.includes(raw.last?.hero)) p.last.hero = raw.last.hero;
  if (TOWN_KEYS.includes(raw.last?.town) && isUnlocked(p, raw.last.town)) p.last.town = raw.last.town;
  return p;
}

const store = (given) => given || (typeof localStorage !== 'undefined' ? localStorage : null);

export function loadProfile(given) {
  const s = store(given);
  if (!s) return defaultProfile();
  try {
    return normalize(JSON.parse(s.getItem(PROFILE_KEY)));
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile, given) {
  const s = store(given);
  if (!s) return profile;
  try {
    s.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch { /* private mode / quota: progress lives in memory for this session */ }
  return profile;
}

export function clearProfile(given) {
  const s = store(given);
  if (s) try { s.removeItem(PROFILE_KEY); } catch { /* ignore */ }
  return defaultProfile();
}

// ---------------------------------------------------------------- derived views

// Everything the shell wants to say about a hero, computed from the stored row. `gear` is
// the wielded weapon ({ id, plus } or null), `wear` the other slots the same way.
export function heroOf(profile, hero) {
  const row = profile.heroes[hero] || heroRow(hero);
  const level = levelFromXp(row.xp);
  const worn = (slot) => {
    const ref = row.equip[slot];
    if (!ref) return null;
    if (ROLLED_SLOTS.has(slot)) return row.bag.find((it) => it.uid === ref) || null;
    return row.items[ref] ? { id: ref, plus: row.items[ref].plus } : null;
  };
  return {
    xp: row.xp, level, skillPoints: skillPointsAt(level), towns: row.towns,
    items: row.items, bag: row.bag, skills: row.skills, branches: row.branches, equip: row.equip,
    gear: worn('weapon'),
    wear: Object.fromEntries(SLOTS.filter((s) => s !== 'weapon').map((s) => [s, worn(s)])),
  };
}

export function skillPointsLeft(profile, hero) {
  const row = profile.heroes[hero];
  if (!row) return 0;
  const spent = Object.values(row.skills).reduce((a, v) => a + (v | 0), 0);
  return skillPointsAt(levelFromXp(row.xp)) - spent;
}

// Put one point on a skill. False when there is nothing to spend or the skill is maxed.
export function spendSkillPoint(profile, hero, skill) {
  const row = profile.heroes[hero];
  if (!row || !(skill in row.skills)) return false;
  if (skillPointsLeft(profile, hero) <= 0 || row.skills[skill] >= SKILL.maxLevel) return false;
  row.skills[skill]++;
  return true;
}

// Pick the branch on a skill that has reached the cap. One choice per skill, and it can be
// changed freely: the tier is meant to be a build decision, not a trap a player walks into
// once and regrets for the rest of the file.
export function setBranch(profile, hero, skill, pick) {
  const row = profile.heroes[hero];
  if (!row || (row.skills[skill] | 0) < SKILL.maxLevel) return false;
  if (!branchesOf(skill).includes(pick)) return false;
  row.branches[skill] = pick;
  return true;
}

// Wear something the hero holds, in the slot it belongs to: an item id, or a bag uid for
// the accessory slot. `setEquip(profile, hero, null, slot)` empties a slot (a null weapon
// is the hero's own).
export function setEquip(profile, hero, ref, slot = ref && slotOf(ref) ? slotOf(ref) : 'weapon') {
  const row = profile.heroes[hero];
  if (!row || !SLOTS.includes(slot)) return false;
  if (ref !== null) {
    if (ROLLED_SLOTS.has(slot)) { if (!row.bag.some((it) => it.uid === ref)) return false; }
    else if (!row.items[ref] || slotOf(ref) !== slot) return false;
  }
  row.equip[slot] = ref;
  return true;
}

// Throw a rolled item away. Worn ones come off first.
export function discard(profile, hero, uid) {
  const row = profile.heroes[hero];
  const i = row ? row.bag.findIndex((it) => it.uid === uid) : -1;
  if (i < 0) return false;
  row.bag.splice(i, 1);
  for (const slot of SLOTS) if (row.equip[slot] === uid) row.equip[slot] = null;
  return true;
}

// What the town boss may drop for this hero this run: its weapon for certain on the first
// clear, then at DROPS.boss.chance. Null when the town has nothing for the class.
export function dropFor(profile, hero, town) {
  const item = TOWNS[town]?.loot?.[hero];
  if (!item || !ITEMS[item]) return null;
  const clears = profile.heroes[hero]?.towns?.[town]?.clears || 0;
  return { item, chance: clears ? DROPS.boss.chance : 1 };
}

export function nextTown(town) {
  const i = TOWN_KEYS.indexOf(town);
  return i >= 0 && i + 1 < TOWN_KEYS.length ? TOWN_KEYS[i + 1] : null;
}
export function prevTown(town) {
  const i = TOWN_KEYS.indexOf(town);
  return i > 0 ? TOWN_KEYS[i - 1] : null;
}

// The first town is always open; each later one opens once any hero has cleared the one
// before it.
export function isUnlocked(profile, town) {
  const prev = prevTown(town);
  if (prev === null) return TOWN_KEYS.includes(town);
  return HERO_KEYS.some((h) => (profile.heroes[h]?.towns?.[prev]?.clears || 0) > 0);
}

// The New Game+ tier this hero plays this town at: once per clear, up to the cap.
export function tierFor(profile, hero, town) {
  return Math.min(NGPLUS.maxTier, profile.heroes[hero]?.towns?.[town]?.clears || 0);
}

// Fold a finished run into the profile. XP is written back as the sim's lifetime total -
// the run started from the stored number - so recording the same run twice is harmless.
// A loss still keeps its XP: coming back to farm is the point.
export function recordRun(profile, game, { hero, town }) {
  const row = profile.heroes[hero] || (profile.heroes[hero] = heroRow(hero));
  const before = levelFromXp(row.xp);
  row.xp = Math.max(row.xp, int(game.xp));
  const after = levelFromXp(row.xp);
  const won = game.phase === 'won';
  const next = nextTown(town);
  let unlocked = null, firstClear = false;
  if (won) {
    const t = row.towns[town] || (row.towns[town] = townRow());
    const openBefore = next ? isUnlocked(profile, next) : true;
    firstClear = t.clears === 0;
    t.clears++;
    t.best = Math.max(t.best, Math.round(game.score));
    if (next && !openBefore) unlocked = next;
  }
  // Loot: a new item is held (and worn if its slot was empty); a duplicate refines the held
  // one by +1 up to the cap, where it is simply lost. A rolled drop is its own instance in
  // the bag, worn if the slot was empty, never merged.
  const loot = [];
  for (const entry of game.loot || []) {
    const rolled = typeof entry === 'object' && entry !== null;
    const id = rolled ? entry.id : entry;
    if (!fits(id, hero)) continue;
    if (rolled) {
      const inst = { uid: `a${++row.seq}`, id, main: entry.main, sub: entry.sub };
      row.bag.push(inst);
      const slot = slotOf(id);
      if (!row.equip[slot]) row.equip[slot] = inst.uid;
      loot.push({ id, rolled: inst, merged: false });
      continue;
    }
    const held = row.items[id];
    if (!held) {
      row.items[id] = { plus: 0 };
      const slot = slotOf(id);
      if (!row.equip[slot]) row.equip[slot] = id;
      loot.push({ id, plus: 0, merged: false });
    } else {
      held.plus = Math.min(REFINE.max, held.plus + 1);
      loot.push({ id, plus: held.plus, merged: true });
    }
  }
  return {
    xpGained: Math.max(0, int(game.xp) - int(game.xpStart)),
    levelBefore: before, levelAfter: after, skillPoints: skillPointsAt(after) - skillPointsAt(before),
    won, firstClear, unlocked, next, tier: tierFor(profile, hero, town), loot,
  };
}
