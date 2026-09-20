// Render smoke test: every monster view is built and animated through every state it can reach,
// using Three.js core in Node (no WebGL). Catches builder / clip crashes the sim tests cannot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGame, update } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { MONSTERS } from '../src/sim/data/monsters.js';
import { createMonsterViews, setBossModel, setMoonrayaModel, setSandmanModel, CLIPS_BY_TYPE } from '../src/render/monsters.js';
import { evalClip, walkPose, idlePose, blendTo, applyPose } from '../src/render/anim.js';

const world = () => ({ scene: new THREE.Scene() });

// The boss view is backed by assets/monsters/baphomet.glb, and GLTFLoader cannot fetch a
// file in Node. Stand in a rig with the same node names and joint hierarchy so the builder,
// the pose rig and the dispose path all get exercised for real.
function stubBossModel() {
  const mk = (name, parent, y = 0) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.y = y;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial()));
    parent.add(g);
    return g;
  };
  const root = new THREE.Group();
  root.name = 'root';
  const torso = mk('torso', root, 1.5);
  mk('head', torso, 0.9);
  const armL = mk('armL', torso, 0.7);
  mk('weapon', armL, -0.4);
  mk('armR', torso, 0.7);
  mk('legL', root, 1.5);
  mk('legR', root, 1.5);
  return root;
}
setBossModel(stubBossModel());
// Moonraya is a sculpt too, and has the same limb names, so the same stand-in serves.
setMoonrayaModel(stubBossModel());
// The Sandman is a sculpt too. He has no legs, but a stand-in with them still exercises the
// builder and the pose path - applyPose only touches the limbs the rig actually has.
setSandmanModel(stubBossModel());

test('every monster type builds, walks, winds up, attacks, gets hurt, launched and dies without throwing', () => {
  const w = world();
  const views = createMonsterViews(w);
  const g = createGame({ hero: 'knight', dungeon: { rooms: [{ name: 't', width: 20, waves: [] }] } });
  g.player.x = 6;
  let x = 8;
  for (const type of Object.keys(MONSTERS)) { const e = createEnemy(g, type, x, 0); e.state = 'chase'; e.cd = 0.2; g.enemies.push(e); x += 2.5; }
  // let them approach and attack, mashing the knight's combo and skills so hurt/launch happen
  for (let i = 0; i < 60 * 12; i++) {
    const pressed = { attack: i % 6 === 0, skill2: i % 200 === 100, skill1: i % 150 === 50 };
    update(g, { held: {}, pressed });
    views.update(g, 1 / 60);
    if (i === 400) for (const e of g.enemies) if (!e.boss) e.hp = 0; // kill the pack, corpses fade
  }
  const states = new Set();
  for (let i = 0; i < 60 * 4; i++) { update(g, { held: {}, pressed: {} }); views.update(g, 1 / 60); for (const e of g.enemies) states.add(e.state); }
  assert.ok(w.scene.children.length >= 1, 'boss view still in the scene');
  views.clear();
  assert.equal(w.scene.children.length, 0, 'clear() removes every view');
});

test('poses evaluate and apply cleanly on a rig', () => {
  const rig = { root: new THREE.Group(), torso: new THREE.Group(), head: new THREE.Group(), armL: new THREE.Group(), armR: new THREE.Group(), legL: new THREE.Group(), legR: new THREE.Group(), cape: new THREE.Group(), weapon: new THREE.Group() };
  const base = { root: new THREE.Vector3(), torso: new THREE.Vector3(0, 1, 0) };
  const clip = [[0, {}], [0.5, { aLx: 1, tx: 0.3 }], [1, {}]];
  const cur = {};
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const target = evalClip(clip, t, {});
    blendTo(cur, target, 20, 1 / 60);
    applyPose(rig, base, { aLy: 1.57 }, cur, 1.57);
  }
  assert.ok(Math.abs(rig.armL.rotation.y - 1.57) < 1e-9, 'rest pose is additive');
  const w = walkPose(1.2);
  assert.ok(w.lLx * w.lRx < 0, 'legs alternate');
  assert.ok(w.cx > 0, 'cape streams back while walking');
  assert.ok(Object.keys(idlePose(3)).length > 0);
});

test("baphomet's cast sweeps the arm that actually holds the scythe", () => {
  // The shared `boss` clips drive aRx, because the Orc Lord's axe is in his right hand.
  // Baphomet's scythe hangs off armL, so a clip that only swings aRx reads as a boss
  // standing still while a spell comes out of nowhere - which is exactly what shipped once.
  // Retargeted motion is no protection against that: assert the weapon arm travels.
  const clips = CLIPS_BY_TYPE.baphomet;
  const arc = (name, ch) => {
    const vals = [];
    for (let t = 0; t <= 1.0001; t += 0.05) vals.push(evalClip(clips[name], t, {})[ch] ?? 0);
    return Math.max(...vals) - Math.min(...vals);
  };
  for (const name of ['castWindup', 'cast']) {
    assert.ok(arc(name, 'aLx') > 1.0, `${name} swings the scythe arm (got ${arc(name, 'aLx')})`);
  }
  // The gather has to pass over the head rather than swing backwards through the body,
  // which is the whole reason those keys are allowed past pi.
  const peak = evalClip(clips.castWindup, 1, {}).aLx;
  assert.ok(peak > Math.PI, `wind-up carries the scythe over the top (got ${peak})`);
});

test('the spin slam closes on a whole turn, so dropping ryaw is invisible', () => {
  // updateHumanoid takes ryaw raw rather than blended, because easing it out would unwind
  // most of a revolution in a tenth of a second. That is only safe while the clip ends on a
  // multiple of 2*PI - retime the slam and this is what catches it.
  const end = evalClip(CLIPS_BY_TYPE.baphomet.slam, 1, {}).ryaw;
  assert.ok(Math.abs(Math.abs(end) - 2 * Math.PI) < 0.02, `slam ends on a full turn (got ${end})`);
  assert.equal(evalClip(CLIPS_BY_TYPE.baphomet.slamWindup, 0, {}).ryaw ?? 0, 0, 'and opens at zero');
  // Nothing else may use the channel yet: the raw hand-off is only reasoned about for slam.
  for (const [name, clip] of Object.entries(CLIPS_BY_TYPE.baphomet)) {
    if (name === 'slam' || name === 'slamWindup') continue;
    assert.equal(clip[0][0], 0, `${name} opens at t=0`);
    for (const [, pose] of clip) assert.equal(pose.ryaw ?? 0, 0, `${name} leaves ryaw alone`);
  }
});

test('the looping clips meet themselves', () => {
  // walk and idle are driven by a phase that wraps, so a first key that does not match the
  // last one is a visible hitch once per cycle rather than a number that is slightly off.
  for (const name of ['walk', 'idle']) {
    const clip = CLIPS_BY_TYPE.baphomet[name];
    const a = evalClip(clip, 0, {}), b = evalClip(clip, 1, {});
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      assert.ok(Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1e-9, `${name}.${k} closes the loop`);
    }
  }
});
