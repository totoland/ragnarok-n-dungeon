// Monster stats and attack patterns. `ai` picks the behaviour in sim/enemies.js.
// Names are Ragnarok Online monsters kept as placeholders (see README); the models,
// stats and behaviour are original.

export const MONSTERS = {
  poring: {
    name: 'Poring', ai: 'hopper',
    hp: 40, atk: 7, speed: 2.7, mass: 0.6,
    hurtbox: { r: 0.42, h: 0.78 },
    attack: { range: 1.1, windup: 0.3, dur: 0.28, cd: 1.5, box: { x0: -0.2, x1: 1.2, y0: -0.3, y1: 1.4 }, knock: [3, 1] },
    hop: { period: 0.62, height: 0.55 },
    score: 10,
  },
  lunatic: {
    name: 'Lunatic', ai: 'hopper',
    hp: 32, atk: 6, speed: 4.0, mass: 0.5,
    hurtbox: { r: 0.36, h: 0.7 },
    attack: { range: 1.2, windup: 0.22, dur: 0.24, cd: 1.1, box: { x0: -0.2, x1: 1.3, y0: -0.3, y1: 1.4 }, knock: [3, 1] },
    hop: { period: 0.42, height: 0.45 },
    score: 15,
  },
  skeleton: {
    name: 'Skel Soldier', ai: 'walker',
    hp: 120, atk: 14, speed: 2.2, mass: 1.0,
    hurtbox: { r: 0.55, h: 1.8 },
    attack: { range: 1.6, windup: 0.5, dur: 0.32, cd: 1.9, box: { x0: 0.0, x1: 1.8, y0: -0.2, y1: 2.2 }, knock: [4, 1.5] },
    score: 40,
  },
  skelArcher: {
    name: 'Skel Archer', ai: 'archer',
    hp: 85, atk: 10, speed: 1.8, mass: 0.9,
    hurtbox: { r: 0.5, h: 1.8 },
    attack: { range: 7.5, keep: 4.5, windup: 0.7, dur: 0.3, cd: 2.4, shot: { speed: 11, life: 1.4, y: 1.2 }, knock: [2, 0] },
    score: 45,
  },
  // Kept as-is. No longer spawned by the default dungeon, but the stats, the AI and the
  // primitive-built view in render/monsters.js are all still here and still work.
  orcLord: {
    name: 'Orc Lord', ai: 'boss', boss: true,
    hp: 820, atk: 14, speed: 2.4, mass: 4.0,
    hurtbox: { r: 0.95, h: 2.9 },
    attack: { range: 2.2, windup: 0.6, dur: 0.4, cd: 2.2, box: { x0: 0.0, x1: 2.6, y0: -0.3, y1: 3 }, knock: [6, 2] },
    slam: { windup: 1.0, dur: 0.5, cd: 8, box: { x0: -3.0, x1: 3.0, y0: -0.5, y1: 3, both: true }, knock: [5, 8], depth: 1.4 },
    charge: { windup: 0.7, dur: 0.55, speed: 13, cd: 10, box: { x0: -0.4, x1: 1.8, y0: -0.3, y1: 3 }, knock: [9, 3] },
    adds: { at: 0.5, type: 'skeleton', count: 2 },
    score: 500,
  },
  // Baphomet reuses the Orc Lord's 'boss' AI wholesale - the same three-move kit reads very
  // differently on a model this tall with a scythe, so the numbers move, not the behaviour.
  // Bigger reach and a taller hurtbox to match the sculpt; slightly slower, hits harder.
  baphomet: {
    name: 'Baphomet', ai: 'boss', boss: true,
    hp: 880, atk: 14, speed: 2.3, mass: 4.5,
    hurtbox: { r: 1.0, h: 3.2 },
    attack: { range: 2.4, windup: 0.62, dur: 0.4, cd: 2.3, box: { x0: 0.0, x1: 2.8, y0: -0.3, y1: 3.4 }, knock: [6, 2] },
    slam: { windup: 1.05, dur: 0.5, cd: 8.5, box: { x0: -3.1, x1: 3.1, y0: -0.5, y1: 3.4, both: true }, knock: [5, 8], depth: 1.45 },
    charge: { windup: 0.72, dur: 0.55, speed: 13, cd: 10, box: { x0: -0.4, x1: 1.9, y0: -0.3, y1: 3.4 }, knock: [9, 3] },
    // Hellfire: three orbs on three different depth lanes. Melee moves are dodged by
    // backing off along x, so the spell is aimed at the other axis - you have to change
    // lane, which is the one habit the earlier rooms teach.
    cast: {
      windup: 0.85, dur: 0.5, cd: 7.5,
      shot: { count: 3, speed: 7.2, life: 2.4, y: 1.45, lane: 1.5, dmg: 0.8 },
      knock: [4, 1],
    },
    adds: { at: 0.5, type: 'baphometling', count: 3 },
    score: 650,
  },
  // The boss splits off three of these at half health. Same sculpt at monster scale, so it
  // reads instantly as "his brood" without needing a second model.
  baphometling: {
    name: 'Baphometling', ai: 'walker',
    hp: 95, atk: 10, speed: 3.1, mass: 0.85,
    hurtbox: { r: 0.44, h: 1.75 },
    attack: { range: 1.5, windup: 0.38, dur: 0.28, cd: 1.35, box: { x0: -0.1, x1: 1.7, y0: -0.3, y1: 2.0 }, knock: [4, 1.2] },
    score: 60,
  },
};
