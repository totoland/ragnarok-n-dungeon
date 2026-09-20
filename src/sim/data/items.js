// Weapons. Every town boss drops one per hero class (data/dungeon.js `loot`); a hero holds
// at most one of each, refined +N by every duplicate that drops. What an item does is a
// sparse modifier set the resolve step merges with the level's (see resolve.js mergeMods):
// multipliers multiply, rates replace the baseline. Names are Ragnarok Online weapons
// kept as placeholders like the monsters; the numbers are original.
import { REFINE } from '../../config.js';
import { BASE_MODS } from '../resolve.js';

// Where an item goes. One of each is worn at a time; `armor` is reserved until there is
// something to put in it (it needs models). `hero` on an item restricts it to a class;
// items without one fit anyone.
export const SLOTS = ['weapon', 'cape', 'hat', 'accessory'];
export const SLOT_INFO = {
  weapon: { name: 'Weapon', empty: 'Your own weapon' },
  cape: { name: 'Cape', empty: 'No cape' },
  hat: { name: 'Hat', empty: 'No hat' },
  accessory: { name: 'Accessory', empty: 'No accessory' },
};

// The attribute pool for rolled items (accessories). `key` is where the value lands in the
// hero's mods: flat ATK / MATK and the rates add up across everything worn (resolve.js
// *Add keys); HP / SP / ASPD multiply like a weapon's. `step` is the roll granularity.
export const ATTRS = {
  atk: { name: 'ATK', key: 'atkAdd', min: 1, max: 3, step: 1, flat: true },
  crit: { name: 'Crit rate', key: 'critAdd', min: 0.03, max: 0.06, step: 0.01 },
  critDmg: { name: 'Crit damage', key: 'critDmgAdd', min: 0.05, max: 0.10, step: 0.01 },
  dodge: { name: 'Dodge', key: 'dodgeAdd', min: 0.03, max: 0.05, step: 0.01 },
  matk: { name: 'MATK', key: 'matkAdd', min: 1, max: 3, step: 1, flat: true },   // for a caster hero to come
  hp: { name: 'HP', key: 'hp', min: 0.01, max: 0.03, step: 0.01, mult: true },
  sp: { name: 'SP', key: 'mp', min: 0.01, max: 0.03, step: 0.01, mult: true },
  aspd: { name: 'ASPD', key: 'atkSpeed', min: 0.05, max: 0.10, step: 0.01, mult: true },
};
export const ATTR_IDS = Object.keys(ATTRS);

export const ITEMS = {
  katana: { name: 'Katana', slot: 'weapon', hero: 'knight', kind: 'sword', mods: { atkSpeed: 1.10, crit: 0.30 }, tip: 'Attack 10% faster, 30% crit rate' },
  gakkung: { name: 'Gakkung Bow', slot: 'weapon', hero: 'hunter', kind: 'bow', mods: { atkSpeed: 1.10, crit: 0.30 }, tip: 'Shoot 10% faster, 30% crit rate' },
  tsurugi: { name: 'Tsurugi', slot: 'weapon', hero: 'knight', kind: 'sword', mods: { atk: 1.15, crit: 0.15 }, tip: '+15% ATK, 15% crit rate' },
  arbalest: { name: 'Arbalest', slot: 'weapon', hero: 'hunter', kind: 'bow', mods: { atk: 1.15, crit: 0.15 }, tip: '+15% ATK, 15% crit rate' },
  // Accessories: no model, no refine, every drop rolled - a main attribute fixed by the
  // kind, at a value from its range, plus one random secondary from the rest of the pool.
  // Which monsters drop them, and how often, is on the monsters (data/monsters.js `drops`).
  ring: { name: 'Ring', slot: 'accessory', main: 'atk', rarity: 'common', tip: 'Main: ATK' },
  clip: { name: 'Clip', slot: 'accessory', main: 'sp', rarity: 'common', tip: 'Main: SP' },
  bell: { name: 'Bell', slot: 'accessory', main: 'aspd', rarity: 'uncommon', tip: 'Main: ASPD' },
  brooch: { name: 'Brooch', slot: 'accessory', main: 'crit', rarity: 'uncommon', tip: 'Main: crit rate' },
  amulet: { name: 'Amulet', slot: 'accessory', main: 'hp', rarity: 'rare', tip: 'Main: HP' },
};

export const ITEM_IDS = Object.keys(ITEMS);
export const slotOf = (id) => ITEMS[id]?.slot || null;
export const fits = (id, hero) => !!ITEMS[id] && (!ITEMS[id].hero || ITEMS[id].hero === hero);
export const isRolled = (id) => !!ITEMS[id]?.main;

// Roll one attribute's value off the run's rng: min + n·step, uniform over the range.
function rollValue(stat, rng) {
  const a = ATTRS[stat];
  const steps = Math.round((a.max - a.min) / a.step);
  const n = Math.min(steps, Math.floor(rng.next() * (steps + 1)));
  return Math.round((a.min + n * a.step) * 1000) / 1000;
}

