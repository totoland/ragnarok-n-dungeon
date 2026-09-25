// Hero views: load the limb-segmented GLBs baked by tools/export_heroes.py and animate them
// procedurally from the sim state. No skinning — each limb is a rigid mesh whose origin is
// its joint (see the exporter docstring for the hierarchy), so a pose is just a set of Euler
// rotations and small offsets, driven by keyframe clips in this file.
//
// Channel sign conventions (see anim.js): aLx/aRx/lLx/lRx positive = limb swings forward,
// tx/hx positive = lean/nod forward, cx positive = cape blown back, rx = root tips forward.
import * as THREE from 'three';
import { auraOf } from '../sim/data/items.js';
import { auraTick } from './aura.js';
import { loadGearAssets, createHatSlot, weaponNode } from './gear.js';
import { ITEMS } from '../sim/data/items.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SKIN, prepareSkin, attachSkinRig, driveSkin, layerSkin, attackClipTime, stepLayers, cloneModel } from './skin.js';
import { evalClip, walkPose, idlePose, blendTo, applyPose } from './anim.js';
import { PLAYER } from '../config.js';

// Emissive tint per buff.
// Only Quicken tints the body. Wind Walk is drawn as dust and gusts at the feet (fx.js), which
// reads as wind where a green glow just read as poison.
// Nothing tints the body any more: Quicken used to glow the Knight gold from head to foot, and
// Toto had it moved to the ground - an aura at his feet, drawn in fx.js like Wind Walk's.
const AURA = {};
const AURA_TMP = new THREE.Color();

const HALF = Math.PI / 2;

// ------------------------------------------------------------------ clips

const COMMON = {
  hurt: [[0, { tx: -0.55, hx: -0.4, aLx: -0.8, aRx: -0.8, aLz: 0.5, aRz: -0.5, lLx: 0.5, lRx: -0.3, cx: -0.3 }], [1, { tx: -0.45, hx: -0.3, aLx: -0.6, aRx: -0.6, aLz: 0.4, aRz: -0.4, lLx: 0.4, lRx: -0.2 }]],
  dash: [[0, { tx: 0.55, hx: 0.25, aLx: -0.6, aRx: -0.6, lLx: 1.0, lRx: -0.9, cx: 1.1, ty: -0.05 }], [1, { tx: 0.55, hx: 0.25, aLx: -0.6, aRx: -0.6, lLx: 1.0, lRx: -0.9, cx: 1.1, ty: -0.05 }]],
  air: [[0, { lLx: 0.55, lRx: -0.35, aLz: 0.35, aRz: -0.35, tx: 0.1, cx: 0.5 }], [1, { lLx: 0.55, lRx: -0.35, aLz: 0.35, aRz: -0.35, tx: 0.1, cx: 0.5 }]],
  dead: [[0, { tx: -0.3, aLx: -0.5, aRx: -0.5 }], [0.5, { rx: -1.5, ry: 0.25, aLx: -1.2, aRx: -1.2, aLz: 0.6, aRz: -0.6, lLx: 0.3, lRx: -0.2, hx: -0.3 }], [1, { rx: -1.52, ry: 0.22, aLx: -1.1, aRx: -1.1, aLz: 0.6, aRz: -0.6, lLx: 0.3, lRx: -0.2, hx: -0.3 }]],
};

