// Monster behaviour. Every monster shares one skeleton state machine
// (enter → chase → windup → attack → recover, interrupted by hurt / down, ending in dead)
// and the `ai` field in data/monsters.js picks how it moves and what "attack" means.
// Wind-ups are deliberately long: the game is about reading them, not about DPS.
import { SIM, FLOOR } from '../config.js';
import { MONSTERS } from './data/monsters.js';
import { resolveMonster } from './resolve.js';
import { boxHits, rollDamage } from './combat.js';
import { hurtPlayer } from './player.js';

export function createEnemy(g, type, x, z) {
  const def = resolveMonster(MONSTERS[type], g.tier || 0);
  return {
    kind: 'enemy', id: g.nextId++, type, def, name: def.name, boss: !!def.boss,
    x, z, y: 0, vx: 0, vz: 0, vy: 0, facing: -1, grounded: true,
    hp: def.hp, hpMax: def.hp, mass: def.mass, hurtbox: def.hurtbox,
    state: 'enter', stateT: 0, cd: 0.8 + g.rng.next() * 0.8, move: null,
    hitstun: 0, launched: false, flash: 0, dead: false, deathT: 0,
    hopT: g.rng.next(), aiT: 0, hitDone: false, addsDone: false,
    lastHitBy: null,
  };
}

const sign = (v) => (v < 0 ? -1 : 1);

function approach(g, e, dt, stopAt, alignDepth = true) {
  const p = g.player;
  const dx = p.x - e.x;
  const dz = p.z - e.z;
  e.facing = sign(dx);
  const sp = e.def.speed;
  let moved = false;
  if (Math.abs(dx) > stopAt) { e.x += sign(dx) * sp * dt; moved = true; }
  if (alignDepth && Math.abs(dz) > 0.15) { e.z += sign(dz) * sp * 0.8 * dt; moved = true; }
  if (moved && e.def.hop) e.hopT += dt / e.def.hop.period; // cosmetic: the renderer bobs hoppers on hopT
  e.moving = moved;
  return moved;
}

function retreat(g, e, dt) {
  const p = g.player;
  e.facing = sign(p.x - e.x);
  e.x -= e.facing * e.def.speed * dt;
  e.moving = true;
}

function inRange(g, e, range) {
  const p = g.player;
  return Math.abs(p.x - e.x) <= range && Math.abs(p.z - e.z) <= FLOOR.hitDepth;
}

function beginAttack(g, e, name = 'attack') {
  e.state = 'windup';
  e.stateT = 0;
  e.move = name;
  e.hitDone = false;
  e.facing = sign(g.player.x - e.x);
  g.events.push({ type: 'windup', id: e.id, move: name, x: e.x, z: e.z, monster: e.type });
}

function pattern(e) {
  return e.move === 'attack' ? e.def.attack : e.def[e.move];
}

function meleeHit(g, e, pat) {
  const p = g.player;
  if (e.hitDone || !boxHits(e, e.facing, pat.box, p, pat.depth)) return;
  e.hitDone = true;
  const { dmg } = rollDamage(e.def.atk, 1, g.rng);
  const dir = pat.box.both ? sign(p.x - e.x) : e.facing;
  if (hurtPlayer(g, p, dmg, pat.knock, 0.35, dir)) g.events.push({ type: 'hit', target: 'player', dmg, x: p.x, z: p.z, y: p.y + 1.2, crit: false });
}

