// Monster views built from primitives (the sibling project's chibi approach), animated from
// the sim state. Humanoids (skeletons, the Orc Lord) use the same limb rig / applyPose as the
// heroes; blobs (Poring, Lunatic) squash and stretch.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { evalClip, walkPose, idlePose, blendTo, applyPose } from './anim.js';

const HALF = Math.PI / 2;

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts });
function mesh(geo, material, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  if (parent) parent.add(m);
  return m;
}
const node = (x, y, z, parent) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

// ------------------------------------------------------------------ blobs

function buildPoring(color = 0xff86b4, radius = 0.39) {
  const root = new THREE.Group();
  const body = node(0, radius, 0, root);
  const skin = mat(color, { roughness: 0.35, transparent: true, opacity: 0.94 });
  mesh(new THREE.SphereGeometry(radius, 20, 16), skin, 0, 0, 0, body);
  const eye = mat(0x1a1016, { roughness: 0.3 });
  mesh(new THREE.SphereGeometry(radius * 0.11, 8, 8), eye, -radius * 0.32, radius * 0.18, radius * 0.86, body);
  mesh(new THREE.SphereGeometry(radius * 0.11, 8, 8), eye, radius * 0.32, radius * 0.18, radius * 0.86, body);
  const glint = mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 });
  mesh(new THREE.SphereGeometry(radius * 0.04, 6, 6), glint, -radius * 0.28, radius * 0.23, radius * 0.95, body);
  mesh(new THREE.SphereGeometry(radius * 0.04, 6, 6), glint, radius * 0.36, radius * 0.23, radius * 0.95, body);
  mesh(new THREE.TorusGeometry(radius * 0.1, radius * 0.03, 6, 10, Math.PI), mat(0x5a1830), 0, -radius * 0.12, radius * 0.94, body).rotation.z = Math.PI;
  return { root, body, kind: 'blob' };
}

function buildLunatic() {
  const v = buildPoring(0xf4f1ea, 0.34);
  const r = 0.34;
  const fur = mat(0xf4f1ea, { roughness: 0.8 });
  const inner = mat(0xf7a6c1, { roughness: 0.9 });
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = node(side * r * 0.4, r * 0.8, 0, v.body);
    mesh(new THREE.CapsuleGeometry(r * 0.16, r * 1.1, 4, 8), fur, 0, r * 0.6, 0, ear);
    mesh(new THREE.BoxGeometry(r * 0.12, r * 0.8, r * 0.05), inner, 0, r * 0.6, r * 0.14, ear);
    ear.rotation.z = -side * 0.25;
    ears.push(ear);
  }
  // red eyes replace the black ones
  v.body.children.filter((c) => c.isMesh && c.material.color.getHex() === 0x1a1016).forEach((c) => { c.material = mat(0xd8323a, { emissive: 0xd8323a, emissiveIntensity: 0.6 }); });
  v.ears = ears;
  return v;
}

// ------------------------------------------------------------------ humanoids

function humanoid({ scale = 1, hip = 1.0, torsoH = 0.7, shoulderW = 0.28, legW = 0.15, skin, joint, buildHead, buildTorso, buildArm, buildLeg }) {
  const root = new THREE.Group();
  const torso = node(0, hip, 0, root);
  buildTorso(torso, torsoH);
  const head = node(0, torsoH + 0.1, 0, torso);
  buildHead(head);
  const armL = node(-shoulderW, torsoH - 0.05, 0, torso);
  const armR = node(shoulderW, torsoH - 0.05, 0, torso);
  buildArm(armL, -1); buildArm(armR, 1);
  const legL = node(-legW, hip, 0, root);
  const legR = node(legW, hip, 0, root);
  buildLeg(legL); buildLeg(legR);
  root.scale.setScalar(scale);
  const rig = { root, torso, head, armL, armR, legL, legR };
  for (const k of ['root', 'torso', 'head']) rig[k].rotation.order = 'YXZ';
  const base = { root: root.position.clone(), torso: torso.position.clone() };
  return { root, rig, base, kind: 'humanoid' };
}

