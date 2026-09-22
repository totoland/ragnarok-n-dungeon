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
  sandWraith: {
    name: 'Sand Wraith', ai: 'archer',
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
  // Morroc's boss. A pillar of packed sand that walks, with a mace of sandstone on one arm
  // and a lance on the other. Phreeoni below is what he replaced, and stays defined the way
  // the Orc Lord does - written, tested, and not in a town.
  sandman: {
    name: 'Sandman', ai: 'boss', boss: true,
    // He is enormous and he was standing still: slow to close, slow to wind up, and two
    // seconds between swings on top of it. Quicker on his feet and quicker to swing, with
    // the mace's reach counted from a body twice anyone else's width.
    hp: 1400, atk: 19, speed: 2.3, mass: 6.0,
    hurtbox: { r: 1.2, h: 3.0 },
    attack: { range: 3.1, windup: 0.5, dur: 0.34, cd: 1.5, box: { x0: 0.0, x1: 3.4, y0: -0.4, y1: 3.0 }, knock: [7, 2] },
    // He does not run so much as pour: the whole column moves and reforms on the far side.
    charge: { windup: 0.7, dur: 0.6, speed: 11.5, cd: 9.5, box: { x0: -0.6, x1: 2.2, y0: -0.5, y1: 3.0 }, knock: [9, 3] },
    // The mace comes down and the floor answers on both sides.
    slam: { windup: 1.0, dur: 0.5, cd: 8.0, box: { x0: -3.6, x1: 3.6, y0: -0.5, y1: 3.2, both: true }, knock: [6, 8], depth: 1.7 },
    // A fistful of the desert, three lanes wide.
    cast: { windup: 0.8, dur: 0.5, cd: 7.0, shot: { kind: 'sandBall', count: 3, speed: 8.5, life: 2.2, y: 1.6, lane: 1.5, dmg: 0.85 }, knock: [4, 1] },
    adds: { at: 0.45, type: 'sandWraith', count: 2 },
    score: 900,
  },
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
    // The Moonveil, now that Moonraya pays a weapon like every other boss. Sorya is the
    // strongest thing walking in Phaelan, which is the right place for the town's cape.
    drops: [{ item: 'moonveil', chance: 0.05 }, { item: 'amulet', chance: 0.008 }],
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
  // ---- Orvane, the mage city whose tower came down. The fourth town, and the first that is
  // meant to feel like a step up rather than a variation: HP and ATK run half again above
  // Phaelan's, because its drops do too (data/items.js - a hundred flat ATK on one sword).
  // Past the rift in room four the roster changes completely, which is the moment the map is
  // built around.
  flittern: {
    name: 'Flittern', ai: 'hopper',
    hp: 72, atk: 20, speed: 6.0, mass: 0.4,
    hurtbox: { r: 0.3, h: 0.6 },
    // Frail and very fast, and never alone: the swarm is the monster, not the bat.
    attack: { range: 1.3, windup: 0.18, dur: 0.2, cd: 0.85, box: { x0: -0.2, x1: 1.3, y0: 0.2, y1: 1.8 }, knock: [3, 1.5] },
    hop: { period: 0.26, height: 0.8 },
    drops: [{ item: 'clip', chance: 0.025 }],
    score: 35,
  },
  stringen: {
    name: 'Stringen', ai: 'walker',
    hp: 235, atk: 28, speed: 2.2, mass: 1.2,
    hurtbox: { r: 0.5, h: 1.8 },
    // A puppet on strings from nothing: it walks in jerks, and the recoil after a swing is
    // the string pulling it back upright.
    attack: { range: 1.7, windup: 0.55, dur: 0.32, cd: 2.1, box: { x0: 0.0, x1: 1.9, y0: -0.2, y1: 2.2 }, knock: [5, 2] },
    drops: [{ item: 'bell', chance: 0.02 }],
    score: 70,
  },
  hushling: {
    name: 'Hushling', ai: 'walker',
    hp: 190, atk: 26, speed: 3.6, mass: 0.7,
    hurtbox: { r: 0.42, h: 1.6 },
    // An empty cloak. The fade that makes it untouchable for a beat is its own behaviour and
    // still has to go into sim/enemies.js; this is the half of it that closes and swings, and
    // it reads as the same threat without it.
    attack: { range: 1.6, windup: 0.32, dur: 0.26, cd: 1.4, box: { x0: -0.1, x1: 1.7, y0: 0.0, y1: 2.0 }, knock: [4, 1] },
    drops: [{ item: 'echoBand', chance: 0.035 }, { item: 'brooch', chance: 0.012 }],
    score: 75,
  },
  grinlit: {
    name: 'Grinlit', ai: 'archer',
    hp: 165, atk: 22, speed: 1.9, mass: 0.8,
    hurtbox: { r: 0.48, h: 1.5 },
    // A lantern head on a cloak, spitting green fire. Slow, and helpless once reached.
    attack: { range: 8.0, keep: 5.2, windup: 0.7, dur: 0.3, cd: 2.2, shot: { kind: 'foxfire', speed: 9.5, life: 1.7, y: 1.2 }, knock: [3, 0] },
    drops: [{ item: 'runeSigil', chance: 0.035 }, { item: 'brooch', chance: 0.012 }],
    score: 80,
  },
  velmara: {
    name: 'Velmara', ai: 'archer',
    hp: 215, atk: 27, speed: 2.3, mass: 1.0,
    hurtbox: { r: 0.45, h: 1.75 },
    // Past the rift. Keeps closer than an archer should and throws violet bolts that take
    // what they hit - the drain is hers, not the player's.
    attack: { range: 7.0, keep: 3.8, windup: 0.6, dur: 0.3, cd: 2.0, shot: { kind: 'hellOrb', speed: 10, life: 1.6, y: 1.3 }, knock: [3, 0] },
    drops: [{ item: 'manaClasp', chance: 0.04 }, { item: 'amulet', chance: 0.01 }],
    score: 95,
  },
  nyxmare: {
    name: 'Nyxmare', ai: 'walker',
    hp: 360, atk: 35, speed: 2.9, mass: 2.4,
    hurtbox: { r: 0.72, h: 2.0 },
    // The heaviest thing in the town that is not the boss: it does not stop when hit and it
    // sends the player a long way when it connects.
    attack: { range: 2.0, windup: 0.6, dur: 0.34, cd: 2.3, box: { x0: 0.0, x1: 2.3, y0: -0.3, y1: 2.4 }, knock: [8, 3] },
    drops: [{ item: 'amulet', chance: 0.012 }],
    score: 120,
  },
  shardling: {
    name: 'Shardling', ai: 'walker',
    hp: 120, atk: 22, speed: 4.4, mass: 0.6,
    hurtbox: { r: 0.4, h: 1.3 },
    // What the Dark Sword breaks off himself at half health: his own shape, small and quick.
    attack: { range: 1.5, windup: 0.24, dur: 0.24, cd: 1.15, box: { x0: -0.1, x1: 1.6, y0: -0.2, y1: 1.7 }, knock: [4, 1.5] },
    score: 55,
  },
  darkSword: {
    name: 'Dark Sword', ai: 'boss', boss: true,
    hp: 1800, atk: 24, speed: 2.6, mass: 5.5,
    hurtbox: { r: 0.9, h: 2.9 },
    // A duellist, not a colossus. He is the fastest boss in the game and the only one whose
    // basic attack is the thing to fear: everything else is a tell.
    attack: { range: 2.4, windup: 0.4, dur: 0.3, cd: 1.5, box: { x0: 0.0, x1: 2.7, y0: -0.3, y1: 2.8 }, knock: [6, 2] },
    // Blink Step: he is not fast, he is simply already there.
    charge: { windup: 0.5, dur: 0.5, speed: 16.0, cd: 8.0, box: { x0: -0.6, x1: 2.2, y0: -0.4, y1: 2.8 }, knock: [9, 3] },
    // Shatterfall: the blade into the floor, and the floor answers on both sides.
    slam: { windup: 0.9, dur: 0.45, cd: 7.5, box: { x0: -3.5, x1: 3.5, y0: -0.5, y1: 3.2, both: true }, knock: [6, 8], depth: 1.6 },
    // Mirror Bolt: three reflections of himself down the lanes.
    cast: { windup: 0.7, dur: 0.45, cd: 6.0, shot: { kind: 'hellOrb', count: 3, speed: 9.0, life: 2.4, y: 1.4, lane: 1.5, dmg: 0.9 }, knock: [4, 1] },
    // Shardself: at half health the shards around him stop being decoration.
    adds: { at: 0.5, type: 'shardling', count: 2 },
    // And he changes with them. Not a second model - a tint, which costs nothing to download
    // and no shader of its own, plus the shards flying wide, which is the part the silhouette
    // can actually show. The renderer eases into it off `addsDone` (render/monsters.js).
    rage: { tint: 0x8c0f26, emissive: 0x5e0a18, grow: 1.06, shards: 1.2 },
    score: 1200,
  },
  // ---- Bairune, the drowned temple. Toto's brief: an island whose city sank, where the
  // temple bell still rings at night and everything that hears it becomes a guard. Five
  // monsters, each carrying a hat - which is the town that finally fills the hat slot the
  // game has had since Phaelan and only ever put one thing in.
  //
  // HP and ATK continue the curve the earlier towns are actually on, not the one they should
  // be on. At the hero's real ATK here a boss at the correct difficulty would need about
  // 5,800 HP, more than three times Orvane's, and a town that arrives three times harder
  // than the one before it reads as a wall rather than a step. The balance pass has to lift
  // every town together; until then this one sits where it can be played.
  craboon: {
    name: 'Craboon', ai: 'hopper',
    hp: 260, atk: 30, speed: 3.0, mass: 1.6,
    hurtbox: { r: 0.5, h: 0.9 },
    // The big claw goes up before it comes down, which is the whole tell.
    attack: { range: 1.5, windup: 0.5, dur: 0.3, cd: 1.8, box: { x0: 0.0, x1: 1.7, y0: -0.3, y1: 1.5 }, knock: [6, 2] },
    hop: { period: 0.55, height: 0.4 },
    drops: [{ item: 'clawHat', chance: 0.05 }, { item: 'ring', chance: 0.03 }],
    score: 90,
  },
  hydrella: {
    name: 'Hydrella', ai: 'archer',
    hp: 220, atk: 28, speed: 1.1, mass: 1.2,
    hurtbox: { r: 0.5, h: 1.3 },
    // Rooted: it shoots from where it grew and barely closes, so the lane it covers is the
    // threat rather than the creature.
    attack: { range: 8.5, keep: 6.5, windup: 0.65, dur: 0.3, cd: 2.0, shot: { kind: 'tide', speed: 11, life: 1.8, y: 1.1 }, knock: [3, 0] },
    drops: [{ item: 'coralCrown', chance: 0.05 }, { item: 'brooch', chance: 0.012 }],
    score: 95,
  },
  jellune: {
    name: 'Jellune', ai: 'walker',
    hp: 200, atk: 32, speed: 2.6, mass: 0.7,
    hurtbox: { r: 0.45, h: 1.2 },
    // Drifts in and discharges. Frail, and the damage is in touching it at all.
    attack: { range: 1.3, windup: 0.3, dur: 0.3, cd: 1.3, box: { x0: -0.4, x1: 1.4, y0: -0.3, y1: 1.9, both: true }, knock: [4, 2] },
    drops: [{ item: 'jellyCap', chance: 0.05 }, { item: 'clip', chance: 0.025 }],
    score: 100,
  },
  marinox: {
    name: 'Marinox', ai: 'walker',
    hp: 420, atk: 38, speed: 2.5, mass: 2.0,
    hurtbox: { r: 0.55, h: 1.9 },
    // The elite of the town: a soldier with reach, and the one carrying the cape.
    attack: { range: 2.2, windup: 0.55, dur: 0.32, cd: 2.0, box: { x0: 0.0, x1: 2.5, y0: -0.2, y1: 2.2 }, knock: [7, 2.5] },
    drops: [{ item: 'everwave', chance: 0.05 }, { item: 'tidefin', chance: 0.05 }, { item: 'amulet', chance: 0.012 }],
    score: 140,
  },
  shellora: {
    name: 'Shellora', ai: 'walker',
    hp: 480, atk: 26, speed: 1.4, mass: 2.6,
    hurtbox: { r: 0.6, h: 1.4 },
    // Slow and heavy. It spits and then shuts, and the shut is when hitting it is wasted -
    // the closing is its own behaviour and still has to go into sim/enemies.js.
    attack: { range: 3.4, windup: 0.7, dur: 0.35, cd: 2.6, box: { x0: 0.0, x1: 3.6, y0: -0.3, y1: 1.8 }, knock: [5, 3] },
    drops: [{ item: 'pearlDiadem', chance: 0.05 }, { item: 'amulet', chance: 0.012 }],
    score: 130,
  },
  nerakos: {
    name: 'Nerakos', ai: 'boss', boss: true,
    hp: 2800, atk: 30, speed: 2.2, mass: 5.8,
    hurtbox: { r: 1.2, h: 3.0 },
    // Trident thrust: long, and it comes with the reach of the haft.
    attack: { range: 2.8, windup: 0.5, dur: 0.34, cd: 1.7, box: { x0: 0.0, x1: 3.2, y0: -0.3, y1: 2.9 }, knock: [7, 2] },
    // He does not run; he surges, and the tentacles carry him.
    charge: { windup: 0.6, dur: 0.55, speed: 13.0, cd: 8.5, box: { x0: -0.6, x1: 2.4, y0: -0.4, y1: 2.9 }, knock: [9, 3] },
    // Temple sweep: six tentacles, both sides at once, the widest thing in the game.
    slam: { windup: 1.0, dur: 0.5, cd: 7.5, box: { x0: -4.0, x1: 4.0, y0: -0.5, y1: 3.2, both: true }, knock: [6, 8], depth: 1.8 },
    // The drowned bell: three rings of water down the lanes.
    cast: { windup: 0.8, dur: 0.5, cd: 6.5, shot: { kind: 'tide', count: 3, speed: 8.5, life: 2.6, y: 1.4, lane: 1.5, dmg: 0.9 }, knock: [4, 1] },
    // The bell rings hard and the water answers.
    adds: { at: 0.45, type: 'jellune', count: 3 },
    // And he lights up with it: the eyes and the marks along the tentacles.
    rage: { tint: 0x1060a8, emissive: 0x0a4a90, grow: 1.05, shards: 1.15 },
    score: 1400,
  },
};