const KNIGHT = {
  rest: {},
  armOrder: 'YXZ',
  walkArmScale: 0.45,        // the sword arm swings less so the blade stays roughly upright
  clips: {
    slash1: [ // overhead chop
      [0, { aLx: -0.2 }],
      [0.25, { aLx: -1.5, aLz: 0.25, tx: -0.22, tyaw: 0.25, aRx: 0.5, lLx: 0.35, lRx: -0.35, hx: -0.1 }],
      [0.42, { aLx: 1.9, aLz: 0.1, tx: 0.42, tyaw: -0.2, aRx: -0.6, lLx: 0.7, lRx: -0.55, hx: 0.25 }],
      [0.7, { aLx: 1.6, tx: 0.32, tyaw: -0.15, aRx: -0.45, lLx: 0.55, lRx: -0.45, hx: 0.15 }],
      [1, {}],
    ],
    slash2: [ // horizontal sweep: sword forward, whole body twists through
      [0, { aLx: 1.5, aLy: 0.9, tyaw: 0.55, tx: 0.1, aRx: 0.2 }],
      [0.25, { aLx: 1.45, aLy: 1.1, tyaw: 0.7, tx: 0.15, aRx: 0.3, lLx: 0.3, lRx: -0.4 }],
      [0.48, { aLx: 1.5, aLy: -1.2, tyaw: -0.7, tx: 0.35, aRx: -0.5, lLx: 0.6, lRx: -0.5, hx: 0.15 }],
      [0.75, { aLx: 1.3, aLy: -1.0, tyaw: -0.55, tx: 0.25, aRx: -0.4, lLx: 0.5, lRx: -0.4 }],
      [1, {}],
    ],
    slash3: [ // lunging thrust
      [0, { aLx: -0.4, tx: -0.15, aRx: 0.3 }],
      [0.2, { aLx: -0.8, aLz: 0.2, tx: -0.25, tyaw: 0.3, aRx: 0.5, lLx: -0.3, lRx: 0.4 }],
      [0.38, { aLx: 1.75, tx: 0.55, tyaw: -0.25, aRx: -0.7, lLx: 0.9, lRx: -0.7, hx: 0.3, ty: -0.08 }],
      [0.7, { aLx: 1.6, tx: 0.45, tyaw: -0.2, aRx: -0.6, lLx: 0.8, lRx: -0.6, hx: 0.2, ty: -0.06 }],
      [1, {}],
    ],
    airSlash: [
      [0, { aLx: -1.4, lLx: 0.8, lRx: 0.4, tx: -0.2 }],
      [0.3, { aLx: 2.1, lLx: 0.9, lRx: 0.3, tx: 0.4, aRx: -0.5, hx: 0.3 }],
      [1, { aLx: 1.6, lLx: 0.6, lRx: 0.2, tx: 0.2 }],
    ],
    quicken: [ // sword held high, hold the pose while the aura catches, settle
      [0, { aLx: 0.2 }],
      [0.25, { aLx: -2.9, aLz: 0.15, tx: -0.2, hx: -0.35, aRx: -0.4, ty: 0.05 }],
      [0.7, { aLx: -2.8, aLz: 0.15, tx: -0.15, hx: -0.3, aRx: -0.35, ty: 0.05 }],
      [1, {}],
    ],
    bash: [ // long wind-up, brutal overhead
      [0, { aLx: -0.5 }],
      [0.3, { aLx: -2.3, aLz: 0.35, tx: -0.35, tyaw: 0.35, aRx: 0.7, lLx: -0.2, lRx: 0.4, hx: -0.2, ty: 0.04 }],
      [0.42, { aLx: 2.2, aLz: 0.1, tx: 0.6, tyaw: -0.3, aRx: -0.8, lLx: 0.9, lRx: -0.7, hx: 0.35, ty: -0.12 }],
      [0.8, { aLx: 1.9, tx: 0.5, tyaw: -0.25, aRx: -0.6, lLx: 0.8, lRx: -0.6, hx: 0.25, ty: -0.1 }],
      [1, {}],
    ],
    magnumBreak: [ // sword to the sky, then slam the ground
      [0, { aLx: -0.3 }],
      [0.28, { aLx: -2.9, aLz: 0.1, tx: -0.3, aRx: -1.2, aRz: -0.6, lLx: -0.25, lRx: 0.25, hx: -0.4, ty: 0.06 }],
      [0.4, { aLx: 1.2, tx: 0.55, aRx: -0.4, aRz: -0.5, lLx: 0.7, lRx: -0.7, lLz: 0.35, lRz: -0.35, hx: 0.3, ty: -0.28 }],
      [0.75, { aLx: 1.1, tx: 0.45, aRx: -0.3, aRz: -0.4, lLx: 0.6, lRx: -0.6, lLz: 0.3, lRz: -0.3, hx: 0.2, ty: -0.24 }],
      [1, {}],
    ],
    bowlingBash: [ // sword low and forward, sprint through everything
      [0, { aLx: 0.6, tx: 0.2 }],
      [0.15, { aLx: 1.2, aLy: 0.5, tx: 0.55, aRx: -0.9, hx: 0.3, cx: 0.9 }],
      [0.6, { aLx: 1.35, aLy: 0.45, tx: 0.6, aRx: -1.0, hx: 0.35, cx: 1.1 }],
      [0.8, { aLx: 0.7, tx: 0.25, aRx: -0.3, cx: 0.4 }],
      [1, {}],
    ],
  },
  run: { bowlingBash: [0.1, 0.65, 26] }, // overlay a sprint on the legs: [from, until, phase rate]
  // The skinned Knight (tools/export_skinned_hero.py): which Mixamo clip plays each thing he
  // does. An attack's clip is cut to [strike - pre, strike + post] seconds and time-warped so
  // its fastest frame lands on the attack's first hit; everything not listed stays on the
  // procedural clips above, driven onto the same bones.
  skinned: {
    walk: { clip: 'walk', stride: 1.8, keep: 'swordArm' },   // game units per cycle
    idle: { clip: 'idle', keep: 'swordArm' },                 // an unarmed idle: the sword arm keeps its stance
    air: { clip: 'jump' },
    dead: { clip: 'dead' },                                   // plays once and holds the last frame
    hurt: { clip: 'hurt', rate: 1.5 },
    attacks: {
      slash1: { clip: 'slash1', pre: 0.45, post: 0.5 },
      slash2: { clip: 'slash2', pre: 0.4, post: 0.45 },
      slash3: { clip: 'slash3', pre: 0.5, post: 0.6 },
      // Quicken is a 0.55 s cast: only the sword going up to the sky and back out of Mixamo's
      // "Sword And Shield Power Up", not its long held flex.
      quicken: { clip: 'powerup', pre: 0.4, post: 0.4 },
    },
  },
};

