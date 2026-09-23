// Monster views built from primitives (the sibling project's chibi approach), animated from
// the sim state. Humanoids (skeletons, the Orc Lord) use the same limb rig / applyPose as the
// heroes; blobs (Poring, Lunatic) squash and stretch.
import * as THREE from 'three';
import { WARM_X, WARM_Z } from './scene.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { evalClip, walkPose, idlePose, blendTo, applyPose } from './anim.js';

const HALF = Math.PI / 2;
// Scratch colours for the rage tint, made once rather than per material per frame.
let RAGE_A = null, RAGE_B = null, FROST = null;
const TAU = Math.PI * 2;
// Seconds per cycle for the `idle` clips in CLIPS_BY_TYPE, i.e. their source duration.
const IDLE_SECS = 1.93;

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

function buildSkeleton({ archer = false, boneColor = 0xd9d1c0, clothColor = 0x6e4a2c } = {}) {
  const bone = mat(boneColor, { roughness: 0.7 });
  const dark = mat(0x2a2224, { roughness: 0.9 });
  const rust = mat(clothColor, { roughness: 0.6, metalness: 0.5 });
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
let moonModel = null;
let sandModel = null;
let dsModel = null;
let nerModel = null;

/** Injection seam for the loaded boss model. The render test uses it to supply a stand-in
 *  rig, since GLTFLoader cannot fetch a file in Node. */
export function setBossModel(scene) { bossModel = scene; }
export function setMoonrayaModel(scene) { moonModel = scene; }
export function setSandmanModel(scene) { sandModel = scene; }
export function setDarkSwordModel(scene) { dsModel = scene; }
export function setNerakosModel(scene) { nerModel = scene; }

export async function loadMonsterAssets(base = 'assets/monsters/') {
  const loader = new GLTFLoader();
  const [baph, moon, sand, ds, ner] = await Promise.all([
    loader.loadAsync(base + 'baphomet.glb'),
    loader.loadAsync(base + 'moonraya.glb'),
    loader.loadAsync(base + 'sandman.glb'),
    loader.loadAsync(base + 'darkSword.glb'),
    loader.loadAsync(base + 'nerakos.glb'),
  ]);
  setBossModel(baph.scene);
  setMoonrayaModel(moon.scene);
  setSandmanModel(sand.scene);
  setDarkSwordModel(ds.scene);
  setNerakosModel(ner.scene);
  return bossModel;
}

/** A GLB boss becomes a rig the same way whichever sculpt it is: clone per spawn, materials
 *  included, because the view mutates emissive for the hit flash and would otherwise corrupt
 *  the source model on the next retry. */
function rigFromGlb(model, { scale = 1, darken = 0 } = {}) {
  const root = model.clone(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.envMapIntensity = 0.9;
    o.castShadow = true;
    o.receiveShadow = false;
    if (darken) o.material.color.multiplyScalar(1 - darken);
  });
  const rig = { root };
  for (const name of ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'weapon', 'shards', 'tentacles']) {
    const n = root.getObjectByName(name);
    if (n) rig[name] = n;
  }
  for (const k of ['root', 'torso', 'head']) if (rig[k]) rig[k].rotation.order = 'YXZ';
  if (scale !== 1) root.scale.setScalar(scale);
  return { root, rig, base: { root: rig.root.position.clone(), torso: rig.torso.position.clone() }, kind: 'humanoid' };
}

function buildBaphomet(scale = 1, darken = 0) {
  if (!bossModel) throw new Error('baphomet.glb not loaded - call loadMonsterAssets() first');
  // Minions are the same sculpt, so they need a tonal shift or the player cannot tell at a
  // glance which silhouette is the one with 880 HP.
  return rigFromGlb(bossModel, { scale, darken });
}

function buildMoonrayaGlb() {
  if (!moonModel) throw new Error('moonraya.glb not loaded - call loadMonsterAssets() first');
  return rigFromGlb(moonModel);
}

function buildSandmanGlb() {
  if (!sandModel) throw new Error('sandman.glb not loaded - call loadMonsterAssets() first');
  return rigFromGlb(sandModel);
}

function buildDarkSwordGlb() {
  if (!dsModel) throw new Error('darkSword.glb not loaded - call loadMonsterAssets() first');
  return rigFromGlb(dsModel);
}

function buildNerakosGlb() {
  if (!nerModel) throw new Error('nerakos.glb not loaded - call loadMonsterAssets() first');
  return rigFromGlb(nerModel);
}

// Per-type rest offsets, added to every pose, for a sculpt that does not stand the way the
// clips assume. The old Baphomet was modelled crouched and hunched and needed the lean taken
// back out of him; the ram samurai that replaced him stands upright like everything else, so
// he needs nothing and the offsets are gone with the sculpt they corrected.
const EMPTY_REST = {};
const REST = {};

