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
  // ---- Orvane. Three rates that fire off a landed hit (sim/game.js rollPassive), and a
  // flat ATK roll five times the one above, because a fourth-town accessory sits on a hero
  // whose own ATK is around forty. They sum across everything worn: the boss weapon grants a
  // chance and each charm adds to the same number, which is what makes the set a set.
  meteor: { name: 'Auto Meteor', key: 'meteorAdd', min: 0.01, max: 0.03, step: 0.01 },
  twin: { name: 'Double Attack', key: 'doubleAdd', min: 0.01, max: 0.03, step: 0.01 },
  drain: { name: 'SP Drain', key: 'spDrainAdd', min: 0.01, max: 0.03, step: 0.01 },
  pull: { name: 'Undertow', key: 'pullAdd', min: 0.01, max: 0.03, step: 0.01 },
  atkHi: { name: 'ATK', key: 'atkAdd', min: 5, max: 15, step: 1, flat: true },
  // Bairune's own rate, and the second spell in the game: a shaft of ice on the spot the
  // blow landed. It shares the meteor's machinery and sums the same way.
  bolt: { name: 'Auto Cold Bolt', key: 'boltAdd', min: 0.01, max: 0.03, step: 0.01 },
};
export const ATTR_IDS = Object.keys(ATTRS);