const HUNTER = {
  // Bow arm turned 90° so the bow faces the camera and points forward, raised in front of the
  // chest; wz cancels the raise so the bow stays vertical (see the arm's XYZ Euler order).
  rest: { aLy: HALF, aLx: 0.8, wz: 0.8 },
  armOrder: 'XYZ',
  walkArmScale: 0.35,
  clips: {
    shoot: [
      [0, { aRx: 0.9, aRy: 0.3, tx: 0.05 }],
      [0.2, { aRx: 0.45, aRy: 0.5, tx: -0.05, tyaw: 0.15, aLx: 0.15 }],
      [0.32, { aRx: 1.25, aRy: 0.2, tx: 0.15, tyaw: -0.05, aLx: 0.25 }],
      [0.7, { aRx: 0.9, aRy: 0.3, tx: 0.05, aLx: 0.1 }],
      [1, {}],
    ],
    shootHeavy: [ // kneel + long draw
      [0, { aRx: 0.9 }],
      [0.25, { aRx: 0.35, aRy: 0.5, tx: -0.1, tyaw: 0.2, aLx: 0.2, ry: -0.3, lLx: 0.9, lRx: -1.1, lLz: 0.2, hx: -0.1 }],
      [0.36, { aRx: 1.35, aRy: 0.2, tx: 0.2, tyaw: -0.05, aLx: 0.3, ry: -0.3, lLx: 0.9, lRx: -1.1, lLz: 0.2, hx: 0.05 }],
      [0.8, { aRx: 1.0, tx: 0.1, aLx: 0.15, ry: -0.25, lLx: 0.8, lRx: -1.0, lLz: 0.2 }],
      [1, {}],
    ],
    airShot: [
      [0, { aRx: 0.8, lLx: 0.7, lRx: 0.3, aLx: 0.6, tx: 0.2 }],
      [0.25, { aRx: 0.3, aRy: 0.5, lLx: 0.8, lRx: 0.3, aLx: 0.7, tx: 0.25 }],
      [0.35, { aRx: 1.3, lLx: 0.8, lRx: 0.3, aLx: 0.75, tx: 0.3 }],
      [1, { aRx: 0.8, lLx: 0.5, lRx: 0.2, aLx: 0.4, tx: 0.15 }],
    ],
    windWalk: [ // coil low, then spring up and open the arms as the wind takes hold
      [0, { tx: 0.1 }],
      [0.3, { tx: 0.45, ty: -0.18, lLx: 0.5, lRx: -0.4, aRx: 0.3, aLx: 0.3, hx: 0.3 }],
      [0.6, { tx: -0.2, ty: 0.12, aRx: -1.2, aRz: 0.7, aLx: -1.0, aLz: -0.7, hx: -0.25 }],
      [1, {}],
    ],
    doubleStrafe: [
      [0, { aRx: 0.9, tx: 0.1 }],
      [0.15, { aRx: 0.4, aRy: 0.5, tx: -0.05, aLx: 0.2, tyaw: 0.15 }],
      [0.22, { aRx: 1.25, tx: 0.2, aLx: 0.3, tyaw: -0.05 }],
      [0.35, { aRx: 0.4, aRy: 0.5, tx: -0.05, aLx: 0.2, tyaw: 0.15 }],
      [0.42, { aRx: 1.25, tx: 0.2, aLx: 0.3, tyaw: -0.05 }],
      [0.75, { aRx: 0.9, tx: 0.1, aLx: 0.1 }],
      [1, {}],
    ],
    arrowShower: [ // aim skyward, loose
      [0, { aRx: 0.9 }],
      [0.3, { aLx: -1.4, aRx: -0.7, aRy: 0.4, tx: -0.35, hx: -0.5, lLx: 0.3, lRx: -0.3 }],
      [0.42, { aLx: -1.2, aRx: -0.2, tx: -0.2, hx: -0.4, lLx: 0.3, lRx: -0.3 }],
      [0.75, { aLx: -0.6, aRx: 0.3, tx: -0.05, hx: -0.15 }],
      [1, {}],
    ],
    blitzBeat: [ // raise the falcon arm, then point at the target
      [0, { aRx: 0.6 }],
      [0.2, { aRx: -1.6, aRz: -0.3, tx: -0.2, hx: -0.3, ty: 0.03 }],
      [0.4, { aRx: 1.3, tx: 0.2, hx: 0.1 }],
      [0.85, { aRx: 1.2, tx: 0.15, hx: 0.05 }],
      [1, {}],
    ],
  },
  run: {},
};

