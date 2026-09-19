// Hero stats, basic combos and skills. Every attack is data: a locked duration, hit windows
// with boxes relative to the player (x forward along facing, z depth tolerance, y height),
// optional projectile spawns, optional forward movement, and the combo link.
//
//   box: { x0, x1, y0, y1 }      forward-relative metres; `both` ignores facing (radial)
//   knock: [forward, up]         velocity applied to whatever it hits
//   nearest: true                the hit only connects with the closest enemy (homing)

export const HEROES = {
  knight: {
    name: 'Knight',
    hp: 150, mp: 60, atk: 12, speed: 5.0,
    hurtbox: { r: 0.55, h: 1.9 },
    basic: 'slash1',
    skills: ['quicken', 'magnumBreak', 'bowlingBash'],
    // Passive: rolled on every hit that lands (see rollPassive in game.js). Restores a share
    // of MAX HP/SP, not of what is left - a drain that shrank as you bled would help least
    // exactly when it mattered most.
    passive: { id: 'soulDrain', chance: 0.03, hp: 0.10, sp: 0.10 },
    attacks: {
      slash1: {
        dur: 0.40, cancelAt: 0.24, next: 'slash2', anim: 'slash1',
        move: { from: 0.04, until: 0.16, speed: 2.0 },
        hits: [{ at: 0.13, until: 0.23, box: { x0: 0.1, x1: 1.9, y0: -0.2, y1: 2.2 }, dmg: 1.0, knock: [2.5, 0], stun: 0.34 }],
      },
      slash2: {
        dur: 0.42, cancelAt: 0.26, next: 'slash3', anim: 'slash2',
        move: { from: 0.04, until: 0.18, speed: 2.4 },
        hits: [{ at: 0.14, until: 0.24, box: { x0: 0.0, x1: 2.0, y0: -0.2, y1: 2.2 }, dmg: 1.1, knock: [3, 0], stun: 0.36 }],
      },
      slash3: {
        dur: 0.62, cancelAt: 0.5, next: null, anim: 'slash3',
        move: { from: 0.06, until: 0.24, speed: 4.5 },
        hits: [{ at: 0.16, until: 0.3, box: { x0: 0.0, x1: 2.4, y0: -0.2, y1: 2.2 }, dmg: 1.8, knock: [7, 2.5], stun: 0.5 }],
      },
      airSlash: {
        dur: 0.36, cancelAt: 0.3, next: null, anim: 'airSlash', air: true,
        hits: [{ at: 0.08, until: 0.2, box: { x0: -0.2, x1: 1.8, y0: -1.4, y1: 1.6 }, dmg: 1.3, knock: [3, -4], stun: 0.4 }],
      },
      // Self-buff. `buff` is applied the moment the cast starts and lives on the player as a
      // timed modifier; the cast itself is a short flourish with no hit box. The numbers are
      // what the skill does at its base level - once skill points exist, a level multiplier
      // belongs at the point the buff is applied, not here.
      quicken: {
        dur: 0.55, cancelAt: 0.45, next: null, anim: 'quicken', mp: 20, cd: 18,
        buff: { id: 'quicken', dur: 15, atkSpeed: 1.30 },
      },
      bash: { // unlisted since Quicken took the slot; kept for the skill-point tree
        dur: 0.6, cancelAt: 0.48, next: null, anim: 'bash', mp: 10, cd: 1.6,
        move: { from: 0.05, until: 0.2, speed: 3 },
        hits: [{ at: 0.2, until: 0.32, box: { x0: 0.0, x1: 2.2, y0: -0.2, y1: 2.4 }, dmg: 2.8, knock: [9, 1.5], stun: 0.6 }],
      },
      magnumBreak: {
        dur: 0.8, cancelAt: 0.7, next: null, anim: 'magnumBreak', mp: 25, cd: 5,
        hits: [{ at: 0.3, until: 0.42, box: { x0: -2.4, x1: 2.4, y0: -0.5, y1: 2.6, both: true }, dmg: 2.4, knock: [4, 7.5], stun: 0.8 }],
      },
      bowlingBash: {
        dur: 0.8, cancelAt: 0.7, next: null, anim: 'bowlingBash', mp: 30, cd: 7,
        move: { from: 0.1, until: 0.5, speed: 9.5 },
        hits: [{ at: 0.1, until: 0.5, box: { x0: -0.2, x1: 1.8, y0: -0.4, y1: 2.4 }, dmg: 3.4, knock: [11, 4], stun: 0.9 }],
      },
    },
  },

  hunter: {
    name: 'Hunter',
    hp: 105, mp: 80, atk: 9, speed: 5.8,
    hurtbox: { r: 0.5, h: 1.75 },
    basic: 'shoot1',
    skills: ['windWalk', 'arrowShower', 'blitzBeat'],
    // Passive: a landed hit has a chance to send the falcon after that enemy. The strike is
    // one Blitz-style hit after a short delay so the bird is seen to arrive before the
    // number does. Falcon hits never proc the falcon.
    passive: { id: 'autoBlitz', chance: 0.03, delay: 0.3, hit: { dmg: 1.5, knock: [1, 0], stun: 0.3 } },
    attacks: {
      shoot1: {
        dur: 0.34, cancelAt: 0.2, next: 'shoot2', anim: 'shoot',
        spawns: [{ at: 0.1, kind: 'arrow', speed: 17, dmg: 1.0, life: 0.9, y: 1.15, knock: [2, 0], stun: 0.25 }],
      },
      shoot2: {
        dur: 0.34, cancelAt: 0.2, next: 'shoot3', anim: 'shoot',
        spawns: [{ at: 0.1, kind: 'arrow', speed: 17, dmg: 1.0, life: 0.9, y: 1.15, knock: [2, 0], stun: 0.25 }],
      },
      shoot3: {
        dur: 0.5, cancelAt: 0.42, next: null, anim: 'shootHeavy',
        move: { from: 0.0, until: 0.15, speed: -3.5 },
        spawns: [{ at: 0.16, kind: 'arrow', speed: 20, dmg: 1.7, life: 1.0, y: 1.1, knock: [6, 2], stun: 0.45, pierce: true }],
      },
      airShot: {
        dur: 0.36, cancelAt: 0.3, next: null, anim: 'airShot', air: true,
        spawns: [{ at: 0.1, kind: 'arrow', speed: 16, dmg: 1.1, life: 0.9, y: 1.0, vy: -5, knock: [2, 0], stun: 0.3 }],
      },
      windWalk: {
        dur: 0.5, cancelAt: 0.4, next: null, anim: 'windWalk', mp: 20, cd: 18,
        buff: { id: 'windWalk', dur: 15, atkSpeed: 1.15, dodge: 0.20 },
      },
      doubleStrafe: { // unlisted since Wind Walk took the slot; kept for the skill-point tree
        dur: 0.5, cancelAt: 0.4, next: null, anim: 'doubleStrafe', mp: 10, cd: 1.2,
        spawns: [
          { at: 0.1, kind: 'arrow', speed: 21, dmg: 1.6, life: 1.0, y: 1.2, knock: [3, 0], stun: 0.35 },
          { at: 0.2, kind: 'arrow', speed: 21, dmg: 1.6, life: 1.0, y: 1.0, knock: [3, 0], stun: 0.35 },
        ],
      },
      arrowShower: {
        dur: 0.85, cancelAt: 0.75, next: null, anim: 'arrowShower', mp: 25, cd: 5,
        hits: [{ at: 0.42, until: 0.5, box: { x0: 1.0, x1: 5.0, y0: -0.5, y1: 3 }, dmg: 2.6, knock: [2, 6.5], stun: 0.8, depth: 2.0 }],
      },
      blitzBeat: {
        dur: 0.95, cancelAt: 0.85, next: null, anim: 'blitzBeat', mp: 30, cd: 7,
        hits: [
          { at: 0.35, until: 0.4, box: { x0: -7, x1: 7, y0: -1, y1: 4, both: true, nearest: true }, dmg: 1.3, knock: [1, 0], stun: 0.3, depth: 9 },
          { at: 0.5, until: 0.55, box: { x0: -7, x1: 7, y0: -1, y1: 4, both: true, nearest: true }, dmg: 1.3, knock: [1, 0], stun: 0.3, depth: 9 },
          { at: 0.65, until: 0.7, box: { x0: -7, x1: 7, y0: -1, y1: 4, both: true, nearest: true }, dmg: 1.6, knock: [5, 5], stun: 0.6, depth: 9 },
        ],
      },
    },
  },
};

export const PASSIVE_INFO = {
  soulDrain: { name: 'Soul Drain', tip: '3% on hit: restore 10% HP and SP' },
  autoBlitz: { name: 'Auto Blitz', tip: '3% on hit: the falcon strikes that enemy' },
};

export const SKILL_INFO = {
  quicken: { name: 'Quicken Sword', key: 'U', tip: 'Aura of speed: attack 30% faster for 15s' },
  bash: { name: 'Bash', key: 'U', tip: 'Heavy single strike, huge knockback' },
  magnumBreak: { name: 'Magnum Break', key: 'I', tip: 'Fire burst all around, launches enemies' },
  bowlingBash: { name: 'Bowling Bash', key: 'O', tip: 'Charge forward, bowling everything over' },
  windWalk: { name: 'Wind Walk', key: 'U', tip: 'Attack 15% faster and dodge 20% of hits for 15s' },
  doubleStrafe: { name: 'Double Strafe', key: 'U', tip: 'Two quick heavy arrows' },
  arrowShower: { name: 'Arrow Shower', key: 'I', tip: 'Rain of arrows ahead, launches' },
  blitzBeat: { name: 'Blitz Beat', key: 'O', tip: 'Falcon dives the nearest enemy three times' },
};
