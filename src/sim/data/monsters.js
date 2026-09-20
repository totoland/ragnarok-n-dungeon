// Monster stats and attack patterns. `ai` picks the behaviour in sim/enemies.js.
// `drops`: the monster's own loot table, each entry rolled on every kill (data/items.js).
// Accessories: 0.5-3 % by rarity - a full Prontera run is worth about one.
// Names are Ragnarok Online monsters kept as placeholders (see README); the models,
// stats and behaviour are original.

export const MONSTERS = {
  poring: {
    name: 'Poring', ai: 'hopper',
    hp: 40, atk: 7, speed: 2.7, mass: 0.6,
    hurtbox: { r: 0.42, h: 0.78 },
    attack: { range: 1.1, windup: 0.3, dur: 0.28, cd: 1.5, box: { x0: -0.2, x1: 1.2, y0: -0.3, y1: 1.4 }, knock: [3, 1] },
    hop: { period: 0.62, height: 0.55 },
    drops: [{ item: 'ring', chance: 0.03 }],
    score: 10,
  },
  lunatic: {
    name: 'Lunatic', ai: 'hopper',
    hp: 32, atk: 6, speed: 4.0, mass: 0.5,
    hurtbox: { r: 0.36, h: 0.7 },
    attack: { range: 1.2, windup: 0.22, dur: 0.24, cd: 1.1, box: { x0: -0.2, x1: 1.3, y0: -0.3, y1: 1.4 }, knock: [3, 1] },
    hop: { period: 0.42, height: 0.45 },
    drops: [{ item: 'clip', chance: 0.025 }],
    score: 15,
  },
  skeleton: {
    name: 'Skel Soldier', ai: 'walker',
    hp: 120, atk: 14, speed: 2.2, mass: 1.0,
    hurtbox: { r: 0.55, h: 1.8 },
    attack: { range: 1.6, windup: 0.5, dur: 0.32, cd: 1.9, box: { x0: 0.0, x1: 1.8, y0: -0.2, y1: 2.2 }, knock: [4, 1.5] },
    drops: [{ item: 'bell', chance: 0.02 }],
    score: 40,
  },
  skelArcher: {
    name: 'Skel Archer', ai: 'archer',
    hp: 85, atk: 10, speed: 1.8, mass: 0.9,
    hurtbox: { r: 0.5, h: 1.8 },
    attack: { range: 7.5, keep: 4.5, windup: 0.7, dur: 0.3, cd: 2.4, shot: { speed: 11, life: 1.4, y: 1.2 }, knock: [2, 0] },
    drops: [{ item: 'brooch', chance: 0.01 }],
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
  // ---------------------------------------------------------------- Sograt Desert (town 2)
  // A step up from Prontera, which is meant to be easy. Blob-viewed monsters (ant, wolf) carry
  // a `hop` even when they walk: the blob renderer bobs on it and reads hop.height.
  pecoPeco: {
    name: 'PecoPeco', ai: 'walker',
    hp: 75, atk: 9, speed: 4.4, mass: 0.9,
    hurtbox: { r: 0.5, h: 1.5 },
    attack: { range: 1.4, windup: 0.3, dur: 0.26, cd: 1.3, box: { x0: -0.1, x1: 1.6, y0: -0.3, y1: 1.8 }, knock: [4, 1.5] },
    drops: [{ item: 'ring', chance: 0.03 }],
    score: 35,
  },
  ant: {
    name: 'Andre', ai: 'walker',
    hp: 62, atk: 8, speed: 3.6, mass: 0.7,
    hurtbox: { r: 0.46, h: 0.72 },
    attack: { range: 1.1, windup: 0.28, dur: 0.24, cd: 1.2, box: { x0: -0.2, x1: 1.2, y0: -0.3, y1: 1.3 }, knock: [3, 1] },
    hop: { period: 0.28, height: 0.08 },
    drops: [{ item: 'bell', chance: 0.02 }],
    score: 25,
  },
  babyWolf: {
    name: 'Baby Desert Wolf', ai: 'hopper',
    hp: 58, atk: 10, speed: 4.8, mass: 0.6,
    hurtbox: { r: 0.42, h: 0.8 },
    attack: { range: 1.5, windup: 0.24, dur: 0.3, cd: 1.0, box: { x0: -0.2, x1: 1.5, y0: -0.3, y1: 1.5 }, knock: [4, 1.5] },
    hop: { period: 0.36, height: 0.32 },
    drops: [{ item: 'clip', chance: 0.025 }],
    score: 30,
  },
  // Throws a fistful of sand: the archer kit with its own projectile kind.
  sandman: {
    name: 'Sandman', ai: 'archer',
    hp: 120, atk: 12, speed: 1.7, mass: 1.2,
    hurtbox: { r: 0.55, h: 1.7 },
    attack: { range: 7, keep: 4, windup: 0.75, dur: 0.3, cd: 2.6, shot: { kind: 'sandBall', speed: 9.5, life: 1.3, y: 1.1 }, knock: [3, 1] },
    drops: [{ item: 'brooch', chance: 0.01 }],
    score: 55,
  },
  golem: {
    name: 'Golem', ai: 'walker',
    hp: 280, atk: 17, speed: 1.5, mass: 2.6,
    hurtbox: { r: 0.8, h: 2.4 },
    attack: { range: 2.0, windup: 0.7, dur: 0.4, cd: 2.4, box: { x0: 0.0, x1: 2.3, y0: -0.4, y1: 2.6 }, knock: [6, 2.5] },
    drops: [{ item: 'amulet', chance: 0.005 }],
    score: 90,
  },
  // Town boss. The boss kit again (bite / ground slam / rolling charge / rock volley) with
  // the numbers turned up from Baphomet's, and Andres for a brood.
  phreeoni: {
    name: 'Phreeoni', ai: 'boss', boss: true,
    hp: 1150, atk: 16, speed: 2.1, mass: 5.0,
    hurtbox: { r: 1.1, h: 2.6 },
    attack: { range: 2.3, windup: 0.55, dur: 0.38, cd: 2.0, box: { x0: 0.0, x1: 2.7, y0: -0.4, y1: 2.8 }, knock: [6, 2] },
    slam: { windup: 1.0, dur: 0.5, cd: 8, box: { x0: -3.2, x1: 3.2, y0: -0.5, y1: 3, both: true }, knock: [5, 8], depth: 1.5 },
    charge: { windup: 0.65, dur: 0.6, speed: 12.5, cd: 9.5, box: { x0: -0.5, x1: 2.0, y0: -0.4, y1: 2.8 }, knock: [9, 3] },
    cast: { windup: 0.8, dur: 0.5, cd: 7, shot: { kind: 'rock', count: 3, speed: 8, life: 2.2, y: 1.3, lane: 1.5, dmg: 0.85 }, knock: [4, 1] },
    adds: { at: 0.5, type: 'ant', count: 3 },
    score: 800,
  },
  // The boss splits off three of these at half health. Same sculpt at monster scale, so it
  // reads instantly as "his brood" without needing a second model.
  // ---- Phaelan: a pine forest and the spirit graveyard under its roots. Toto's brief, and
  // the first names in this game that are his own rather than Ragnarok's standing in - the
  // rest of the table still has to go through the rename pass before any store build.
  famiru: {
    name: 'Famiru', ai: 'hopper',
    hp: 54, atk: 13, speed: 5.4, mass: 0.45,
    hurtbox: { r: 0.34, h: 0.62 },
    // A swarm that takes turns diving: fast, frail, and meant to be swept up in one combo.
    attack: { range: 1.4, windup: 0.2, dur: 0.22, cd: 0.9, box: { x0: -0.2, x1: 1.4, y0: 0.1, y1: 1.7 }, knock: [3, 1.5] },
    hop: { period: 0.3, height: 0.7 },
    drops: [{ item: 'clip', chance: 0.025 }],
    score: 30,
  },
  munari: {
    name: 'Munari', ai: 'walker',
    hp: 135, atk: 16, speed: 2.4, mass: 0.9,
    hurtbox: { r: 0.45, h: 1.6 },
    attack: { range: 1.5, windup: 0.45, dur: 0.3, cd: 1.8, box: { x0: 0.0, x1: 1.7, y0: -0.2, y1: 2.0 }, knock: [4, 1.5] },
    drops: [{ item: 'bell', chance: 0.02 }],
    score: 50,
  },
  bonku: {
    name: 'Bonku', ai: 'hopper',
    hp: 170, atk: 19, speed: 3.2, mass: 1.3,
    hurtbox: { r: 0.52, h: 1.7 },
    // Leaps the gap rather than walking it, so the wind-up is the tell and the landing is
    // the opening.
    attack: { range: 1.8, windup: 0.5, dur: 0.3, cd: 2.0, box: { x0: 0.0, x1: 2.0, y0: -0.3, y1: 2.1 }, knock: [6, 2.5] },
    hop: { period: 0.72, height: 1.1 },
    drops: [{ item: 'ring', chance: 0.03 }],
    score: 65,
  },
  skelbow: {
    name: 'Skelbow', ai: 'archer',
    hp: 115, atk: 15, speed: 1.9, mass: 0.9,
    hurtbox: { r: 0.5, h: 1.8 },
    // Keeps its distance and draws with a long tell; weak the moment the gap is closed.
    attack: { range: 8.0, keep: 5.0, windup: 0.75, dur: 0.3, cd: 2.3, shot: { speed: 12, life: 1.5, y: 1.25 }, knock: [2, 0] },
    drops: [{ item: 'robinHat', chance: 0.04 }, { item: 'brooch', chance: 0.01 }],
    score: 55,
  },
  wispra: {
    name: 'Wispra', ai: 'walker',
    hp: 98, atk: 17, speed: 4.6, mass: 0.5,
    hurtbox: { r: 0.4, h: 1.5 },
    // Drifts in and lunges. The fade-and-reappear in the brief needs its own behaviour in
    // sim/enemies.js; this is the closing half of it, and reads as the same threat.
    attack: { range: 1.6, windup: 0.3, dur: 0.26, cd: 1.3, box: { x0: -0.1, x1: 1.7, y0: 0.0, y1: 2.0 }, knock: [4, 1] },
    drops: [{ item: 'brooch', chance: 0.015 }],
    score: 60,
  },
  sorya: {
    name: 'Sorya', ai: 'walker',
    hp: 215, atk: 21, speed: 2.2, mass: 1.4,
    hurtbox: { r: 0.5, h: 1.75 },
    attack: { range: 1.7, windup: 0.6, dur: 0.34, cd: 2.2, box: { x0: 0.0, x1: 1.9, y0: -0.2, y1: 2.2 }, knock: [5, 2] },
    drops: [{ item: 'amulet', chance: 0.008 }],
    score: 85,
  },
  foxShade: {
    name: 'Fox Shade', ai: 'walker',
    hp: 95, atk: 18, speed: 5.2, mass: 0.6,
    hurtbox: { r: 0.42, h: 1.2 },
    // Moonraya's second phase: her own shape, thrown at the player and gone again.
    attack: { range: 1.5, windup: 0.22, dur: 0.24, cd: 1.1, box: { x0: -0.1, x1: 1.6, y0: -0.2, y1: 1.6 }, knock: [4, 1.5] },
    score: 45,
  },
  moonraya: {
    name: 'Moonraya', ai: 'boss', boss: true,
    hp: 1500, atk: 20, speed: 2.4, mass: 5.2,
    hurtbox: { r: 1.0, h: 2.4 },
    // Her four moves, in the shapes the boss AI already knows how to pick between.
    attack: { range: 2.2, windup: 0.5, dur: 0.34, cd: 1.9, box: { x0: 0.0, x1: 2.5, y0: -0.3, y1: 2.6 }, knock: [6, 2] },
    // Moon Dash: through the player rather than at them.
    charge: { windup: 0.6, dur: 0.55, speed: 13.5, cd: 9.0, box: { x0: -0.6, x1: 2.1, y0: -0.4, y1: 2.6 }, knock: [9, 3] },
    // Spirit Bell: a ring, so it answers on both sides at once.
    slam: { windup: 0.95, dur: 0.45, cd: 8.0, box: { x0: -3.4, x1: 3.4, y0: -0.5, y1: 3.0, both: true }, knock: [5, 7], depth: 1.6 },
    // Foxfire: three spirit flames down the lanes.
    cast: { windup: 0.75, dur: 0.5, cd: 6.5, shot: { kind: 'foxfire', count: 3, speed: 7.5, life: 2.4, y: 1.4, lane: 1.5, dmg: 0.9 }, knock: [4, 1] },
    // Blood moon: at 40 % she stops coming alone.
    adds: { at: 0.4, type: 'foxShade', count: 2 },
    score: 1000,
  },
  baphometling: {
    name: 'Baphometling', ai: 'walker',
    hp: 95, atk: 10, speed: 3.1, mass: 0.85,
    hurtbox: { r: 0.44, h: 1.75 },
    attack: { range: 1.5, windup: 0.38, dur: 0.28, cd: 1.35, box: { x0: -0.1, x1: 1.7, y0: -0.3, y1: 2.0 }, knock: [4, 1.2] },
    drops: [{ item: 'amulet', chance: 0.005 }],
    score: 60,
  },
};