const DEFS = { knight: KNIGHT, hunter: HUNTER };

// ------------------------------------------------------------------ loading

export async function loadHeroAssets(base = 'assets/heroes/') {
  const loader = new GLTFLoader();
  const [knight, hunter, meta, gear] = await Promise.all([
    loader.loadAsync(base + 'knight.glb'),
    loader.loadAsync(base + 'hunter.glb'),
    fetch(base + 'meta.json').then((r) => r.json()),
    loadGearAssets(),
  ]);
  for (const [key, gltf] of [['knight', knight], ['hunter', hunter]]) if (meta?.[key]?.skinned) prepareSkin(key, gltf, meta[key]);
  for (const [key, scene] of [['knight', knight.scene], ['hunter', hunter.scene]]) mountWeapons(scene, key, gear);
  return { knight: knight.scene, hunter: hunter.scene, meta, gear };
}

// A hero model's own copy. A skinned mesh cannot be cloned like the rigid ones: a plain
// clone keeps pointing at the original's bones, and the copy would dance with the live hero.
export function cloneHero(model) {
  return cloneModel(model);
}

function airClipTime(info, vy) {
  const v0 = PLAYER.jumpVel;
  const t0 = info.takeoff ?? 0, apex = info.apex ?? info.dur / 2, land = info.land ?? info.dur;
  if (vy > 0) return t0 + (apex - t0) * THREE.MathUtils.clamp(1 - vy / v0, 0, 1);
  return apex + (land - apex) * THREE.MathUtils.clamp(-vy / v0, 0, 1) * 0.9;
}

/**
 * Hang every loaded weapon model off the hero that wields it, as a sibling of his own weapon
 * with the same transform - which is exactly the shape a baked variant has.
 *
 * Done once at load, on the shared asset, so it costs one clone per weapon for the whole
 * session and everything downstream - showWeapon, restPose, the inventory icon, the plinths -
 * finds it by name and cannot tell it was not baked in. A weapon already baked in wins: the
 * Katana is in the knight's own file and stays there.
 */
function mountWeapons(model, heroKey, gear) {
  const own = model.getObjectByName('weapon');
  if (!own || !gear?.weapons) return;
  for (const id of Object.keys(gear.weapons)) {
    const fitsHero = !ITEMS[id]?.hero || ITEMS[id].hero === heroKey;
    if (!fitsHero || model.getObjectByName(`weapon_${id}`)) continue;
    const node = weaponNode(gear, id);
    if (!node) continue;
    node.name = `weapon_${id}`;
    node.position.copy(own.position);
    node.rotation.copy(own.rotation);
    node.scale.copy(own.scale);
    node.visible = false;
    node.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    own.parent.add(node);
  }
}

// Alternative weapons the exporter baked next to `weapon` (weapon_katana, ...): same
// pivot, same parent, shown one at a time by showWeapon(). The pattern is deliberate:
// GLTFLoader splits a multi-material mesh into primitives it names weapon_1, weapon_2,
// weapon_katana_1, ... and those are parts of a weapon, not weapons.
const VARIANT = /^weapon_([a-z][a-zA-Z]*)$/;
function weaponNodes(root) {
  const out = { weapon: null, variants: {} };
  root.traverse((o) => {
    if (o.name === 'weapon') out.weapon = o;
    else { const m = VARIANT.exec(o.name); if (m) out.variants[m[1]] = o; }
  });
  return out;
}

function findRig(root) {
  const rig = { root };
  for (const name of ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'cape', 'weapon', 'falcon', 'wingL', 'wingR']) {
    const n = root.getObjectByName(name);
    if (n) rig[name] = n;
  }
  // Where a hat goes. On a rigid hero that is the head node itself; on a skinned one the
  // head node is an anchor riding the Head bone, and `head` below becomes a stand-in.
  rig.hatHead = rig.head;
  rig.variants = weaponNodes(root).variants;
  attachSkinRig(rig, root);
  return rig;
}

