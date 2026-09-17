import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  update(g, press('attack'));
  steps(g, Math.ceil(HEROES.knight.attacks.slash1.cancelAt / SIM.dt));
  const mp = p.mp;
  update(g, press('skill1'));
  assert.equal(p.attack, 'bash', 'skill cancels the basic attack at cancelAt');
  assert.ok(p.mp < mp - 9, 'MP deducted');
  assert.ok(p.cooldowns.bash > 1.5);
  steps(g, 60);
  update(g, press('skill1'));
  assert.notEqual(p.attack, 'bash', 'still on cooldown');
  p.mp = 0; p.cooldowns.bash = 0;
  update(g, press('skill1'));
  assert.notEqual(p.attack, 'bash', 'no MP');
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