function stepAttack(g, e, dt) {
  const pat = pattern(e);
  e.stateT += dt;
  if (e.state === 'windup') {
    if (e.stateT >= pat.windup) {
      e.state = 'attack'; e.stateT = 0;
      g.events.push({ type: 'enemyAttack', id: e.id, move: e.move, x: e.x, z: e.z, y: e.y, facing: e.facing, monster: e.type });
      if (e.move === 'cast' && pat.shot) {
        const s = pat.shot;
        for (let i = 0; i < s.count; i++) {
          const lane = (i - (s.count - 1) / 2) * s.lane;
          const z = Math.max(FLOOR.zMin, Math.min(FLOOR.zMax, e.z + lane));
          g.spawnProjectile({
            owner: 'enemy', kind: s.kind || 'hellOrb', x: e.x + e.facing * 0.9, z, y: s.y,
            vx: s.speed * e.facing, vy: 0, dmg: Math.round(e.def.atk * (s.dmg ?? 1)),
            knock: pat.knock, stun: 0.25, life: s.life, facing: e.facing,
          });
        }
        e.hitDone = true;
      }
      if (e.move === 'attack' && e.def.ai === 'archer') {
        const s = pat.shot;
        g.spawnProjectile({ owner: 'enemy', kind: s.kind || 'boneArrow', x: e.x + e.facing * 0.5, z: e.z, y: s.y, vx: s.speed * e.facing, vy: 0, dmg: e.def.atk, knock: pat.knock, stun: 0.3, life: s.life, facing: e.facing });
        e.hitDone = true;
      }
    }
    return;
  }
  if (e.state === 'attack') {
    const f = e.stateT / pat.dur;
    if (e.move === 'charge') {
      e.x += pat.speed * e.facing * dt;
      meleeHit(g, e, pat);
    } else if (e.def.ai === 'hopper') {
      e.x += 5.5 * e.facing * dt * (f < 0.6 ? 1 : 0);
      e.y = Math.max(e.y, Math.sin(Math.PI * f) * 0.5);
      if (f > 0.15 && f < 0.7) meleeHit(g, e, pat);
    } else if (pat.box) {
      if (f > 0.1 && f < 0.6) meleeHit(g, e, pat);
    }
    if (e.stateT >= pat.dur) { e.state = 'recover'; e.stateT = 0; }
    return;
  }
  if (e.state === 'recover') {
    if (e.stateT >= 0.45) { e.state = 'chase'; e.stateT = 0; e.cd = pat.cd; }
  }
}

function think(g, e, dt) {
  const def = e.def;
  e.cd -= dt;
  e.moving = false;
  switch (def.ai) {
    case 'hopper':
    case 'walker': {
      const stop = def.attack.range - 0.25;
      approach(g, e, dt, stop);
      if (e.cd <= 0 && inRange(g, e, def.attack.range)) beginAttack(g, e, 'attack');
      break;
    }
    case 'archer': {
      const p = g.player;
      const dx = Math.abs(p.x - e.x);
      if (dx < def.attack.keep - 1) retreat(g, e, dt);
      else if (dx > def.attack.range) approach(g, e, dt, def.attack.range - 0.5, false);
      else e.facing = sign(p.x - e.x);
      const dz = p.z - e.z;
      if (Math.abs(dz) > 0.12) { e.z += sign(dz) * def.speed * dt; e.moving = true; }
      if (e.cd <= 0 && dx <= def.attack.range && Math.abs(dz) < 0.5) beginAttack(g, e, 'attack');
      break;
    }
    case 'boss': {
      const p = g.player;
      const dx = Math.abs(p.x - e.x);
      e.chargeCd = (e.chargeCd ?? 3) - dt;
      e.slamCd = (e.slamCd ?? 5) - dt;
      e.castCd = (e.castCd ?? 4) - dt;
      if (!e.addsDone && e.hp <= e.hpMax * def.adds.at) {
        e.addsDone = true;
        for (let i = 0; i < def.adds.count; i++) g.queueSpawn(def.adds.type, i % 2 ? 'left' : 'right', 0.2 * i);
        g.events.push({ type: 'bossAdds', id: e.id, x: e.x, z: e.z });
      }
      if (e.chargeCd <= 0 && dx > 4.5 && Math.abs(p.z - e.z) < 0.9) { e.chargeCd = def.charge.cd; beginAttack(g, e, 'charge'); break; }
      // Cast sits between charge and slam on purpose: at slam range it would never fire,
      // and at charge range the orbs are trivially outrun.
      if (def.cast && e.castCd <= 0 && dx > 2.2) { e.castCd = def.cast.cd; beginAttack(g, e, 'cast'); break; }
      if (e.slamCd <= 0 && dx < 3.4) { e.slamCd = def.slam.cd; beginAttack(g, e, 'slam'); break; }
      approach(g, e, dt, def.attack.range - 0.3);
      if (e.cd <= 0 && inRange(g, e, def.attack.range)) beginAttack(g, e, 'attack');
      break;
    }
  }
}