// Put a clone of a hero model into its rest pose - the plinths and the profile turntable
// clone the shared asset, which the live view may have left mid-swing.
export function restPose(model, heroKey) {
  const rig = findRig(model);
  const base = {};
  for (const k of ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'cape', 'weapon', 'root']) if (rig[k]) base[k] = rig[k].position.clone();
  if (model.userData.base) for (const k in model.userData.base) if (base[k]) base[k].copy(model.userData.base[k]);
  applyPose(rig, base, DEFS[heroKey].rest, {}, 0);
  if (rig.skinHero) driveSkin(rig);
  for (const v of Object.values(rig.variants)) { v.rotation.copy(rig.weapon.rotation); v.position.copy(rig.weapon.position); }
}

// Show the wielded weapon and hide the rest. `gearId` is the item id (data/items.js) or
// null for the hero's own weapon; an item with no model of its own falls back to that.
export function showWeapon(model, gearId) {
  const { weapon, variants } = weaponNodes(model);
  const variant = gearId ? variants[gearId] || null : null;
  if (weapon) weapon.visible = !variant;
  for (const node of Object.values(variants)) node.visible = node === variant;
}

// ------------------------------------------------------------------ view

export function createHeroView(world, heroKey, assets) {
  const def = DEFS[heroKey];
  const model = assets[heroKey];
  const rig = findRig(model);
  const group = new THREE.Group();
  group.add(model);
  world.scene.add(group);

  const materials = new Set();
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { m.envMapIntensity = 0.9; materials.add(m); }
    }
  });
  // Captured once per model: a restart must not re-read a posed hero as its rest state.
  for (const m of materials) if (!m.userData.emissive) m.userData.emissive = m.emissive ? m.emissive.clone() : null;
  // The weapon's materials get their own copies, once, so a refined blade can glow on its
  // own without lighting the gauntlet that shares its material in the export. The model is
  // reused across runs, so a clone already made is kept rather than cloned again.
  const weaponMats = new Set();
  for (const node of [rig.weapon, ...Object.values(rig.variants)]) {
    node?.traverse((o) => {
      if (!o.isMesh || o.name === '__aura') return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map((m) => {
        if (m.userData.weaponClone) return m;
        const c = m.clone(); c.userData.weaponClone = true; c.userData.emissive = m.userData.emissive ? m.userData.emissive.clone() : null;
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
      for (const m of cloned) { weaponMats.add(m); materials.delete(m); }
    });
  }
  let shownGear = undefined;
  let shownHat = undefined;
  const showHat = createHatSlot({ head: rig.hatHead }, heroKey, assets.gear, assets.meta?.[heroKey]?.pivot?.head?.[1] ?? 0);
  if (!model.userData.base) {
    model.userData.base = {};
    for (const k of ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'cape', 'weapon', 'root']) if (rig[k]) model.userData.base[k] = rig[k].position.clone();
  }
  const base = model.userData.base;
  model.visible = true;

  rig.root.rotation.order = 'YXZ';
  for (const k of ['torso', 'head']) if (rig[k]) rig[k].rotation.order = 'YXZ';
  for (const k of ['armL', 'armR']) if (rig[k]) rig[k].rotation.order = def.armOrder;

  // the falcon rides the draw hand; during Blitz Beat it flies free in world space
  let falconPerch = null;
  if (rig.falcon) {
    if (rig.falcon.parent !== rig.armR) rig.armR.attach(rig.falcon);
    if (!model.userData.perch) model.userData.perch = { pos: rig.falcon.position.clone(), quat: rig.falcon.quaternion.clone() };
    falconPerch = model.userData.perch;
    rig.falcon.position.copy(falconPerch.pos);
    rig.falcon.quaternion.copy(falconPerch.quat);
  }
  const falcon = { flying: false, mode: 'blitz', t: 0, target: null, from: new THREE.Vector3(), pos: new THREE.Vector3() };

  const view = {
    group, rig, hero: heroKey, def,
    cur: {}, target: {}, walkPhase: 0, yaw: HALF, t: 0, lastAttack: null,
    scratch: {},
    layers: [],        // skinned heroes: the Mixamo clips playing over the driven pose
  };

  // Which clip, if any, the skinned hero should be playing now, and where in it.
  const skinCfg = rig.skinHero ? def.skinned : null;
  function wantedLayer(p, dt) {
    const S = SKIN[rig.skinHero];
    if (p.state === 'attack' && p.attack) {
      const atk = p.def.attacks[p.attack];
      const cfg = skinCfg.attacks?.[atk.anim || p.attack];
      const C = cfg && S.clips[cfg.clip];
      if (!C) return null;
      const u = Math.min(1, p.attackT / atk.dur);
      const hitU = (atk.hits?.[0]?.at ?? atk.dur / 2) / atk.dur;
      return { name: cfg.clip, key: 'atk:' + p.attack, time: attackClipTime(C.info, cfg, u, hitU) };
    }
    if (p.state === 'walk' && skinCfg.walk && S.clips[skinCfg.walk.clip]) {
      const C = S.clips[skinCfg.walk.clip];
      view.walkTime = ((view.walkTime ?? 0) + dt * (p.speed / skinCfg.walk.stride) * C.info.dur) % C.info.dur;
      return { name: skinCfg.walk.clip, key: 'walk', time: view.walkTime, keep: skinCfg.walk.keep };
    }
    // Struck: the reaction plays from the moment of the hit, a little quicker than Mixamo's,
    // because the stun it covers is a third of a second.
    if (p.state === 'hurt' && skinCfg.hurt && S.clips[skinCfg.hurt.clip]) {
      const C = S.clips[skinCfg.hurt.clip];
      view.hurtT = (view.hurtT ?? 0) + dt;
      return { name: skinCfg.hurt.clip, key: 'hurt', time: Math.min(C.info.dur, view.hurtT * (skinCfg.hurt.rate ?? 1)) };
    }
    view.hurtT = 0;
    if (p.state === 'dead' && skinCfg.dead && S.clips[skinCfg.dead.clip]) {
      const C = S.clips[skinCfg.dead.clip];
      return { name: skinCfg.dead.clip, key: 'dead', time: Math.min(C.info.dur, view.deadT ?? 0) };
    }
    if (p.state === 'idle' && skinCfg.idle && S.clips[skinCfg.idle.clip]) {
      const C = S.clips[skinCfg.idle.clip];
      view.idleTime = ((view.idleTime ?? 0) + dt) % C.info.dur;
      return { name: skinCfg.idle.clip, key: 'idle', time: view.idleTime, keep: skinCfg.idle.keep };
    }
    if (p.state === 'air' && skinCfg.air && S.clips[skinCfg.air.clip]) {
      const C = S.clips[skinCfg.air.clip];
      return { name: skinCfg.air.clip, key: 'air', time: airClipTime(C.info, p.vy) };
    }
    return null;
  }
  function updateLayers(p, dt) {
    view.layers = stepLayers(view.layers, wantedLayer(p, dt), dt);
  }

  view.update = (game, dt) => {
    const p = game.player;
    view.t += dt;
    const yawTarget = p.facing * HALF;
    view.yaw += (yawTarget - view.yaw) * Math.min(1, 16 * dt);
    group.position.set(p.x, p.y, p.z);

    if (rig.falcon) for (const ev of game.events) if (ev.type === 'autoBlitz') startAutoBlitz(game, ev.target);

    // --- choose the target pose
    let target = view.scratch;
    let rate = 18;
    if (p.state === 'attack' && p.attack) {
      const atk = p.def.attacks[p.attack];
      const clipName = atk.anim || p.attack;
      const clip = def.clips[clipName];
      const t = Math.min(1, p.attackT / atk.dur);
      target = clip ? evalClip(clip, t, view.scratch) : idlePose(view.t, view.scratch);
      const run = def.run[clipName];
      if (run && t > run[0] && t < run[1]) {
        view.walkPhase += run[2] * dt;
        const w = walkPose(view.walkPhase, 1.2);
        target.lLx = w.lLx; target.lRx = w.lRx; target.ty = (target.ty ?? 0) + w.ty;
      }
      rate = 34;
      if (p.attack !== view.lastAttack) {
        view.lastAttack = p.attack;
        if (rig.falcon && p.attack === 'blitzBeat') startBlitz(game);
        else if (rig.falcon && p.attack === 'windWalk') startCircle();
      }
    } else {
      view.lastAttack = null;
      switch (p.state) {
        case 'walk': {
          view.walkPhase += dt * p.speed * 2.4;
          target = walkPose(view.walkPhase, 1, view.scratch);
          if (def.walkArmScale != null) { target.aLx *= def.walkArmScale; }
          break;
        }
        case 'dash': target = evalClip(COMMON.dash, 0, view.scratch); rate = 30; break;
        case 'air': target = evalClip(COMMON.air, 0, view.scratch); target.tx += THREE.MathUtils.clamp(-p.vy * 0.03, -0.25, 0.25); break;
        case 'hurt': target = evalClip(COMMON.hurt, Math.min(1, view.t % 0.2 / 0.2), view.scratch); rate = 26; break;
        case 'dead': target = evalClip(COMMON.dead, Math.min(1, (view.deadT = (view.deadT ?? 0) + dt) / 0.6), view.scratch); rate = 12; break;
        default: target = idlePose(view.t, view.scratch); view.walkPhase = 0;
      }
      if (p.state !== 'dead') view.deadT = 0;
    }
    // The death clip falls down on its own; the procedural one tips the whole root over, and
    // both at once would put him through the floor.
    if (skinCfg?.dead && p.state === 'dead' && SKIN[rig.skinHero].clips[skinCfg.dead.clip]) { for (const k in target) delete target[k]; rate = 12; }
    blendTo(view.cur, target, rate, dt);
    applyPose(rig, base, def.rest, view.cur, view.yaw);
    if (rig.skinHero) { driveSkin(rig); updateLayers(p, dt); layerSkin(rig, view.layers); }
    // The wielded weapon rides the sword's grip: same pose every frame, and only it shows.
    if (shownGear !== (p.gear?.id ?? null)) { shownGear = p.gear?.id ?? null; showWeapon(model, shownGear); }
    // The hat rides the head node and needs no per-frame work, only a swap when it changes.
    if (shownHat !== (p.wear?.hat?.id ?? null)) { shownHat = p.wear?.hat?.id ?? null; showHat(shownHat); }
    for (const v of Object.values(rig.variants)) { v.rotation.copy(rig.weapon.rotation); v.position.copy(rig.weapon.position); }

    // Hit flash (red tint). No i-frame blink: Toto had it taken out - on a skinned hero the
    // hit reaction already says he was struck, and a model strobing for 0.9 s read as a bug.
    const flashing = p.flash > 0;
    model.visible = true;
    // A buff aura is a slow emissive pulse in the buff's colour; the flash still wins.
    const aura = p.buffs?.quicken ? AURA.quicken : null;
    const pulse = aura ? 0.35 + 0.25 * Math.sin(view.t * 6) : 0;
    for (const m of materials) {
      if (!m.emissive) continue;
      if (flashing) m.emissive.setRGB(0.9, 0.2, 0.15);
      else if (aura) m.emissive.copy(m.userData.emissive).add(AURA_TMP.copy(aura).multiplyScalar(pulse));
      else m.emissive.copy(m.userData.emissive);
    }
    // A refined weapon carries an aura on its blade (aura.js) and the steel takes a faint
    // cast of the same colour; the hit flash still wins.
    const wa = auraOf(p.gear);
    for (const m of weaponMats) {
      if (!m.emissive) continue;
      if (flashing) m.emissive.setRGB(0.9, 0.2, 0.15);
      else if (wa) m.emissive.copy(m.userData.emissive).add(AURA_TMP.setRGB(wa.color[0], wa.color[1], wa.color[2]).multiplyScalar(0.05 + 0.1 * wa.strength));
      else if (aura) m.emissive.copy(m.userData.emissive).add(AURA_TMP.copy(aura).multiplyScalar(pulse));
      else m.emissive.copy(m.userData.emissive);
    }
    auraTick(model, p.gear, view.t);

    if (rig.falcon) updateFalcon(game, dt);
  };

  function startBlitz(game) {
    const p = game.player;
    const live = game.enemies.filter((e) => !e.dead && Math.abs(e.x - p.x) < 7);
    if (!live.length) return;
    live.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
    falcon.flying = true;
    falcon.mode = 'blitz';
    falcon.t = 0;
    falcon.target = live[0];
    world.scene.attach(rig.falcon);
    falcon.from.copy(rig.falcon.position);
  }

  // Wind Walk: the falcon takes off and rings the hunter twice while the wind picks up, then
  // settles back on the arm. Pure flourish - the sim's buff is already applied - so it runs
  // on its own clock rather than the cast's, which is far too short for a lap.
  const CIRCLE = { total: 1.5, r: 1.7, laps: 2, height: 1.6 };

  // Auto Blitz: the passive sent the bird after one enemy. One swoop and back, on its own
  // clock; the sim lands the hit at its own delay so the number arrives as the bird does.
  const AUTO = { total: 0.75 };
  function startAutoBlitz(game, targetId) {
    if (falcon.flying) return;                       // already out - the hit still lands
    const tgt = game.enemies.find((e) => e.id === targetId && !e.dead);
    if (!tgt) return;
    falcon.flying = true;
    falcon.mode = 'auto';
    falcon.t = 0;
    falcon.target = tgt;
    world.scene.attach(rig.falcon);
    falcon.from.copy(rig.falcon.position);
  }
  function startCircle() {
    if (falcon.flying) return;
    falcon.flying = true;
    falcon.mode = 'circle';
    falcon.t = 0;
    falcon.target = null;
    world.scene.attach(rig.falcon);
    falcon.from.copy(rig.falcon.position);
  }

  function updateFalcon(game, dt) {
    const f = rig.falcon;
    const flap = Math.sin(view.t * (falcon.flying ? 34 : 9)) * (falcon.flying ? 0.55 : 0.28);
    rig.wingR.rotation.z = flap;
    rig.wingL.rotation.z = -flap;
    if (!falcon.flying) return;
    const p = game.player;
    falcon.t += dt;
    if (falcon.mode === 'auto') {
      const u = Math.min(1, falcon.t / AUTO.total);
      const tgt = falcon.target;
      const tx = tgt.x, tz = tgt.z, ty = tgt.y + tgt.hurtbox.h * 0.6;
      let px, py, pz;
      if (u < 0.4) { const k = u / 0.4; px = falcon.from.x + (tx - falcon.from.x) * k; py = falcon.from.y + 2.2 * Math.sin(k * Math.PI / 2); pz = falcon.from.z + (tz - falcon.from.z) * k; }
      else if (u < 0.6) { const k = (u - 0.4) / 0.2; px = tx; py = ty + 2.2 * (1 - Math.sin(k * Math.PI)); pz = tz; }
      else { const k = (u - 0.6) / 0.4; const home = rig.armR.getWorldPosition(new THREE.Vector3()); px = tx + (home.x - tx) * k; py = ty + 1.2 + (home.y - ty - 1.2) * k; pz = tz + (home.z - tz) * k; }
      f.position.lerp(new THREE.Vector3(px, py, pz), Math.min(1, 16 * dt));
      f.rotation.set(0, view.yaw, 0);
      if (u >= 1) {
        falcon.flying = false;
        rig.armR.attach(f);
        f.position.copy(falconPerch.pos);
        f.quaternion.copy(falconPerch.quat);
      }
      return;
    }
    if (falcon.mode === 'circle') {
      const u = Math.min(1, falcon.t / CIRCLE.total);
      // ease in from the hand, two laps, ease back; the ring follows the hunter as he moves
      const a = view.yaw + u * Math.PI * 2 * CIRCLE.laps;
      const lift = u < 0.15 ? u / 0.15 : u > 0.85 ? (1 - u) / 0.15 : 1;
      const r = CIRCLE.r * lift, y = p.y + 0.9 + (CIRCLE.height - 0.9) * lift + 0.25 * Math.sin(u * Math.PI * 6);
      const target = new THREE.Vector3(p.x + Math.sin(a) * r, y, p.z + Math.cos(a) * r * 0.55);
      f.position.lerp(target, Math.min(1, 12 * dt));
      f.rotation.set(0, a + Math.PI / 2, 0);            // beak along the direction of travel
      if (u >= 1) {
        falcon.flying = false;
        rig.armR.attach(f);
        f.position.copy(falconPerch.pos);
        f.quaternion.copy(falconPerch.quat);
      }
      return;
    }
    const atk = p.def.attacks.blitzBeat;
    const done = !(p.state === 'attack' && p.attack === 'blitzBeat');
    const total = atk.dur;
    const u = Math.min(1, falcon.t / total);
    const tgt = falcon.target;
    const tx = tgt ? tgt.x : p.x + p.facing * 3, tz = tgt ? tgt.z : p.z, ty = tgt ? tgt.y + tgt.hurtbox.h * 0.6 : 1;
    // up, then three swoops through the target, then back to the hand
    let px, py, pz;
    if (u < 0.3) { const s = u / 0.3; px = falcon.from.x + (tx - falcon.from.x) * s * 0.5; py = falcon.from.y + 3.2 * Math.sin(s * Math.PI / 2); pz = falcon.from.z; }
    else if (u < 0.75) { const s = (u - 0.3) / 0.45; const k = s * 3; const sw = Math.sin(k * Math.PI); px = tx + Math.cos(k * Math.PI * 2) * 1.2 * (1 - sw * 0.5); py = ty + 1.6 * (1 - sw) ; pz = tz + Math.sin(k * Math.PI) * 0.6; }
    else { px = tx; py = ty + 1.8; pz = tz; }
    f.position.lerp(new THREE.Vector3(px, py, pz), Math.min(1, 14 * dt));
    f.rotation.set(0, view.yaw, 0);
    if (done || u >= 1) {
      falcon.flying = false;
      rig.armR.attach(f);
      f.position.copy(falconPerch.pos);
      f.quaternion.copy(falconPerch.quat);
    }
  }

  view.dispose = () => { world.scene.remove(group); if (rig.falcon && falcon.flying) { rig.armR.attach(rig.falcon); } };
  return view;
}
