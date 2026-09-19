import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hurtPlayer } from '../src/sim/player.js';
import { createGame, update, EMPTY_INPUT } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { HEROES } from '../src/sim/data/heroes.js';
import { SIM } from '../src/config.js';

const press = (...keys) => ({ held: {}, pressed: Object.fromEntries(keys.map((k) => [k, true])) });
const hold = (...keys) => ({ held: Object.fromEntries(keys.map((k) => [k, true])), pressed: {} });
const steps = (g, n, input = EMPTY_INPUT) => { for (let i = 0; i < n; i++) update(g, input); };

// A room with no waves so nothing interferes; enemies are placed by hand.
const quiet = { rooms: [{ name: 'test', width: 20, waves: [] }] };
const dummy = (g, x, type = 'skeleton') => { const e = createEnemy(g, type, x, 0); e.state = 'chase'; e.cd = 99; g.enemies.push(e); return e; };

test('attack press starts the basic combo and chains on buffered presses', () => {
  const g = createGame({ hero: 'knight', dungeon: quiet });
  update(g, press('attack'));
  assert.equal(g.player.state, 'attack');
  assert.equal(g.player.attack, 'slash1');
  const a = HEROES.knight.attacks.slash1;
  steps(g, Math.ceil(a.cancelAt / SIM.dt));
  update(g, press('attack'));
  assert.equal(g.player.attack, 'slash2', 'press at cancelAt chains');
  steps(g, Math.ceil(HEROES.knight.attacks.slash2.cancelAt / SIM.dt) + 1, EMPTY_INPUT);
  update(g, press('attack'));
  assert.equal(g.player.attack, 'slash3');
  steps(g, 60);
  assert.equal(g.player.state, 'idle', 'slash3 ends the chain');
});

test('an early attack press is buffered into the chain', () => {
  const g = createGame({ hero: 'knight', dungeon: quiet });
  update(g, press('attack'));
  steps(g, 3);
  update(g, press('attack')); // well before cancelAt
  steps(g, 12);
  assert.equal(g.player.attack, 'slash2');
});

test('a slash hits an enemy in front once, not one behind, and builds the combo counter', () => {
  const g = createGame({ hero: 'knight', dungeon: quiet });
  const front = dummy(g, 2.5), behind = dummy(g, 0.2);
  behind.x = -0.5; g.bounds.xMin = -5;
  update(g, press('attack'));
  steps(g, 30);
  assert.ok(front.hp < front.hpMax, 'front enemy took damage');
  assert.equal(behind.hp, behind.hpMax, 'enemy behind is untouched');
  assert.equal(g.combo.count, 1, 'one hit window connects once');
  assert.ok(g.events.some((e) => e.type === 'hit' && e.target === 'enemy'));
});

test('skills cost MP, respect cooldowns and can cancel a basic attack', () => {
  const g = createGame({ hero: 'knight', dungeon: quiet });
  const p = g.player;
  // Whatever sits in slot 1 - it was Bash, it is Quicken now, and the contract is the same.
  const s1 = HEROES.knight.skills[0], def = HEROES.knight.attacks[s1];
  update(g, press('attack'));
  steps(g, Math.ceil(HEROES.knight.attacks.slash1.cancelAt / SIM.dt));
  const mp = p.mp;
  update(g, press('skill1'));
  assert.equal(p.attack, s1, 'skill cancels the basic attack at cancelAt');
  assert.ok(p.mp <= mp - def.mp + 0.1, 'MP deducted');
  assert.ok(p.cooldowns[s1] > def.cd - 0.5);
  steps(g, 60);
  update(g, press('skill1'));
  assert.notEqual(p.attack, s1, 'still on cooldown');
  p.mp = 0; p.cooldowns[s1] = 0;
  update(g, press('skill1'));
  assert.notEqual(p.attack, s1, 'no MP');
});