// The shared `boss` clips swing aRx, because the Orc Lord carries his axe in the right hand.
// Baphomet's scythe is parented to armL, so those clips swung an empty arm and the attack
// read as no animation at all. These drive the arm that actually holds the weapon.
export const CLIPS_BY_TYPE = {
  // Nerakos. Every other boss is posed through his arms; this one has none, so the motion
  // is the trunk, the head, and the trident turning about the fist that never lets go of it.
  // The numbers are small on purpose: his torso pivot is the waist of a figure whose legs
  // are welded to it, so a lean is the whole body tipping and 0.2 is already a long way.
  nerakos: {
    // The thrust. He drops his weight onto the leading side and drives the fork out; the
    // trident turns about the grip, which is exactly what a hand holding a haft does.
    windup: [[0, {}], [1, { tx: -0.16, tyaw: 0.24, ty: 0.06, hx: -0.14, wx: -0.30, wz: 0.10 }]],
    attack: [
      [0, { tx: -0.16, tyaw: 0.24, ty: 0.06, hx: -0.14, wx: -0.30, wz: 0.10 }],
      [0.35, { tx: 0.20, tyaw: -0.14, ty: -0.05, hx: 0.16, wx: 0.55, wz: -0.06 }],
      [1, { tx: 0.15, tyaw: -0.10, ty: -0.03, hx: 0.12, wx: 0.46, wz: -0.04 }],
    ],
    // The temple sweep is the tentacles, which are driven in update() - here the body only
    // has to look like it is throwing them: gather down and low, then rise through it.
    slamWindup: [[0, {}], [1, { tx: -0.20, ty: -0.22, hx: -0.26, wx: -0.16 }]],
    slam: [
      [0, { tx: -0.20, ty: -0.22, hx: -0.26, wx: -0.16 }],
      [0.4, { tx: 0.10, ty: 0.20, hx: 0.22, wx: 0.12, tz: 0.06 }],
      [1, { tx: 0.06, ty: 0.12, hx: 0.16, wx: 0.08 }],
    ],
    // The drowned bell. He lifts the haft and shakes it, and the bell chained under the fork
    // does the rest - so the tell is a raised trident and a head thrown back, not a swing.
    castWindup: [[0, {}], [1, { ty: 0.16, hx: -0.34, wx: -0.22, wz: 0.16 }]],
    cast: [
      [0, { ty: 0.16, hx: -0.34, wx: -0.22, wz: 0.16 }],
      [0.3, { ty: 0.20, hx: -0.20, wx: -0.10, wz: -0.14 }],
      [0.6, { ty: 0.18, hx: -0.24, wx: -0.18, wz: 0.12 }],
      [1, { ty: 0.10, hx: -0.12, wx: -0.12, wz: -0.04 }],
    ],
    chargeWindup: [[0, {}], [1, { tx: -0.22, ty: -0.10, hx: -0.16, wx: -0.24 }]],
    charge: [[0, { tx: 0.26, hx: 0.12, wx: 0.30 }], [1, { tx: 0.30, hx: 0.14, wx: 0.34 }]],
  },
  baphomet: {
    // Mixamo "Standing Melee Attack Downward", frames 7:33, gain legs=0.6,hy=0.25,tz=0.4,tyaw=0.55.
    // The scythe goes up over the shoulder while the torso winds the other way, then the
    // whole body unwinds through the chop, which is the part a hand-authored swing never
    // has the patience to key. Mixamo's own twist reaches 54 degrees; it is held to 0.55 of
    // that because the hit box stays along X, and a boss who turns that far out of the fight
    // plane stops agreeing with where he is actually swinging.
    windup: [
      [0, { tx: 0.05, tyaw: -0.08, hx: 0.02, hy: 0.26, aLx: 0.72, aLz: -0.87, aRx: 0.11, aRz: 0.74, lLx: -0.06, lLz: -0.30, lRx: 0.01, lRz: 0.17 }],
      [0.286, { tx: -0.05, tyaw: -0.23, tz: 0.05, hx: -0.05, hy: 0.24, aLx: 2.81, aLz: -1.00, aRx: -0.22, aRz: 0.96, lLx: -0.12, lLz: -0.32, lRz: 0.13 }],
      [0.429, { tx: -0.10, tyaw: -0.23, tz: 0.05, hx: -0.05, hy: 0.24, aLx: 3.20, aLz: -0.82, aRx: -0.22, aRz: 1.02, lLx: -0.20, lLz: -0.30, lRz: 0.11 }],
      [0.786, { tx: -0.18, tyaw: -0.09, ty: 0.08, hx: -0.19, hy: 0.16, aLx: 3.51, aLz: -0.65, aRx: -0.06, aRz: 0.96, lLx: -0.36, lLz: -0.17, lRx: 0.11 }],
      [1, { tx: 0.08, tyaw: 0.08, tz: -0.04, ty: 0.08, hx: -0.12, hy: 0.08, aLx: 3.74, aLz: -0.68, aRx: 0.27, aRz: 0.78, lLx: -0.39, lLz: -0.08, lRx: 0.15, lRz: -0.03 }],
    ],
    attack: [
      [0, { tx: 0.08, tyaw: 0.08, tz: -0.04, ty: 0.08, hx: -0.12, hy: 0.08, aLx: 3.74, aLz: -0.68, aRx: 0.27, aRz: 0.78, lLx: -0.39, lLz: -0.08, lRx: 0.15, lRz: -0.03 }],
      [0.25, { tx: 0.37, tyaw: 0.17, hx: 0.08, aLx: 2.82, aLz: -0.94, aRx: 0.14, aRz: 0.47, lLx: -0.40, lRx: 0.19, lRz: -0.07 }],
      [0.417, { tx: 0.55, tyaw: 0.26, hx: 0.11, aLx: 1.59, aLz: -0.67, aRx: -0.06, aRz: 0.47, lLx: -0.39, lLz: -0.06, lRx: 0.19 }],
      [0.583, { tx: 0.70, tyaw: 0.38, tz: 0.06, hx: 0.11, hy: 0.06, aLx: 1.22, aLz: -0.11, aRx: -0.12, aRz: 0.39, lLx: -0.41, lRx: 0.19 }],
      [1, { tx: 0.83, tyaw: 0.52, tz: 0.23, ty: -0.03, hx: -0.07, hy: 0.02, aLx: 1.49, aLz: 0.24, aRx: -0.25, aRz: 0.28, lLx: -0.43, lLz: 0.13, lRx: 0.19, lRz: -0.06 }],
    ],
    // Mixamo "Unarmed Idle", the full 58-frame cycle, --centre all. Centring matters more
    // here than anywhere else: the mannequin rests with its torso turned 9 degrees and its
    // arms out 17, and beside 15 degrees of actual breathing that stance IS the pose. What
    // is left is the breath alone, which then layers onto the stance Baphomet is sculpted
    // in. It is still three to five times the motion idlePose's sines gave him.
    idle: [
      [0, { tx: 0.06, ty: -0.01, hx: -0.10, hy: 0.01, aLx: 0.04, aLz: 0.02, aRx: 0.09, lLx: 0.01 }],
      [0.211, { tx: -0.03, hy: -0.01, aLx: -0.06, aRx: 0.03, aRz: -0.02 }],
      [0.439, { tx: -0.08, ty: 0.01, hx: 0.15, aLx: -0.07, aLz: -0.02, aRx: -0.10, aRz: -0.03, lLx: -0.01, lRx: -0.01 }],
      [0.579, { tx: -0.03, hx: 0.07, aLx: 0.01, aLz: -0.01, aRx: -0.08, aRz: 0.01 }],
      [0.667, { tx: 0.02, aLx: 0.05, aRx: -0.04, aRz: 0.03 }],
      [0.825, { tx: 0.06, ty: -0.01, hx: -0.09, hy: 0.01, aLx: 0.07, aLz: 0.01, aRx: 0.04, aRz: 0.03, lLx: 0.01 }],
      [1, { tx: 0.06, ty: -0.01, hx: -0.10, hy: 0.01, aLx: 0.04, aLz: 0.02, aRx: 0.09, lLx: 0.01 }],
    ],
    // Mixamo "Walking", the full 32-frame cycle, gain ty=0.5,hy=0.4. Frame 32 is a copy of
    // frame 1, so the first and last keys match and the loop closes without a seam.
    walk: [
      [0, { tx: 0.23, tyaw: -0.11, tz: 0.02, hx: -0.06, hy: 0.05, aLx: 0.39, aLz: -0.21, aRx: 0.11, aRz: 0.18, lLx: -0.10, lLz: 0.02, lRx: -0.16, lRz: -0.01 }],
      [0.161, { tx: 0.20, tyaw: 0.10, hx: -0.09, aLx: 0.72, aLz: -0.22, aRx: -0.25, aRz: 0.18, lLx: -0.40, lRx: 0.46, lRz: 0.05 }],
      [0.355, { tx: 0.13, tyaw: 0.11, tz: -0.04, hx: -0.06, aLx: 0.37, aLz: -0.28, aRx: -0.09, aRz: 0.25, lLx: -0.67, lLz: -0.05, lRx: 0.18 }],
      [0.452, { tx: 0.14, tyaw: -0.07, hx: -0.06, hy: 0.04, aLx: 0.20, aLz: -0.27, aRx: 0.21, aRz: 0.21, lLx: -0.41, lRz: -0.05 }],
      [0.71, { tx: 0.19, tyaw: -0.40, hx: -0.07, hy: 0.12, aLx: -0.17, aLz: -0.26, aRx: 0.83, lLx: 0.38, lLz: -0.06, lRx: -0.51, lRz: 0.04 }],
      [0.871, { tx: 0.18, tyaw: -0.32, hx: -0.08, hy: 0.11, aLx: 0.07, aLz: -0.29, aRx: 0.49, aRz: 0.14, lLx: 0.13, lRx: -0.65, lRz: 0.05 }],
      [1, { tx: 0.23, tyaw: -0.11, tz: 0.02, hx: -0.06, hy: 0.05, aLx: 0.39, aLz: -0.21, aRx: 0.11, aRz: 0.18, lLx: -0.10, lLz: 0.02, lRx: -0.16, lRz: -0.01 }],
    ],
    // Mixamo "Standing Melee Attack 360 Low", frames 1:51, split 0.32,
    // gain legs=0.6,hy=0.3,tz=0.5,ryaw=1.076.
    //
    // slam's box is `both: true`, which combat.js reads as radial - 3.1 units either side of
    // him. Every hand-authored version of this was a forward overhead smash, so the picture
    // and the hit box never agreed. A spin sweep is what that box actually describes.
    //
    // ryaw turns the root, so the hooves come round with him. The 1.076 on it stretches the
    // source's 335 degrees onto a whole 360: the last key is exactly -2*PI, which is the
    // same orientation as 0, so updateHumanoid can drop the channel the moment the clip ends
    // without anything moving. Retime this and that has to be re-normalised.
    slamWindup: [
      [0, { ryaw: 0.00, tx: 0.30, tyaw: 0.28, tz: -0.04, hx: -0.05, hy: 0.17, aLx: 0.27, aLz: -0.57, aRx: 0.58, aRz: 0.52, lLx: -0.09, lLz: -0.26, lRx: 0.08, lRz: 0.20 }],
      [0.188, { tx: 0.34, tyaw: 0.27, hx: -0.08, hy: 0.14, aLx: 0.25, aLz: -0.71, aRx: 0.70, aRz: 0.59, lLx: -0.08, lLz: -0.28, lRx: 0.11, lRz: 0.12 }],
      [0.312, { ryaw: -0.05, tx: 0.41, tyaw: 0.20, tz: -0.05, hx: -0.15, hy: 0.06, aLx: 0.51, aLz: -0.78, aRx: 0.77, aRz: 0.50, lLz: -0.32, lRx: 0.12 }],
      [0.438, { ryaw: -0.40, tx: 0.43, tyaw: 0.11, tz: -0.14, hx: -0.17, hy: -0.05, aLx: 0.92, aLz: -0.53, aRx: 0.82, aRz: 0.34, lLx: 0.13, lLz: -0.34, lRx: 0.09 }],
      [0.5, { ryaw: -0.55, tx: 0.38, tz: -0.19, hx: -0.15, hy: -0.11, aLx: 1.11, aLz: -0.34, aRx: 0.87, aRz: 0.22, lLx: 0.19, lLz: -0.37, lRx: 0.09 }],
      [0.688, { ryaw: -0.74, tx: 0.22, tyaw: -0.27, tz: -0.22, ty: 0.05, hx: -0.15, hy: -0.24, aLx: 1.68, aLz: 0.10, aRx: 1.20, aRz: -0.33, lLx: 0.12, lLz: -0.56, lRx: 0.11, lRz: -0.12 }],
      [0.938, { ryaw: -1.40, tx: -0.12, tyaw: -0.19, tz: -0.15, ty: 0.17, hx: -0.28, hy: -0.17, aLx: 2.05, aLz: 0.62, aRx: 1.39, aRz: -0.78, lLx: 0.10, lLz: -0.62, lRx: 0.09, lRz: -0.15 }],
      [1, { ryaw: -1.62, tx: -0.21, tyaw: -0.16, tz: -0.12, ty: 0.20, hx: -0.28, hy: -0.15, aLx: 2.09, aLz: 0.67, aRx: 1.47, aRz: -0.88, lLx: 0.12, lLz: -0.57, lRx: 0.09, lRz: -0.14 }],
    ],
    slam: [
      [0, { ryaw: -1.62, tx: -0.21, tyaw: -0.16, tz: -0.12, ty: 0.20, hx: -0.28, hy: -0.15, aLx: 2.09, aLz: 0.67, aRx: 1.47, aRz: -0.88, lLx: 0.12, lLz: -0.57, lRx: 0.09, lRz: -0.14 }],
      [0.176, { ryaw: -3.33, tx: -0.44, tyaw: 0.05, tz: 0.21, ty: 0.18, hx: -0.19, hy: -0.06, aLx: 1.98, aLz: 0.58, aRx: 1.16, aRz: -0.96, lLx: 0.06, lLz: -0.15, lRz: 0.04 }],
      [0.265, { ryaw: -4.13, tx: 0.10, tyaw: -0.06, tz: 0.25, ty: 0.06, hx: 0.40, hy: -0.12, aLx: 1.73, aLz: 0.36, aRx: 0.87, aRz: -0.12, lLx: 0.12, lLz: -0.09, lRz: 0.19 }],
      [0.412, { ryaw: -4.66, tx: 1.01, tyaw: 0.24, tz: 0.31, ty: -0.13, hy: -0.16, aLx: 0.74, aLz: -1.21, aRx: 0.15, aRz: 0.76, lLx: 0.22, lRx: -0.10, lRz: 0.26 }],
      [0.471, { ryaw: -4.78, tx: 1.20, tyaw: 0.05, tz: 0.23, ty: -0.10, hx: -0.09, hy: -0.14, aLx: -0.24, aLz: -1.01, aRx: -0.31, aRz: 0.62, lLx: 0.19, lRx: -0.16, lRz: 0.24 }],
      [0.559, { ryaw: -5.06, tx: 1.00, tyaw: -0.23, hx: -0.22, hy: -0.17, aLx: -0.71, aLz: -0.71, aRx: -0.51, aRz: 0.73, lLx: 0.15, lRx: -0.24, lRz: 0.16 }],
      [0.853, { ryaw: -5.73, tx: 0.40, tyaw: -0.11, tz: -0.06, ty: 0.12, hx: -0.10, hy: -0.07, aLx: -0.87, aLz: -1.02, aRx: 0.90, aRz: 0.97, lLx: 0.13, lRx: -0.07 }],
      [1, { ryaw: -6.28, tx: 0.21, tyaw: 0.09, tz: -0.06, ty: 0.16, hx: -0.03, hy: 0.03, aLx: 0.24, aLz: -1.12, aRx: 0.84, aRz: 0.87, lLx: 0.02, lLz: -0.08, lRx: -0.02, lRz: -0.02 }],
    ],
    chargeWindup: [[0, {}], [1, { tx: 0.4, ty: -0.15, aLx: -0.8, aRx: -0.7, hx: 0.25, lLx: 0.5, lRx: -0.6 }]],
    charge: [[0, { tx: 0.65, aLx: -0.6, aRx: -0.6, hx: 0.25 }], [1, { tx: 0.7, aLx: -0.7, aRx: -0.65, hx: 0.3 }]],
    // Retargeted from Mixamo's "Standing 2H Magic Attack 01" by tools/mixamo_to_clip.py:
    //   tools/mixamo_to_clip.sh <fbx> --name cast --range 11:44 --gain legs=0.6,tz=0.5
    // Both hands gather the scythe up and over the head, then drive it forward with the
    // body lunging after it. The melee wind-up swings the same arm back and *down*, so the
    // two tells still read apart at a glance.
    //
    // aLx/aRx run past pi on purpose: the keys are interpolated as plain numbers, so 3.90
    // sweeps the arm up over the front, while the equivalent -2.38 would swing it backwards
    // through the body. Do not "simplify" these into range.
    castWindup: [
      [0, { tx: 0.50, tyaw: -0.08, tz: -0.25, hx: -0.55, hy: -0.06, aLx: 0.91, aLz: -1.09, aRx: 1.40, aRz: 0.07, lLx: -0.28, lLz: -0.14, lRx: 0.08, lRz: 0.13 }],
      [0.286, { tx: 0.43, tyaw: 0.13, tz: -0.21, hx: -0.41, hy: -0.18, aLx: 2.24, aLz: -0.88, aRx: 2.15, aRz: 0.54, lLx: -0.37, lRx: 0.11, lRz: 0.13 }],
      [0.524, { tx: 0.20, tyaw: 0.25, tz: -0.12, ty: 0.10, hx: -0.14, hy: -0.21, aLx: 3.13, aLz: -0.59, aRx: 2.83, aRz: 0.55, lLx: -0.33, lRx: 0.14, lRz: 0.10 }],
      [0.81, { tx: -0.16, tyaw: 0.17, ty: 0.16, hx: 0.23, aLx: 3.55, aLz: -0.42, aRx: 3.35, aRz: 0.49, lLx: -0.28, lLz: -0.07, lRx: 0.15, lRz: 0.08 }],
      [1, { tx: 0.02, tyaw: 0.08, tz: -0.02, ty: 0.08, hx: 0.20, hy: 0.12, aLx: 3.90, aLz: -0.73, aRx: 3.55, aRz: 0.80, lLx: -0.24, lLz: -0.10, lRx: 0.21, lRz: 0.05 }],
    ],
    cast: [
      [0, { tx: 0.02, tyaw: 0.08, tz: -0.02, ty: 0.08, hx: 0.20, hy: 0.12, aLx: 3.90, aLz: -0.73, aRx: 3.55, aRz: 0.80, lLx: -0.24, lLz: -0.10, lRx: 0.21, lRz: 0.05 }],
      [0.167, { tx: 0.27, tyaw: 0.07, hx: 0.08, hy: 0.11, aLx: 3.40, aLz: -1.27, aRx: 2.84, aRz: 0.93, lLx: -0.24, lLz: -0.11, lRx: 0.23 }],
      [0.25, { tx: 0.48, tyaw: 0.08, hx: -0.11, hy: 0.09, aLx: 2.19, aLz: -1.01, aRx: 2.19, aRz: 0.78, lLx: -0.25, lLz: -0.10, lRx: 0.24 }],
      [0.5, { tx: 0.93, tyaw: 0.12, tz: 0.09, ty: -0.04, hx: -0.55, aLx: 2.34, aLz: -0.24, aRx: 2.35, lLx: -0.32, lLz: -0.05, lRx: 0.21 }],
      [1, { tx: 1.00, tyaw: 0.14, tz: 0.10, ty: -0.05, hx: -0.77, hy: 0.02, aLx: 2.51, aLz: -0.12, aRx: 2.45, aRz: -0.05, lLx: -0.39, lLz: -0.05, lRx: 0.14, lRz: 0.04 }],
    ],
  },
};