function buildSkeleton({ archer = false } = {}) {
  const bone = mat(0xd9d1c0, { roughness: 0.7 });
  const dark = mat(0x2a2224, { roughness: 0.9 });
  const rust = mat(0x6e4a2c, { roughness: 0.6, metalness: 0.5 });
  return humanoid({
    skin: bone, joint: dark, hip: 0.95, torsoH: 0.7, shoulderW: 0.27, legW: 0.14,
    buildTorso(t, h) {
      mesh(new THREE.BoxGeometry(0.36, 0.16, 0.22), bone, 0, 0.05, 0, t);              // pelvis
      mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 6), bone, 0, h / 2, 0, t);        // spine
      const ribs = mesh(new THREE.BoxGeometry(0.5, 0.42, 0.3), bone, 0, h - 0.22, 0, t);
      for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(0.52, 0.05, 0.32), dark, 0, h - 0.1 - i * 0.13, 0, t);
      mesh(new THREE.BoxGeometry(0.62, 0.08, 0.18), bone, 0, h, 0, t);                 // clavicle
      if (archer) {
        const q = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 8), rust, 0.15, h - 0.3, -0.2, t);
        q.rotation.z = 0.3; q.rotation.x = 0.2;
        mesh(new THREE.ConeGeometry(0.12, 0.6, 5), dark, 0, h + 0.6, -0.02, t).rotation.y = 0.4; // hood tip
      }
      ribs.receiveShadow = true;
    },
    buildHead(hd) {
      mesh(new THREE.SphereGeometry(0.24, 12, 10), bone, 0, 0.2, 0, hd);
      mesh(new THREE.BoxGeometry(0.26, 0.12, 0.2), bone, 0, 0.0, 0.03, hd);
      const socket = mat(0x120d10);
      mesh(new THREE.SphereGeometry(0.06, 8, 8), socket, -0.09, 0.22, 0.2, hd);
      mesh(new THREE.SphereGeometry(0.06, 8, 8), socket, 0.09, 0.22, 0.2, hd);
      const glow = mat(0xff3a2a, { emissive: 0xff3a2a, emissiveIntensity: 2 });
      mesh(new THREE.SphereGeometry(0.025, 6, 6), glow, -0.09, 0.22, 0.24, hd);
      mesh(new THREE.SphereGeometry(0.025, 6, 6), glow, 0.09, 0.22, 0.24, hd);
      if (archer) { const hood = mesh(new THREE.ConeGeometry(0.34, 0.5, 8), dark, 0, 0.42, -0.02, hd); hood.castShadow = true; }
    },
    buildArm(a, side) {
      mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.34, 6), bone, 0, -0.17, 0, a);
      mesh(new THREE.SphereGeometry(0.06, 8, 8), dark, 0, -0.35, 0, a);
      mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.32, 6), bone, 0, -0.52, 0, a);
      mesh(new THREE.SphereGeometry(0.07, 8, 8), bone, 0, -0.7, 0, a);
      if (side === 1 && !archer) { // rusty sword pointing up from the hand
        const w = node(0, -0.7, 0.05, a);
        mesh(new THREE.BoxGeometry(0.07, 0.95, 0.03), rust, 0, 0.55, 0, w);
        mesh(new THREE.BoxGeometry(0.28, 0.05, 0.06), dark, 0, 0.1, 0, w);
        mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), dark, 0, -0.08, 0, w);
      }
      if (side === -1 && archer) { // crude bow, string toward the body
        const w = node(0, -0.7, 0.1, a);
        const limb = mesh(new THREE.TorusGeometry(0.55, 0.03, 6, 14, Math.PI), rust, 0, 0, 0, w);
        limb.rotation.z = HALF; limb.rotation.y = HALF;
        const s = mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.1, 4), mat(0xd8d0c0), 0, 0, -0.02, w);
        s.castShadow = false;
      }
    },
    buildLeg(l) {
      mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.42, 6), bone, 0, -0.21, 0, l);
      mesh(new THREE.SphereGeometry(0.06, 8, 8), dark, 0, -0.44, 0, l);
      mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.4, 6), bone, 0, -0.66, 0, l);
      mesh(new THREE.BoxGeometry(0.14, 0.08, 0.3), bone, 0, -0.9, 0.08, l);
    },
  });
}

