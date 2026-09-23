// Headless balance harness: a scripted player runs the whole dungeon with each hero.
//
//   node tools/playtest.mjs            # both heroes, 5 seeds each, summary table
//   node tools/playtest.mjs hunter 7   # one hero, one seed, verbose room log
//   node tools/playtest.mjs --tier 2    # every monster at New Game+ tier 2
//   node tools/playtest.mjs --matrix    # tiers 0..2, no pass/fail gate
//   node tools/playtest.mjs --level 8   # the hero starts at level 8 (xp from sim/progress.js)
//   node tools/playtest.mjs --gear katana:5 --skill 3   # wield a +5 Katana, every skill at level 3
//   node tools/playtest.mjs --dungeon morroc   # another town; reports, no gate
//
// The bot is deliberately simple: walk to the nearest live enemy's lane, mash attack when in
// range, fire skills when ready, and step off-lane when something winds up nearby. A bot this
// dumb should still clear the dungeon most of the time with hp to spare (it is a beat-em-up,
// not a bullet hell), and must never clear it without taking any damage.
import { createGame, update } from '../src/sim/game.js';
import { xpAtLevel } from '../src/sim/progress.js';
import { HEROES } from '../src/sim/data/heroes.js';
import { TOWNS } from '../src/sim/data/dungeon.js';
import { FLOOR, SIM } from '../src/config.js';

function botInput(g, frame) {
  const p = g.player;
  const held = {}, pressed = {};
  const live = g.enemies.filter((e) => !e.dead && e.x > g.bounds.xMin - 1 && e.x < g.bounds.xMax + 1);
  if (g.phase === 'cleared') { held.right = true; return { held, pressed }; }
  const potion = g.pickups.find((it) => it.y <= 0.05 && ((it.kind === 'hp' && p.hp < p.hpMax * 0.65) || (it.kind === 'mp' && p.mp < p.mpMax * 0.4)) && Math.abs(it.x - p.x) < 7);
  if (potion && !live.some((e) => e.state === 'windup' && Math.abs(e.x - p.x) < 2.5)) {
    if (Math.abs(potion.x - p.x) > 0.3) { if (potion.x > p.x) held.right = true; else held.left = true; }
    if (Math.abs(potion.z - p.z) > 0.25) { if (potion.z > p.z) held.down = true; else held.up = true; }
    return { held, pressed };
  }
  if (!live.length) return { held, pressed };
  // A self-buff is cast the moment it can be, not when an enemy is in range: it has no hit
  // box, and holding it back is just leaving attack speed on the table.
  for (let i = 0; i < 3; i++) {
    const id = p.def.skills[i], atk = p.def.attacks[id];
    if (atk.buff && !p.buffs[atk.buff.id] && p.mp >= atk.mp && !(p.cooldowns[id] > 0) && p.grounded && p.state !== 'attack') {
      pressed[`skill${i + 1}`] = true; return { held, pressed };
    }
  }
  live.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
  const t = live[0];
  const dx = t.x - p.x, dz = t.z - p.z;
  const ranged = p.hero === 'hunter';
  const want = ranged ? 5.5 : 1.3;
  // A charge is a threat from across the room; everything else only once it is close enough
  // to land. Without the distance gate a boss pacing about at the far wall counted as a
  // threat, and the rule below then ran the bot away from it.
  const threat = live.find((e) => e.state === 'windup'
    && (Math.abs(e.x - p.x) < 3 || (e.move === 'charge' && Math.abs(e.z - p.z) < 1.2)));
  const arrow = g.projectiles.find((pr) => pr.owner === 'enemy' && Math.abs(pr.z - p.z) < 0.9 && Math.sign(p.x - pr.x) === Math.sign(pr.vx) && Math.abs(pr.x - p.x) < 3.5);
  // A ring on the floor with a rock coming down into it. The bot cannot see the ring, so it
  // is handed the thing the ring stands for: an impact about to land where it is standing.
  // Without this it stood in every one of the King Orc's and the harness reported a town
  // nobody could finish, which is a fact about the bot and not the town.
  const rock = g.pending.find((j) => j.kind === 'bossMeteor' && j.t < 0.7
    && Math.abs(j.x - p.x) <= j.r + 0.4 && Math.abs(j.z - p.z) <= j.r * 0.7 + 0.4);
  if (rock) {
    if (p.x < rock.x) held.left = true; else held.right = true;
    if (p.z > rock.z) held.down = true; else held.up = true;
    return { held, pressed };
  }
  if (arrow) { // change lane to let an incoming arrow pass
    if (p.z > 0) held.up = true; else held.down = true;
    return { held, pressed };
  }

  if (threat && (threat.boss || frame % 2 === 0)) {
    // sidestep a telegraphed attack; back off along x from a boss (its slam covers the lanes)
    if (p.z > 0) held.up = true; else held.down = true;
    if (threat.move === 'charge') return { held, pressed }; // a charge is dodged by changing lane, not by running
    // Stepping out of the lane is what dodges; backing off along x as well, on every frame a
    // boss is winding up, is what made the bot unable to fight one at all. A boss spends a
    // third of the fight in a wind-up, so the bot spent a third of it walking backwards, and
    // the tougher the boss the worse it got - the Hall of Mirrors took 280 s and timed out,
    // while the same fight driven straight at the boss takes 12. Retreat is kept for when it
    // is genuinely inside the swing.
    if (ranged || (threat.boss && Math.abs(threat.x - p.x) < 2.2)) { if (threat.x > p.x) held.left = true; else held.right = true; }
    if (Math.abs(threat.x - p.x) < (threat.boss ? 3.5 : 1.6) && p.dashCd <= 0) { if (threat.x > p.x) held.left = true; else held.right = true; pressed.dash = true; }
    return { held, pressed };
  }
  if (Math.abs(dz) > 0.35) { if (dz > 0) held.down = true; else held.up = true; }
  if (Math.abs(dx) > want) { if (dx > 0) held.right = true; else held.left = true; }
  else if (ranged && Math.abs(dx) < 2.5) { if (dx > 0) held.left = true; else held.right = true; }
  const facingOk = Math.sign(dx) === p.facing;
  if (!facingOk) { if (dx > 0) held.right = true; else held.left = true; }
  const inRange = Math.abs(dx) <= (ranged ? 7 : 2.0) && Math.abs(dz) < FLOOR.hitDepth;
  if (inRange && facingOk) {
    for (let i = 0; i < 3; i++) {
      const id = p.def.skills[i];
      const atk = p.def.attacks[id];
      if (atk.buff) continue;                     // handled above, before range is considered
      if (p.mp >= atk.mp && !(p.cooldowns[id] > 0) && frame % 3 === 0) { pressed[`skill${i + 1}`] = true; return { held, pressed }; }
    }
    if (frame % 4 === 0) pressed.attack = true;
  }
  return { held, pressed };
}

