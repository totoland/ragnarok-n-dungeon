// The dungeon: a list of rooms, each a list of waves. A wave spawns when the previous one is
// dead. The exit opens when the last wave is dead; walking past it loads the next room.
// One lesson per room, like the sibling's wave table: porings teach the combo, lunatics
// teach depth-lane dodging, skeletons teach reading a wind-up, archers teach closing
// distance, the boss combines all of it.

export const DUNGEON = {
  town: 'Prontera', name: 'Culvert of Prontera',
  loot: { knight: 'katana', hunter: 'gakkung' },     // what the boss drops, per hero (data/items.js)
  rooms: [
    {
      name: 'Prontera Field', width: 16, theme: 'field',
      waves: [
        [{ type: 'poring', count: 3 }],
        [{ type: 'poring', count: 4 }, { type: 'lunatic', count: 1 }],
      ],
    },
    {
      name: 'Drainage Hall', width: 18, theme: 'sewer',
      waves: [
        [{ type: 'lunatic', count: 3 }, { type: 'poring', count: 2 }],
        [{ type: 'skeleton', count: 1 }, { type: 'lunatic', count: 2 }],
        [{ type: 'skeleton', count: 2 }, { type: 'poring', count: 3 }],
      ],
    },
    {
      name: 'Bone Crypt', width: 18, theme: 'crypt',
      waves: [
        [{ type: 'skeleton', count: 2 }, { type: 'skelArcher', count: 1 }],
        [{ type: 'skelArcher', count: 2 }, { type: 'poring', count: 3 }],
        [{ type: 'skeleton', count: 3 }, { type: 'lunatic', count: 2 }, { type: 'skelArcher', count: 1 }],
      ],
    },
    {
      name: 'Ossuary', width: 20, theme: 'crypt',
      waves: [
        [{ type: 'skeleton', count: 2 }, { type: 'skelArcher', count: 2 }, { type: 'lunatic', count: 2 }],
        [{ type: 'skeleton', count: 3 }, { type: 'skelArcher', count: 2 }],
        [{ type: 'skeleton', count: 3 }, { type: 'skelArcher', count: 2 }, { type: 'lunatic', count: 2 }],
      ],
    },
    {
      name: "Baphomet's Throne", width: 20, theme: 'throne', boss: true,
      waves: [
        [{ type: 'baphomet', count: 1 }],
      ],
    },
  ],
};

// Town 2: the Sograt Desert outside Morroc. Five rooms like Prontera, harder from the first
// wave, ending on the Sandman. Room themes are the sand and the quarry; both are outdoor and
// draw their own dune sky procedurally, so the town ships with no image at all.
export const MORROC = {
  town: 'Morroc', name: 'Sograt Desert',
  loot: { knight: 'tsurugi', hunter: 'arbalest' },
  rooms: [
    {
      name: 'Sograt Sands', width: 18, theme: 'desert',
      waves: [
        [{ type: 'pecoPeco', count: 2 }, { type: 'ant', count: 2 }],
        [{ type: 'ant', count: 4 }, { type: 'pecoPeco', count: 1 }],
        [{ type: 'babyWolf', count: 2 }, { type: 'ant', count: 2 }],
      ],
    },
    {
      name: 'Ant Hell', width: 18, theme: 'desert',
      waves: [
        [{ type: 'ant', count: 4 }],
        [{ type: 'ant', count: 3 }, { type: 'babyWolf', count: 2 }],
        [{ type: 'ant', count: 5 }, { type: 'sandWraith', count: 1 }],
      ],
    },
    {
      name: 'Sandstorm Ridge', width: 20, theme: 'desert',
      waves: [
        [{ type: 'sandWraith', count: 2 }, { type: 'babyWolf', count: 2 }],
        [{ type: 'pecoPeco', count: 3 }, { type: 'sandWraith', count: 1 }],
        [{ type: 'sandWraith', count: 2 }, { type: 'babyWolf', count: 3 }, { type: 'ant', count: 2 }],
      ],
    },
    {
      name: 'Golem Quarry', width: 20, theme: 'quarry',
      waves: [
        [{ type: 'golem', count: 1 }, { type: 'ant', count: 2 }],
        [{ type: 'golem', count: 2 }, { type: 'sandWraith', count: 1 }],
        [{ type: 'golem', count: 2 }, { type: 'pecoPeco', count: 2 }, { type: 'sandWraith', count: 1 }],
      ],
    },
    {
      name: 'Colossus Hollow', width: 20, theme: 'quarry', boss: true,
      waves: [
        [{ type: 'sandman', count: 1 }],
      ],
    },
  ],
};

