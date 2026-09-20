// The one place stat modifiers combine.
//
// Everything that will ever change a number on a hero or a monster - level, equipment, skill
// points, a town's New Game+ tier - lands here as data and comes out as a def-shaped object
// the rest of the sim reads exactly as it read the static table. The sim never learns what a
// level or a Katana is; it sees hp, atk, and a few baseline rates.
//
// A resolved def keeps every nested field of the base by reference (attacks, skills, passive,
// ai, ...) so code that reaches into p.def.attacks or e.def.hop keeps working, and copies only
// the scalars it scales. Tier 0 hands the monster table back untouched, so a fresh run is
// byte-for-byte the game it was before this file existed.
import { NGPLUS } from '../config.js';

// Baseline modifiers: the numbers an unmodified hero plays with. crit and critDmg used to be
// literals in combat.js; they live here so a weapon can raise them.
export const BASE_MODS = { hp: 1, mp: 1, atk: 1, speed: 1, atkSpeed: 1, dodge: 0, crit: 0.08, critDmg: 1.6 };

// Combine modifier sets from different sources - the level's, a weapon's, a skill's - into
// one. Multipliers multiply; the rates (dodge, crit, critDmg) are absolute and the last set
// that names one wins, so a Katana's crit rate replaces the baseline rather than adding to
// it. Sets are sparse: a key a set does not mention is left to the others.
const MULT = new Set(['hp', 'mp', 'atk', 'speed', 'atkSpeed']);
export function mergeMods(...sets) {
  const out = {};
  for (const s of sets) {
    if (!s) continue;
    for (const [k, v] of Object.entries(s)) out[k] = MULT.has(k) && k in out ? out[k] * v : v;
  }
  return out;
}

export function resolveHero(base, mods = {}) {
  const m = { ...BASE_MODS, ...mods };
  return {
    ...base,
    hp: Math.round(base.hp * m.hp),
    mp: Math.round(base.mp * m.mp),
    atk: base.atk * m.atk,
    speed: base.speed * m.speed,
    atkSpeed: m.atkSpeed, dodge: m.dodge, crit: m.crit, critDmg: m.critDmg,
    mods: m,
  };
}

export function resolveMonster(base, tier = 0) {
  const t = Math.max(0, Math.min(NGPLUS.maxTier, tier | 0));
  if (!t) return base;
  return {
    ...base,
    hp: Math.round(base.hp * (1 + NGPLUS.hp * t)),
    atk: base.atk * (1 + NGPLUS.atk * t),
    speed: base.speed * (1 + NGPLUS.speed * t),
    tier: t,
  };
}