function buildOrcLord() {
  const skin = mat(0x5f8a3c, { roughness: 0.8 });
  const dark = mat(0x2e3a1e, { roughness: 0.9 });
  const iron = mat(0x6a6670, { roughness: 0.45, metalness: 0.7 });
  const gold = mat(0xc9962e, { roughness: 0.35, metalness: 0.8 });
  const tusk = mat(0xf0e6c8, { roughness: 0.5 });
  const v = humanoid({
    scale: 1.55, hip: 1.0, torsoH: 0.85, shoulderW: 0.55, legW: 0.24,
    buildTorso(t, h) {
      const belly = mesh(new THREE.SphereGeometry(0.62, 16, 12), skin, 0, 0.35, 0, t);
      belly.scale.set(1, 0.85, 0.85);
      mesh(new THREE.BoxGeometry(1.1, 0.3, 0.7), dark, 0, 0.02, 0, t);       // loincloth belt
      mesh(new THREE.BoxGeometry(1.15, 0.5, 0.8), skin, 0, h - 0.2, 0, t);     // chest
      mesh(new THREE.BoxGeometry(1.2, 0.5, 0.5), iron, 0, h - 0.15, 0.25, t);  // breastplate
      for (const side of [-1, 1]) { const p = mesh(new THREE.SphereGeometry(0.34, 12, 10), iron, side * 0.58, h + 0.02, 0, t); p.scale.set(1, 0.7, 1); }
      const cape = mesh(new THREE.BoxGeometry(1.1, 1.5, 0.06), mat(0x5a1a1a, { roughness: 0.9 }), 0, h - 0.65, -0.42, t);
      cape.castShadow = true;
    },
    buildHead(hd) {
      const skull = mesh(new THREE.SphereGeometry(0.42, 14, 12), skin, 0, 0.32, 0, hd);
      skull.scale.set(1.1, 0.95, 1);
      mesh(new THREE.BoxGeometry(0.6, 0.3, 0.35), skin, 0, 0.08, 0.15, hd);    // jaw
      for (const side of [-1, 1]) {
        const tk = mesh(new THREE.ConeGeometry(0.06, 0.28, 6), tusk, side * 0.2, 0.22, 0.32, hd);
        tk.rotation.x = -0.3; tk.rotation.z = -side * 0.15;
        mesh(new THREE.SphereGeometry(0.06, 8, 8), mat(0xff2a1a, { emissive: 0xff2a1a, emissiveIntensity: 2.5 }), side * 0.17, 0.42, 0.36, hd);
      }
      mesh(new THREE.ConeGeometry(0.2, 0.5, 5), gold, 0, 0.78, 0, hd);          // crown spike
      mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 12), gold, 0, 0.6, 0, hd).rotation.x = HALF;
    },
    buildArm(a, side) {
      mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.55, 8), skin, 0, -0.28, 0, a);
      mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.5, 8), skin, 0, -0.78, 0, a);
      mesh(new THREE.BoxGeometry(0.34, 0.28, 0.34), iron, 0, -1.08, 0, a);
      if (side === 1) { // great axe, blade forward
        const w = node(0, -1.08, 0.1, a);
        mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 8), dark, 0, 0.4, 0, w);
        const blade = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 3), iron, 0, 1.0, 0.2, w);
        blade.rotation.x = HALF; blade.rotation.z = 0.5;
        mesh(new THREE.SphereGeometry(0.09, 8, 8), gold, 0, -0.55, 0, w);
      }
    },
    buildLeg(l) {
      mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.55, 8), skin, 0, -0.28, 0, l);
      mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.4, 8), dark, 0, -0.72, 0, l);
      mesh(new THREE.BoxGeometry(0.32, 0.16, 0.46), iron, 0, -0.98, 0.08, l);
    },
  });
  return v;
}

// ------------------------------------------------------------------ Baphomet (GLB)
// Unlike every other monster here, the boss is the sculpted Blender model, baked into
// limb-segmented GLB by tools/export_heroes.py exactly like the heroes. Each limb is a
// rigid mesh whose origin is its joint, so the same applyPose rig drives it and the boss
// clips below need no changes.
let bossModel = null;