test('Quicken is a timed attack-speed buff that a recast refreshes', () => {
  const swingSteps = (g) => {
    update(g, press('attack'));
    let n = 0;
    while (g.player.state === 'attack' && n < 200) { steps(g, 1); n++; }
    return n;
  };
  const base = swingSteps(createGame({ hero: 'knight', dungeon: quiet }));

  const g = createGame({ hero: 'knight', dungeon: quiet });
  const p = g.player;
  update(g, press('skill1'));
  assert.equal(p.attack, 'quicken');
  assert.ok(Math.abs(p.atkSpeed - 1.3) < 1e-9, 'buff applies the moment the cast starts');
  while (p.state === 'attack') steps(g, 1);
  const quick = swingSteps(g);
  assert.ok(quick < base * 0.85, `a slash finishes faster under the buff (${quick} vs ${base} steps)`);

  const half = Math.ceil(7 / SIM.dt);
  steps(g, half);
  assert.ok(p.buffs.quicken.t < 8 && p.buffs.quicken.t > 6, 'buff is counting down');
  p.cooldowns.quicken = 0; p.mp = 60;
  update(g, press('skill1'));
  assert.ok(p.buffs.quicken.t > 14.9, 'recast refreshes to the full duration');
  while (p.state === 'attack') steps(g, 1);
  steps(g, Math.ceil(15.2 / SIM.dt));
  assert.equal(p.buffs.quicken, undefined, 'buff expires');
  assert.equal(p.atkSpeed, 1, 'and attack speed returns to normal');
});

test('Wind Walk grants a seeded, roughly 20% dodge that only rolls while it lasts', () => {
  const g = createGame({ hero: 'hunter', dungeon: quiet, seed: 7 });
  const p = g.player;
  const hits = (n) => {
    let landed = 0, dodged = 0;
    for (let i = 0; i < n; i++) {
      p.iframes = 0; p.hp = p.hpMax; p.state = 'idle';
      const before = g.events.filter((e) => e.type === 'dodge').length;
      if (hurtPlayer(g, p, 1, [0, 0], 0, 1)) landed++;
      else if (g.events.filter((e) => e.type === 'dodge').length > before) dodged++;
    }
    return { landed, dodged };
  };
  assert.deepEqual(hits(50), { landed: 50, dodged: 0 }, 'nothing dodges without the buff');

  p.state = 'idle'; p.hitstun = 0; p.iframes = 0;    // the last hit left him reeling
  update(g, press('skill1'));
  assert.equal(p.attack, 'windWalk');
  assert.ok(Math.abs(p.dodge - 0.2) < 1e-9);
  assert.ok(Math.abs(p.atkSpeed - 1.15) < 1e-9);
  const r = hits(400);
  assert.ok(r.dodged > 50 && r.dodged < 110, `about a fifth dodged (${r.dodged}/400)`);
  assert.equal(r.landed + r.dodged, 400);

  // Same seed, same run, same dodges: the roll comes from the run's rng, not Math.random.
  const g2 = createGame({ hero: 'hunter', dungeon: quiet, seed: 7 });
  update(g2, press('skill1'));
  let d2 = 0;
  for (let i = 0; i < 400; i++) { g2.player.iframes = 0; g2.player.hp = g2.player.hpMax; g2.player.state = 'idle'; if (!hurtPlayer(g2, g2.player, 1, [0, 0], 0, 1)) d2++; }
  assert.equal(d2, r.dodged, 'deterministic');
});


test('magnum break launches enemies on both sides', () => {
  const g = createGame({ hero: 'knight', dungeon: quiet });
  g.bounds.xMin = -10; g.player.x = 5;
  const left = dummy(g, 3.5, 'poring'), right = dummy(g, 6.5, 'poring');
  g.player.mp = 60;
  update(g, press('skill2'));
  steps(g, 30);
  assert.ok(left.hp < left.hpMax && right.hp < right.hpMax);
  assert.ok(left.launched || left.y > 0 || left.vy > 0, 'launched');
  assert.ok(left.vx < 0 && right.vx > 0, 'pushed away from the knight on each side');
});