// Same sculpt at 0.58 scale with the scythe in the same hand, so the minions need the same
// clips: falling through to CLIPS.walker swung their empty arm, exactly as the shared boss
// clips once did to Baphomet himself.
CLIPS_BY_TYPE.baphometling = CLIPS_BY_TYPE.baphomet;

// ------------------------------------------------------------------ Sograt Desert

// A bird as a humanoid: the wings hang off the arm nodes, so the walk cycle's arm swing
// becomes a flap for free and the boss/walker clips still have something to move.
function buildPecoPeco() {
  const plume = mat(0xf0a63a, { roughness: 0.8 });
  const belly = mat(0xf6d68a, { roughness: 0.85 });
  const beak = mat(0xe07a2a, { roughness: 0.5 });
  const leg = mat(0xd98a3a, { roughness: 0.7 });
  const eye = mat(0x1a1016, { roughness: 0.3 });
  return humanoid({
    hip: 0.78, torsoH: 0.55, shoulderW: 0.3, legW: 0.17,
    buildTorso(t, h) {
      const body = mesh(new THREE.SphereGeometry(0.42, 14, 12), plume, 0, h * 0.45, 0, t);
      body.scale.set(1, 0.85, 1.25);
      const b = mesh(new THREE.SphereGeometry(0.3, 12, 10), belly, 0, h * 0.35, 0.22, t);
      b.scale.set(1, 0.8, 0.8);
      const tail = mesh(new THREE.ConeGeometry(0.14, 0.5, 6), plume, 0, h * 0.5, -0.55, t);
      tail.rotation.x = -1.2;
    },
    buildHead(hd) {
      mesh(new THREE.SphereGeometry(0.27, 12, 10), plume, 0, 0.2, 0.05, hd);
      const bk = mesh(new THREE.ConeGeometry(0.1, 0.38, 6), beak, 0, 0.16, 0.36, hd);
      bk.rotation.x = HALF;
      mesh(new THREE.SphereGeometry(0.06, 8, 8), eye, -0.12, 0.26, 0.22, hd);
      mesh(new THREE.SphereGeometry(0.06, 8, 8), eye, 0.12, 0.26, 0.22, hd);
      mesh(new THREE.ConeGeometry(0.06, 0.24, 5), plume, 0, 0.5, -0.02, hd).rotation.x = -0.4;   // crest
    },
    buildArm(a, side) {
      const wing = mesh(new THREE.BoxGeometry(0.1, 0.55, 0.42), plume, side * 0.04, -0.28, -0.05, a);
      wing.rotation.z = side * 0.25;
    },
    buildLeg(l) {
      mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.5, 6), leg, 0, -0.25, 0, l);
      mesh(new THREE.BoxGeometry(0.18, 0.05, 0.28), leg, 0, -0.52, 0.06, l);   // foot
    },
  });
}

// Andre: a blob-kind view so the sim's cheap walker can carry six legs without a rig.
function buildAnt() {
  const root = new THREE.Group();
  const body = node(0, 0.36, 0, root);
  const shell = mat(0x8a4a2a, { roughness: 0.55 });
  const dark = mat(0x3a1e12, { roughness: 0.7 });
  const abd = mesh(new THREE.SphereGeometry(0.3, 12, 10), shell, 0, 0, -0.32, body); abd.scale.set(1, 0.85, 1.3);
  mesh(new THREE.SphereGeometry(0.2, 10, 8), shell, 0, 0.02, 0.02, body);                      // thorax
  const head = mesh(new THREE.SphereGeometry(0.19, 10, 8), shell, 0, 0.06, 0.34, body);
  head.scale.set(1.1, 0.9, 1);
  for (const side of [-1, 1]) {
    const mand = mesh(new THREE.ConeGeometry(0.05, 0.22, 5), dark, side * 0.1, -0.02, 0.52, body);
    mand.rotation.x = HALF; mand.rotation.z = -side * 0.5;
    const ant = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), dark, side * 0.08, 0.28, 0.4, body);
    ant.rotation.x = -0.7; ant.rotation.z = -side * 0.5;
    mesh(new THREE.SphereGeometry(0.04, 6, 6), mat(0x120d10), side * 0.1, 0.14, 0.48, body);
    for (let i = 0; i < 3; i++) {
      const lg = mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.5, 4), dark, side * 0.28, -0.14, 0.18 - i * 0.2, body);
      lg.rotation.z = side * 1.15; lg.rotation.y = (i - 1) * 0.3;
    }
  }
  return { root, body, kind: 'blob' };
}

// Baby Desert Wolf: a pup that bounds, so the blob squash reads as the bounce.
function buildBabyWolf() {
  const root = new THREE.Group();
  const body = node(0, 0.4, 0, root);
  const fur = mat(0xd8b884, { roughness: 0.9 });
  const pale = mat(0xf0e2c2, { roughness: 0.9 });
  const dark = mat(0x3b2a1e, { roughness: 0.7 });
  const torso = mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 10), fur, 0, 0, -0.05, body); torso.rotation.x = HALF;
  const head = mesh(new THREE.SphereGeometry(0.2, 12, 10), fur, 0, 0.12, 0.36, body);
  mesh(new THREE.SphereGeometry(0.11, 8, 8), pale, 0, 0.05, 0.52, body);                       // muzzle
  mesh(new THREE.SphereGeometry(0.045, 6, 6), dark, 0, 0.08, 0.62, body);                     // nose
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.07, 0.2, 5), fur, side * 0.12, 0.32, 0.3, body);
    ear.rotation.z = -side * 0.2;
    mesh(new THREE.SphereGeometry(0.04, 6, 6), dark, side * 0.09, 0.18, 0.5, body);
    for (const fz of [0.2, -0.24]) mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.36, 6), fur, side * 0.13, -0.28, fz, body);
  }
  const tail = mesh(new THREE.CapsuleGeometry(0.05, 0.3, 4, 6), fur, 0, 0.1, -0.42, body);
  tail.rotation.x = -0.9;
  head.castShadow = true;
  return { root, body, kind: 'blob' };
}

// Sand Wraith: a hunched figure of packed sand with lit eyes. Blocks with the corners knocked off.
function buildSandWraith() {
  const sand = mat(0xc9a66a, { roughness: 1.0 });
  const dark = mat(0x8a6a3a, { roughness: 1.0 });
  const eye = mat(0xffe680, { emissive: 0xffc830, emissiveIntensity: 1.8 });
  return humanoid({
    hip: 0.9, torsoH: 0.66, shoulderW: 0.32, legW: 0.16,
    buildTorso(t, h) {
      mesh(new THREE.SphereGeometry(0.4, 10, 8), sand, 0, h * 0.5, 0, t).scale.set(1, 0.9, 0.8);
      mesh(new THREE.BoxGeometry(0.72, 0.18, 0.5), dark, 0, 0.06, 0, t);
      for (let i = 0; i < 5; i++) mesh(new THREE.SphereGeometry(0.06 + (i % 2) * 0.03, 6, 6), dark, (i - 2) * 0.13, h * 0.5 + Math.sin(i) * 0.12, 0.3, t); // crust lumps
    },
    buildHead(hd) {
      mesh(new THREE.SphereGeometry(0.26, 10, 8), sand, 0, 0.18, 0.02, hd).scale.set(1, 0.85, 1);
      mesh(new THREE.SphereGeometry(0.055, 6, 6), eye, -0.1, 0.22, 0.22, hd);
      mesh(new THREE.SphereGeometry(0.055, 6, 6), eye, 0.1, 0.22, 0.22, hd);
      mesh(new THREE.BoxGeometry(0.16, 0.04, 0.06), dark, 0, 0.06, 0.24, hd);   // mouth slit
    },
    buildArm(a) {
      mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.36, 6), sand, 0, -0.18, 0, a);
      mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.34, 6), sand, 0, -0.52, 0, a);
      mesh(new THREE.SphereGeometry(0.11, 8, 6), sand, 0, -0.72, 0, a);
    },
    buildLeg(l) {
      mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 6), sand, 0, -0.25, 0, l);
      mesh(new THREE.BoxGeometry(0.24, 0.1, 0.3), dark, 0, -0.52, 0.04, l);
    },
  });
}

// Golem: hewn sandstone, all mass in the shoulders and fists.
function buildGolem() {
  const stone = mat(0xa8865a, { roughness: 0.95 });
  const dark = mat(0x6a5236, { roughness: 1.0 });
  const core = mat(0xff8a2a, { emissive: 0xff7a1a, emissiveIntensity: 1.6 });
  return humanoid({
    scale: 1.25, hip: 0.95, torsoH: 0.85, shoulderW: 0.5, legW: 0.24,
    buildTorso(t, h) {
      mesh(new THREE.BoxGeometry(0.95, 0.5, 0.6), stone, 0, 0.25, 0, t);                  // pelvis block
      mesh(new THREE.BoxGeometry(1.15, 0.75, 0.7), stone, 0, h - 0.3, 0, t);              // chest
      mesh(new THREE.BoxGeometry(0.4, 0.3, 0.1), core, 0, h - 0.3, 0.36, t);              // glowing core
      for (const side of [-1, 1]) mesh(new THREE.BoxGeometry(0.42, 0.42, 0.62), dark, side * 0.62, h - 0.05, 0, t); // shoulders
    },
    buildHead(hd) {
      mesh(new THREE.BoxGeometry(0.42, 0.36, 0.4), stone, 0, 0.12, 0, hd);
      mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), core, 0, 0.16, 0.21, hd);              // visor glow
    },
    buildArm(a) {
      mesh(new THREE.BoxGeometry(0.28, 0.44, 0.28), stone, 0, -0.22, 0, a);
      mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), dark, 0, -0.6, 0, a);
      mesh(new THREE.BoxGeometry(0.4, 0.36, 0.4), stone, 0, -0.95, 0, a);                 // fist
    },
    buildLeg(l) {
      mesh(new THREE.BoxGeometry(0.34, 0.5, 0.34), stone, 0, -0.25, 0, l);
      mesh(new THREE.BoxGeometry(0.4, 0.45, 0.44), dark, 0, -0.72, 0.03, l);
    },
  });
}

