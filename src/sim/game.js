// The sim: createGame / update. Owns rooms, waves, spawning, projectiles, the combo counter
// and the event stream. It never imports the renderer and never touches Math.random, so a run
// is fully determined by (hero, seed, input stream). The one channel out is `events`: plain
// records the effects layer drains each frame; the sim never reads them.
import { SIM, FLOOR, PLAYER, DROPS } from '../config.js';
import { DUNGEON } from './data/dungeon.js';
import { createRng } from './rng.js';
import { createPlayer, updatePlayer, hurtPlayer } from './player.js';
import { createEnemy, updateEnemy } from './enemies.js';
import { boxHits, rollDamage, applyHit } from './combat.js';

export function createGame({ hero = 'knight', seed = 1, dungeon = DUNGEON, mods, tier = 0 } = {}) {
  const g = {
    t: 0, rng: createRng(seed), seed, dungeon,
    // tier: the town's New Game+ level, fixed for the run; every spawn reads it.
    tier,
    player: createPlayer(hero, mods),
    roomIndex: -1, room: null, bounds: { xMin: 0, xMax: 16 },
    waveIndex: -1, spawnQueue: [], enemies: [], projectiles: [], pickups: [],
    events: [], nextId: 1,
    pending: [],          // delayed strikes (the falcon's Auto Blitz), resolved in update()
    phase: 'fight',       // fight | cleared | won | dead
    roomT: 0, combo: { count: 0, timer: 0, best: 0 }, score: 0, kills: 0,
    stats: { damageDealt: 0, damageTaken: 0, hits: 0 },
  };
  g.spawnProjectile = (p) => spawnProjectile(g, p);
  g.queueSpawn = (type, side, delay) => g.spawnQueue.push({ type, side, t: delay });
  g.onEnemyHit = (e, dmg, crit, killed, attackId) => onEnemyHit(g, e, dmg, crit, killed, attackId);
  loadRoom(g, 0);
  return g;
}

export function loadRoom(g, index) {
  const room = g.dungeon.rooms[index];
  g.roomIndex = index;
  g.room = room;
  g.bounds = { xMin: 0, xMax: room.width };
  g.enemies = [];
  g.projectiles = [];
  g.pickups = [];
  g.spawnQueue = [];
  g.waveIndex = -1;
  g.roomT = 0;
  g.phase = 'fight';
  const p = g.player;
  p.x = 1.5; p.z = 0; p.y = 0; p.vx = 0; p.vy = 0; p.facing = 1;
  if (p.state !== 'dead') { p.state = 'idle'; p.attack = null; }
  if (index > 0) { // a breather between rooms, like the potion stop in a belt-scroller
    p.hp = Math.min(p.hpMax, p.hp + Math.round(p.hpMax * PLAYER.roomRest));
    p.mp = p.mpMax;
  }
  pushEvent(g, { type: 'roomEnter', index, name: room.name, boss: !!room.boss, width: room.width });
}

function startWave(g, index) {
  const wave = g.room.waves[index];
  g.waveIndex = index;
  let delay = 0;
  let n = 0;
  for (const group of wave) {
    for (let i = 0; i < group.count; i++) {
      // the first wave of a room comes from the right; later packs surround the player
      const side = index === 0 || n % 2 === 0 ? 'right' : 'left';
      g.queueSpawn(group.type, side, delay);
      delay += 0.35;
      n++;
    }
  }
  pushEvent(g, { type: 'wave', index, total: g.room.waves.length, count: n });
}

function spawn(g, type, side) {
  const b = g.bounds;
  const x = side === 'right' ? b.xMax + 1.5 : b.xMin - 1.5;
  const z = g.rng.range(FLOOR.zMin + 0.4, FLOOR.zMax - 0.4);
  const e = createEnemy(g, type, x, z);
  e.facing = side === 'right' ? -1 : 1;
  g.enemies.push(e);
  pushEvent(g, { type: 'spawn', id: e.id, monster: type, x, z, boss: e.boss });
  return e;
}

function spawnProjectile(g, p) {
  const pr = { id: g.nextId++, hitIds: [], t: 0, ...p };
  g.projectiles.push(pr);
  pushEvent(g, { type: 'shoot', id: pr.id, owner: pr.owner, kind: pr.kind, x: pr.x, z: pr.z, y: pr.y, facing: pr.facing });
  return pr;
}

