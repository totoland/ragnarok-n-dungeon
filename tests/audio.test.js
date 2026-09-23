// The audio graph has to give back what it takes.
//
// This was the Hunter's lag on the iPad: 59 fps falling to 7 over a minute in one room, with
// the GPU flat and the sim at 0.03 ms. Every sound built nodes and wired them to the
// destination and never disconnected one, and WebKit keeps a connected node in its render
// graph long after it goes silent - so the audio thread walked thousands of dead voices on
// every quantum. Nothing about it shows on a desktop browser, which collects them promptly,
// so it gets a test against a counting context rather than trust in a real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, update } from '../src/sim/game.js';
import { ORVANE } from '../src/sim/data/dungeon.js';
import { xpAtLevel } from '../src/sim/progress.js';

// A stand-in AudioContext that records what it is asked to build, and ends every source as
// soon as it is told to stop - which is when a real one would fire `onended` too.
const stats = { built: 0, disconnected: 0, samples: 0, buffers: 0 };
function node() {
  stats.built++;
  const n = {
    connect: (x) => x || n,
    disconnect() { stats.disconnected++; },
    start() { if (this.buffer) queueEnd(n); },
    stop() { queueEnd(n); },
  };
  n.frequency = n.gain = n.Q = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  return n;
}
const ending = [];
const queueEnd = (n) => ending.push(n);
const flush = () => { while (ending.length) ending.shift().onended?.(); };
globalThis.window = {
  AudioContext: class {
    constructor() { this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.destination = { connect() {} }; }
    createOscillator() { return node(); }
    createGain() { return node(); }
    createBiquadFilter() { return node(); }
    createBufferSource() { return node(); }
    createBuffer(c, n) { stats.buffers++; stats.samples += n; return { getChannelData: () => new Float32Array(n) }; }
    resume() {}
  },
};
const { sfx } = await import('../src/audio.js');

test('every node a fight builds is released when its sound ends', () => {
  sfx.init();
  const g = createGame({ hero: 'hunter', seed: 3, dungeon: ORVANE, xp: xpAtLevel(3) });
  g.cheats = { invuln: true };
  for (let i = 0; g.roomIndex < 1 && i < 7200; i++) { g.enemies.forEach((e) => { e.hp = 0; }); update(g, { held: { right: true }, pressed: {} }); g.events.length = 0; }
  const p = g.player;
  for (let f = 0; f < 60 * 30; f++) {
    const t = g.enemies.filter((e) => !e.dead).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    const held = {};
    if (t && Math.abs(t.x - p.x) > 5) held[t.x > p.x ? 'right' : 'left'] = true;
    update(g, { held, pressed: f % 4 === 0 ? { attack: true } : {} });
    sfx.ctx.currentTime += 1 / 60;
    for (const ev of g.events) sfx.handle(ev);
    g.events.length = 0;
    flush();
  }
  assert.ok(stats.built > 200, `the fight made sound at all (${stats.built} nodes)`);
  assert.equal(stats.disconnected, stats.built, `built ${stats.built}, released ${stats.disconnected}`);
  assert.equal(sfx.voices, 0, 'and no voice is left counted as live');
});

test('noise is synthesised once, not once per hit', () => {
  // Thirty seconds of a fight above played hundreds of hits; the noise behind all of them is
  // one buffer, made on the first. It used to be a fresh buffer filled with Math.random() on
  // the main thread for every single one - 35,000 samples a second in the frame budget.
  assert.equal(stats.buffers, 1, `${stats.buffers} noise buffers were allocated`);
  assert.equal(stats.samples, 48000, 'one second of it, at the context rate');
});

test('a flood of sound is capped rather than stacked', () => {
  const before = stats.built;
  for (let i = 0; i < 500; i++) sfx.tone({ freq: 440, dur: 0.1 });   // none of these end
  const made = stats.built - before;
  assert.ok(made <= 2 * 32, `${made} nodes for 500 calls - the cap held`);
  flush();
  assert.equal(sfx.voices, 0);
});
