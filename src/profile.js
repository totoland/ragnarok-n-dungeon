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
import { HEROES } from './sim/data/heroes.js';
import { TOWNS } from './sim/data/dungeon.js';
import { ITEMS } from './sim/data/items.js';
import { NGPLUS, DROPS, REFINE, SKILL } from './config.js';
import { levelFromXp, skillPointsAt } from './sim/progress.js';

export const PROFILE_KEY = 'dro.profile.v1';
export const HERO_KEYS = Object.keys(HEROES);
export const TOWN_KEYS = Object.keys(TOWNS);       // unlock order

const townRow = () => ({ clears: 0, best: 0 });
// items: { itemId: { plus } } - one of each, refined by duplicates. equip: the wielded item
// id or null. skills: { skillId: level } for the points spent.
const heroRow = (hero) => ({
  xp: 0,
  towns: Object.fromEntries(TOWN_KEYS.map((t) => [t, townRow()])),
  items: {}, equip: null,
  skills: Object.fromEntries((HEROES[hero]?.skills || []).map((id) => [id, 0])),
});

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
    // Only this hero's weapons, each at a legal refine; the wielded one must be held.
    if (src.items && typeof src.items === 'object') {
      for (const [id, it] of Object.entries(src.items)) {
        if (ITEMS[id]?.hero === h && it && typeof it === 'object') row.items[id] = { plus: int(it.plus, REFINE.max) };
      }
    }
    if (typeof src.equip === 'string' && row.items[src.equip]) row.equip = src.equip;
    // Skill levels clamp per skill; points spent beyond what the level grants (a curve or
    // cap change) refund everything rather than guess which to keep.
    if (src.skills && typeof src.skills === 'object') {
      for (const id of Object.keys(row.skills)) row.skills[id] = int(src.skills[id], SKILL.maxLevel);
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

// Everything the shell wants to say about a hero, computed from the stored row.
export function heroOf(profile, hero) {
  const row = profile.heroes[hero] || heroRow(hero);
  const level = levelFromXp(row.xp);
  return {
    xp: row.xp, level, skillPoints: skillPointsAt(level), towns: row.towns,
    items: row.items, skills: row.skills,
    gear: row.equip && row.items[row.equip] ? { id: row.equip, plus: row.items[row.equip].plus } : null,
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

// Wield an item the hero holds, or null for bare hands.
export function setEquip(profile, hero, id) {
  const row = profile.heroes[hero];
  if (!row) return false;
  if (id !== null && !row.items[id]) return false;
  row.equip = id;
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
  // Loot: a new weapon is held (and wielded if the hands were empty); a duplicate refines
  // the held one by +1 up to the cap, where it is simply lost.
  const loot = [];
  for (const id of game.loot || []) {
    if (!ITEMS[id] || ITEMS[id].hero !== hero) continue;
    const held = row.items[id];
    if (!held) {
      row.items[id] = { plus: 0 };
      if (!row.equip) row.equip = id;
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