test('hunter arrows fly forward, hit the first enemy and stop; the heavy shot pierces', () => {
  const g = createGame({ hero: 'hunter', dungeon: quiet });
  const near = dummy(g, 4), far = dummy(g, 7);
  update(g, press('attack'));
  steps(g, 40);
  assert.ok(near.hp < near.hpMax, 'near hit');
  assert.equal(far.hp, far.hpMax, 'normal arrow stops at the first target');
  assert.equal(g.projectiles.length, 0, 'arrow consumed');

  const h = createGame({ hero: 'hunter', dungeon: quiet });
  const a = dummy(h, 4), b = dummy(h, 6.5);
  // shoot1 → shoot2 → shoot3 (piercing)
  update(h, press('attack')); steps(h, 13); update(h, press('attack')); steps(h, 13); update(h, press('attack'));
  steps(h, 60);
  assert.ok(a.hp < a.hpMax && b.hp < b.hpMax, 'piercing shot hits both');
});

test('walking, facing and room bounds', () => {
  const g = createGame({ hero: 'knight', dungeon: quiet });
  const x0 = g.player.x;
  steps(g, 30, hold('right'));
  assert.ok(g.player.x > x0 + 2);
  assert.equal(g.player.facing, 1);
  steps(g, 30, hold('left'));
  assert.equal(g.player.facing, -1);
  steps(g, 600, hold('left'));
  assert.equal(g.player.x, 0, 'clamped to the room');
  steps(g, 600, hold('up'));
  assert.ok(g.player.z < 0 && g.player.z >= -2.6, 'depth lanes clamp');
});

test('jump leaves the ground and air attack ends on landing', () => {
  const g = createGame({ hero: 'knight', dungeon: quiet });
  update(g, press('jump'));
  steps(g, 5);
  assert.ok(g.player.y > 0 && !g.player.grounded);
  update(g, press('attack'));
  assert.equal(g.player.attack, 'airSlash');
  steps(g, 120);
  assert.equal(g.player.y, 0);
  assert.equal(g.player.state, 'idle');
});

test('an enemy attack hurts the player once, grants i-frames and kills at 0 hp', () => {
  const g = createGame({ hero: 'knight', dungeon: quiet });
  const e = dummy(g, 2.5);
  e.cd = 0;
  steps(g, 90);
  assert.ok(g.player.hp < g.player.hpMax, 'took damage');
  assert.ok(g.events.some((ev) => ev.type === 'playerHurt'));
  assert.ok(g.player.iframes > 0 || g.player.state === 'hurt' || g.player.state === 'idle');
  g.player.hp = 1; g.player.iframes = 0; e.cd = 0; e.state = 'chase';
  steps(g, 200);
  assert.equal(g.player.state, 'dead');
  assert.equal(g.phase, 'dead');
  assert.ok(g.events.some((ev) => ev.type === 'gameOver'));
});

test('holding attack keeps the combo going at the rate the attacks allow', () => {
  const chain = (atkSpeed, secs) => {
    const g = createGame({ hero: 'knight', dungeon: quiet });
    if (atkSpeed !== 1) g.player.buffs.quicken = { t: 99, atkSpeed, dodge: 0 };
    const seen = [];
    for (let i = 0; i < Math.round(secs / SIM.dt); i++) {
      update(g, hold('attack'));
      for (const e of g.events) if (e.type === 'attack') seen.push(e.id);
      g.events.length = 0;
    }
    return seen;
  };
  const held = chain(1, 3);
  assert.deepEqual(held.slice(0, 4), ['slash1', 'slash2', 'slash3', 'slash1'], 'chains and loops with no presses at all');
  const quick = chain(1.3, 3);
  assert.ok(quick.length > held.length, `Quicken lands more swings in the same time (${quick.length} vs ${held.length})`);
  // A single press still behaves as before: one slash, then idle.
  const g = createGame({ hero: 'knight', dungeon: quiet });
  update(g, press('attack'));
  steps(g, 40);
  assert.equal(g.player.state, 'idle');
});

