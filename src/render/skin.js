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
// Per model, which bone each arm channel drives when it is not the default. The Hunter holds
// his bow in his LEFT hand (the side every Mixamo archery clip uses), and the procedural
// clips' bow arm is aL - so for him aL drives LeftArm and aR the drawing RightArm.
const DRIVE_FOR = { hunter: { armL: 'LeftArm', armR: 'RightArm' } };
export const DRIVE = { torso: 'Spine', head: 'Neck', armL: 'RightArm', armR: 'LeftArm', legL: 'RightUpLeg', legR: 'LeftUpLeg', cape: 'Cape', tail: 'Tail' };
// Bone sets a clip layer leaves alone. The walk swings both arms; the Knight's sword arm
// stays on its stance so the blade is carried upright rather than waved at the floor.
const KEEP = {
  swordArm: (name) => /^mixamorigRight(Shoulder|Arm|ForeArm|Hand)/.test(name),
  bowArm: (name) => /^mixamorigLeft(Shoulder|Arm|ForeArm|Hand)/.test(name),
};
export const SKIN = {};

export function prepareSkin(heroKey, gltf, meta) {
  const root = gltf.scene;
  root.userData.skinHero = heroKey;
  root.updateMatrixWorld(true);
  // One fixed bone order for the model: every per-bone table below - the rest pose, each
  // clip's samples, a layer's keep mask, a rig's bones - is an array in this order, so the
  // hot loops index instead of hashing names.
  const names = [];
  root.traverse((o) => { if (o.isBone) names.push(o.name); });
  const index = new Map(names.map((n, i) => [n, i]));
  const rest = new Map();
  const restQ = [], restP = [];
  root.traverse((o) => {
    if (!o.isBone) return;
    rest.set(o.name, { q: o.quaternion.clone(), p: o.position.clone() });
    restQ.push(o.quaternion.clone()); restP.push(o.position.clone());
  });
  // A skinned mesh is culled by a bounding sphere taken once, in whatever pose it was first
  // seen in - so a lunge or a fall can carry the body out of it and blink it away. One hero is
  // cheap enough to always draw, and so is a boss.
  root.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; });
  const drive = [];
  for (const [key, bone] of Object.entries({ ...DRIVE, ...(DRIVE_FOR[heroKey] || {}) })) {
    const b = root.getObjectByName(MIXAMO(bone));
    if (!b) continue;
    const P0 = b.parent.getWorldQuaternion(new THREE.Quaternion());
    drive.push({ key, name: b.name, i: index.get(b.name), P0, P0inv: P0.clone().invert(), L0: b.quaternion.clone(), scale: b.parent.getWorldScale(new THREE.Vector3()).x });
  }
  const clips = {};
  for (const c of gltf.animations) {
    const bones = new Set(c.tracks.map((t) => t.name.split('.')[0]));
    clips[c.name] = { clip: c, bones, table: sampleClip(c, index, names.length), info: meta.clips?.[c.name] || { dur: c.duration, strike: c.duration / 2 } };
  }
  const keep = {};
  for (const [k, test] of Object.entries(KEEP)) keep[k] = names.map((n) => test(n));
  SKIN[heroKey] = { names, index, rest, restQ, restP, drive, clips, keep };
}

// A clip, sampled once at load onto a fixed 30 fps grid, every bone's rotation and position
// side by side in one array per channel. Played back, a layer reads two rows and blends them.
//
// It used to go through THREE.AnimationMixer, and that was the stutter. A mixer binds every
// track of a clip to its bones the first time a rig plays it - 65 bones, two tracks each - so
// the first slash, the first hurt, the first walk of every monster clone each cost a frame of
// their own (a 4x-throttled CPU put the Knight's first frame of a run at 850 ms of "hero"),
// and after that every layer of every rig ran a full mixer update per frame to pose itself.
// None of the mixer's machinery is used here - one action, paused, time set by hand - so the
// samples are read directly: nothing to bind, nothing allocated, and the same numbers.
const FPS = 30;
function sampleClip(clip, index, count) {
  const n = Math.max(2, Math.round(clip.duration * FPS) + 1);
  const q = new Float32Array(n * count * 4), p = new Float32Array(n * count * 3);
  const hasQ = new Uint8Array(count), hasP = new Uint8Array(count);
  for (const track of clip.tracks) {
    const [bone, prop] = track.name.split('.');
    const b = index.get(bone);
    if (b === undefined || (prop !== 'quaternion' && prop !== 'position')) continue;
    const quat = prop === 'quaternion', size = quat ? 4 : 3, out = quat ? q : p;
    const tm = track.times, vals = track.values;
    // The exporter bakes every clip at exactly this rate (export_force_sampling at 30 fps), so
    // almost every track is already on the grid and is copied as it is; a constant channel
    // comes as two keys and is filled. Only anything else goes through an interpolant - the
    // difference is 15 ms of load per model, which ten skinned models turn into a stall.
    const onGrid = tm.length === n && Math.abs(tm[1] - tm[0] - 1 / FPS) < 1e-4;
    const constant = tm.length <= 2 && vals.length >= size && (tm.length === 1 || vals.slice(0, size).every((v, k) => Math.abs(v - vals[size + k]) < 1e-7));
    const interp = onGrid || constant ? null : track.createInterpolant();
    for (let f = 0; f < n; f++) {
      const o = (f * count + b) * size;
      if (onGrid) for (let k = 0; k < size; k++) out[o + k] = vals[f * size + k];
      else if (constant) for (let k = 0; k < size; k++) out[o + k] = vals[k];
      else { const v = interp.evaluate(Math.min(clip.duration, f / FPS)); for (let k = 0; k < size; k++) out[o + k] = v[k]; }
    }
    (quat ? hasQ : hasP)[b] = 1;
  }
  return { n, count, q, p, hasQ, hasP };
}

