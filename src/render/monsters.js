// Monster views built from primitives (the sibling project's chibi approach), animated from
// the sim state. Humanoids (skeletons, the Orc Lord) use the same limb rig / applyPose as the
// heroes; blobs (Poring, Lunatic) squash and stretch.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { evalClip, walkPose, idlePose, blendTo, applyPose } from './anim.js';

const HALF = Math.PI / 2;
const TAU = Math.PI * 2;

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

function buildBaphomet(scale = 1, darken = 0) {
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
    // Minions are the same sculpt, so they need a tonal shift or the player cannot tell at a
    // glance which silhouette is the one with 880 HP.
    if (darken) o.material.color.multiplyScalar(1 - darken);
  });
  const rig = { root };
  for (const name of ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'weapon']) {
    const n = root.getObjectByName(name);
    if (n) rig[name] = n;
  }
  for (const k of ['root', 'torso', 'head']) if (rig[k]) rig[k].rotation.order = 'YXZ';
  if (scale !== 1) root.scale.setScalar(scale);
  const base = { root: rig.root.position.clone(), torso: rig.torso.position.clone() };
  return { root, rig, base, kind: 'humanoid' };
}

// Per-type rest offsets, added to every pose. The primitive monsters are modelled standing
// upright so they need none; Baphomet is sculpted already crouched and hunched, and the boss
// clips lean forward on top of that, which pitched him nearly horizontal on the slam.
const EMPTY_REST = {};
const REST = { baphomet: { tx: -0.24, hx: 0.16 }, baphometling: { tx: -0.24, hx: 0.16 } };

// The shared `boss` clips swing aRx, because the Orc Lord carries his axe in the right hand.
// Baphomet's scythe is parented to armL, so those clips swung an empty arm and the attack
// read as no animation at all. These drive the arm that actually holds the weapon.
export const CLIPS_BY_TYPE = {
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

const BUILDERS = { poring: () => buildPoring(), lunatic: buildLunatic, skeleton: () => buildSkeleton(), skelArcher: () => buildSkeleton({ archer: true }), orcLord: buildOrcLord, baphomet: () => buildBaphomet(),
  // 1.75 of the boss's 3.0 game units, which is skeleton height.
  baphometling: () => buildBaphomet(0.58, 0.3) };

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
    const clips = CLIPS_BY_TYPE[e.type] || CLIPS[ai] || CLIPS.walker;
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
      // walkPose is a pair of sines, which is all the primitive monsters need. A type that
      // ships a `walk` clip drives it off the same phase instead, one cycle per 2*PI, so
      // speed still sets the cadence.
      target = clips.walk
        ? evalClip(clips.walk, (v.walkPhase / TAU) % 1, v.scratch)
        : walkPose(v.walkPhase, e.boss ? 0.8 : 1, v.scratch);
    } else {
      target = idlePose(v.t, v.scratch);
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
