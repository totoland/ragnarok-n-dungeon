// Skinned models: a hero or boss that ships with its Mixamo skeleton rather than as rigid limbs.
//
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// A hero or boss exported with its skeleton (tools/export_skinned_hero.py) is posed two ways at once.
// The procedural clips above still run - they are the whole move set, and the channels they
// write (aLx, tx, lRx, cx...) are turned into bone rotations by driveSkin(): each channel
// node's rotation is re-expressed about its bone's parent in the rest pose, which is exactly
// how the rigid limb it replaces turned. Mixamo clips then play over that where the hero's
// def (render/heroes.js) or the boss's SKIN_MOVES entry (render/monsters.js) names one, with
// a weight that fades in and out, so a move with no clip of its own is never left without a
// pose.
const MIXAMO = (n) => 'mixamorig' + n;      // GLTFLoader strips the ':' from mixamorig:Hips
export const DRIVE = { torso: 'Spine', head: 'Neck', armL: 'RightArm', armR: 'LeftArm', legL: 'RightUpLeg', legR: 'LeftUpLeg', cape: 'Cape', tail: 'Tail' };
// Bone sets a clip layer leaves alone. The walk swings both arms; the Knight's sword arm
// stays on its stance so the blade is carried upright rather than waved at the floor.
const KEEP = {
  swordArm: (name) => /^mixamorigRight(Shoulder|Arm|ForeArm|Hand)/.test(name),
};
export const SKIN = {};

export function prepareSkin(heroKey, gltf, meta) {
  const root = gltf.scene;
  root.userData.skinHero = heroKey;
  root.updateMatrixWorld(true);
  const rest = new Map();
  root.traverse((o) => { if (o.isBone) rest.set(o.name, { q: o.quaternion.clone(), p: o.position.clone() }); });
  // A skinned mesh is culled by a bounding sphere taken once, in whatever pose it was first
  // seen in - so a lunge or a fall can carry the body out of it and blink it away. One hero is
  // cheap enough to always draw, and so is a boss.
  root.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
  const drive = [];
  for (const [key, bone] of Object.entries(DRIVE)) {
    const b = root.getObjectByName(MIXAMO(bone));
    if (!b) continue;
    const P0 = b.parent.getWorldQuaternion(new THREE.Quaternion());
    drive.push({ key, name: b.name, P0, P0inv: P0.clone().invert(), L0: b.quaternion.clone(), scale: b.parent.getWorldScale(new THREE.Vector3()).x });
  }
  const clips = {};
  for (const c of gltf.animations) {
    const bones = new Set(c.tracks.map((t) => t.name.split('.')[0]));
    clips[c.name] = { clip: c, bones, info: meta.clips?.[c.name] || { dur: c.duration, strike: c.duration / 2 } };
  }
  SKIN[heroKey] = { rest, drive, clips };
}

function skinBones(root) {
  const bones = new Map();
  root.traverse((o) => { if (o.isBone) bones.set(o.name, o); });
  return bones;
}

const Q = new THREE.Quaternion(), V = new THREE.Vector3();
// Channels -> bones. The rig's torso/armL/... are stand-in nodes that applyPose writes as it
// always has; this is the one place those rotations reach the skeleton.
export function driveSkin(rig) {
  const S = SKIN[rig.skinHero];
  for (const [name, b] of rig.bones) { const r = S.rest.get(name); if (r) { b.quaternion.copy(r.q); b.position.copy(r.p); } }
  for (const d of S.drive) {
    const b = rig.bones.get(d.name), node = rig[d.key];
    if (!b || !node) continue;
    b.quaternion.copy(Q.copy(d.P0inv).multiply(node.quaternion).multiply(d.P0)).multiply(d.L0);
    if (node.position.y) b.position.add(V.set(0, node.position.y, 0).applyQuaternion(d.P0inv).divideScalar(d.scale));
  }
}