function updateProjectiles(g, dt) {
  const p = g.player;
  for (const pr of g.projectiles) {
    pr.t += dt;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    if (pr.vy) pr.vy -= SIM.gravity * 0.35 * dt;
    if (pr.y <= 0 || pr.t >= pr.life || pr.x < g.bounds.xMin - 4 || pr.x > g.bounds.xMax + 4) { pr.dead = true; continue; }
    // generous downward reach so a chest-height arrow still clips a knee-high blob
    const box = { x0: -0.3, x1: 0.5, y0: -0.75, y1: 0.35 };
    if (pr.owner === 'player') {
      for (const e of g.enemies) {
        if (e.dead || pr.hitIds.includes(e.id) || !boxHits(pr, pr.facing, box, e)) continue;
        pr.hitIds.push(e.id);
        const { dmg, crit } = rollDamage(p.atk, pr.dmg, g.rng, p.crit, p.critDmg);
        const killed = applyHit(e, dmg, pr.knock, pr.stun, pr.facing, e.mass);
        e.facing = -pr.facing;
        onEnemyHit(g, e, dmg, crit, killed, pr.kind);
        if (!pr.pierce) { pr.dead = true; break; }
      }
    } else if (!pr.dead && boxHits(pr, pr.facing, box, p)) {
      const { dmg } = rollDamage(pr.dmg, 1, g.rng);
      if (hurtPlayer(g, p, dmg, pr.knock, pr.stun, pr.facing)) {
        pushEvent(g, { type: 'hit', target: 'player', dmg, x: p.x, z: p.z, y: p.y + 1.2, crit: false });
        pr.dead = true;
      }
    }
  }
  g.projectiles = g.projectiles.filter((pr) => !pr.dead);
}

function onEnemyHit(g, e, dmg, crit, killed, attackId) {
  g.stats.damageDealt += dmg;
  g.stats.hits++;
  g.combo.count++;
  g.combo.timer = PLAYER.comboWindow;
  g.combo.best = Math.max(g.combo.best, g.combo.count);
  pushEvent(g, { type: 'hit', target: 'enemy', id: e.id, monster: e.type, dmg, crit, x: e.x, z: e.z, y: e.y + e.hurtbox.h * 0.7, attack: attackId, launched: e.launched, combo: g.combo.count });
  rollPassive(g, e, attackId, killed);
  if (killed) {
    g.kills++;
    g.score += e.def.score * (1 + Math.min(2, g.combo.count / 20));
    pushEvent(g, { type: 'kill', id: e.id, monster: e.type, x: e.x, z: e.z, y: e.y, boss: e.boss, score: e.def.score });
    if (!e.boss) rollDrop(g, e);
  }
}

// The hero's passive, rolled once per landed hit off the run's rng so a proc is as
// reproducible as a crit. Both are data on the hero (data/heroes.js).
function rollPassive(g, e, attackId, killed) {
  const p = g.player, pv = p.def.passive;
  if (!pv) return;
  if (pv.id === 'autoBlitz') {
    if (killed || attackId === 'blitzBeat' || attackId === 'autoBlitz') return;
    if (!g.rng.chance(pv.chance)) return;
    g.pending.push({ kind: 'autoBlitz', target: e.id, t: pv.delay });
    pushEvent(g, { type: 'autoBlitz', target: e.id, x: e.x, z: e.z, y: e.y });
  } else if (pv.id === 'soulDrain') {
    if (!g.rng.chance(pv.chance)) return;
    const hp = Math.round(p.hpMax * pv.hp), sp = Math.round(p.mpMax * pv.sp);
    p.hp = Math.min(p.hpMax, p.hp + hp);
    p.mp = Math.min(p.mpMax, p.mp + sp);
    pushEvent(g, { type: 'drain', hp, sp, x: p.x, z: p.z, y: p.y + 1.6 });
  }
}

function resolvePending(g, dt) {
  if (!g.pending.length) return;
  const p = g.player;
  for (const job of g.pending) job.t -= dt;
  const due = g.pending.filter((j) => j.t <= 0);
  if (!due.length) return;
  g.pending = g.pending.filter((j) => j.t > 0);
  for (const job of due) {
    if (job.kind !== 'autoBlitz') continue;
    const e = g.enemies.find((x) => x.id === job.target);
    if (!e || e.dead) continue;               // the bird finds nothing there; no hit, no proc
    const hit = p.def.passive.hit;
    const { dmg, crit } = rollDamage(p.atk, hit.dmg, g.rng, p.crit, p.critDmg);
    const dir = Math.sign(e.x - p.x) || p.facing;
    const killed = applyHit(e, dmg, hit.knock, hit.stun, dir, e.mass);
    onEnemyHit(g, e, dmg, crit, killed, 'autoBlitz');
  }
}