export function updateEnemy(g, e, dt) {
  if (e.dead) { e.deathT += dt; physics(g, e, dt); return; }
  if (e.flash > 0) e.flash -= dt;
  if (e.hitstun > 0) e.hitstun -= dt;
  e.aiT += dt;

  if (e.hp <= 0) {
    e.dead = true; e.state = 'dead'; e.deathT = 0;
    return;
  }
  if (e.hitstun > 0 || e.launched || !e.grounded) {
    e.state = 'hurt';
    e.stateT = 0;
  } else if (e.state === 'hurt') {
    // light hits recover straight into chase; a hard landing leaves the monster down for a beat
    e.state = e.knockedDown ? 'down' : 'chase';
    e.knockedDown = false;
    e.stateT = 0;
  }

  switch (e.state) {
    case 'hurt': break;
    case 'down':
      e.stateT += dt;
      if (e.stateT >= 0.55) { e.state = 'chase'; e.stateT = 0; }
      break;
    case 'enter': {
      const b = g.bounds;
      approach(g, e, dt, 2.5);
      if (e.x > b.xMin + 0.5 && e.x < b.xMax - 0.5) { e.state = 'chase'; e.stateT = 0; }
      break;
    }
    case 'chase': think(g, e, dt); break;
    case 'windup': case 'attack': case 'recover': stepAttack(g, e, dt); break;
  }
  physics(g, e, dt);
  separate(g, e);
}

function physics(g, e, dt) {
  e.x += e.vx * dt;
  e.vx *= Math.max(0, 1 - (e.grounded ? 7 : 1.2) * dt);
  if (Math.abs(e.vx) < 0.05) e.vx = 0;
  if (!e.grounded || e.vy > 0) {
    e.vy -= SIM.gravity * dt;
    e.y += e.vy * dt;
    if (e.y <= 0) {
      e.y = 0; e.vy = 0;
      if (!e.grounded) {
        g.events.push({ type: 'land', id: e.id, x: e.x, z: e.z, hard: e.launched, monster: e.type });
        if (e.launched) { e.launched = false; e.knockedDown = true; e.hitstun = Math.max(e.hitstun, 0.25); }
      }
      e.grounded = true;
    } else e.grounded = false;
  } else if (e.state !== 'attack') {
    e.y = Math.max(0, e.y - 6 * dt); // settle hop arcs that were interrupted
  }
  const b = g.bounds;
  const pad = e.state === 'enter' ? -3 : -0.2; // entering monsters may still be off-stage
  e.x = Math.min(b.xMax - pad, Math.max(b.xMin + pad, e.x));
  e.z = Math.min(FLOOR.zMax, Math.max(FLOOR.zMin, e.z));
}

// Soft push apart so a pack does not collapse into one point.
function separate(g, e) {
  for (const o of g.enemies) {
    if (o === e || o.dead) continue;
    const dx = e.x - o.x, dz = e.z - o.z;
    const min = e.hurtbox.r + o.hurtbox.r;
    const d = Math.hypot(dx, dz);
    if (d > 0.001 && d < min) {
      const push = (min - d) * 0.5;
      e.x += (dx / d) * push; e.z += (dz / d) * push * 0.6;
    }
  }
}