export const ITEMS = {
  // Every weapon carries flat ATK, on one curve across the towns: 6, 16, 30, 55. A weapon
  // used to be a multiplier of the hero's own table, which is twelve points for the knight -
  // so the best sword in Morroc was worth +2 ATK and three towns of drops changed nothing a
  // player could feel. On the flat scale the weapon leads: it is a third of the hero's ATK in
  // Prontera and nearly two thirds by Orvane, and towns 5-6 have room above that (~95, ~150).
  // What still distinguishes them is the rest of the set - speed and crit, or raw points.
  katana: { name: 'Katana', slot: 'weapon', hero: 'knight', kind: 'sword', mods: { atkAdd: 6, atkSpeed: 1.10, crit: 0.30 }, tip: '+6 ATK, attack 10% faster, 30% crit rate' },
  gakkung: { name: 'Gakkung Bow', slot: 'weapon', hero: 'hunter', kind: 'bow', mods: { atkAdd: 6, atkSpeed: 1.10, crit: 0.30 }, tip: '+6 ATK, shoot 10% faster, 30% crit rate' },
  tsurugi: { name: 'Tsurugi', slot: 'weapon', hero: 'knight', kind: 'sword', mods: { atkAdd: 16, crit: 0.15 }, tip: '+16 ATK, 15% crit rate' },
  arbalest: { name: 'Arbalest', slot: 'weapon', hero: 'hunter', kind: 'bow', mods: { atkAdd: 16, crit: 0.15 }, tip: '+16 ATK, 15% crit rate' },
  // Accessories: no model, no refine, every drop rolled - a main attribute fixed by the
  // kind, at a value from its range, plus one random secondary from the rest of the pool.
  // Which monsters drop them, and how often, is on the monsters (data/monsters.js `drops`).
  ring: { name: 'Ring', slot: 'accessory', main: 'atk', rarity: 'common', tip: 'Main: ATK' },
  clip: { name: 'Clip', slot: 'accessory', main: 'sp', rarity: 'common', tip: 'Main: SP' },
  bell: { name: 'Bell', slot: 'accessory', main: 'aspd', rarity: 'uncommon', tip: 'Main: ASPD' },
  brooch: { name: 'Brooch', slot: 'accessory', main: 'crit', rarity: 'uncommon', tip: 'Main: crit rate' },
  amulet: { name: 'Amulet', slot: 'accessory', main: 'hp', rarity: 'rare', tip: 'Main: HP' },
  // ---- Phaelan. The first worn items in the game, so the first to need models: a cape node
  // on the hero rig and a hat node, the same pipeline the katana went through.
  // Moonstep - an afterimage and a moment of speed on a successful dodge - is the cape's own
  // behaviour and still has to be written into the sim; the numbers below are what it gives
  // just by being worn.
  // Phaelan's weapons. Moonraya used to drop the cape and nothing else, which left the third
  // town as the only one in the game paying no attack power at all; the cape now comes off
  // Sorya instead (data/monsters.js) and the boss pays a weapon like every other boss.
  crescentfang: { name: 'Crescentfang', slot: 'weapon', hero: 'knight', kind: 'sword', mods: { atkAdd: 30, critDmgAdd: 0.30 }, tip: '+30 ATK, crits hit 30% harder' },
  moonstring: { name: 'Moonstring', slot: 'weapon', hero: 'hunter', kind: 'bow', mods: { atkAdd: 30, critDmgAdd: 0.30 }, tip: '+30 ATK, crits hit 30% harder' },
  moonveil: { name: 'Moonveil', slot: 'cape', mods: { speed: 1.06, dodgeAdd: 0.05 }, tip: '+6% move speed, +5% dodge' },
  robinHat: { name: 'Robin Hood Hat', slot: 'hat', mods: { atkAdd: 10 }, tip: '+10 ATK' },
  // ---- Orvane, the mage city. Its drops are magic where every other town's are steel, and
  // they share their numbers: the weapon grants a chance and the charms add to the same one.
  // ATK here is flat and large on purpose - the fourth town is meant to be a step up, and the
  // monsters carry the HP and ATK to match (data/monsters.js).
  meteorEdge: {
    name: 'Meteor Edge', slot: 'weapon', hero: 'knight', kind: 'sword',
    mods: { atkAdd: 55, meteorAdd: 0.10 },
    tip: '+55 ATK, 10% chance on hit: a meteor falls for 10% of ATK as magic',
  },
  twinshot: {
    name: 'Twinshot', slot: 'weapon', hero: 'hunter', kind: 'bow',
    mods: { atkAdd: 50, doubleAdd: 0.15 },
    tip: '+50 ATK, 15% chance on hit: the shot lands twice',
  },
  // ---- Bairune. The town that finally fills the hat slot: one from each of its five, at
  // the scale of a fifth town. Weapons continue the flat curve at 95 (6, 16, 30, 55, 95) and
  // carry the town's own proc - Undertow, which drags what it hits back towards the hero,
  // the sea pulling everything down to the temple.
  clawHat: { name: 'Crab Claw Hat', slot: 'hat', mods: { atkAdd: 20 }, tip: '+20 ATK' },
  coralCrown: { name: 'Coral Crown', slot: 'hat', mods: { atkAdd: 8, critAdd: 0.05 }, tip: '+8 ATK, +5% crit rate' },
  jellyCap: { name: 'Jelly Cap', slot: 'hat', mods: { mp: 1.08, dodgeAdd: 0.04 }, tip: '+8% SP, +4% dodge' },
  tidefin: { name: 'Tidefin Helm', slot: 'hat', mods: { atkAdd: 16, critDmgAdd: 0.12 }, tip: '+16 ATK, crits hit 12% harder' },
  pearlDiadem: { name: 'Pearl Diadem', slot: 'hat', mods: { atkAdd: 10, hp: 1.06 }, tip: '+10 ATK, +6% HP' },
  everwave: {
    name: 'Everwave Mantle', slot: 'cape',
    mods: { speed: 1.08, dodgeAdd: 0.06, hp: 1.05 },
    tip: '+8% move speed, +6% dodge, +5% HP',
  },
  // Not a boss reward: a drowned blade found in the sunken quarter, which is the first
  // weapon in the game that is looted rather than won. It sits below Orvane's 55 on the ATK
  // curve on purpose - what it sells is speed and the bolt, not points.
  underWaterSword: {
    name: 'Under Water Sword', slot: 'weapon', hero: 'knight', kind: 'sword',
    mods: { atkAdd: 40, atkSpeed: 1.10, boltAdd: 0.10 },
    tip: '+40 ATK, attack 10% faster, 10% chance on hit: a shaft of ice falls for 10% of ATK as magic',
  },
  tidecleaver: {
    name: 'Tidecleaver', slot: 'weapon', hero: 'knight', kind: 'sword',
    mods: { atkAdd: 95, pullAdd: 0.18 },
    tip: '+95 ATK, 18% chance on hit: Undertow drags them back to you',
  },
  coralbow: {
    name: 'Coralbow', slot: 'weapon', hero: 'hunter', kind: 'bow',
    mods: { atkAdd: 95, pullAdd: 0.18 },
    tip: '+95 ATK, 18% chance on hit: Undertow drags them back to you',
  },
  runeSigil: { name: 'Rune Sigil', slot: 'accessory', main: 'meteor', secondary: ['atkHi', 'drain'], rarity: 'rare', tip: 'Main: Auto Meteor' },
  echoBand: { name: 'Echo Band', slot: 'accessory', main: 'twin', secondary: ['atkHi', 'drain'], rarity: 'rare', tip: 'Main: Double Attack' },
  manaClasp: { name: 'Mana Clasp', slot: 'accessory', main: 'drain', secondary: ['atkHi', 'meteor'], rarity: 'uncommon', tip: 'Main: SP Drain' },
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
  // `secondary` narrows what the second roll can be. Without one an item draws from the whole
  // pool, which is right for a Ring but not for a rune charm: Orvane's accessories are a set
  // with a shape, and a dodge roll on one of them would read as a stray.
  const pool = (def.secondary || ATTR_IDS).filter((k) => k !== def.main);
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
    // Refining scales the ATK the weapon itself carries. Every weapon's is flat now, so this
    // is the line that matters; the multiplier branch is kept for anything added later that
    // scales the hero's table instead.
    if (plus && mods.atk) mods.atk *= (1 + REFINE.atk * plus);
    if (plus && mods.atkAdd) mods.atkAdd *= (1 + REFINE.atk * plus);
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
