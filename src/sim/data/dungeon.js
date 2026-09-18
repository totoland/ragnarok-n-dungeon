// The dungeon: a list of rooms, each a list of waves. A wave spawns when the previous one is
// dead. The exit opens when the last wave is dead; walking past it loads the next room.
// One lesson per room, like the sibling's wave table: porings teach the combo, lunatics
// teach depth-lane dodging, skeletons teach reading a wind-up, archers teach closing
// distance, the boss combines all of it.

export const DUNGEON = {
  name: 'Culvert of Prontera',
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