function run(hero, seed, verbose = false, opts = {}) {
  const skills = skillLevel ? Object.fromEntries(HEROES[hero].skills.map((id) => [id, skillLevel])) : {};
  const g = createGame({ hero, seed, skills, ...opts });
  const log = [];
  let frame = 0;
  const maxFrames = 60 * 60 * 6;
  let lastRoom = -1, roomStart = 0, hpAtRoom = g.player.hp;
  while (g.phase !== 'won' && g.phase !== 'dead' && frame < maxFrames) {
    if (g.roomIndex !== lastRoom) {
      if (lastRoom >= 0) log.push({ room: lastRoom, name: g.dungeon.rooms[lastRoom].name, secs: ((frame - roomStart) * SIM.dt).toFixed(1), hpLost: hpAtRoom - g.player.hp });
      lastRoom = g.roomIndex; roomStart = frame; hpAtRoom = g.player.hp;
    }
    update(g, botInput(g, frame));
    g.events.length = 0;
    frame++;
  }
  log.push({ room: lastRoom, name: g.dungeon.rooms[lastRoom].name, secs: ((frame - roomStart) * SIM.dt).toFixed(1), hpLost: hpAtRoom - g.player.hp });
  const result = { hero, ...(opts.tier ? { tier: opts.tier } : {}), seed, phase: g.phase, room: g.roomIndex, secs: (frame * SIM.dt).toFixed(0), hp: g.player.hp, hpMax: g.player.hpMax, kills: g.kills, best: g.combo.best, dealt: g.stats.damageDealt, score: Math.round(g.score), lv: g.player.level, xp: g.xp - g.xpStart };
  if (verbose) { console.table(log); }
  return result;
}

