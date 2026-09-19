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
};

export const SKILL_KEYS = ['skill1', 'skill2', 'skill3'];

// New Game+: how much harder a town's monsters get per time its boss has been beaten. Applied
// by resolveMonster() at spawn, so a run's difficulty is fixed when it starts.
export const NGPLUS = { hp: 0.35, atk: 0.25, speed: 0.06, maxTier: 5 };
