// The hero: a small state machine (idle / walk / air / dash / attack / hurt / dead) driven by
// data from data/heroes.js. Attacks are time-windowed: movement windows, hit windows and
// projectile spawns fire as attackT sweeps through them, and a buffered attack press at or
// after `cancelAt` chains into `next`. Skills can cancel a basic attack from `cancelAt` too,
// which is what makes the combos feel like a belt-scroller instead of a queue.
import { SIM, FLOOR, PLAYER, SKILL_KEYS, SKILL } from '../config.js';
import { HEROES, SKILL_BRANCH } from './data/heroes.js';
import { boxHits, rollDamage, applyHit } from './combat.js';
import { resolveHero, mergeMods } from './resolve.js';
import { levelMods } from './progress.js';

export function createPlayer(heroKey, mods, level = 1, skills = {}, branches = null) {
  const p = {
    kind: 'player', hero: heroKey, level: 1, def: null,
    // Skill levels by id (0 when unset) and the weapon, both read-only in the sim: the
    // shell folds them in at creation. gear is here for the renderer (a +5 glows).
    skillLv: skills, skillBranch: null, gear: null,
    crit: 0, critDmg: 0,
    meteor: 0, double: 0, spDrain: 0, pull: 0,
    x: 1.5, z: 0, y: 0, vx: 0, vy: 0, facing: 1, grounded: true,
    hp: 0, hpMax: 0, mp: 0, mpMax: 0, atk: 0, speed: 0,
    hurtbox: null,
    state: 'idle', stateT: 0,
    attack: null, attackT: 0, hitLog: [], spawned: [],
    cooldowns: {}, dashCd: 0, buf: {}, holdAttack: false, holdArmed: false, heldAttackPrev: false,
    hitstun: 0, iframes: 0, flash: 0, launched: false,
    moving: false,
    // Timed modifiers keyed by id, and the values folded from them every tick. Anything that
    // changes how fast the hero swings or how often he is hit goes through these two numbers
    // - a buff now, equipment later - so there is exactly one place they combine.
    buffs: {}, atkSpeed: 1, dodge: 0,
  };
  p.skillBranch = branches;
  setLevel(p, level, mods);
  p.hp = p.hpMax; p.mp = p.mpMax;
  return p;
}

// Re-resolve the hero at a level. `mods` are whatever the shell knows beyond the level -
// gear, skill points - and are folded with the level's share here, once, so the rest of the
// sim keeps reading a def-shaped object (see resolve.js). Called at creation and again on a
// level-up mid-run; it sets the maxima and leaves hp / mp to the caller.
// Fold in whatever branches the hero has actually earned: a branch counts only once its
// skill is at the cap, so a respec or a half-spent tree simply resolves to the base attack.
// The patched map is built here, once per resolve, rather than checked on every cast.
function withBranches(def, skillLv, branch) {
  if (!branch) return def;
  let attacks = null;
  for (const id in branch) {
    const pick = SKILL_BRANCH[id]?.[branch[id]];
    if (!pick || !def.attacks[id] || (skillLv?.[id] || 0) < SKILL.maxLevel) continue;
    attacks ||= { ...def.attacks };
    attacks[id] = { ...def.attacks[id], ...pick.attack };
  }
  return attacks ? { ...def, attacks } : def;
}

export function setLevel(p, level, mods) {
  const def = withBranches(resolveHero(HEROES[p.hero], mergeMods(levelMods(level), mods)), p.skillLv, p.skillBranch);
  p.level = level;
  p.def = def;
  p.hpMax = def.hp; p.mpMax = def.mp; p.atk = def.atk; p.speed = def.speed;
  p.crit = def.crit; p.critDmg = def.critDmg;
  // Gear proc rates (Orvane). Copied onto the player like crit is, so sim/game.js rolls them
  // without reaching through def - and so a level-up mid-run picks up a new charm's share.
  p.meteor = def.meteor || 0; p.double = def.double || 0; p.spDrain = def.spDrain || 0;
  p.pull = def.pull || 0;
  p.hurtbox = def.hurtbox;
  foldBuffs(p, 0);
}

