// Weapons. Every town boss drops one per hero class (data/dungeon.js `loot`); a hero holds
// at most one of each, refined +N by every duplicate that drops. What an item does is a
// sparse modifier set the resolve step merges with the level's (see resolve.js mergeMods):
// multipliers multiply, rates replace the baseline. Names are Ragnarok Online weapons
// kept as placeholders like the monsters; the numbers are original.
import { REFINE } from '../../config.js';
import { BASE_MODS } from '../resolve.js';

export const ITEMS = {
  katana: { name: 'Katana', hero: 'knight', kind: 'sword', mods: { atkSpeed: 1.10, crit: 0.30 }, tip: 'Attack 10% faster, 30% crit rate' },
  gakkung: { name: 'Gakkung Bow', hero: 'hunter', kind: 'bow', mods: { atkSpeed: 1.10, crit: 0.30 }, tip: 'Shoot 10% faster, 30% crit rate' },
  tsurugi: { name: 'Tsurugi', hero: 'knight', kind: 'sword', mods: { atk: 1.15, crit: 0.15 }, tip: '+15% ATK, 15% crit rate' },
  arbalest: { name: 'Arbalest', hero: 'hunter', kind: 'bow', mods: { atk: 1.15, crit: 0.15 }, tip: '+15% ATK, 15% crit rate' },
};

export const ITEM_IDS = Object.keys(ITEMS);

// gear: { id, plus } or null. The refine bonus multiplies whatever ATK the item already
// gives; at glowAt and above crits deal REFINE.critDmg more, on top of the baseline.
export function itemMods(gear) {
  if (!gear || !ITEMS[gear.id]) return {};
  const plus = Math.max(0, Math.min(REFINE.max, gear.plus | 0));
  const mods = { ...ITEMS[gear.id].mods };
  if (plus) mods.atk = (mods.atk ?? 1) * (1 + REFINE.atk * plus);
  if (plus >= REFINE.glowAt) mods.critDmg = (mods.critDmg ?? BASE_MODS.critDmg) * (1 + REFINE.critDmg);
  return mods;
}

// What a hero holds with nothing equipped: his own starting weapon, no bonuses.
export const DEFAULT_WEAPON = { knight: 'Knight Sword', hunter: 'Hunter Bow' };

export function itemName(gear, hero) {
  if (!gear || !ITEMS[gear.id]) return DEFAULT_WEAPON[hero] || 'Bare hands';
  return gear.plus ? `${ITEMS[gear.id].name} +${gear.plus}` : ITEMS[gear.id].name;
}

// How strongly a refined weapon glows, 0..1: nothing below glowAt, then brighter per plus.
export function glowOf(gear) {
  if (!gear || (gear.plus | 0) < REFINE.glowAt) return 0;
  return Math.min(1, (gear.plus - REFINE.glowAt + 1) / (REFINE.max - REFINE.glowAt + 1));
}