// Mixamo layers over the driven pose. Each layer is { name, time, w }; a layer samples its
// clip through the mixer onto the bones, and the result is blended into what is already
// there by its weight - so a fading layer hands over to the next one, or back to the
// procedural pose, without a pop.
export function layerSkin(rig, layers) {
  if (!layers.length) return;
  const S = SKIN[rig.skinHero];
  const acc = rig.skinAcc;
  for (const [name, b] of rig.bones) { const a = acc.get(name); a.q.copy(b.quaternion); a.p.copy(b.position); }
  for (const L of layers) {
    const C = S.clips[L.name];
    if (!C || L.w <= 0.001) continue;
    const action = rig.mixer.clipAction(C.clip);
    for (const a of rig.mixer._actions) a.enabled = a === action;
    action.play(); action.paused = true; action.time = L.time; action.weight = 1;
    rig.mixer.update(0);
    const keep = L.keep ? KEEP[L.keep] : null;
    for (const [name, b] of rig.bones) {
      const a = acc.get(name);
      if (C.bones.has(name) && !(keep && keep(name))) { a.q.slerp(b.quaternion, L.w); a.p.lerp(b.position, L.w); }
    }
  }
  for (const [name, b] of rig.bones) { const a = acc.get(name); b.quaternion.copy(a.q); b.position.copy(a.p); }
}

// Map an attack's own clock onto its clip: the wind-up squeezed or stretched into the time
// before the first hit, the follow-through into the rest.
export function attackClipTime(info, cfg, u, hitU) {
  const strike = info.strike, ws = Math.max(0, strike - cfg.pre), we = Math.min(info.dur, strike + cfg.post);
  if (u <= hitU) return ws + (strike - ws) * (hitU > 0 ? u / hitU : 1);
  return strike + (we - strike) * Math.min(1, (u - hitU) / Math.max(1e-6, 1 - hitU));
}

// The skinned half of a rig: stand-in channel nodes for applyPose to write, the model's own
// bones, and a mixer for its clips. A no-op for a rigid model.
export function attachSkinRig(rig, root) {
  const key = root.userData.skinHero;
  if (!key || !SKIN[key]) return rig;
  rig.skinHero = key;
  for (const k of Object.keys(DRIVE)) { const n = new THREE.Object3D(); n.name = k; rig[k] = n; }
  rig.bones = skinBones(root);
  rig.skinAcc = new Map([...rig.bones.keys()].map((k) => [k, { q: new THREE.Quaternion(), p: new THREE.Vector3() }]));
  rig.mixer = new THREE.AnimationMixer(root);
  return rig;
}

// A copy of a model. A skinned mesh cannot be cloned like the rigid ones: a plain clone keeps
// pointing at the original's bones, and the copy would move with whatever moves those.
export function cloneModel(model) {
  if (!model.userData.skinHero) return model.clone();
  const c = cloneSkinned(model);
  c.userData.skinHero = model.userData.skinHero;
  return c;
}

// One frame of the layer stack. `want` is { name, key, time, keep? } or null: a new key
// pushes a layer that fades in over the others, the top layer fades toward 1 while it is still
// wanted and every other layer toward 0; a layer that has faded out, or is fully covered by
// the one above it, is dropped.
export function stepLayers(layers, want, dt, rateFor = (w) => (w?.key.startsWith('atk') ? 40 : 14)) {
  const top = layers[layers.length - 1];
  if (want && (!top || top.key !== want.key)) layers.push({ ...want, w: 0 });
  else if (want) { top.time = want.time; top.keep = want.keep; }
  const k = 1 - Math.exp(-rateFor(want) * dt);
  layers.forEach((L, i) => {
    const live = want && i === layers.length - 1;
    L.w += ((live ? 1 : 0) - L.w) * k;
  });
  return layers.filter((L, i, a) => L.w > 0.01 && !(i < a.length - 1 && a[a.length - 1].w > 0.99));
}
