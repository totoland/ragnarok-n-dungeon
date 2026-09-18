// Render smoke test: every monster view is built and animated through every state it can reach,
// using Three.js core in Node (no WebGL). Catches builder / clip crashes the sim tests cannot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGame, update } from '../src/sim/game.js';
import { createEnemy } from '../src/sim/enemies.js';
import { MONSTERS } from '../src/sim/data/monsters.js';
import { createMonsterViews, setBossModel } from '../src/render/monsters.js';
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