/** Injection seam for the loaded boss model. The render test uses it to supply a stand-in
 *  rig, since GLTFLoader cannot fetch a file in Node. */
export function setBossModel(scene) { bossModel = scene; }

export async function loadMonsterAssets(base = 'assets/monsters/') {
  const gltf = await new GLTFLoader().loadAsync(base + 'baphomet.glb');
  setBossModel(gltf.scene);
  return bossModel;
}

function buildBaphomet() {
  if (!bossModel) throw new Error('baphomet.glb not loaded — call loadMonsterAssets() first');
  // Clone per spawn, materials included: the view mutates emissive for the hit flash and
  // disposes materials on death, so sharing them across a retry would corrupt the model.
  const root = bossModel.clone(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.envMapIntensity = 0.9;
    o.castShadow = true;
    o.receiveShadow = false;
  });
  const rig = { root };
  for (const name of ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'weapon']) {
    const n = root.getObjectByName(name);
    if (n) rig[name] = n;
  }
  for (const k of ['root', 'torso', 'head']) if (rig[k]) rig[k].rotation.order = 'YXZ';
  const base = { root: rig.root.position.clone(), torso: rig.torso.position.clone() };
  return { root, rig, base, kind: 'humanoid' };
}

// Per-type rest offsets, added to every pose. The primitive monsters are modelled standing
// upright so they need none; Baphomet is sculpted already crouched and hunched, and the boss
// clips lean forward on top of that, which pitched him nearly horizontal on the slam.
const EMPTY_REST = {};
const REST = { baphomet: { tx: -0.24, hx: 0.16 } };

const BUILDERS = { poring: () => buildPoring(), lunatic: buildLunatic, skeleton: () => buildSkeleton(), skelArcher: () => buildSkeleton({ archer: true }), orcLord: buildOrcLord, baphomet: buildBaphomet };

// ------------------------------------------------------------------ clips

const CLIPS = {
  walker: {
    windup: [[0, {}], [1, { aRx: -2.2, aRz: 0.35, tx: -0.25, tyaw: 0.45, hx: -0.2, aLx: 0.4 }]],
    attack: [[0, { aRx: -2.2, aRz: 0.3, tx: -0.25, tyaw: 0.45 }], [0.35, { aRx: 1.8, tx: 0.5, tyaw: -0.35, hx: 0.3, lLx: 0.6, lRx: -0.4, aLx: -0.5 }], [1, { aRx: 1.5, tx: 0.4, tyaw: -0.3, lLx: 0.5, lRx: -0.3 }]],
  },
  archer: {
    windup: [[0, {}], [1, { aLx: 1.4, aRx: 1.1, aRy: 0.45, tyaw: 0.3, tx: -0.05 }]],
    attack: [[0, { aLx: 1.4, aRx: 0.7, aRy: 0.5, tyaw: 0.3 }], [0.3, { aLx: 1.5, aRx: 1.5, tyaw: 0.1, tx: 0.1 }], [1, { aLx: 0.9, aRx: 0.9 }]],
  },
  boss: {
    windup: [[0, {}], [1, { aRx: -2.4, aRz: 0.4, tx: -0.3, tyaw: 0.5, hx: -0.25, aLx: 0.5 }]],
    attack: [[0, { aRx: -2.4, aRz: 0.4, tx: -0.3, tyaw: 0.5 }], [0.4, { aRx: 1.7, tx: 0.55, tyaw: -0.4, hx: 0.3, lLx: 0.6, lRx: -0.4, aLx: -0.5 }], [1, { aRx: 1.4, tx: 0.45, tyaw: -0.3 }]],
    slamWindup: [[0, {}], [1, { aLx: -2.9, aRx: -2.9, aLz: 0.3, aRz: -0.3, tx: -0.45, hx: -0.5, ty: 0.15 }]],
    slam: [[0, { aLx: -2.9, aRx: -2.9, tx: -0.45, hx: -0.5, ty: 0.15 }], [0.35, { aLx: 1.5, aRx: 1.5, tx: 0.75, hx: 0.45, ty: -0.4, lLz: 0.35, lRz: -0.35, lLx: 0.4, lRx: 0.4 }], [1, { aLx: 1.3, aRx: 1.3, tx: 0.65, hx: 0.4, ty: -0.35, lLz: 0.3, lRz: -0.3 }]],
    chargeWindup: [[0, {}], [1, { tx: 0.45, ty: -0.2, aLx: -0.9, aRx: -0.9, hx: 0.2, lLx: 0.5, lRx: -0.6 }]],
    charge: [[0, { tx: 0.7, aLx: -0.7, aRx: -0.7, hx: 0.2 }], [1, { tx: 0.75, aLx: -0.8, aRx: -0.8, hx: 0.25 }]],
  },
  hurt: [[0, { tx: -0.5, hx: -0.4, aLx: -0.8, aRx: -0.8, aLz: 0.5, aRz: -0.5, lLx: 0.5, lRx: -0.3 }], [1, { tx: -0.5, hx: -0.4, aLx: -0.8, aRx: -0.8, aLz: 0.5, aRz: -0.5, lLx: 0.5, lRx: -0.3 }]],
  launched: [[0, { rx: -1.1, aLx: -1.4, aRx: -1.4, aLz: 0.6, aRz: -0.6, lLx: 0.8, lRx: 0.5, hx: -0.3 }], [1, { rx: -1.1, aLx: -1.4, aRx: -1.4, aLz: 0.6, aRz: -0.6, lLx: 0.8, lRx: 0.5, hx: -0.3 }]],
  down: [[0, { rx: -1.5, ry: 0.25, aLx: -1.2, aRx: -1.2, aLz: 0.6, aRz: -0.6, lLx: 0.3, lRx: -0.2, hx: -0.3 }], [1, { rx: -1.5, ry: 0.25, aLx: -1.2, aRx: -1.2, aLz: 0.6, aRz: -0.6, lLx: 0.3, lRx: -0.2, hx: -0.3 }]],
};