// Flags first: --tier N plays one New Game+ tier, --matrix sweeps tiers 0..2 and reports each
// on its own. Positional [hero] [seed] as before. The pass/fail gate below is only applied to
// the plain run, so it stays comparable across commits; the matrix is for reading.
// Both `--tier=2` and `--tier 2`: a flag swallows the next token as its value unless that
// token is itself a flag (so a bare `--matrix` stays boolean).
const argv = process.argv.slice(2);
const flags = {}, positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { positional.push(a); continue; }
  const [k, v] = a.includes('=') ? a.split(/=(.*)/s) : [a, undefined];
  if (v !== undefined) flags[k] = v;
  else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') && !['--matrix'].includes(k)) flags[k] = argv[++i];
  else flags[k] = true;
}
const flag = (name) => (name in flags ? flags[name] : null);
const [heroArg, seedArg] = positional;
const heroes = heroArg ? [heroArg] : ['knight', 'hunter'];
const seeds = seedArg ? [Number(seedArg)] : [1, 2, 3, 4, 5];
const townFlag = flag('--dungeon');
const town = townFlag ? TOWNS[townFlag] : null;
if (townFlag && !town) { console.error(`unknown dungeon '${townFlag}' - one of: ${Object.keys(TOWNS).join(', ')}`); process.exit(2); }
const tierFlag = flag('--tier');
const tier = tierFlag ? Number(tierFlag) : 0;
const levelFlag = flag('--level');
const gearFlag = flag('--gear'), skillFlag = flag('--skill');
const start = {
  ...(levelFlag ? { xp: xpAtLevel(Number(levelFlag)) } : {}),
  ...(gearFlag ? { gear: { id: gearFlag.split(':')[0], plus: Number(gearFlag.split(':')[1] || 0) } } : {}),
};
// --skill N: every slotted skill at level N, resolved per hero inside run() since the ids differ.
const skillLevel = skillFlag ? Number(skillFlag) : 0;
const rows = [];
if (flag('--matrix')) {
  for (const t of [0, 1, 2]) for (const h of heroes) for (const s of seeds) rows.push(run(h, s, false, { tier: t, ...start, ...(town ? { dungeon: town } : {}) }));
  console.table(rows);
  for (const t of [0, 1, 2]) {
    const r = rows.filter((x) => (x.tier || 0) === t);
    const w = r.filter((x) => x.phase === 'won').length;
    console.log(`tier ${t}: ${w}/${r.length} cleared; avg hp left ${(r.reduce((a, x) => a + x.hp / x.hpMax, 0) / r.length * 100).toFixed(0)}%`);
  }
  process.exit(0);
}
for (const h of heroes) for (const s of seeds) rows.push(run(h, s, !!seedArg, { ...(tier ? { tier } : {}), ...start, ...(town ? { dungeon: town } : {}) }));
console.table(rows);
const wins = rows.filter((r) => r.phase === 'won').length;
console.log(`${wins}/${rows.length} runs cleared the dungeon; avg hp left ${(rows.reduce((a, r) => a + r.hp / r.hpMax, 0) / rows.length * 100).toFixed(0)}%`);
if (town || levelFlag || gearFlag || skillFlag) { console.log(`(${townFlag || 'loadout'}: no pass/fail gate - the bar below is calibrated for a fresh hero in Prontera)`); process.exit(0); }
const flawless = rows.filter((r) => r.phase === 'won' && r.hp === r.hpMax).length;
if (flawless) { console.error(`${flawless} flawless runs — the dungeon is too easy`); process.exitCode = 1; }
// The bot has no boss strategy beyond backing off, so half the runs is the bar; a kiting hunter
// or a knight that punishes the recover window clears the Orc Lord comfortably.
if (wins < rows.length * 0.5) { console.error('fewer than half of the bot runs cleared the dungeon — too hard'); process.exitCode = 1; }