function rollDrop(g, e) {
  const p = g.player;
  const low = p.hp < p.hpMax * DROPS.lowHp;
  let kind = null;
  if (g.rng.chance(low ? DROPS.hp.lowHpChance : DROPS.hp.chance)) kind = 'hp';
  else if (g.rng.chance(DROPS.mp.chance)) kind = 'mp';
  if (!kind) return;
  const item = { id: g.nextId++, kind, x: e.x, z: e.z, y: e.y + 0.6, vy: 3.5, vx: g.rng.range(-1.2, 1.2), t: 0 };
  g.pickups.push(item);
  pushEvent(g, { type: 'drop', id: item.id, kind, x: item.x, z: item.z, y: item.y });
}

function updatePickups(g, dt) {
  const p = g.player;
  for (const it of g.pickups) {
    it.t += dt;
    if (it.y > 0 || it.vy > 0) {
      it.vy -= SIM.gravity * 0.6 * dt;
      it.y += it.vy * dt;
      it.x += it.vx * dt;
      if (it.y <= 0) { it.y = 0; it.vy = 0; it.vx = 0; }
    }
    if (it.t >= DROPS.life) { it.dead = true; continue; }
    if (it.y <= 0.05 && p.state !== 'dead' && Math.abs(p.x - it.x) < DROPS.pickupRadius && Math.abs(p.z - it.z) < DROPS.pickupRadius * 0.8 && p.y < 0.6) {
      it.dead = true;
      let amount = 0;
      if (it.kind === 'hp') { amount = Math.round(p.hpMax * DROPS.hp.heal); p.hp = Math.min(p.hpMax, p.hp + amount); }
      else { amount = Math.round(p.mpMax * DROPS.mp.restore); p.mp = Math.min(p.mpMax, p.mp + amount); }
      pushEvent(g, { type: 'pickup', kind: it.kind, amount, x: p.x, z: p.z, y: p.y + 1.4 });
    }
  }
  g.pickups = g.pickups.filter((it) => !it.dead);
}

function pushEvent(g, ev) {
  if (g.events.length < SIM.eventCap) g.events.push(ev);
}

export function update(g, input, dt = SIM.dt) {
  if (g.phase === 'won' || g.phase === 'dead') { g.t += dt; return g; }
  g.t += dt;
  g.roomT += dt;

  // spawns
  for (const s of g.spawnQueue) s.t -= dt;
  const ready = g.spawnQueue.filter((s) => s.t <= 0);
  if (ready.length) {
    g.spawnQueue = g.spawnQueue.filter((s) => s.t > 0);
    for (const s of ready) spawn(g, s.type, s.side);
  }

  updatePlayer(g, g.player, input, dt);
  resolvePending(g, dt);
  for (const e of g.enemies) updateEnemy(g, e, dt);
  updateProjectiles(g, dt);
  updatePickups(g, dt);

  // corpses linger for the death effect, then leave
  g.enemies = g.enemies.filter((e) => !e.dead || e.deathT < 1.2);

  // combo decay
  if (g.combo.timer > 0) {
    g.combo.timer -= dt;
    if (g.combo.timer <= 0 && g.combo.count > 0) { pushEvent(g, { type: 'comboEnd', count: g.combo.count }); g.combo.count = 0; }
  }

  // waves & room flow
  const alive = g.enemies.some((e) => !e.dead);
  if (g.phase === 'fight') {
    if (g.waveIndex < 0) {
      // a room without waves is a sandbox: it never clears (used by tests and the debug handle)
      if (g.room.waves.length && g.roomT >= 0.8) startWave(g, 0);
    } else if (!alive && g.spawnQueue.length === 0) {
      if (g.waveIndex + 1 < g.room.waves.length) startWave(g, g.waveIndex + 1);
      else { g.phase = 'cleared'; pushEvent(g, { type: 'roomClear', index: g.roomIndex, last: g.roomIndex === g.dungeon.rooms.length - 1 }); }
    }
  } else if (g.phase === 'cleared') {
    if (g.roomIndex === g.dungeon.rooms.length - 1) {
      g.phase = 'won';
      pushEvent(g, { type: 'won', score: g.score, kills: g.kills, best: g.combo.best });
    } else if (g.player.x >= g.bounds.xMax - 0.6) {
      loadRoom(g, g.roomIndex + 1);
    }
  }
  if (g.player.state === 'dead' && g.phase !== 'dead') {
    g.phase = 'dead';
    pushEvent(g, { type: 'gameOver', score: g.score, kills: g.kills, room: g.roomIndex });
  }
  return g;
}

export const EMPTY_INPUT = Object.freeze({ held: {}, pressed: {} });
