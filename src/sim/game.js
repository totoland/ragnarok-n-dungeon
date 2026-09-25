// The sim: createGame / update. Owns rooms, waves, spawning, projectiles, the combo counter
// and the event stream. It never imports the renderer and never touches Math.random, so a run
// is fully determined by (hero, seed, input stream). The one channel out is `events`: plain
// records the effects layer drains each frame; the sim never reads them.
import { SIM, FLOOR, PLAYER, DROPS } from '../config.js';
import { DUNGEON } from './data/dungeon.js';
import { createRng } from './rng.js';
import { createPlayer, updatePlayer, hurtPlayer, setLevel } from './player.js';
import { levelFromXp, xpForKill } from './progress.js';
import { mergeMods } from './resolve.js';
import { itemMods, wearMods, isRolled, rollItem } from './data/items.js';
import { createEnemy, updateEnemy } from './enemies.js';
import { boxHits, rollDamage, applyHit, elementMult } from './combat.js';

// The loadout: everything the profile knows that changes the run, fixed when it starts.
//   tier    the town's New Game+ level; every spawn reads it
//   xp      the hero's lifetime total - sets the level, grows per kill, written back by the shell
//   gear    { id, plus } the wielded weapon (data/items.js), folded into the hero's mods
//   wear    { cape, hat, accessory } the worn slots, each { id, plus } or null, folded the same
//   branches { skillId: branchId } the upgrade picked on each skill that reached the cap
//   skills  { skillId: level } spent skill points
//   drop    { item, chance } what the town boss may drop this run; null for nothing
//   mods    extra modifiers on top (tests, the harness); merged after the weapon's
export function createGame({ hero = 'knight', seed = 1, dungeon = DUNGEON, mods, tier = 0, xp = 0, gear = null, wear = null, skills = {}, branches = null, drop = null } = {}) {
  const all = mergeMods(itemMods(gear), ...wearMods(wear), mods);
  const g = {
    t: 0, rng: createRng(seed), seed, dungeon,
    tier, xp, xpStart: xp, mods: all, extMods: mods, gear, wear, drop,
    loot: [],             // what dropped this run: item ids, or rolled instances; the shell banks them
    player: createPlayer(hero, all, levelFromXp(xp), skills, branches),
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
  g.player.gear = gear;
  g.player.wear = wear;
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
        const { dmg, crit } = rollDamage(p.atk, pr.dmg * elementMult(p, e), g.rng, p.crit, p.critDmg);
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
  rollGearProcs(g, e, attackId, killed);
  if (killed) {
    g.kills++;
    g.score += e.def.score * (1 + Math.min(2, g.combo.count / 20));
    pushEvent(g, { type: 'kill', id: e.id, monster: e.type, x: e.x, z: e.z, y: e.y, boss: e.boss, score: e.def.score });
    if (!e.boss) { rollDrop(g, e); rollItemDrops(g, e); }
    else if (g.drop && g.rng.chance(g.drop.chance)) {
      // The boss's weapon. Not a pickup: the room clears and the run ends on the next tick,
      // so it goes straight to the loot list and the renderer stages the moment.
      g.loot.push(g.drop.item);
      pushEvent(g, { type: 'bossDrop', item: g.drop.item, x: e.x, z: e.z, y: e.y });
    }
    gainXp(g, xpForKill(e.def, g.tier));
  }
}

// Change the loadout mid-run: weapon and worn slots are re-merged and the hero re-resolved
// at his level, keeping the same fraction of HP and SP. This is the shell reaching into a
// run (profile panel from the pause menu); a run that does it is no longer (loadout, seed,
// inputs), which is fine for a player and is why the harness never calls it.
const gearKey = (gear, wear) => JSON.stringify([gear?.id ?? null, gear?.plus ?? 0, wear || null]);
export function setGear(g, gear, wear = g.wear) {
  const p = g.player;
  if (gearKey(g.gear, g.wear) === gearKey(gear, wear)) return;
  g.gear = gear;
  g.wear = wear;
  g.mods = mergeMods(itemMods(gear), ...wearMods(wear), g.extMods);
  const hpF = p.hp / p.hpMax, mpF = p.mp / p.mpMax;
  setLevel(p, p.level, g.mods);
  p.hp = Math.max(1, Math.round(hpF * p.hpMax));
  p.mp = Math.round(mpF * p.mpMax);
  p.gear = gear;
  p.wear = wear;
  pushEvent(g, { type: 'equip', item: gear?.id ?? null, plus: gear?.plus ?? 0 });
}

// XP is flat per kill - no combo multiplier, unlike score - so a level is a count of what was
// killed, not of how stylishly. A level-up mid-run re-resolves the hero on the spot and
// refills him, RO style: the boss room is where it tends to happen and where it matters.
function gainXp(g, amount) {
  g.xp += amount;
  const p = g.player;
  const level = levelFromXp(g.xp);
  if (level <= p.level) return;
  setLevel(p, level, g.mods);
  p.hp = p.hpMax; p.mp = p.mpMax;
  pushEvent(g, { type: 'levelUp', level, x: p.x, z: p.z, y: p.y });
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

// What Orvane's gear does. Three rates the resolve step already summed across the weapon and
// every charm worn (sim/resolve.js), rolled here off the run's rng, once per landed hit, the
// same way the hero's own passive is - so a proc is as reproducible as a crit.
//
// Each one is deliberately not allowed to feed itself: a meteor and a doubled hit both land
// through onEnemyHit, and letting them roll again there is a loop that ends in a screenful of
// meteors off one swing. `attackId` carries which is which.
// How wide the ring of ice around the hero reaches, and how long what it catches stays put.
// Weapons that cast a hero skill: [the rate on the player, the attack it fires, its tag].
const SKILL_PROCS = [['magnum', 'magnumBreak', 'autoMagnum'], ['shower', 'arrowShower', 'autoShower']];

// Cold Bolt's reach about the hero. Widened from 2.6 x 1.6 when the wedges were made smaller
// and thrown further out (Toto) - the box has to cover where they are SEEN to land, or a shard
// falls on a monster that takes nothing.
const BOLT_R = { x: 3.8, z: 2.0 };
const FREEZE_SECS = 1.2;

const PROC_FREE = new Set(['autoBlitz', 'autoMeteor', 'autoBolt', 'doubleAttack', 'autoMagnum', 'autoShower']);
function rollGearProcs(g, e, attackId, killed) {
  const p = g.player;
  if (PROC_FREE.has(attackId)) return;
  if (p.spDrain && g.rng.chance(p.spDrain)) {
    const sp = Math.max(1, Math.round(p.mpMax * 0.01));
    p.mp = Math.min(p.mpMax, p.mp + sp);
    pushEvent(g, { type: 'drain', hp: 0, sp, x: p.x, z: p.z, y: p.y + 1.6 });
  }
  // A doubled hit is the same blow landing twice: same damage, no knockback of its own, and
  // nothing if the first one already killed - there is nothing left to hit twice.
  if (!killed && p.double && g.rng.chance(p.double)) {
    const { dmg, crit } = rollDamage(p.atk, elementMult(p, e), g.rng, p.crit, p.critDmg);
    const dir = Math.sign(e.x - p.x) || p.facing;
    const dead = applyHit(e, dmg, 0, 0, dir, e.mass);
    onEnemyHit(g, e, dmg, crit, dead, 'doubleAttack');
  }
  // Undertow: the sea pulling it back down. A knockback with the sign flipped, so it costs
  // the sim nothing new - and no damage of its own, because the point is where the monster
  // ends up, not what it has left.
  if (!killed && p.pull && g.rng.chance(p.pull)) {
    const dir = Math.sign(e.x - p.x) || p.facing;
    applyHit(e, 0, [6, 0], 0.2, -dir, e.mass);
    pushEvent(g, { type: 'undertow', id: e.id, x: e.x, z: e.z, y: e.y + 0.4 });
  }
  if (p.meteor && g.rng.chance(p.meteor)) {
    // It falls, so it lands a moment later and on wherever the target is by then - which is
    // the point of a meteor, and why it goes through the same queue the falcon does.
    g.pending.push({ kind: 'autoMeteor', target: e.id, t: 0.55, x: e.x, z: e.z });
    pushEvent(g, { type: 'autoMeteor', target: e.id, x: e.x, z: e.z, y: e.y });
  }
  // The weapon casting one of the hero's own skills, without his hands or his SP. Unlike
  // every other proc it is not a spell of its own: it borrows the skill's hit box, damage
  // and knockback exactly, which is the whole point - Magnum Break is radial, so it reaches
  // what is standing behind the hero, and Arrow Shower covers a strip he is not facing into.
  //
  // It deliberately does NOT take the hero's skill levels with it. What the weapon casts is
  // the skill; how good the hero is at it is his own business, and a weapon that scaled off
  // a choice made on the skill screen would be better on some builds for reasons nothing
  // written on it explains.
  for (const [rate, skill, tag] of SKILL_PROCS) {
    if (!p[rate] || !g.rng.chance(p[rate])) continue;
    const hit = p.def.attacks?.[skill]?.hits?.[0];
    if (!hit) continue;
    pushEvent(g, { type: tag, x: p.x, z: p.z, y: p.y, facing: p.facing });
    for (const t of g.enemies) {
      if (t.dead || !boxHits(p, p.facing, hit.box, t)) continue;
      const { dmg, crit } = rollDamage(p.atk, hit.dmg, g.rng, p.crit, p.critDmg);
      const dir = Math.sign(t.x - p.x) || p.facing;
      const dead = applyHit(t, dmg, hit.knock, hit.stun, dir, t.mass);
      onEnemyHit(g, t, dmg, crit, dead, tag);
    }
  }
  // Cold Bolt. Not the meteor in another colour: the meteor falls on what was hit, and this
  // falls around the HERO - a ring of ice wedges out of the ceiling, so what it answers is
  // being surrounded rather than what is in front of you. Same tenth of ATK as magic, and it
  // arrives sooner, because an icicle is a smaller thing falling a shorter way than a star.
  if (p.bolt && g.rng.chance(p.bolt)) {
    g.pending.push({ kind: 'autoBolt', t: 0.28, x: p.x, z: p.z });
    pushEvent(g, { type: 'autoBolt', x: p.x, z: p.z, y: p.y });
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
    if (job.kind === 'bossMeteor') {
      // The boss's own. It lands on a spot and hurts whoever is standing there, which is the
      // hero - monsters are not caught in it, because a boss dropping rocks on its own adds
      // reads as a bug however defensible it is.
      pushEvent(g, { type: 'meteor', x: job.x, z: job.z, y: 0, dmg: job.dmg, fire: true });
      const hitHero = Math.abs(p.x - job.x) <= job.r && Math.abs(p.z - job.z) <= job.r * 0.7;
      if (hitHero && !p.dead && hurtPlayer(g, p, job.dmg, [3, 0], 0.25, Math.sign(p.x - job.x) || 1)) {
        pushEvent(g, { type: 'hit', target: 'player', dmg: job.dmg, x: p.x, z: p.z, y: p.y + 1.2, crit: false });
      }
      continue;
    }
    if (job.kind === 'autoMeteor' || job.kind === 'autoBolt') {
      // Magic damage: a tenth of the hero's ATK, and it does not crit and does not knock -
      // it is a star landing on a spot, not a blow the hero threw. The bolt covers a ring
      // around the hero instead of a patch around one monster, so it reaches wider.
      const ice = job.kind === 'autoBolt';
      const dmg = Math.max(1, Math.round(p.atk * 0.1));
      pushEvent(g, { type: ice ? 'coldBolt' : 'meteor', x: job.x, z: job.z, y: 0, dmg });
      const rx = ice ? BOLT_R.x : 1.6, rz = ice ? BOLT_R.z : 1.1;
      for (const e of g.enemies) {
        if (e.dead || Math.abs(e.x - job.x) > rx || Math.abs(e.z - job.z) > rz) continue;
        const dead = applyHit(e, dmg, 0, 0, Math.sign(e.x - job.x) || 1, e.mass);
        onEnemyHit(g, e, dmg, false, dead, job.kind);
        // Freeze rides on magic landing rather than on the swing: a chance, once the spell
        // has actually hit, that what it hit stops. A boss keeps its hyper armour here for
        // the same reason it keeps it against stun - 5% on a target you hit several times a
        // second is not a surprise, it is a lock.
        if (!dead && p.freeze && e.mass < 3 && g.rng.chance(p.freeze)) {
          e.frozen = Math.max(e.frozen || 0, FREEZE_SECS);
          pushEvent(g, { type: 'freeze', id: e.id, x: e.x, z: e.z, y: e.y, secs: FREEZE_SECS });
        }
      }
      continue;
    }
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

// A monster's own drop table (data/monsters.js `drops: [{ item, chance }]`): each entry is
// rolled on its own, and a hit goes straight to the loot list with a small moment on the
// floor, like the boss's weapon. The shell keeps only what the hero can use.
function rollItemDrops(g, e) {
  for (const d of e.def.drops || []) {
    if (!g.rng.chance(d.chance)) continue;
    // An accessory is rolled here, off the same rng, so its attributes are part of the run.
    g.loot.push(isRolled(d.item) ? rollItem(d.item, g.rng) : d.item);
    pushEvent(g, { type: 'itemDrop', item: d.item, monster: e.type, x: e.x, z: e.z, y: e.y });
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
      // A soak room has no last wave. A one-room soak starts its table again; a soak with
      // more than one room walks to the next instead and wraps at the end, so a night of it
      // builds and throws away every room in the game rather than sitting in one of them.
      else if (g.dungeon.soak) {
        if (g.dungeon.rooms.length > 1) {
          const next = (g.roomIndex + 1) % g.dungeon.rooms.length;
          if (!next) g.loops = (g.loops || 0) + 1;
          loadRoom(g, next);
        } else { g.loops = (g.loops || 0) + 1; startWave(g, 0); }
      }
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