// ------------------------------------------------------------------ manager

export function createMonsterViews(world) {
  const views = new Map();

  function create(e) {
    const built = BUILDERS[e.type]();
    const group = new THREE.Group();
    group.add(built.root);
    world.scene.add(group);
    const materials = new Set();
    built.root.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) materials.add(m); } });
    for (const m of materials) { m.userData.emissive = m.emissive.clone(); m.userData.opacity = m.opacity; }
    const v = { id: e.id, type: e.type, group, built, materials, cur: {}, scratch: {}, walkPhase: 0, yaw: e.facing * HALF, t: Math.random() * 10, dead: false };
    views.set(e.id, v);
    return v;
  }

  function dispose(v) {
    world.scene.remove(v.group);
    v.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of v.materials) m.dispose();
    views.delete(v.id);
  }

  function updateHumanoid(v, e, dt) {
    const { rig, base } = v.built;
    const rest = REST[e.type] || EMPTY_REST;
    const ai = e.def.ai === 'hopper' ? 'walker' : e.def.ai;
    const clips = CLIPS[ai] || CLIPS.walker;
    let target = v.scratch, rate = 16;
    if (e.dead) {
      target = evalClip(CLIPS.down, 0, v.scratch); rate = 10;
    } else if (e.state === 'hurt') {
      target = evalClip(e.launched || !e.grounded ? CLIPS.launched : CLIPS.hurt, 0, v.scratch); rate = 22;
    } else if (e.state === 'down') {
      target = evalClip(CLIPS.down, 0, v.scratch); rate = 14;
    } else if (e.state === 'windup') {
      const pat = e.move === 'attack' ? e.def.attack : e.def[e.move];
      const clip = clips[e.move === 'attack' ? 'windup' : e.move + 'Windup'] || clips.windup;
      target = evalClip(clip, Math.min(1, e.stateT / pat.windup), v.scratch); rate = 20;
    } else if (e.state === 'attack') {
      const pat = e.move === 'attack' ? e.def.attack : e.def[e.move];
      const clip = clips[e.move] || clips.attack;
      target = evalClip(clip, Math.min(1, e.stateT / pat.dur), v.scratch); rate = 34;
      if (e.move === 'charge') { v.walkPhase += 22 * dt; const w = walkPose(v.walkPhase, 1.1); target.lLx = w.lLx; target.lRx = w.lRx; }
    } else if (e.moving || e.state === 'enter') {
      v.walkPhase += dt * e.def.speed * 2.6;
      target = walkPose(v.walkPhase, e.boss ? 0.8 : 1, v.scratch);
    } else {
      target = idlePose(v.t, v.scratch);
    }
    blendTo(v.cur, target, rate, dt);
    applyPose(rig, base, rest, v.cur, v.yaw);
  }

  function updateBlob(v, e, dt) {
    const { body } = v.built;
    const def = e.def;
    let sy = 1, sxz = 1, lift = 0, lean = 0;
    if (e.dead) {
      const k = Math.min(1, e.deathT / 0.25);
      sy = 1 + 0.6 * k; sxz = 1 + 0.6 * k;
      if (e.deathT > 0.25) { sy = 0; sxz = 0; }
    } else if (e.state === 'windup') {
      const k = Math.min(1, e.stateT / def.attack.windup);
      sy = 1 - 0.3 * k; sxz = 1 + 0.2 * k; lean = -0.2 * k;
    } else if (e.state === 'attack') {
      sy = 0.9; sxz = 1.05; lean = 0.5;
    } else if (e.state === 'hurt' || e.state === 'down') {
      sy = 0.8; sxz = 1.15;
    } else if (e.moving) {
      const ph = (e.hopT % 1);
      const arc = Math.sin(ph * Math.PI);
      lift = def.hop.height * arc;
      sy = 0.86 + 0.34 * arc; sxz = 1.14 - 0.2 * arc;
      lean = 0.15;
    } else {
      const b = Math.sin(v.t * 3);
      sy = 1 + 0.04 * b; sxz = 1 - 0.03 * b;
    }
    v.cur.sy = (v.cur.sy ?? 1) + (sy - (v.cur.sy ?? 1)) * Math.min(1, 24 * dt);
    v.cur.sxz = (v.cur.sxz ?? 1) + (sxz - (v.cur.sxz ?? 1)) * Math.min(1, 24 * dt);
    v.cur.lift = (v.cur.lift ?? 0) + (lift - (v.cur.lift ?? 0)) * Math.min(1, 30 * dt);
    v.cur.lean = (v.cur.lean ?? 0) + (lean - (v.cur.lean ?? 0)) * Math.min(1, 18 * dt);
    body.scale.set(v.cur.sxz, v.cur.sy, v.cur.sxz);
    body.position.y = def.hurtbox.h * 0.5 * v.cur.sy + v.cur.lift;
    body.rotation.set(v.cur.lean, v.yaw, 0);
    if (v.built.ears) for (const ear of v.built.ears) ear.rotation.x = -0.3 * (v.cur.lift / Math.max(0.01, def.hop.height)) - 0.1 * Math.sin(v.t * 4);
  }

  return {
    update(game, dt) {
      const seen = new Set();
      for (const e of game.enemies) {
        seen.add(e.id);
        const v = views.get(e.id) || create(e);
        v.t += dt;
        const yawTarget = e.facing * HALF;
        v.yaw += (yawTarget - v.yaw) * Math.min(1, 14 * dt);
        v.group.position.set(e.x, e.y, e.z);
        if (v.built.kind === 'humanoid') updateHumanoid(v, e, dt); else updateBlob(v, e, dt);

        // hit flash, and the dead sink into the floor and fade
        const flash = e.flash > 0;
        const fade = e.dead ? Math.max(0, 1 - Math.max(0, e.deathT - 0.5) / 0.6) : 1;
        if (e.dead && v.built.kind === 'humanoid') v.group.position.y -= Math.max(0, e.deathT - 0.5) * 0.6;
        for (const m of v.materials) {
          if (flash) m.emissive.setRGB(0.32, 0.28, 0.24); else m.emissive.copy(m.userData.emissive);
          if (fade < 1) { m.transparent = true; m.opacity = m.userData.opacity * fade; }
        }
      }
      for (const v of [...views.values()]) if (!seen.has(v.id)) dispose(v);
    },
    clear() { for (const v of [...views.values()]) dispose(v); },
  };
}