// Skill levels: an attack skill hits harder per level, a buff lasts longer. Anything that is
// not a skill (the basic combo, the falcon's passive) has no level and reads as 1.
export const skillDmg = (p, id) => 1 + SKILL.dmg * (p.skillLv?.[id] || 0);
const skillDur = (p, id) => 1 + SKILL.buffDur * (p.skillLv?.[id] || 0);

function applyBuff(p, b, dur = b.dur) {
  p.buffs[b.id] = { t: dur, dur, atkSpeed: b.atkSpeed || 1, dodge: b.dodge || 0, crit: b.crit || 0 };   // recast refreshes
  // Fold now rather than on the next tick's timers: the cast that grants a buff should be
  // under it from its first frame, not from 33 ms later.
  foldBuffs(p, 0);
}

function foldBuffs(p, dt) {
  // Start from the resolved baseline (gear, level) and fold the timed buffs on top: a Katana's
  // +10% and Quicken's +30% multiply here and nowhere else.
  let atkSpeed = p.def.atkSpeed ?? 1, miss = 1 - (p.def.dodge ?? 0), crit = p.def.crit ?? 0;
  for (const id in p.buffs) {
    const b = p.buffs[id];
    b.t -= dt;
    if (b.t <= 0) { delete p.buffs[id]; continue; }
    atkSpeed *= b.atkSpeed;
    miss *= 1 - b.dodge;             // independent dodge chances stack as 1 - prod(1 - p)
    crit += b.crit;                  // Quicken's Edge branch; zero on every other buff
  }
  p.atkSpeed = atkSpeed;
  p.dodge = 1 - miss;
  p.crit = Math.min(1, crit);
}

const cost = (p, atk) => atk.mp || 0;
const canCast = (p, id) => {
  const atk = p.def.attacks[id];
  return atk && p.mp >= cost(p, atk) && !(p.cooldowns[id] > 0);
};

export function startAttack(g, p, id) {
  const atk = p.def.attacks[id];
  p.state = 'attack';
  p.stateT = 0;
  p.attack = id;
  p.attackT = 0;
  p.hitLog = atk.hits ? atk.hits.map(() => []) : [];
  p.spawned = atk.spawns ? atk.spawns.map(() => false) : [];
  p.mp -= cost(p, atk);
  if (atk.cd) p.cooldowns[id] = atk.cd;
  if (p.def.skills.includes(id)) { p.holdArmed = false; p.holdAttack = false; }
  if (atk.buff) applyBuff(p, atk.buff, atk.buff.dur * skillDur(p, id));
  p.buf.attack = 0;
  for (const k of SKILL_KEYS) p.buf[k] = 0;
  g.events.push({ type: 'attack', id, hero: p.hero, x: p.x, z: p.z, y: p.y, facing: p.facing });
}

function bufferedSkill(p) {
  for (let i = 0; i < SKILL_KEYS.length; i++) {
    if (p.buf[SKILL_KEYS[i]] > 0) {
      const id = p.def.skills[i];
      if (canCast(p, id)) return id;
      p.buf[SKILL_KEYS[i]] = 0;
      return null;
    }
  }
  return null;
}