// One bone of a clip at time t: rotation into `qo`, position into `po`; false if the clip does
// not animate that channel. Neighbouring 30 fps samples are close, so a normalised lerp is
// indistinguishable from a slerp here and a good deal cheaper.
function sampleBone(T, b, t, qo, po) {
  const f = Math.max(0, Math.min(T.n - 1, t * FPS));
  const i = f | 0, j = Math.min(T.n - 1, i + 1), a = f - i;
  if (T.hasQ[b]) {
    const o1 = (i * T.count + b) * 4, o2 = (j * T.count + b) * 4, Q_ = T.q;
    const sgn = Q_[o1] * Q_[o2] + Q_[o1 + 1] * Q_[o2 + 1] + Q_[o1 + 2] * Q_[o2 + 2] + Q_[o1 + 3] * Q_[o2 + 3] < 0 ? -1 : 1;
    qo.set(Q_[o1] + (sgn * Q_[o2] - Q_[o1]) * a, Q_[o1 + 1] + (sgn * Q_[o2 + 1] - Q_[o1 + 1]) * a,
      Q_[o1 + 2] + (sgn * Q_[o2 + 2] - Q_[o1 + 2]) * a, Q_[o1 + 3] + (sgn * Q_[o2 + 3] - Q_[o1 + 3]) * a).normalize();
  }
  if (T.hasP[b]) {
    const o1 = (i * T.count + b) * 3, o2 = (j * T.count + b) * 3, P_ = T.p;
    po.set(P_[o1] + (P_[o2] - P_[o1]) * a, P_[o1 + 1] + (P_[o2 + 1] - P_[o1 + 1]) * a, P_[o1 + 2] + (P_[o2 + 2] - P_[o1 + 2]) * a);
  }
  return T.hasQ[b] || T.hasP[b];
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
  const S = SKIN[rig.skinHero], B = rig.boneArr;
  for (let i = 0; i < B.length; i++) { const b = B[i]; if (b) { b.quaternion.copy(S.restQ[i]); b.position.copy(S.restP[i]); } }
  for (const d of S.drive) {
    const b = B[d.i], node = rig[d.key];
    if (!b || !node) continue;
    b.quaternion.copy(Q.copy(d.P0inv).multiply(node.quaternion).multiply(d.P0)).multiply(d.L0);
    if (node.position.y) b.position.add(V.set(0, node.position.y, 0).applyQuaternion(d.P0inv).divideScalar(d.scale));
  }
}

// Mixamo layers over the driven pose. Each layer is { name, time, w, keep? }: its clip is
// sampled at `time` (sampleClip above) and blended into what is already on the bones by its
// weight - so a fading layer hands over to the next one, or back to the procedural pose,
// without a pop. A bone the clip does not animate, or the layer's `keep` set holds, is left.
const LQ = new THREE.Quaternion(), LP = new THREE.Vector3();
export function layerSkin(rig, layers) {
  if (!layers.length) return;
  const S = SKIN[rig.skinHero], B = rig.boneArr;
  for (const L of layers) {
    const C = S.clips[L.name];
    if (!C || L.w <= 0.001) continue;
    const T = C.table, keep = L.keep ? S.keep[L.keep] : null, full = L.w >= 0.999;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (!b || (keep && keep[i])) continue;
      LQ.copy(b.quaternion); LP.copy(b.position);
      if (!sampleBone(T, i, L.time, LQ, LP)) continue;
      if (full) { b.quaternion.copy(LQ); b.position.copy(LP); }
      else { b.quaternion.slerp(LQ, L.w); b.position.lerp(LP, L.w); }
    }
  }
}

// Map an attack's own clock onto its clip: the wind-up squeezed or stretched into the time
// before the first hit, the follow-through into the rest.
export function attackClipTime(info, cfg, u, hitU) {
  const strike = info.strike, ws = Math.max(0, strike - cfg.pre), we = Math.min(info.dur, strike + cfg.post);
  if (u <= hitU) return ws + (strike - ws) * (hitU > 0 ? u / hitU : 1);
  return strike + (we - strike) * Math.min(1, (u - hitU) / Math.max(1e-6, 1 - hitU));
}

// The skinned half of a rig: stand-in channel nodes for applyPose to write, and the model's
// own bones in the model's bone order. A no-op for a rigid model.
export function attachSkinRig(rig, root) {
  const key = root.userData.skinHero;
  if (!key || !SKIN[key]) return rig;
  rig.skinHero = key;
  for (const k of Object.keys(DRIVE)) { const n = new THREE.Object3D(); n.name = k; rig[k] = n; }
  rig.bones = skinBones(root);
  rig.boneArr = SKIN[key].names.map((n) => rig.bones.get(n) || null);
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
