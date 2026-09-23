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
// A third kind, the *Add keys (accessories): flat ATK / MATK and rate bonuses that sum
// across everything worn and land on top of whatever the weapon set.
const MULT = new Set(['hp', 'mp', 'atk', 'matk', 'speed', 'atkSpeed']);
// The *Add keys sum across everything worn. The last three are Orvane's: rates that fire
// off a landed hit, so a weapon granting a chance and three charms adding to it all reach
// rollPassive as one number (sim/game.js).
const ADD = new Set(['atkAdd', 'matkAdd', 'critAdd', 'critDmgAdd', 'dodgeAdd',
                     'meteorAdd', 'doubleAdd', 'spDrainAdd', 'pullAdd', 'boltAdd', 'freezeAdd', 'magnumAdd', 'showerAdd', 'armorAdd']);
export function mergeMods(...sets) {
  const out = {};
  for (const s of sets) {
    if (!s) continue;
    for (const [k, v] of Object.entries(s)) {
      if (MULT.has(k) && k in out) out[k] *= v;
      else if (ADD.has(k) && k in out) out[k] += v;
      else out[k] = v;
    }
  }
  return out;
}

export function resolveHero(base, mods = {}) {
  const m = { ...BASE_MODS, ...mods };
  return {
    ...base,
    hp: Math.round(base.hp * m.hp),
    mp: Math.round(base.mp * m.mp),
    atk: base.atk * m.atk + (m.atkAdd || 0),
    matk: (base.matk || 0) * (m.matk || 1) + (m.matkAdd || 0),
    speed: base.speed * m.speed,
    atkSpeed: m.atkSpeed,
    dodge: Math.min(0.75, m.dodge + (m.dodgeAdd || 0)),
    crit: Math.min(1, m.crit + (m.critAdd || 0)),
    critDmg: m.critDmg + (m.critDmgAdd || 0),
    // Gear procs. Capped at a half so a full set of one kind stays a surprise rather than
    // the way the hero attacks.
    meteor: Math.min(0.5, m.meteorAdd || 0),
    double: Math.min(0.5, m.doubleAdd || 0),
    spDrain: Math.min(0.5, m.spDrainAdd || 0),
    pull: Math.min(0.5, m.pullAdd || 0),
    bolt: Math.min(0.5, m.boltAdd || 0),
    // Not a proc of its own: the chance that magic damage, once it lands, freezes what it hit.
    freeze: Math.min(0.5, m.freezeAdd || 0),
    magnum: Math.min(0.5, m.magnumAdd || 0),
    shower: Math.min(0.5, m.showerAdd || 0),
    // Armour is not capped at the top the way a proc rate is - it is capped at 0.8 so
    // nothing can ever become immune - and it is allowed to go negative.
    armor: Math.max(-1, Math.min(0.8, m.armorAdd || 0)),
    mods: m,
  };
}

export function resolveMonster(base, tier = 0) {
  const t = Math.max(0, Math.min(NGPLUS.maxTier, tier | 0));
  if (!t) return base;
  return {
    ...base,
    hp: Math.round(base.hp * (1 + NGPLUS.hp * t)),
    // Armour does NOT climb with the tier. Health and damage already do, and a percentage
    // that also climbed would turn NG+5 into a wall rather than a harder fight.
    armor: base.armor || 0,
    atk: base.atk * (1 + NGPLUS.atk * t),
    speed: base.speed * (1 + NGPLUS.speed * t),
    tier: t,
  };
}