// Phreeoni: the town boss. Nearly all mouth - a pale slab of flesh split by a maw the width
// of the body, teeth on both jaws, a tongue lolling out - on stub legs, with stub arms for
// the boss clips to swing.
function buildPhreeoni() {
  const flesh = mat(0xd9b8b0, { roughness: 0.75 });
  const dark = mat(0x7a3a3e, { roughness: 0.8 });
  const gum = mat(0xb3383f, { roughness: 0.6 });
  const tooth = mat(0xf3eedb, { roughness: 0.45 });
  const eye = mat(0x2a0f12, { roughness: 0.3 });
  const iris = mat(0xffd050, { emissive: 0xffb020, emissiveIntensity: 1.5 });
  return humanoid({
    scale: 1.7, hip: 0.62, torsoH: 0.9, shoulderW: 0.62, legW: 0.3,
    buildTorso(t, h) {
      const slab = mesh(new THREE.SphereGeometry(0.75, 16, 12), flesh, 0, h * 0.5, 0, t);
      slab.scale.set(1.05, 0.72, 0.9);
      // the maw: a dark cavity cut across the front, gums above and below, teeth in rows
      const maw = mesh(new THREE.BoxGeometry(1.3, 0.34, 0.5), mat(0x1a0608, { roughness: 1 }), 0, h * 0.5 - 0.02, 0.48, t);
      maw.castShadow = false;
      mesh(new THREE.BoxGeometry(1.34, 0.08, 0.5), gum, 0, h * 0.5 + 0.2, 0.5, t);
      mesh(new THREE.BoxGeometry(1.34, 0.08, 0.5), gum, 0, h * 0.5 - 0.24, 0.5, t);
      for (let i = 0; i < 7; i++) {
        const x = -0.55 + i * 0.18;
        mesh(new THREE.ConeGeometry(0.05, 0.14, 5), tooth, x, h * 0.5 + 0.1, 0.7, t).rotation.x = Math.PI;
        mesh(new THREE.ConeGeometry(0.05, 0.14, 5), tooth, x + 0.09, h * 0.5 - 0.14, 0.7, t);
      }
      const tongue = mesh(new THREE.CapsuleGeometry(0.12, 0.5, 6, 10), gum, 0.05, h * 0.5 - 0.18, 0.62, t);
      tongue.rotation.x = HALF + 0.35;
      for (let i = 0; i < 6; i++) mesh(new THREE.SphereGeometry(0.06 + (i % 3) * 0.02, 6, 6), dark, -0.6 + i * 0.24, h * 0.5 + 0.42, 0.1 + (i % 2) * 0.3, t); // warts along the back
    },
    buildHead(hd) {
      // no separate head to speak of: a brow ridge with the eyes, riding the top of the slab
      mesh(new THREE.SphereGeometry(0.3, 12, 8), flesh, 0, -0.05, 0.15, hd).scale.set(1.6, 0.5, 1);
      for (const side of [-1, 1]) {
        mesh(new THREE.SphereGeometry(0.11, 10, 8), eye, side * 0.24, 0.04, 0.34, hd);
        mesh(new THREE.SphereGeometry(0.05, 8, 6), iris, side * 0.24, 0.05, 0.43, hd);
      }
    },
    buildArm(a, side) {
      mesh(new THREE.CapsuleGeometry(0.13, 0.32, 6, 8), flesh, 0, -0.22, 0, a);
      const claw = node(0, -0.45, 0, a);
      for (let i = 0; i < 3; i++) mesh(new THREE.ConeGeometry(0.045, 0.2, 5), tooth, (i - 1) * 0.08, -0.1, 0.04, claw).rotation.x = Math.PI;
    },
    buildLeg(l) {
      mesh(new THREE.CapsuleGeometry(0.17, 0.3, 6, 8), flesh, 0, -0.22, 0, l);
      mesh(new THREE.SphereGeometry(0.2, 8, 6), dark, 0, -0.45, 0.05, l).scale.set(1.2, 0.5, 1.3);
    },
  });
}


// ---------------------------------------------- Phaelan: the forest and what sleeps in it

// Famiru: a bat, and the only thing in the wave that flies. Built as a blob so the hop
// squash reads as wingbeats, with the wings handed back as `ears` - the blob update already
// swings those with the arc of the hop, which is exactly what a wing does.
function buildFamiru() {
  const root = new THREE.Group();
  const body = node(0, 0.34, 0, root);
  const fur = mat(0x4a3550, { roughness: 0.85 });
  const skin = mat(0x6f4f78, { roughness: 0.9 });
  const fang = mat(0xf2eadf, { roughness: 0.5 });
  mesh(new THREE.SphereGeometry(0.17, 12, 10), fur, 0, 0, 0, body).scale.set(1, 1.1, 0.95);
  mesh(new THREE.SphereGeometry(0.085, 8, 8), skin, 0, -0.04, 0.16, body);                    // snout
  const wings = [];
  for (const side of [-1, 1]) {
    const w = node(side * 0.14, 0.03, 0, body);
    const web = mesh(new THREE.ConeGeometry(0.2, 0.42, 3), skin, side * 0.2, 0, -0.02, w);
    web.rotation.z = side * HALF; web.scale.set(1, 1, 0.22);
    mesh(new THREE.CylinderGeometry(0.014, 0.01, 0.4, 4), fur, side * 0.2, 0.02, 0, w).rotation.z = side * HALF;
    wings.push(w);
    const ear = mesh(new THREE.ConeGeometry(0.05, 0.16, 5), fur, side * 0.08, 0.2, 0.01, body);
    ear.rotation.z = -side * 0.3;
    mesh(new THREE.SphereGeometry(0.028, 6, 6), mat(0xffc93c, { emissive: 0xffc93c, emissiveIntensity: 0.7 }), side * 0.06, 0.03, 0.14, body);
    mesh(new THREE.ConeGeometry(0.018, 0.06, 4), fang, side * 0.035, -0.1, 0.15, body).rotation.x = Math.PI;
  }
  return { root, body, ears: wings, kind: 'blob' };
}

// Wispra: a drifting white shade, wide at the shoulders and trailing away to nothing. A blob
// again, because it has no legs to walk on and the squash reads as a drift.
function buildWispra() {
  const root = new THREE.Group();
  const body = node(0, 0.8, 0, root);
  const pale = mat(0xe8f0f4, { roughness: 1, emissive: 0x8fb6c8, emissiveIntensity: 0.25, transparent: true, opacity: 0.92 });
  const veil = mat(0xcfe0e8, { roughness: 1, emissive: 0x7fa8bc, emissiveIntensity: 0.18, transparent: true, opacity: 0.7 });
  const hood = mesh(new THREE.SphereGeometry(0.3, 14, 12), pale, 0, 0.18, 0, body);
  hood.scale.set(1, 0.95, 1);
  const skirt = mesh(new THREE.ConeGeometry(0.34, 0.9, 12, 1, true), veil, 0, -0.34, 0, body);
  skirt.rotation.x = Math.PI;                       // point down: the hem tapers into the dark
  for (const side of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.045, 8, 8), mat(0x1b2430, { emissive: 0x2d4356, emissiveIntensity: 0.5 }), side * 0.1, 0.2, 0.26, body);
    const arm = mesh(new THREE.CapsuleGeometry(0.05, 0.3, 4, 8), veil, side * 0.28, 0.02, 0.04, body);
    arm.rotation.z = side * 0.5;
  }
  return { root, body, kind: 'blob' };
}

// Fox Shade: what Moonraya throws at the player once the moon turns. Her shape, in smoke.
function buildFoxShade() {
  const root = new THREE.Group();
  const body = node(0, 0.5, 0, root);
  const smoke = mat(0x2a2038, { roughness: 1, emissive: 0x4a2f6a, emissiveIntensity: 0.35, transparent: true, opacity: 0.86 });
  const glow = mat(0xffd27a, { emissive: 0xffd27a, emissiveIntensity: 0.9 });
  const torso = mesh(new THREE.CapsuleGeometry(0.18, 0.4, 6, 10), smoke, 0, 0, -0.04, body);
  torso.rotation.x = HALF;
  mesh(new THREE.SphereGeometry(0.17, 12, 10), smoke, 0, 0.1, 0.33, body);                     // head
  mesh(new THREE.ConeGeometry(0.09, 0.22, 6), smoke, 0, 0.03, 0.46, body).rotation.x = HALF;   // muzzle
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.07, 0.24, 5), smoke, side * 0.11, 0.3, 0.28, body);
    ear.rotation.z = -side * 0.24;
    mesh(new THREE.SphereGeometry(0.038, 6, 6), glow, side * 0.08, 0.14, 0.45, body);
    for (const fz of [0.18, -0.24]) mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.42, 5), smoke, side * 0.12, -0.3, fz, body);
  }
  const tail = mesh(new THREE.ConeGeometry(0.13, 0.5, 8), smoke, 0, 0.16, -0.44, body);
  tail.rotation.x = -1.1;
  return { root, body, kind: 'blob' };
}

// Munari: a small shrine ghost in a high-collared dress, the paper seal still on her hat.
function buildMunari() {
  const dress = mat(0x2f3f6a, { roughness: 0.85 });
  const trim = mat(0xe8dcc0, { roughness: 0.8 });
  const skinM = mat(0xf0e4da, { roughness: 0.9 });
  const hair = mat(0x1a141c, { roughness: 0.8 });
  const seal = mat(0xf3e3a8, { roughness: 0.9, emissive: 0xb89a3a, emissiveIntensity: 0.2 });
  return humanoid({
    scale: 0.88, hip: 0.82, torsoH: 0.56, shoulderW: 0.2, legW: 0.1,
    buildTorso(t, h) {
      const gown = mesh(new THREE.CylinderGeometry(0.16, 0.3, h + 0.5, 10), dress, 0, h / 2 - 0.22, 0, t);
      gown.castShadow = true;
      mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 10), trim, 0, h - 0.04, 0, t);          // collar
      mesh(new THREE.BoxGeometry(0.34, 0.07, 0.24), trim, 0, h - 0.34, 0, t);                  // sash
    },
    buildHead(hd) {
      mesh(new THREE.SphereGeometry(0.2, 14, 12), skinM, 0, 0.16, 0, hd);
      mesh(new THREE.SphereGeometry(0.22, 14, 12), hair, 0, 0.18, -0.03, hd).scale.set(1, 0.9, 1);
      mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), hair, 0, 0.3, 0, hd);                         // fringe
      mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 8), dress, 0, 0.42, 0, hd);             // cap
      mesh(new THREE.BoxGeometry(0.1, 0.26, 0.02), seal, 0, 0.42, 0.22, hd);                   // the seal
      for (const side of [-1, 1]) mesh(new THREE.SphereGeometry(0.03, 6, 6), mat(0x241a22), side * 0.075, 0.16, 0.18, hd);
    },
    buildArm(a, side) {
      const sleeve = mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), dress, 0, -0.18, 0, a);
      sleeve.rotation.z = side * 0.08;
      mesh(new THREE.SphereGeometry(0.055, 8, 8), skinM, 0, -0.38, 0.02, a);
    },
    buildLeg(l) {
      mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.3, 6), dress, 0, -0.16, 0, l);
      mesh(new THREE.BoxGeometry(0.12, 0.06, 0.2), trim, 0, -0.33, 0.03, l);
    },
  });
}