test("Knight's Soul Drain procs on a share of hits and restores a tenth of max HP and SP", () => {
  const g = createGame({ hero: 'knight', dungeon: quiet, seed: 3 });
  const p = g.player, e = dummy(g, 2.4);
  e.hp = 1e9; e.hpMax = 1e9;
  p.hp = 50; p.mp = 10;
  let hits = 0, drains = 0, firstHeal = null;
  for (let i = 0; i < 4000; i++) {
    const hpBefore = p.hp;
    update(g, hold('attack'));
    for (const ev of g.events) {
      if (ev.type === 'hit' && ev.target === 'enemy') hits++;
      if (ev.type === 'drain') { drains++; if (firstHeal === null) firstHeal = { hp: ev.hp, sp: ev.sp, gained: p.hp - hpBefore }; }
    }
    g.events.length = 0;
    p.hp = Math.min(p.hp, 60); p.mp = Math.min(p.mp, 20);   // stay below max so the heal is visible
    e.hp = 1e9; e.x = 2.4; e.z = 0; e.vx = 0; e.dead = false;   // knockback would walk it out of reach
    e.state = 'chase'; e.hitstun = 0; e.launched = false; e.y = 0; e.vy = 0; e.grounded = true;   // and knockdown would make it unhittable
    p.x = 1.5; p.z = 0; p.vx = 0; p.facing = 1;                  // and the combo's lunge would walk him past it
  }
  assert.ok(hits > 150, `enough hits landed (${hits})`);
  const rate = drains / hits;
  assert.ok(rate > 0.008 && rate < 0.065, `about 3% of hits drain (${drains}/${hits} = ${(rate * 100).toFixed(1)}%)`);
  assert.deepEqual({ hp: firstHeal.hp, sp: firstHeal.sp }, { hp: 15, sp: 6 }, '10% of 150 HP and 60 SP');
  assert.equal(firstHeal.gained, 15, 'the HP actually went up by that much');
});

test("Hunter's Auto Blitz sends the falcon after a share of arrow hits, and the falcon never procs itself", () => {
  const g = createGame({ hero: 'hunter', dungeon: quiet, seed: 5 });
  const p = g.player, e = dummy(g, 4.5);
  e.hp = 1e9; e.hpMax = 1e9;
  let arrowHits = 0, procs = 0, falconHits = 0;
  for (let i = 0; i < 4000; i++) {
    update(g, hold('attack'));
    for (const ev of g.events) {
      if (ev.type === 'hit' && ev.target === 'enemy') { if (ev.attack === 'autoBlitz') falconHits++; else arrowHits++; }
      if (ev.type === 'autoBlitz') procs++;
    }
    g.events.length = 0;
    e.hp = 1e9; e.x = 4.5; e.z = 0; e.vx = 0; e.dead = false;
    e.state = 'chase'; e.hitstun = 0; e.launched = false; e.y = 0; e.vy = 0; e.grounded = true;
    p.x = 1.5; p.z = 0; p.vx = 0; p.facing = 1;                  // shoot3 backsteps into the wall otherwise
  }
  // A proc in the last 0.3s of the loop has not landed yet; let the falcon finish its trip.
  for (let i = 0; i < 20; i++) {
    update(g, EMPTY_INPUT);
    for (const ev of g.events) if (ev.type === 'hit' && ev.target === 'enemy' && ev.attack === 'autoBlitz') falconHits++;
    g.events.length = 0;
    e.hp = 1e9; e.dead = false; e.state = 'chase'; e.hitstun = 0;
  }
  assert.ok(arrowHits > 150, `enough arrows landed (${arrowHits})`);
  const rate = procs / arrowHits;
  assert.ok(rate > 0.008 && rate < 0.065, `about 3% of hits proc (${procs}/${arrowHits} = ${(rate * 100).toFixed(1)}%)`);
  assert.equal(falconHits, procs, 'every proc landed its strike after the delay');

  // Same seed, same story - the proc comes off the run's rng.
  const g2 = createGame({ hero: 'hunter', dungeon: quiet, seed: 5 });
  const e2 = dummy(g2, 4.5); e2.hp = 1e9; e2.hpMax = 1e9;
  let procs2 = 0;
  for (let i = 0; i < 4000; i++) { update(g2, hold('attack')); for (const ev of g2.events) if (ev.type === 'autoBlitz') procs2++; g2.events.length = 0; e2.hp = 1e9; e2.x = 4.5; e2.z = 0; e2.vx = 0; e2.dead = false; e2.state = 'chase'; e2.hitstun = 0; e2.launched = false; e2.y = 0; e2.vy = 0; e2.grounded = true; g2.player.x = 1.5; g2.player.z = 0; g2.player.vx = 0; g2.player.facing = 1; }
  assert.equal(procs2, procs, 'deterministic');
});
