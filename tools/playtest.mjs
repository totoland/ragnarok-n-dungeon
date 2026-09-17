// Headless balance harness: a scripted player runs the whole dungeon with each hero.
//
//   node tools/playtest.mjs            # both heroes, 5 seeds each, summary table
//   node tools/playtest.mjs hunter 7   # one hero, one seed, verbose room log
//
// The bot is deliberately simple: walk to the nearest live enemy's lane, mash attack when in
// range, fire skills when ready, and step off-lane when something winds up nearby. A bot this
// dumb should still clear the dungeon most of the time with hp to spare (it is a beat-em-up,
// not a bullet hell), and must never clear it without taking any damage.
import { createGame, update } from '../src/sim/game.js';
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
  live.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
  const t = live[0];
  const dx = t.x - p.x, dz = t.z - p.z;
  const ranged = p.hero === 'hunter';
  const want = ranged ? 5.5 : 1.3;
  const threat = live.find((e) => e.state === 'windup' && (Math.abs(e.x - p.x) < 3 || e.move === 'charge'));
  const arrow = g.projectiles.find((pr) => pr.owner === 'enemy' && Math.abs(pr.z - p.z) < 0.9 && Math.sign(p.x - pr.x) === Math.sign(pr.vx) && Math.abs(pr.x - p.x) < 3.5);
  if (arrow) { // change lane to let an incoming arrow pass
    if (p.z > 0) held.up = true; else held.down = true;
    return { held, pressed };
  }

  if (threat && (threat.boss || frame % 2 === 0)) {
    // sidestep a telegraphed attack; back off along x from a boss (its slam covers the lanes)
    if (p.z > 0) held.up = true; else held.down = true;
    if (threat.move === 'charge') return { held, pressed }; // a charge is dodged by changing lane, not by running
    if (ranged || threat.boss) { if (threat.x > p.x) held.left = true; else held.right = true; }
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
      if (p.mp >= atk.mp && !(p.cooldowns[id] > 0) && frame % 3 === 0) { pressed[`skill${i + 1}`] = true; return { held, pressed }; }
    }
    if (frame % 4 === 0) pressed.attack = true;
  }
  return { held, pressed };
}

function run(hero, seed, verbose = false) {
  const g = createGame({ hero, seed });
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
  const result = { hero, seed, phase: g.phase, room: g.roomIndex, secs: (frame * SIM.dt).toFixed(0), hp: g.player.hp, hpMax: g.player.hpMax, kills: g.kills, best: g.combo.best, dealt: g.stats.damageDealt, score: Math.round(g.score) };
  if (verbose) { console.table(log); }
  return result;
}

const [, , heroArg, seedArg] = process.argv;
const heroes = heroArg ? [heroArg] : ['knight', 'hunter'];
const seeds = seedArg ? [Number(seedArg)] : [1, 2, 3, 4, 5];
const rows = [];
for (const h of heroes) for (const s of seeds) rows.push(run(h, s, !!seedArg));
console.table(rows);
const wins = rows.filter((r) => r.phase === 'won').length;
console.log(`${wins}/${rows.length} runs cleared the dungeon; avg hp left ${(rows.reduce((a, r) => a + r.hp / r.hpMax, 0) / rows.length * 100).toFixed(0)}%`);
const flawless = rows.filter((r) => r.phase === 'won' && r.hp === r.hpMax).length;
if (flawless) { console.error(`${flawless} flawless runs — the dungeon is too easy`); process.exitCode = 1; }
// The bot has no boss strategy beyond backing off, so half the runs is the bar; a kiting hunter
// or a knight that punishes the recover window clears the Orc Lord comfortably.
if (wins < rows.length * 0.5) { console.error('fewer than half of the bot runs cleared the dungeon — too hard'); process.exitCode = 1; }