// Bonku: stiff-armed, hopping, and always a step behind Munari.
function buildBonku() {
  const robe = mat(0x243b33, { roughness: 0.85 });
  const trim = mat(0xc8b48a, { roughness: 0.8 });
  const skinB = mat(0xb9c4b0, { roughness: 0.95 });
  const seal = mat(0xf3e3a8, { roughness: 0.9, emissive: 0xb89a3a, emissiveIntensity: 0.25 });
  return humanoid({
    hip: 0.95, torsoH: 0.66, shoulderW: 0.26, legW: 0.13,
    buildTorso(t, h) {
      mesh(new THREE.CylinderGeometry(0.22, 0.28, h + 0.3, 10), robe, 0, h / 2 - 0.1, 0, t);
      mesh(new THREE.BoxGeometry(0.42, 0.08, 0.3), trim, 0, h - 0.3, 0, t);
      mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 10), trim, 0, h - 0.02, 0, t);
    },
    buildHead(hd) {
      mesh(new THREE.SphereGeometry(0.22, 14, 12), skinB, 0, 0.18, 0, hd);
      mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.16, 8), robe, 0, 0.42, 0, hd);             // officer's cap
      mesh(new THREE.BoxGeometry(0.11, 0.3, 0.02), seal, 0, 0.3, 0.21, hd);                    // the seal over his eyes
      for (const side of [-1, 1]) mesh(new THREE.SphereGeometry(0.028, 6, 6), mat(0x5a1c22, { emissive: 0x7a2028, emissiveIntensity: 0.5 }), side * 0.08, 0.14, 0.2, hd);
    },
    // Both arms locked out in front: the pose is the whole silhouette.
    buildArm(a, side) {
      a.rotation.x = -1.35;
      mesh(new THREE.CapsuleGeometry(0.075, 0.34, 4, 8), robe, 0, -0.2, 0, a);
      mesh(new THREE.SphereGeometry(0.07, 8, 8), skinB, 0, -0.42, 0, a);
      mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), trim, side * 0.02, -0.42, 0, a);
    },
    buildLeg(l) {
      mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.36, 6), robe, 0, -0.19, 0, l);
      mesh(new THREE.BoxGeometry(0.15, 0.07, 0.24), trim, 0, -0.39, 0.03, l);
    },
  });
}

// Sorya: the one that is still beautiful, which is the point of her.
function buildSorya() {
  const robe = mat(0x6d5f84, { roughness: 0.85 });
  const under = mat(0xd8cfe0, { roughness: 0.9 });
  const skinS = mat(0xf2e6dd, { roughness: 0.9 });
  const hair = mat(0x15111a, { roughness: 0.75 });
  return humanoid({
    hip: 0.96, torsoH: 0.66, shoulderW: 0.24, legW: 0.11,
    buildTorso(t, h) {
      mesh(new THREE.CylinderGeometry(0.19, 0.36, h + 0.62, 12), robe, 0, h / 2 - 0.3, 0, t);
      mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10), under, 0, h - 0.03, 0, t);
      mesh(new THREE.BoxGeometry(0.38, 0.09, 0.28), under, 0, h - 0.28, 0, t);
      // The hair is the長 part of her, so it hangs off the torso and swings with it.
      const fall = mesh(new THREE.CapsuleGeometry(0.17, 0.62, 6, 10), hair, 0, h - 0.42, -0.16, t);
      fall.scale.set(1.1, 1, 0.55);
    },
    buildHead(hd) {
      mesh(new THREE.SphereGeometry(0.2, 14, 12), skinS, 0, 0.17, 0, hd);
      mesh(new THREE.SphereGeometry(0.225, 14, 12), hair, 0, 0.2, -0.02, hd).scale.set(1, 0.95, 1);
      mesh(new THREE.BoxGeometry(0.32, 0.12, 0.26), hair, 0, 0.3, 0.02, hd);
      for (const side of [-1, 1]) {
        mesh(new THREE.SphereGeometry(0.028, 6, 6), mat(0x241a22), side * 0.072, 0.17, 0.18, hd);
        mesh(new THREE.CapsuleGeometry(0.05, 0.3, 4, 6), hair, side * 0.19, 0.02, 0.06, hd);   // side locks
      }
    },
    buildArm(a, side) {
      const sleeve = mesh(new THREE.ConeGeometry(0.13, 0.42, 8), robe, 0, -0.2, 0, a);
      sleeve.rotation.x = Math.PI; sleeve.rotation.z = side * 0.06;
      mesh(new THREE.SphereGeometry(0.055, 8, 8), skinS, 0, -0.44, 0.02, a);
    },
    buildLeg(l) {
      mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.32, 6), under, 0, -0.17, 0, l);
      mesh(new THREE.BoxGeometry(0.13, 0.06, 0.2), robe, 0, -0.35, 0.03, l);
    },
  });
}

// ------------------------------------------------------------------ Orvane
//
// The tower's four rooms and the demon dimension past the rift. The two halves are meant to
// read apart at a glance: everything above ground is rune blue over pale stone, everything
// beyond the rift is violet over pink, and the one that crosses over is the bat.

// Flittern: a rune-lit bat, small and quick. Famiru is already a bat, so this one is built
// the other way round - a bright core carrying dark wings, rather than fur with eyes in it.
function buildFlittern() {
  const root = new THREE.Group();
  const body = node(0, 0.32, 0, root);
  const dark = mat(0x1e2340, { roughness: 0.9 });
  const core = mat(0x9ed4ff, { emissive: 0x6fb8ff, emissiveIntensity: 1.2, roughness: 0.4 });
  mesh(new THREE.OctahedronGeometry(0.13, 0), core, 0, 0, 0, body);
  mesh(new THREE.SphereGeometry(0.11, 10, 8), dark, 0, 0.02, 0.12, body).scale.set(1, 0.9, 1.2);
  const wings = [];
  for (const side of [-1, 1]) {
    const w = node(side * 0.1, 0.04, -0.02, body);
    // two membranes per side, the upper one longer: it reads as a flutter rather than a flap
    for (const [len, lift] of [[0.34, 0.06], [0.24, -0.05]]) {
      const web = mesh(new THREE.ConeGeometry(0.15, len, 3), dark, side * len * 0.5, lift, 0, w);
      web.rotation.z = side * HALF; web.scale.set(1, 1, 0.18);
    }
    wings.push(w);
    mesh(new THREE.SphereGeometry(0.022, 6, 6), core, side * 0.05, 0.04, 0.2, body);
  }
  return { root, body, ears: wings, kind: 'blob' };
}

// Hushling: a cloak with nobody in it. The hood is empty and the hands float free of the
// sleeves, which is the whole idea - and it is what the fade will hang off when that lands.
function buildHushling() {
  const root = new THREE.Group();
  const body = node(0, 0.86, 0, root);
  const cloth = mat(0x2a3050, { roughness: 1, transparent: true, opacity: 0.93 });
  const inner = mat(0x080a14, { roughness: 1 });
  const glow = mat(0x8fd0ff, { emissive: 0x8fd0ff, emissiveIntensity: 1.1, roughness: 0.4 });
  const hood = mesh(new THREE.SphereGeometry(0.28, 14, 12), cloth, 0, 0.2, 0, body);
  hood.scale.set(1, 1.05, 0.95);
  mesh(new THREE.SphereGeometry(0.2, 10, 8), inner, 0, 0.17, 0.14, body);        // the empty hood
  mesh(new THREE.SphereGeometry(0.035, 8, 8), glow, 0, 0.19, 0.24, body);        // one eye, alone
  const robe = mesh(new THREE.ConeGeometry(0.36, 1.0, 12, 1, true), cloth, 0, -0.38, 0, body);
  robe.rotation.x = Math.PI;
  for (const side of [-1, 1]) {
    const cuff = mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.2, 8), cloth, side * 0.3, 0.0, 0.05, body);
    cuff.rotation.z = side * 0.6;
    mesh(new THREE.SphereGeometry(0.055, 8, 8), glow, side * 0.42, -0.14, 0.1, body);   // a hand, floating
  }
  return { root, body, kind: 'blob' };
}

// Stringen: a wooden puppet held up by strings that go nowhere. Built as a humanoid so the
// walk clip's stiffness works for it instead of against it.
function buildStringen() {
  const wood = mat(0x8a6a44, { roughness: 0.85 });
  const dark = mat(0x4a3520, { roughness: 0.9 });
  const cord = mat(0xd8d0bc, { roughness: 1, emissive: 0x6a7080, emissiveIntensity: 0.2 });
  const paint = mat(0xc4425a, { roughness: 0.7 });
  return humanoid({
    scale: 1.0, hip: 0.92, torsoH: 0.66, shoulderW: 0.26, legW: 0.13,
    buildTorso(t, h) {
      mesh(new THREE.BoxGeometry(0.34, 0.2, 0.2), wood, 0, 0.06, 0, t);                 // pelvis block
      mesh(new THREE.CylinderGeometry(0.05, 0.05, h * 0.5, 6), dark, 0, h * 0.4, 0, t); // exposed spine peg
      mesh(new THREE.BoxGeometry(0.44, 0.4, 0.24), wood, 0, h - 0.2, 0, t);             // chest block
      mesh(new THREE.BoxGeometry(0.46, 0.06, 0.26), paint, 0, h - 0.34, 0, t);
      // the strings: four, rising out of the top of the frame into nothing
      for (const sx of [-0.18, 0.18]) for (const sz of [-0.08, 0.08]) {
        mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.5, 3), cord, sx, h + 0.75, sz, t);
      }
    },
    buildHead(hd) {
      mesh(new THREE.BoxGeometry(0.3, 0.32, 0.28), wood, 0, 0.18, 0, hd);
      mesh(new THREE.SphereGeometry(0.045, 8, 8), dark, -0.08, 0.22, 0.15, hd);
      mesh(new THREE.SphereGeometry(0.045, 8, 8), dark, 0.08, 0.22, 0.15, hd);
      mesh(new THREE.BoxGeometry(0.2, 0.03, 0.02), paint, 0, 0.1, 0.15, hd);            // a painted smile
      mesh(new THREE.SphereGeometry(0.07, 8, 8), dark, 0, 0.36, 0, hd);                 // the string knot
    },
    buildArm(a, side) {
      mesh(new THREE.SphereGeometry(0.07, 8, 8), dark, 0, 0, 0, a);                     // ball joint
      mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), wood, side * 0.02, -0.22, 0, a);
      mesh(new THREE.SphereGeometry(0.055, 8, 8), dark, side * 0.03, -0.4, 0, a);
      mesh(new THREE.BoxGeometry(0.09, 0.3, 0.09), wood, side * 0.04, -0.56, 0, a);
      mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), wood, side * 0.05, -0.76, 0, a);    // blocky fist
    },
    buildLeg(l) {
      mesh(new THREE.SphereGeometry(0.07, 8, 8), dark, 0, 0, 0, l);
      mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), wood, 0, -0.24, 0, l);
      mesh(new THREE.SphereGeometry(0.06, 8, 8), dark, 0, -0.47, 0, l);
      mesh(new THREE.BoxGeometry(0.11, 0.36, 0.11), wood, 0, -0.66, 0, l);
      mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), dark, 0, -0.86, 0.04, l);
    },
  });
}

