// Levels and XP: the one place a number of kills turns into a level and a level turns into
// stat modifiers. Pure functions of the tables in config.js, so the sim, the shell, the
// harness and the tests all agree on what "level 7" means.
//
// Level 1 is 0 XP. XP is cumulative and never spent, so a hero's level is a function of one
// integer the profile stores; skill points are (level - 1) minus whatever has been allocated.
import { LEVEL, NGPLUS } from '../config.js';

// XP needed to go from `level` to `level + 1`; 0 past the cap.
export function xpToNext(level) {
  if (level >= LEVEL.max) return 0;
  return Math.round(LEVEL.base * Math.pow(level, LEVEL.exp));
}

// Cumulative XP at which `level` is reached. Precomputed once: the sim asks on every kill.
const AT = [0, 0];
for (let l = 1; l < LEVEL.max; l++) AT[l + 1] = AT[l] + xpToNext(l);
export function xpAtLevel(level) { return AT[Math.max(1, Math.min(LEVEL.max, level | 0))]; }

export function levelFromXp(xp) {
  let l = 1;
  while (l < LEVEL.max && xp >= AT[l + 1]) l++;
  return l;
}

// Progress inside the current level, 0..1, for the bar.
export function levelProgress(xp) {
  const l = levelFromXp(xp);
  const need = xpToNext(l);
  return need ? (xp - AT[l]) / need : 1;
}

// The modifiers a level grants, sparse: only the keys it changes, so merging with gear
// later cannot double-apply a baseline. Level 1 is the empty set and resolves to the table.
export function levelMods(level) {
  const n = Math.max(0, (level | 0) - 1);
  if (!n) return {};
  return { hp: 1 + LEVEL.hp * n, mp: 1 + LEVEL.mp * n, atk: 1 + LEVEL.atk * n };
}

export function skillPointsAt(level) { return Math.max(0, (level | 0) - 1); }

// XP for a kill: the monster's `xp` if it has one, its score otherwise (score is already the
// per-monster difficulty number), plus a share per New Game+ tier so coming back to farm a
// harder town pays.
export function xpForKill(def, tier = 0) {
  return Math.round((def.xp ?? def.score) * (1 + NGPLUS.xp * Math.max(0, tier | 0)));
}
