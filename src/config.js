// Every tunable in one place. Units: world metres (heroes are ~1.8 tall), seconds.
export const SIM = {
  dt: 1 / 60,          // fixed sim step
  gravity: 26,
  eventCap: 256,       // game.events is drained by fx; capped so headless runs cannot grow it
};

export const FLOOR = {
  zMin: -2.6,          // depth lanes the player can walk on (camera side is +z)
  zMax: 2.6,
  hitDepth: 0.75,      // |dz| tolerance for a hit to connect (belt-scroller depth fudge)
};

export const PLAYER = {
  speed: 5.2,
  depthSpeed: 3.4,
  jumpVel: 8.5,
  dash: { speed: 14, dur: 0.16, cd: 0.55 },
  hurt: { stun: 0.32, iframes: 0.9, knock: 3 },
  comboWindow: 1.8,    // seconds between hits before the combo counter resets
  inputBuffer: 0.18,   // an attack press is remembered this long so combos chain reliably
  mpRegen: 2.2,        // per second
  roomRest: 0.3,       // fraction of max HP restored on entering a new room (MP refills fully)
};

export const CAMERA = {
  fov: 36,
  height: 4.6,
  dist: 10.2,
  lookY: 1.5,
  lag: 6,              // follow lerp rate
  lead: 1.4,           // look ahead of the player in the facing direction
  minHalfView: 4.5,    // portrait screens zoom out until this many metres are visible each side
};

export const DROPS = {
  hp: { chance: 0.12, lowHpChance: 0.4, heal: 0.3 },   // red potion: fraction of max HP; chance jumps under 40 % HP
  mp: { chance: 0.08, restore: 0.5 },                  // blue potion: fraction of max MP
  lowHp: 0.4,
  pickupRadius: 0.8,
  life: 20,                                            // seconds a potion lies on the floor
  // A town boss drops its weapon (data/dungeon.js `loot`) for certain the first time a hero
  // beats it, and with this chance after. A duplicate refines the one you hold (+1).
  boss: { chance: 0.35 },
};

// Refining: every + on a weapon adds a share of ATK and from `glowAt` it glows and crits hit
// harder; every + on anything worn (cape, hat, accessory, armor) adds a share of HP.
export const REFINE = { max: 10, atk: 0.03, hp: 0.02, glowAt: 5, critDmg: 0.05 };

// Skill points: each level on a skill adds a share of damage (attack skills) or of duration
// (buff skills), and a skill taken all the way to `maxLevel` offers a branch - one of two
// upgrades that changes what the skill does rather than how big it is (data/heroes.js
// `branch`). Points come `perLevel` per hero level, spent in the character panel.
//
// Two per level, not one, because the branch has to be reachable. A full clear of all four
// towns lands at hero level 9: at one point per level that is 8 points, and a ten-point
// skill would never be finished by anyone. At two it is 16 - one skill taken to its branch
// and six points to spread, so the first run ends on a real choice of which branch to own,
// and New Game+ opens the rest.
// `buffDur` came down from 0.15 when the cap went from 5 to 10: at the old cap a buff ran
// +75% long, and leaving the share alone would have made it +150% - Quicken's 15 seconds
// becoming 37 on an 18-second cooldown, which is not a window any more, it is a passive.
// 0.08 lands a maxed buff at +80%, where the old cap had it.
export const SKILL = { maxLevel: 10, perLevel: 2, dmg: 0.10, buffDur: 0.08 };

export const SKILL_KEYS = ['skill1', 'skill2', 'skill3'];

// New Game+: how much harder a town's monsters get per time its boss has been beaten. Applied
// by resolveMonster() at spawn, so a run's difficulty is fixed when it starts.
export const NGPLUS = { hp: 0.35, atk: 0.25, speed: 0.06, xp: 0.25, maxTier: 5 };

// Levels. XP to go from level L to L+1 is base * L^exp; every level past the first adds a
// share of the hero's table HP / SP and one skill point. A first Prontera clear (~2,250 XP)
// lands around level 4; see sim/progress.js for the curve itself.
//
// ATK is the exception and is flat: `atk` points of it per level, not a share. That is the
// same absolute scale Orvane's weapons are already on (+100 on one sword) and the one RO
// itself uses - a number a player can add up, rather than a percentage of a table they
// cannot see. It moves the hero from 35 ATK at level 50 to 159.
export const LEVEL = { max: 50, base: 120, exp: 1.6, hp: 0.06, mp: 0.05, atk: 3 };