function tickTimers(p, input, dt) {
  foldBuffs(p, dt);
  for (const k in p.cooldowns) if (p.cooldowns[k] > 0) p.cooldowns[k] -= dt;
  for (const k in p.buf) if (p.buf[k] > 0) p.buf[k] -= dt;
  if (p.dashCd > 0) p.dashCd -= dt;
  if (p.iframes > 0) p.iframes -= dt;
  if (p.flash > 0) p.flash -= dt;
  if (p.hitstun > 0) p.hitstun -= dt;
  p.mp = Math.min(p.mpMax, p.mp + PLAYER.mpRegen * dt);
  const pr = input.pressed || {};
  // Holding attack keeps swinging: the combo chains at each cancel point and loops from the
  // top, at the rate the attack timeline allows. That is what makes attack speed something
  // the player can feel - with press-to-swing the finger is the bottleneck, and a faster
  // attack only closes the chain window sooner. Single presses still work as they always did.
  // Hold-to-attack is armed by a press and stays armed while the button is held; casting
  // a skill disarms it, so a hand that came off the attack button to reach a skill and a
  // controller whose state froze with "attack" down both stop swinging - the next press
  // (a real edge) arms it again. Deterministic: it is a function of the input stream.
  const heldAttack = !!(input.held && input.held.attack);
  if (pr.attack || (heldAttack && !p.heldAttackPrev)) p.holdArmed = true;   // a press, or the held line rising
  if (!heldAttack) p.holdArmed = false;
  p.heldAttackPrev = heldAttack;
  p.holdAttack = heldAttack && p.holdArmed;
  // A press during an attack is held until that attack's cancel point plus the normal buffer,
  // so mashing early still chains — the belt-scroller feel.
  const untilCancel = p.state === 'attack' ? Math.max(0, p.def.attacks[p.attack].cancelAt - p.attackT) / p.atkSpeed : 0;
  if (pr.attack) p.buf.attack = PLAYER.inputBuffer + untilCancel;
  if (pr.jump) p.buf.jump = PLAYER.inputBuffer;
  if (pr.dash) p.buf.dash = PLAYER.inputBuffer;
  for (const k of SKILL_KEYS) if (pr[k]) p.buf[k] = PLAYER.inputBuffer + untilCancel;
}

function runAttack(g, p, dt) {
  const atk = p.def.attacks[p.attack];
  const t0 = p.attackT;
  // Attack speed is a rate on attack time. Every window - move, hits, spawns, cancel, end -
  // is written in attackT, so this one line is the whole of "swing 30% faster".
  const adt = dt * p.atkSpeed;
  p.attackT += adt;
  const t = p.attackT;

  if (atk.move && t >= atk.move.from && t0 < atk.move.until) {
    p.x += atk.move.speed * p.facing * adt;      // lunge covers the same ground, just quicker
  }
  if (atk.hits) {
    atk.hits.forEach((hit, i) => {
      if (t < hit.at || t0 >= hit.until) return;
      let candidates = g.enemies.filter((e) => !e.dead && !p.hitLog[i].includes(e.id) && boxHits(p, p.facing, hit.box, e, hit.depth));
      if (hit.box.nearest && candidates.length) {
        candidates.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
        candidates = [candidates[0]];
      }
      for (const e of candidates) {
        p.hitLog[i].push(e.id);
        landHit(g, p, e, hit, hit.box.both ? Math.sign(e.x - p.x) || p.facing : p.facing);
      }
    });
  }
  if (atk.spawns) {
    atk.spawns.forEach((s, i) => {
      if (p.spawned[i] || t < s.at) return;
      p.spawned[i] = true;
      g.spawnProjectile({
        owner: 'player', kind: s.kind, x: p.x + p.facing * 0.6, z: p.z, y: p.y + s.y,
        vx: s.speed * p.facing, vy: s.vy || 0, dmg: s.dmg * skillDmg(p, p.attack), knock: s.knock, stun: s.stun,
        life: s.life, pierce: !!s.pierce, facing: p.facing,
      });
    });
  }

  if (atk.air) {
    if (p.grounded) { p.state = 'idle'; p.attack = null; return; }
  }
  if (t >= atk.cancelAt) {
    const skill = bufferedSkill(p);
    if (skill && p.grounded) { startAttack(g, p, skill); return; }
    if (atk.next && (p.buf.attack > 0 || p.holdAttack)) { startAttack(g, p, atk.next); return; }
  }
  if (t >= atk.dur) { p.state = 'idle'; p.attack = null; }
}

export function landHit(g, p, e, hit, dir) {
  const { dmg, crit } = rollDamage(p.atk, hit.dmg * skillDmg(p, p.attack), g.rng, p.crit, p.critDmg);
  const killed = applyHit(e, dmg, hit.knock, hit.stun, dir, e.mass);
  e.facing = -dir || e.facing;
  g.onEnemyHit(e, dmg, crit, killed, p.attack);
}