// Grinlit: a lantern for a head over an empty coat, green fire where the face should be.
function buildGrinlit() {
  const root = new THREE.Group();
  const body = node(0, 0.8, 0, root);
  const coat = mat(0x3a3020, { roughness: 1 });
  const iron = mat(0x4a4a52, { roughness: 0.55, metalness: 0.6 });
  const fire = mat(0x7dff9a, { emissive: 0x4cff7a, emissiveIntensity: 1.4, roughness: 0.3 });
  const robe = mesh(new THREE.ConeGeometry(0.34, 0.92, 10, 1, true), coat, 0, -0.34, 0, body);
  robe.rotation.x = Math.PI;
  // the lantern: a glass drum in an iron cage, with the flame inside it
  mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8), fire, 0, 0.26, 0, body);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 4), iron, Math.cos(a) * 0.2, 0.26, Math.sin(a) * 0.2, body);
  }
  mesh(new THREE.CylinderGeometry(0.23, 0.2, 0.06, 8), iron, 0, 0.44, 0, body);
  mesh(new THREE.ConeGeometry(0.16, 0.14, 8), iron, 0, 0.52, 0, body);
  mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.06, 8), iron, 0, 0.09, 0, body);
  for (const side of [-1, 1]) {
    const sleeve = mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.36, 8), coat, side * 0.28, -0.08, 0.03, body);
    sleeve.rotation.z = side * 0.55;
    mesh(new THREE.SphereGeometry(0.05, 8, 8), fire, side * 0.4, -0.26, 0.06, body);
  }
  return { root, body, kind: 'blob' };
}

// Velmara: past the rift. A winged thing that keeps closer than an archer should.
function buildVelmara() {
  const skinV = mat(0xb87ac4, { roughness: 0.85 });
  const cloth = mat(0x40163f, { roughness: 0.9 });
  const horn = mat(0x2a1230, { roughness: 0.7 });
  const membrane = mat(0x6a2a68, { roughness: 1, transparent: true, opacity: 0.88 });
  const glow = mat(0xff8ae0, { emissive: 0xff5ad0, emissiveIntensity: 1.1, roughness: 0.4 });
  return humanoid({
    scale: 1.0, hip: 0.92, torsoH: 0.62, shoulderW: 0.22, legW: 0.11,
    buildTorso(t, h) {
      mesh(new THREE.CapsuleGeometry(0.17, 0.3, 5, 10), skinV, 0, h * 0.55, 0, t);
      mesh(new THREE.CylinderGeometry(0.19, 0.26, 0.5, 10), cloth, 0, h * 0.2 - 0.1, 0, t);   // skirt
      mesh(new THREE.BoxGeometry(0.34, 0.16, 0.2), cloth, 0, h - 0.16, 0.02, t);              // bodice
      // wings: two membranes a side, swept back, so the silhouette is wide without flapping
      for (const side of [-1, 1]) {
        for (const [len, ang, lift] of [[0.62, 0.5, 0.1], [0.44, 1.0, -0.06]]) {
          const wing = mesh(new THREE.ConeGeometry(0.16, len, 3), membrane, side * 0.16, h - 0.1 + lift, -0.16, t);
          wing.rotation.set(0, side * 0.7, side * (HALF - ang));
          wing.scale.set(1, 1, 0.16);
        }
      }
    },
    buildHead(hd) {
      mesh(new THREE.SphereGeometry(0.18, 14, 12), skinV, 0, 0.16, 0, hd);
      mesh(new THREE.SphereGeometry(0.2, 12, 10), cloth, 0, 0.19, -0.04, hd).scale.set(1, 0.95, 1);  // hair
      for (const side of [-1, 1]) {
        const h2 = mesh(new THREE.ConeGeometry(0.05, 0.26, 5), horn, side * 0.11, 0.3, -0.02, hd);
        h2.rotation.set(-0.5, 0, -side * 0.35);
        mesh(new THREE.SphereGeometry(0.032, 6, 6), glow, side * 0.07, 0.17, 0.15, hd);
      }
    },
    buildArm(a, side) {
      mesh(new THREE.CapsuleGeometry(0.052, 0.28, 4, 8), skinV, 0, -0.18, 0, a);
      mesh(new THREE.CapsuleGeometry(0.046, 0.26, 4, 8), skinV, side * 0.03, -0.46, 0, a);
      mesh(new THREE.SphereGeometry(0.07, 8, 8), glow, side * 0.05, -0.64, 0.02, a);      // the bolt in hand
    },
    buildLeg(l) {
      mesh(new THREE.CapsuleGeometry(0.075, 0.36, 4, 8), skinV, 0, -0.26, 0, l);
      mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 8), skinV, 0, -0.62, 0, l);
      mesh(new THREE.ConeGeometry(0.07, 0.16, 5), horn, 0, -0.84, 0.03, l).rotation.x = Math.PI;  // hoof
    },
  });
}

// Nyxmare: the heaviest thing in the town that is not the boss. A quadruped, so it is a blob
// like the Fox Shade rather than a humanoid - the squash on a hop reads as a gallop.
function buildNyxmare() {
  const root = new THREE.Group();
  const body = node(0, 0.86, 0, root);
  const hide = mat(0x14121c, { roughness: 0.85 });
  const smoke = mat(0x3a2a48, { roughness: 1, transparent: true, opacity: 0.6 });
  const ember = mat(0xff4a3a, { emissive: 0xff3a24, emissiveIntensity: 1.3, roughness: 0.4 });
  const barrel = mesh(new THREE.CapsuleGeometry(0.34, 0.66, 6, 12), hide, 0, 0, -0.06, body);
  barrel.rotation.x = HALF;
  const neck = mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.5, 8), hide, 0, 0.26, 0.4, body);
  neck.rotation.x = -0.7;
  const head = mesh(new THREE.BoxGeometry(0.24, 0.24, 0.48), hide, 0, 0.44, 0.72, body);
  head.rotation.x = 0.25;
  mesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), hide, 0, 0.36, 0.92, body);          // muzzle
  for (const side of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.05, 8, 8), ember, side * 0.11, 0.5, 0.82, body);
    mesh(new THREE.ConeGeometry(0.05, 0.16, 4), hide, side * 0.09, 0.6, 0.6, body);   // ear
    for (const fz of [0.34, -0.36]) {
      mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.56, 6), hide, side * 0.22, -0.44, fz, body);
      mesh(new THREE.SphereGeometry(0.07, 6, 6), ember, side * 0.22, -0.72, fz, body).scale.set(1, 0.4, 1);
    }
  }
  // mane and tail, in smoke rather than hair
  for (let i = 0; i < 5; i++) {
    const m = mesh(new THREE.ConeGeometry(0.1 - i * 0.012, 0.36, 5), smoke, 0, 0.5 - i * 0.07, 0.56 - i * 0.14, body);
    m.rotation.x = -0.9;
  }
  const tail = mesh(new THREE.ConeGeometry(0.16, 0.7, 6), smoke, 0, 0.16, -0.56, body);
  tail.rotation.x = -1.25;
  return { root, body, kind: 'blob' };
}

// Shardling: what the Dark Sword breaks off himself. Not a small knight - a cluster of his
// own armour held together by the same violet light, which is cheaper and reads better.
function buildShardling() {
  const root = new THREE.Group();
  const body = node(0, 0.62, 0, root);
  const obsidian = mat(0x14121e, { roughness: 0.35, metalness: 0.5 });
  const core = mat(0xc07aff, { emissive: 0xa85aff, emissiveIntensity: 1.4, roughness: 0.3 });
  mesh(new THREE.OctahedronGeometry(0.16, 0), core, 0, 0, 0, body);
  // six shards orbiting the core at fixed angles: the pose code spins the body, not these
  const ring = [[0.3, 0.16, 0.1], [-0.28, 0.2, -0.06], [0.1, 0.34, -0.22],
                [-0.2, -0.16, 0.24], [0.24, -0.22, -0.18], [-0.06, -0.3, 0.02]];
  for (let i = 0; i < ring.length; i++) {
    const [x, y, z] = ring[i];
    const sh = mesh(new THREE.OctahedronGeometry(0.15 - (i % 3) * 0.03, 0), obsidian, x, y, z, body);
    sh.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    sh.scale.set(0.5, 1.5, 0.35);
  }
  return { root, body, kind: 'blob' };
}

// ------------------------------------------------------------------ Bairune
//
// The drowned temple. Everything here is built for a silhouette read against bright water:
// wide low shapes on the beach, drifting ones in the caves, and upright ones once the city
// starts. Nothing is transparent except the jellyfish, which is the one that should be.

// Craboon: orange, wide, and asymmetric - one claw is the monster.
function buildCraboon() {
  const root = new THREE.Group();
  const body = node(0, 0.32, 0, root);
  const shellC = mat(0xe8703a, { roughness: 0.55 });
  const under = mat(0xf6c49a, { roughness: 0.8 });
  const eyeC = mat(0x201418, { roughness: 0.3 });
  const carapace = mesh(new THREE.SphereGeometry(0.42, 14, 10), shellC, 0, 0, 0, body);
  carapace.scale.set(1.25, 0.6, 1);
  mesh(new THREE.SphereGeometry(0.34, 12, 8), under, 0, -0.1, 0.06, body).scale.set(1.1, 0.35, 0.9);
  for (const side of [-1, 1]) {
    // eye stalks
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 5), under, side * 0.13, 0.2, 0.2, body);
    mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeC, side * 0.13, 0.3, 0.22, body);
    // four legs a side, splayed
    for (let i = 0; i < 4; i++) {
      const leg = mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.38, 5), shellC, side * 0.4, -0.12, 0.22 - i * 0.16, body);
      leg.rotation.z = side * 1.05;
    }
  }
  // the big claw, and a small one to make it look big
  const bigArm = mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.3, 6), shellC, -0.45, 0.02, 0.24, body);
  bigArm.rotation.z = 0.7;
  const claw = mesh(new THREE.SphereGeometry(0.22, 10, 8), shellC, -0.62, 0.16, 0.3, body);
  claw.scale.set(1.3, 0.9, 0.7);
  mesh(new THREE.BoxGeometry(0.26, 0.07, 0.16), under, -0.74, 0.2, 0.3, body).rotation.z = -0.25;
  mesh(new THREE.SphereGeometry(0.11, 8, 8), shellC, 0.5, 0.0, 0.26, body).scale.set(1.2, 0.9, 0.7);
  return { root, body, kind: 'blob' };
}

