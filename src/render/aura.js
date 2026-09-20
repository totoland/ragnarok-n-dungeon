// The refine aura on a blade, the Lineage way: a soft light that hugs the steel and flows
// along it, coloured by the plus (data/items.js auraOf), not a tint on the whole weapon.
// Each blade mesh gets two shells - the same geometry pushed out along its normals, additive:
// a tight bright core and a wide soft falloff - fading with the view angle, with two slow
// bands travelling up the blade. Shells are children of the blade meshes so they follow
// every swing and hide with the weapon.
import * as THREE from 'three';
import { auraOf } from '../sim/data/items.js';

const SHELL = '__aura';
// Which of a weapon's meshes are its blade: by material name, the export keeps them. A
// weapon with no steel (a bow) lights up whole.
const BLADE = /steel|bevel|blade/i;

const VERT = `
uniform float uExpand;
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  vY = position.y;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position + normal * uExpand, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uSoft;
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uSoft);
  float flow = 0.7 + 0.3 * sin(vY * 14.0 - uTime * 2.8);
  float breathe = 0.8 + 0.2 * sin(vY * 3.5 + uTime * 1.2);
  float a = uOpacity * flow * breathe * (0.55 + 0.45 * f);
  gl_FragColor = vec4(uColor * (0.9 + 0.6 * f), a);
}`;

const state = new WeakMap();   // weapon node -> { mat, shells }

function build(node) {
  const meshes = [];
  node.traverse((o) => { if (o.isMesh && o.name !== SHELL) meshes.push(o); });
  let blades = meshes.filter((m) => BLADE.test(m.material?.name || ''));
  if (!blades.length) blades = meshes;
  const make = (expand, soft) => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 0.3 }, uTime: { value: 0 }, uExpand: { value: expand }, uSoft: { value: soft } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mats = [make(0.022, 0.8), make(0.06, 2.2)];   // core, halo
  const shells = [];
  for (const m of blades) {
    for (const mat of mats) {
      const sh = new THREE.Mesh(m.geometry, mat);
      sh.name = SHELL;
      sh.renderOrder = 3;
      sh.frustumCulled = false;
      m.add(sh);
      shells.push(sh);
    }
  }
  const st = { mats, shells };
  state.set(node, st);
  return st;
}

// Drive the aura on one weapon node for this frame; null hides it.
export function updateAura(node, aura, t) {
  const st = state.get(node);
  if (!aura) { if (st) for (const sh of st.shells) sh.visible = false; return; }
  const s = st || build(node);
  const [core, halo] = s.mats;
  for (const m of s.mats) { m.uniforms.uColor.value.setRGB(aura.color[0], aura.color[1], aura.color[2]); m.uniforms.uTime.value = t; }
  core.uniforms.uOpacity.value = 0.45 + 0.35 * aura.strength;
  halo.uniforms.uOpacity.value = 0.18 + 0.22 * aura.strength;
  for (const sh of s.shells) sh.visible = true;
}

// The visible weapon node of a hero model (the wielded variant, else the hero's own).
export function visibleWeapon(model) {
  let found = null;
  model.traverse((o) => { if (!found && (o.name === 'weapon' || /^weapon_[a-z]+$/.test(o.name)) && o.visible) found = o; });
  return found;
}

// One call per frame for a whole hero model: aura on what he wields, off everywhere else.
export function auraTick(model, gear, t) {
  const aura = auraOf(gear);
  model.traverse((o) => {
    if (!(o.name === 'weapon' || /^weapon_[a-z]+$/.test(o.name))) return;
    updateAura(o, o.visible ? aura : null, t);
  });
}

// A clone of a model carries the shells its source had; drop them so the clone can build
// its own (with its own uniforms) or stay bare, as for an icon.
export function stripAura(root) {
  const gone = [];
  root.traverse((o) => { if (o.name === SHELL) gone.push(o); });
  for (const o of gone) o.parent?.remove(o);
}