function move(g, p, input, dt) {
  const h = input.held || {};
  const dx = (h.right ? 1 : 0) - (h.left ? 1 : 0);
  const dz = (h.down ? 1 : 0) - (h.up ? 1 : 0);
  p.moving = dx !== 0 || dz !== 0;
  if (dx) p.facing = dx;
  p.x += dx * p.speed * dt;
  if (p.grounded) p.z += dz * PLAYER.depthSpeed * dt;
  else p.z += dz * PLAYER.depthSpeed * 0.6 * dt;
  p.state = p.grounded ? (p.moving ? 'walk' : 'idle') : 'air';
}

export function updatePlayer(g, p, input, dt) {
  if (p.state === 'dead') { physics(g, p, dt); return; }
  tickTimers(p, input, dt);

  switch (p.state) {
    case 'hurt':
      if (p.hitstun <= 0 && p.grounded) { p.state = 'idle'; p.launched = false; }
      break;
    case 'dash':
      p.stateT += dt;
      p.x += PLAYER.dash.speed * p.facing * dt;
      if (p.stateT >= PLAYER.dash.dur) p.state = 'idle';
      break;
    case 'attack':
      runAttack(g, p, dt);
      break;
    default: {
      move(g, p, input, dt);
      const skill = p.grounded ? bufferedSkill(p) : null;
      if (skill) startAttack(g, p, skill);
      else if (p.buf.attack > 0 || p.holdAttack) startAttack(g, p, p.grounded ? p.def.basic : (p.hero === 'knight' ? 'airSlash' : 'airShot'));
      else if (p.buf.jump > 0 && p.grounded) { p.vy = PLAYER.jumpVel; p.grounded = false; p.buf.jump = 0; p.state = 'air'; g.events.push({ type: 'jump', x: p.x, z: p.z }); }
      else if (p.buf.dash > 0 && p.grounded && p.dashCd <= 0) { p.state = 'dash'; p.stateT = 0; p.dashCd = PLAYER.dash.cd; p.buf.dash = 0; g.events.push({ type: 'dash', x: p.x, z: p.z, facing: p.facing }); }
    }
  }
  physics(g, p, dt);
}

function physics(g, p, dt) {
  // knockback velocity with ground friction; gravity; floor and room bounds
  p.x += p.vx * dt;
  if (p.grounded) p.vx *= Math.max(0, 1 - 9 * dt); else p.vx *= Math.max(0, 1 - 1.5 * dt);
  if (Math.abs(p.vx) < 0.05) p.vx = 0;
  p.vy -= SIM.gravity * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) {
    if (!p.grounded) g.events.push({ type: 'land', x: p.x, z: p.z, hard: p.launched });
    p.y = 0; p.vy = 0; p.grounded = true;
    if (p.state === 'air') p.state = 'idle';
  } else p.grounded = false;
  const b = g.bounds;
  p.x = Math.min(b.xMax, Math.max(b.xMin, p.x));
  p.z = Math.min(FLOOR.zMax, Math.max(FLOOR.zMin, p.z));
}

// Called by the enemy side when one of their attacks connects.
export function hurtPlayer(g, p, dmg, knock, stun, dir) {
  if (p.iframes > 0 || p.state === 'dead') return false;
  // The only line the sim gives up to the test panel (render/test-ui.js). `cheats` is unset
  // in every real run, so this reads as false and the run plays out exactly as it would.
  if (g.cheats?.invuln) return false;
  // Rolled off the run's rng so a dodge is as reproducible as a crit. Only consumes a roll
  // while something grants dodge, so runs without it play out exactly as before.
  if (p.dodge > 0 && g.rng.next() < p.dodge) {
    g.events.push({ type: 'dodge', x: p.x, z: p.z, y: p.y + 1.4 });
    return false;
  }
  applyHit(p, dmg, knock, stun, dir, 1);
  p.iframes = PLAYER.hurt.iframes;
  p.state = 'hurt';
  p.attack = null;
  p.facing = -dir;
  g.events.push({ type: 'playerHurt', dmg, x: p.x, z: p.z, y: p.y + 1 });
  if (p.hp <= 0) { p.state = 'dead'; g.events.push({ type: 'playerDead', x: p.x, z: p.z }); }
  return true;
}