// Hydrella: an anemone that shoots. It does not really walk, so the drift is all it has.
function buildHydrella() {
  const root = new THREE.Group();
  const body = node(0, 0.5, 0, root);
  const stalk = mat(0x7a3f86, { roughness: 0.9 });
  const frond = mat(0xc06ad0, { roughness: 0.85 });
  const bud = mat(0xffc2f0, { emissive: 0xff7ad8, emissiveIntensity: 0.9, roughness: 0.4 });
  mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.6, 9), stalk, 0, -0.2, 0, body);
  mesh(new THREE.SphereGeometry(0.26, 12, 10), stalk, 0, 0.15, 0, body).scale.set(1, 0.8, 1);
  // a crown of tentacles, leaning out
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const t = mesh(new THREE.ConeGeometry(0.05, 0.46, 5), frond,
      Math.cos(a) * 0.2, 0.34, Math.sin(a) * 0.2, body);
    t.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
  }
  mesh(new THREE.SphereGeometry(0.1, 10, 10), bud, 0, 0.36, 0.06, body);
  return { root, body, kind: 'blob' };
}

// Jellune: the only transparent thing in the town, and the only one with its light inside.
function buildJellune() {
  const root = new THREE.Group();
  const body = node(0, 0.72, 0, root);
  const bellM = mat(0x8fd8ff, { roughness: 0.25, transparent: true, opacity: 0.45 });
  const core = mat(0xdff6ff, { emissive: 0x4fc8ff, emissiveIntensity: 1.5, roughness: 0.3 });
  const tendril = mat(0xbfe8ff, { roughness: 0.6, transparent: true, opacity: 0.6 });
  const bell = mesh(new THREE.SphereGeometry(0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), bellM, 0, 0.1, 0, body);
  bell.scale.set(1, 1.05, 1);
  mesh(new THREE.SphereGeometry(0.11, 10, 10), core, 0, 0.06, 0, body);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, r = 0.2 + (i % 2) * 0.07;
    mesh(new THREE.CylinderGeometry(0.018, 0.008, 0.6 + (i % 3) * 0.18, 4), tendril,
      Math.cos(a) * r, -0.32 - (i % 3) * 0.08, Math.sin(a) * r, body);
  }
  return { root, body, kind: 'blob' };
}

// Marinox: the town's soldier, and the first upright thing in it.
function buildMarinox() {
  const scaleM = mat(0x3f8a72, { roughness: 0.65 });
  const paleM = mat(0xbfe0c8, { roughness: 0.8 });
  const finM = mat(0x5fc8b0, { roughness: 0.55, transparent: true, opacity: 0.85 });
  const shellM = mat(0xe4d8b8, { roughness: 0.6 });
  const eyeM = mat(0xffd24a, { emissive: 0xffa81a, emissiveIntensity: 0.8 });
  return humanoid({
    scale: 1.0, hip: 0.95, torsoH: 0.66, shoulderW: 0.27, legW: 0.14,
    buildTorso(t, h) {
      mesh(new THREE.CapsuleGeometry(0.2, 0.34, 5, 10), scaleM, 0, h * 0.55, 0, t);
      mesh(new THREE.SphereGeometry(0.17, 10, 8), paleM, 0, h * 0.42, 0.11, t).scale.set(1, 1.5, 0.5);
      // a dorsal fin down the spine
      for (let i = 0; i < 3; i++) {
        const f = mesh(new THREE.ConeGeometry(0.09 - i * 0.02, 0.24, 3), finM, 0, h - 0.12 - i * 0.18, -0.18, t);
        f.rotation.x = -0.4; f.scale.set(1, 1, 0.2);
      }
    },
    buildHead(hd) {
      mesh(new THREE.SphereGeometry(0.19, 12, 10), scaleM, 0, 0.16, 0, hd).scale.set(1, 1, 1.25);
      mesh(new THREE.ConeGeometry(0.12, 0.26, 7), scaleM, 0, 0.12, 0.2, hd).rotation.x = HALF;   // snout
      for (const side of [-1, 1]) {
        mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeM, side * 0.11, 0.21, 0.13, hd);
        // the cheek fins from the brief
        const gill = mesh(new THREE.ConeGeometry(0.1, 0.3, 3), finM, side * 0.18, 0.12, -0.04, hd);
        gill.rotation.set(0, 0, -side * 1.2); gill.scale.set(1, 1, 0.22);
      }
    },
    buildArm(a, side) {
      mesh(new THREE.CapsuleGeometry(0.058, 0.3, 4, 8), scaleM, 0, -0.2, 0, a);
      mesh(new THREE.CapsuleGeometry(0.05, 0.28, 4, 8), scaleM, side * 0.03, -0.5, 0, a);
      if (side < 0) {   // the shell spear rides the weapon-side arm
        const haft = mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.9, 6), shellM, -0.06, -0.55, 0.08, a);
        haft.rotation.x = 0.18;
        mesh(new THREE.ConeGeometry(0.09, 0.34, 7), shellM, -0.06, 0.3, 0.02, a);
      }
    },
    buildLeg(l) {
      mesh(new THREE.CapsuleGeometry(0.075, 0.34, 4, 8), scaleM, 0, -0.25, 0, l);
      mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8), scaleM, 0, -0.6, 0, l);
      mesh(new THREE.BoxGeometry(0.16, 0.06, 0.3), finM, 0, -0.8, 0.07, l);   // webbed foot
    },
  });
}

// Shellora: two shells and a pearl. Wide and low, so it reads as cover rather than a creature.
function buildShellora() {
  const root = new THREE.Group();
  const body = node(0, 0.42, 0, root);
  const shellS = mat(0x9a8fa8, { roughness: 0.45 });
  const innerS = mat(0xffe8f4, { roughness: 0.2, metalness: 0.3 });
  const pearl = mat(0xfff4fa, { emissive: 0xffd8ee, emissiveIntensity: 0.7, roughness: 0.1, metalness: 0.4 });
  for (const [sign, tilt] of [[1, -0.5], [-1, 0.32]]) {
    const half = mesh(new THREE.SphereGeometry(0.52, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2), shellS, 0, 0.02, 0, body);
    half.rotation.z = Math.PI * (sign > 0 ? 0 : 1) + tilt * sign;
    half.scale.set(1, 0.55, 0.85);
    const lip = mesh(new THREE.TorusGeometry(0.5, 0.035, 6, 18), innerS, 0, 0.02, 0, body);
    lip.rotation.x = HALF; lip.rotation.z = tilt * sign * 0.4;
    lip.scale.set(1, 0.85, 1);
  }
  mesh(new THREE.SphereGeometry(0.15, 12, 12), pearl, 0, 0.06, 0.02, body);
  // the ribs that make a shell a shell
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + (i / 5) * 1.8;
    const rib = mesh(new THREE.BoxGeometry(0.04, 0.04, 0.9), shellS, Math.sin(a) * 0.3, 0.16, 0, body);
    rib.rotation.y = a * 0.4;
  }
  return { root, body, kind: 'blob' };
}