// A dropped accessory: the kind's main attribute and one secondary from the rest of the
// pool, both rolled. Deterministic given the rng, so a run's loot is part of its seed.
export function rollItem(id, rng) {
  const def = ITEMS[id];
  const main = { stat: def.main, v: rollValue(def.main, rng) };
  const pool = ATTR_IDS.filter((k) => k !== def.main);
  const stat = pool[Math.min(pool.length - 1, Math.floor(rng.next() * pool.length))];
  return { id, main, sub: { stat, v: rollValue(stat, rng) } };
}

export function attrText({ stat, v }) {
  const a = ATTRS[stat];
  return a.flat ? `+${v} ${a.name}` : `+${Math.round(v * 100)}% ${a.name}`;
}

function rolledMods(inst) {
  const mods = {};
  for (const part of [inst.main, inst.sub]) {
    if (!part || !ATTRS[part.stat]) continue;
    const a = ATTRS[part.stat];
    if (a.mult) mods[a.key] = (mods[a.key] ?? 1) * (1 + part.v);
    else mods[a.key] = (mods[a.key] ?? 0) + part.v;
  }
  return mods;
}

// gear: { id, plus } or null. A weapon's refine bonus multiplies whatever ATK the item
// already gives and, at glowAt and above, crits deal REFINE.critDmg more on top of the
// baseline; anything worn refines into HP instead.
export function itemMods(gear) {
  if (!gear || !ITEMS[gear.id]) return {};
  if (gear.main) return rolledMods(gear);
  const plus = Math.max(0, Math.min(REFINE.max, gear.plus | 0));
  const mods = { ...ITEMS[gear.id].mods };
  if (ITEMS[gear.id].slot === 'weapon') {
    if (plus) mods.atk = (mods.atk ?? 1) * (1 + REFINE.atk * plus);
    if (plus >= REFINE.glowAt) mods.critDmg = (mods.critDmg ?? BASE_MODS.critDmg) * (1 + REFINE.critDmg);
  } else if (plus) mods.hp = (mods.hp ?? 1) * (1 + REFINE.hp * plus);
  return mods;
}

// wear: { cape: {id, plus} | null, hat: ..., accessory: ... } - the worn slots' mods, in a
// fixed slot order so the merge is the same whatever object the shell built.
export function wearMods(wear) {
  return SLOTS.filter((s) => s !== 'weapon').map((s) => itemMods(wear?.[s]));
}

// What a hero holds with nothing equipped: his own starting weapon, no bonuses.
export const DEFAULT_WEAPON = { knight: 'Knight Sword', hunter: 'Hunter Bow' };

export function itemName(gear, hero) {
  if (!gear || !ITEMS[gear.id]) return DEFAULT_WEAPON[hero] || 'Bare hands';
  if (gear.main) return `${ITEMS[gear.id].name} · ${attrText(gear.main)}`;
  return gear.plus ? `${ITEMS[gear.id].name} +${gear.plus}` : ITEMS[gear.id].name;
}

// The refine aura: from glowAt the blade carries a soft light that steps through these
// colours - white at +5, blue from +7, gold from +9 - blending between stops so +6 sits
// between white and blue. The renderer draws it on the blade alone (render/aura.js).
export const AURA_STOPS = [
  { at: 5, color: [1.0, 1.0, 1.0] },
  { at: 7, color: [0.45, 0.78, 1.0] },
  { at: 9, color: [1.0, 0.78, 0.30] },
];
export function auraOf(gear) {
  const strength = glowOf(gear);
  if (!strength) return null;
  const plus = Math.min(REFINE.max, gear.plus | 0);
  let color = AURA_STOPS[AURA_STOPS.length - 1].color, name = 'gold';
  for (let i = 0; i < AURA_STOPS.length - 1; i++) {
    const a = AURA_STOPS[i], b = AURA_STOPS[i + 1];
    if (plus >= a.at && plus < b.at) {
      const k = (plus - a.at) / (b.at - a.at);
      color = a.color.map((c, j) => c + (b.color[j] - c) * k);
      name = k === 0 ? ['white', 'blue', 'gold'][i] : `${['white', 'blue', 'gold'][i]}-${['white', 'blue', 'gold'][i + 1]}`;
    }
  }
  return { color, strength, name };
}

// How strongly a refined weapon glows, 0..1: nothing below glowAt, then brighter per plus.
export function glowOf(gear) {
  if (!gear || (gear.plus | 0) < REFINE.glowAt || ITEMS[gear.id]?.slot !== 'weapon') return 0;
  return Math.min(1, (gear.plus - REFINE.glowAt + 1) / (REFINE.max - REFINE.glowAt + 1));
}
