// Tiny keyframe pose system for the limb-segmented rigs (heroes and humanoid monsters).
// A pose is a flat bag of named channels (radians / metres); a clip is a list of
// [time, pose] keys interpolated with smoothstep; missing channels read as 0.
//
// Channels: ry (root lift), rx (root tip fwd/back), rz (root roll), ryaw (root turn,
//           added to the facing the sim supplies - a spin attack lives here),
//           ty (torso lift), tx/tyaw/tz (torso lean / twist / roll), hx/hy (head),
//           aLx/aLy/aLz, aRx/aRy/aRz (arms), lLx/lRx (legs swing), lLz/lRz (legs splay),
//           cx (cape), wx/wy/wz (weapon in hand), sx (scale squash, 1 = none)

export const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function lerpPose(a, b, s, out = {}) {
  for (const k in out) delete out[k];
  for (const k in a) out[k] = a[k] + ((b[k] ?? 0) - a[k]) * s;
  for (const k in b) if (!(k in a)) out[k] = (b[k]) * s;
  return out;
}

// Evaluate a clip at normalised time t ∈ [0, 1].
export function evalClip(keys, t, out = {}) {
  if (t <= keys[0][0]) return Object.assign(clear(out), keys[0][1]);
  for (let i = 1; i < keys.length; i++) {
    const [t1, p1] = keys[i];
    if (t <= t1) {
      const [t0, p0] = keys[i - 1];
      return lerpPose(p0, p1, smooth((t - t0) / (t1 - t0)), out);
    }
  }
  return Object.assign(clear(out), keys[keys.length - 1][1]);
}

function clear(o) { for (const k in o) delete o[k]; return o; }

// Walk cycle: legs alternate, arms counter-swing, torso bobs. `phase` in radians.
export function walkPose(phase, amp = 1, out = {}) {
  const s = Math.sin(phase), c = Math.cos(phase);
  clear(out);
  out.lLx = 0.65 * amp * s;
  out.lRx = -0.65 * amp * s;
  out.aLx = -0.45 * amp * s;
  out.aRx = 0.45 * amp * s;
  out.ty = 0.035 * amp * Math.abs(c);
  out.tx = 0.08 * amp;                       // slight forward lean
  out.tyaw = 0.08 * amp * s;
  out.hx = 0.04 * amp * c;
  out.cx = 0.25 * amp + 0.08 * amp * Math.abs(s);   // cape streams back
  return out;
}

export function idlePose(t, out = {}) {
  clear(out);
  const b = Math.sin(t * 2.4);
  out.ty = 0.012 * b;
  out.aLx = 0.04 * b; out.aRx = -0.04 * b;
  out.hx = 0.02 * Math.sin(t * 1.7 + 1);
  out.cx = 0.04 * Math.sin(t * 1.3);
  return out;
}

// Smoothly move every channel of `cur` toward `target`; channels absent from target decay to 0.
export function blendTo(cur, target, rate, dt) {
  const k = 1 - Math.exp(-rate * dt);
  for (const key in cur) if (!(key in target)) cur[key] += (0 - cur[key]) * k;
  for (const key in target) cur[key] = (cur[key] ?? 0) + (target[key] - (cur[key] ?? 0)) * k;
  return cur;
}

// Write a pose onto rig nodes (heroes and humanoid monsters share this).
export function applyPose(rig, base, rest, c, yaw) {
  const v = (k) => (c[k] ?? 0) + (rest[k] ?? 0);
  rig.root.rotation.set(v('rx'), yaw + v('ryaw'), v('rz'));
  rig.root.position.y = base.root.y + v('ry');
  if (rig.torso) {
    rig.torso.rotation.set(v('tx'), v('tyaw'), v('tz'));
    rig.torso.position.y = base.torso.y + v('ty');
  }
  if (rig.head) rig.head.rotation.set(v('hx'), v('hy'), 0);
  if (rig.armL) rig.armL.rotation.set(-v('aLx'), v('aLy'), v('aLz'));
  if (rig.armR) rig.armR.rotation.set(-v('aRx'), v('aRy'), v('aRz'));
  if (rig.legL) rig.legL.rotation.set(-v('lLx'), 0, v('lLz'));
  if (rig.legR) rig.legR.rotation.set(-v('lRx'), 0, v('lRz'));
  if (rig.cape) rig.cape.rotation.set(v('cx'), 0, 0);
  if (rig.weapon) rig.weapon.rotation.set(v('wx'), v('wy'), v('wz'));
}