// Moonraya - PLACEHOLDER. Toto is sculpting her, and this stands in so the fight can be
// played and tuned meanwhile. When the sculpt lands it goes the way Baphomet did: exported
// limb-segmented by tools/export_heroes.py to assets/monsters/moonraya.glb with an entry in
// meta.json, loaded in loadMonsterAssets(), and this function replaced by the GLB build.
const BUILDERS = { poring: () => buildPoring(), lunatic: buildLunatic,
  pecoPeco: buildPecoPeco, ant: buildAnt, babyWolf: buildBabyWolf, sandWraith: buildSandWraith, golem: buildGolem, phreeoni: buildPhreeoni, skeleton: () => buildSkeleton(), skelArcher: () => buildSkeleton({ archer: true }), orcLord: buildOrcLord, baphomet: () => buildBaphomet(),
  // 1.75 of the boss's 3.0 game units, which is skeleton height.
  baphometling: () => buildBaphomet(0.58, 0.3),
  // Phaelan. Skelbow is the archer skeleton's build in the forest's own colours, so the two
  // read as cousins rather than as the same monster twice.
  famiru: buildFamiru, wispra: buildWispra, foxShade: buildFoxShade,
  munari: buildMunari, bonku: buildBonku, sorya: buildSorya,
  skelbow: () => buildSkeleton({ archer: true, boneColor: 0xcfd6c4, clothColor: 0x3f5b3a }),
  moonraya: buildMoonrayaGlb,
  // Orvane. The tower above, the rift below, and the boss's own shards for his adds.
  flittern: buildFlittern, hushling: buildHushling, stringen: buildStringen,
  grinlit: buildGrinlit, velmara: buildVelmara, nyxmare: buildNyxmare,
  shardling: buildShardling,
  darkSword: buildDarkSwordGlb,
  // Bairune. Nerakos is the fifth sculpt: one continuous body, so no arms and no legs in
  // his rig - the six dorsal tentacles are the limb that moves.
  craboon: buildCraboon, hydrella: buildHydrella, jellune: buildJellune,
  marinox: buildMarinox, shellora: buildShellora, nerakos: buildNerakosGlb,
  // Morroc's boss. No legs: the pose rig simply leaves out what the sculpt does not have.
  sandman: buildSandmanGlb };

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
  // Views built ahead of their spawn. A monster is a few dozen primitives, and building
  // five of them on the frame a wave lands cost 40-75 ms on a tablet; prebuild() lists what
  // the next room will spawn and tick() builds one per frame while the player walks out.
  const pool = {};
  let queue = [];

  // Frame-spike attribution. The stutter to explain is "several monsters at once", and the
  // two candidates look identical from the outside: a view built on the frame it is needed
  // because the pool ran dry, or a batch of them freed at once when a wave dies. Stamp both
  // with what they cost, so a report from a tablet says which it was instead of suggesting
  // both. world.marks is read by src/telemetry.js and by the stats overlay.
  const note = (label) => { if (world.marks) { world.marks.push({ at: performance.now(), label }); if (world.marks.length > 12) world.marks.shift(); } };

  const take = (type) => {
    const list = pool[type];
    if (list && list.length) return list.pop();
    // The expensive path: a few dozen primitives, 40-75 ms on a tablet, on the frame a
    // monster is already meant to be on screen.
    const t0 = performance.now();
    const built = BUILDERS[type]();
    note(`monster ${type} built cold ${Math.round(performance.now() - t0)}ms (queue ${queue.length})`);
    return built;
  };

  function create(e) {
    const built = take(e.type);
    const group = new THREE.Group();
    group.add(built.root);
    world.scene.add(group);
    const materials = new Set();
    built.root.traverse((o) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) materials.add(m); } });
    for (const m of materials) {
      // A recycled view arrives mid-death: flashed, faded, half transparent. Put it back the
      // way it was built rather than recording the state it died in as its resting state.
      if (m.userData.emissive) { m.emissive.copy(m.userData.emissive); m.color.copy(m.userData.color); m.opacity = m.userData.opacity; m.transparent = m.userData.transparent; }
      else { m.userData.emissive = m.emissive.clone(); m.userData.color = m.color.clone(); m.userData.opacity = m.opacity; m.userData.transparent = m.transparent; }
    }
    // The build comes off a shelf, so anything the last owner left on it is reset here: a
    // boss that died raging would otherwise hand the next one his flung-out shards.
    for (const limb of ['shards', 'tentacles']) {
      if (built.rig?.[limb]) { built.rig[limb].scale.setScalar(1); built.rig[limb].rotation.set(0, 0, 0); }
    }
    group.scale.setScalar(1);
    const v = { id: e.id, type: e.type, group, built, materials, cur: {}, scratch: {}, walkPhase: 0, yaw: e.facing * HALF, t: Math.random() * 10, dead: false, rageT: 0, shardSpin: 0 };
    views.set(e.id, v);
    return v;
  }

  // Freeing a monster used to mean freeing everything it was made of. Several dozen
  // geometries and materials went back to the driver, and with them the shader programs -
  // which the next monster of that type then compiled again. The tablet's report caught it
  // as seven programs compiled inside one 69 ms frame. So the body goes back on the shelf
  // instead; only a room change or the end of a run actually destroys anything.
  // How many of each type to keep on the shelf: what the room actually asks for at most,
  // because a room needing nine of something and a shelf holding eight means one built cold
  // on every lap. prebuild() works that number out already.
  const need = {};
  const keepFor = (type) => Math.max(4, need[type] || 0);
  function retire(v) {
    world.scene.remove(v.group);
    v.group.remove(v.built.root);
    const list = (pool[v.type] ||= []);
    if (list.length < keepFor(v.type)) list.push(v.built); else destroy(v.built);
    views.delete(v.id);
  }

  function destroy(built) {
    built.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) m.dispose(); }
    });
  }

  function updateHumanoid(v, e, dt) {
    const { rig, base } = v.built;
    const rest = REST[e.type] || EMPTY_REST;
    const ai = e.def.ai === 'hopper' ? 'walker' : e.def.ai;
    const clips = CLIPS_BY_TYPE[e.type] || CLIPS[ai] || CLIPS.walker;
    let target = v.scratch, rate = 16;
    if (e.frozen > 0) {
      // Whatever it was doing, it is doing it still. No target and a rate of nothing means
      // blendTo is never called below and the pose it was caught in is the pose it keeps -
      // which is what a thing frozen mid-stride looks like, and cheaper than a clip.
      applyPose(rig, base, rest, v.cur, v.yaw);
      return;
    }
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
      // walkPose is a pair of sines, which is all the primitive monsters need. A type that
      // ships a `walk` clip drives it off the same phase instead, one cycle per 2*PI, so
      // speed still sets the cadence.
      target = clips.walk
        ? evalClip(clips.walk, (v.walkPhase / TAU) % 1, v.scratch)
        : walkPose(v.walkPhase, e.boss ? 0.8 : 1, v.scratch);
    } else {
      // v.t opens on a random per-spawn offset, so a pack of minions does not breathe in
      // lockstep the way a shared clock would make them.
      target = clips.idle
        ? evalClip(clips.idle, (v.t / IDLE_SECS) % 1, v.scratch)
        : idlePose(v.t, v.scratch);
    }
    blendTo(v.cur, target, rate, dt);
    // A spin attack turns the whole body, so its yaw is taken raw rather than blended: an
    // eased hand-off would unwind most of a revolution in a tenth of a second the instant
    // the clip ended. The clip opens at zero and closes on very nearly a whole turn, so
    // dropping the channel on the next frame is very nearly invisible.
    v.cur.ryaw = target.ryaw ?? 0;
    applyPose(rig, base, rest, v.cur, v.yaw);
  }

  function updateBlob(v, e, dt) {
    const { body } = v.built;
    const def = e.def;
    // A blob body and a hopping gait used to arrive together, because every blob so far was
    // a hopper. Phaelan has two that drift instead - a shade and a bat - so the hop is now
    // optional, and without one they simply glide.
    const hop = def.hop || { height: 0, period: 1 };
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
      lift = hop.height * arc;
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
    if (v.built.ears) for (const ear of v.built.ears) ear.rotation.x = -0.3 * (v.cur.lift / Math.max(0.01, hop.height)) - 0.1 * Math.sin(v.t * 4);
  }

  function dropPool() {
    for (const list of Object.values(pool)) for (const b of list) destroy(b);
    for (const k in pool) pool[k] = [];
    queue = [];
  }

  return {
    // Queue the views a room will need - every wave, plus a boss's brood - beyond what the
    // pool already holds. Leftovers from the room before are dropped first.
    prebuild(roomDef, monsterDefs) {
      dropPool();
      for (const k in need) delete need[k];
      for (const wave of roomDef.waves || []) for (const g of wave) {
        need[g.type] = (need[g.type] || 0) + g.count;
        const adds = monsterDefs?.[g.type]?.adds;
        if (adds) need[adds.type] = (need[adds.type] || 0) + adds.count;
      }
      for (const [type, n] of Object.entries(need)) if (BUILDERS[type]) for (let i = 0; i < n; i++) queue.push(type);
      return queue.length;
    },
    // Build one queued view. Returns true while there is more to do.
    tick() {
      const type = queue.shift();
      if (!type) return false;
      (pool[type] ||= []).push(BUILDERS[type]());
      return queue.length > 0;
    },
    get pending() { return queue.length; },
    // Shader warm-up: one of every monster, far off-screen, so the renderer can compile
    // their programs at load instead of on the frame the first one walks in. Returns the
    // teardown; call it after renderer.compile().
    warm() {
      // Spread along the play line rather than parked off the map: inside the camera and
      // inside the shadow box, so the depth pass compiles their shaders too.
      const built = Object.keys(BUILDERS).map((type, i) => { const b = BUILDERS[type](); b.root.position.set(WARM_X + (i % 7) * 1.2 - 3, 0, WARM_Z); world.scene.add(b.root); return b.root; });
      return () => { for (const r of built) { world.scene.remove(r); r.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); } };
    },
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

        // The shards a sculpt carries loose (the Dark Sword's obsidian) turn on their own,
        // slowly while he is whole and fast once he is not - and in the second half they fly
        // out wide, which is the only part of a phase change the silhouette can show.
        const rage = e.def.rage, raging = rage && e.addsDone && !e.dead;
        // The second phase's ramp. Everything phase 2 shows is derived from it - the tint and
        // the growth as much as the shards - so it is raised here rather than inside the
        // shards branch, where it used to sit. A boss with no shards node never entered that
        // branch, so his rageT stayed at 0 and he crossed half health without changing at
        // all: Nerakos, who is tentacles where the Dark Sword is obsidian.
        //
        // Clamped at BOTH ends. Only the top was, so a boss that spent a minute below the
        // threshold eased its way down to -180 instead of resting at 0 - and the moment it
        // crossed into its second phase every value derived from this went with it: the
        // group scaled by -9.8, which is a boss inside out and ten times too big, which is
        // a boss you cannot see.
        if (rage) v.rageT = Math.max(0, Math.min(1, (v.rageT || 0) + (raging ? dt * 1.6 : -dt * 3)));
        if (v.built.rig?.shards) {
          const sh = v.built.rig.shards;
          v.shardSpin = (v.shardSpin || 0) + dt * (0.5 + 2.6 * v.rageT);
          sh.rotation.y = v.shardSpin;
          sh.rotation.z = Math.sin(v.t * 0.7) * 0.1;
          const out = 1 + (rage ? (rage.shards - 1) * v.rageT : 0);
          sh.scale.setScalar(out);
        }

        // Nerakos' six dorsal tentacles are a limb of their own, and the only one he has -
        // his body is a single mesh, so there is no arm to swing and no leg to step. They
        // drift with the water while he stands, draw back through a windup and surge on the
        // strike, which is where the weight of every one of his moves has to come from.
        // applyPose never touches this node, so it is driven here rather than keyed: a clip
        // would be overwritten by the next frame's pose.
        if (v.built.rig?.tentacles) {
          const tn = v.built.rig.tentacles;
          const drive = e.dead ? -0.7 : e.state === 'windup' ? -1 : e.state === 'attack' ? 1.7 : 0;
          v.tent = (v.tent ?? 0) + (drive - (v.tent ?? 0)) * Math.min(1, 9 * dt);
          tn.rotation.x = Math.sin(v.t * 1.3) * 0.07 + v.tent * 0.20;
          tn.rotation.y = Math.sin(v.t * 0.7) * 0.06 + v.tent * 0.08;
          tn.rotation.z = Math.sin(v.t * 0.9 + 1.2) * 0.05;
          // and they lengthen with the second phase, which is where his `rage.shards` goes:
          // the same number the Dark Sword throws his obsidian out by.
          tn.scale.setScalar(1 + (rage ? (rage.shards - 1) * v.rageT : 0));
        }

        // hit flash, and the dead sink into the floor and fade
        const flash = e.flash > 0;
        const fade = e.dead ? Math.max(0, 1 - Math.max(0, e.deathT - 0.5) / 0.6) : 1;
        if (e.dead && v.built.kind === 'humanoid') v.group.position.y -= Math.max(0, e.deathT - 0.5) * 0.6;
        // Tinting is a uniform, not a shader variant: a raging boss costs no new program and
        // nothing to download, which is the whole reason he changes colour rather than model.
        const k = raging ? (v.rageT ?? 0) : 0;
        if (rage && (k > 0 || v.wasRaging)) {
          v.wasRaging = k > 0;
          if (!RAGE_A) { RAGE_A = new THREE.Color(); RAGE_B = new THREE.Color(); }
          RAGE_A.setHex(rage.tint); RAGE_B.setHex(rage.emissive);
          if (rage.grow) v.group.scale.setScalar(1 + (rage.grow - 1) * k);
        }
        const iced = e.frozen > 0;
        if (iced && !FROST) { FROST = new THREE.Color(0x4f9ed0); }
        for (const m of v.materials) {
          if (iced) {
            // Enough to read as ice at a glance, not enough to erase the monster under it.
            // At 0.55 of a pale blue a Craboon went to flat white and stopped being a crab.
            m.emissive.setRGB(0.04, 0.13, 0.22);
            m.color.copy(m.userData.color).lerp(FROST, 0.5);
            v.tinted = true;
            continue;
          }
          if (flash) m.emissive.setRGB(0.32, 0.28, 0.24);
          else if (k > 0) {
            // Emissive does the work, not colour. This sculpt is near-black and the room is
            // lit violet, so a tinted base colour reads as the same black - what shows on a
            // black model is the light it makes itself. The lerp turns whatever already glows
            // from violet towards red, and the scale lifts the armour, which glows at nothing,
            // up off zero.
            m.emissive.copy(m.userData.emissive).lerp(RAGE_B, k * 0.55);
          } else m.emissive.copy(m.userData.emissive);
          if (k > 0) m.color.copy(m.userData.color).lerp(RAGE_A, k * 0.45);
          else if (v.tinted) m.color.copy(m.userData.color);
          if (fade < 1) { m.transparent = true; m.opacity = m.userData.opacity * fade; }
        }
        v.tinted = k > 0;
      }
      // Freeing is not free: every primitive's geometry and material goes back to the driver,
      // and a wave that dies together frees them together.
      let freed = 0;
      const t0 = performance.now();
      for (const v of [...views.values()]) if (!seen.has(v.id)) { retire(v); freed++; }
      if (freed > 1) note(`${freed} monsters shelved ${Math.round(performance.now() - t0)}ms (${views.size} left)`);
    },
    // The end of a run: nothing is coming back, so let it all go, shelf included.
    clear() { for (const v of [...views.values()]) { world.scene.remove(v.group); destroy(v.built); views.delete(v.id); } dropPool(); },
  };
}