// Every town the title screen can start, in unlock order: clearing one opens the next (see
// profile.js). DUNGEON stays the default export shape for the tests and the harness; TOWNS
// is what the shell and `--dungeon` read.
// Phaelan: a pine forest and the spirit graveyard under its roots, after Morroc. Toto's
// brief - an eastern timber village gone quiet, a stream, an abandoned shrine, spirit
// lanterns, and a moonlit courtyard at the end of it. Jade green and amber through the
// forest, silver once the moon is the only light left.
//
// The cursed lanterns that thin the reinforcements are a room mechanic of its own and are
// not here yet; the rooms below are the route and the fights.
export const PHAELAN = {
  town: 'Phaelan', name: 'Phaelan Woods',
  loot: { knight: 'moonveil', hunter: 'moonveil' },   // the same cape either way: it is not a weapon
  rooms: [
    {
      name: 'Forest Edge', width: 18, theme: 'forest',
      waves: [
        [{ type: 'famiru', count: 4 }],
        [{ type: 'famiru', count: 5 }, { type: 'munari', count: 1 }],
      ],
    },
    {
      name: 'Abandoned Shrine', width: 20, theme: 'shrine',
      waves: [
        [{ type: 'munari', count: 2 }, { type: 'bonku', count: 1 }],
        [{ type: 'skelbow', count: 2 }, { type: 'munari', count: 2 }],
        [{ type: 'bonku', count: 2 }, { type: 'skelbow', count: 2 }, { type: 'famiru', count: 3 }],
      ],
    },
    {
      name: 'Root Graveyard', width: 20, theme: 'graveyard',
      waves: [
        [{ type: 'munari', count: 2 }, { type: 'bonku', count: 2 }],
        [{ type: 'wispra', count: 3 }, { type: 'skelbow', count: 2 }],
        [{ type: 'bonku', count: 2 }, { type: 'wispra', count: 2 }, { type: 'munari', count: 2 }, { type: 'skelbow', count: 1 }],
      ],
    },
    {
      name: 'Moonlit Courtyard', width: 22, theme: 'moonlit',
      waves: [
        [{ type: 'sorya', count: 2 }, { type: 'wispra', count: 2 }],
        [{ type: 'sorya', count: 2 }, { type: 'wispra', count: 3 }, { type: 'skelbow', count: 2 }],
        [{ type: 'moonraya', count: 1 }],
      ],
    },
  ],
};

// A room that never ends, for leaving on a tablet while the reports come in. Its waves are
// the ones the real towns build up to, in a loop that climbs and starts again, so a long
// session keeps meeting the same heavy moments instead of drifting into an easy one. Not a
// place to play: no exit, no boss, no ending. `soak` is what game.js looks for.
export const SOAK = {
  town: 'Soak', name: 'Proving Ground', soak: true,
  loot: { knight: 'katana', hunter: 'gakkung' },
  rooms: [
    {
      name: 'Proving Ground', width: 22, theme: 'crypt',
      waves: [
        [{ type: 'poring', count: 4 }, { type: 'lunatic', count: 2 }],
        [{ type: 'skeleton', count: 3 }, { type: 'skelArcher', count: 2 }],
        [{ type: 'lunatic', count: 4 }, { type: 'poring', count: 3 }, { type: 'ant', count: 2 }],
        [{ type: 'skeleton', count: 3 }, { type: 'skelArcher', count: 2 }, { type: 'sandWraith', count: 2 }],
        [{ type: 'golem', count: 2 }, { type: 'babyWolf', count: 3 }, { type: 'pecoPeco', count: 2 }],
        [{ type: 'skeleton', count: 4 }, { type: 'skelArcher', count: 3 }, { type: 'lunatic', count: 3 }, { type: 'poring', count: 2 }],
      ],
    },
  ],
};

export const TOWNS = { prontera: DUNGEON, morroc: MORROC, phaelan: PHAELAN };
