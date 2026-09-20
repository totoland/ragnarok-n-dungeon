// Item icons and the profile turntable, rendered from the real GLBs with one small extra
// WebGL context. An icon is the weapon node alone, framed and tilted like a Ragnarok item
// sprite, drawn once per (hero, item) and cached as a data URL. The turntable is the hero's
// own model wielding the selected weapon, turning slowly in a box in the profile panel.
import * as THREE from 'three';
import { showWeapon, restPose } from './heroes.js';
import { ITEMS, glowOf } from '../sim/data/items.js';

const ICON = 112;

export function createPreview() {
  let assets = null;
  const canvas = document.createElement('canvas');
  canvas.className = 'preview-canvas';
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xb8c4e0, 0x2a2f2a, 1.0));
  const key = new THREE.DirectionalLight(0xfff1dc, 1.7);
  key.position.set(2.5, 4, 3);
  const rim = new THREE.DirectionalLight(0xe8b64a, 0.7);
  rim.position.set(-3, 2, -2);
  scene.add(key, rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const icons = new Map();

  // Materials on the shared asset carry whatever the live view last did to them - a +7's
  // glow, a hit flash - so anything rendered here gets its own copies, emissive reset.
  const GOLD = new THREE.Color(0xffd35a);
  function ownMaterials(root, glow = 0) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
        const c = m.clone();
        if (c.emissive) { c.emissive.copy(m.userData.emissive || new THREE.Color(0)); if (glow > 0) c.emissive.add(GOLD.clone().multiplyScalar(0.25 + 0.6 * glow)); }
        return c;
      });
      o.material = Array.isArray(o.material) ? mats : mats[0];
    });
  }

  // The item's node alone, reset to its own frame: the grip at the origin, the blade up +Y.
  // A weapon without a baked model falls back to the hero's own; anything else (a cape, a
  // hat) only has a model when a `<slot>_<id>` node exists, and returns null otherwise.
  function nodeOf(hero, gearId) {
    const model = assets[hero];
    const slot = gearId ? ITEMS[gearId]?.slot || 'weapon' : 'weapon';
    let node = gearId ? model.getObjectByName(`${slot}_${gearId}`) : null;
    if (!node && slot === 'weapon') node = model.getObjectByName('weapon');
    if (!node) return null;
    const c = node.clone();
    c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.set(1, 1, 1);
    c.traverse((o) => { o.visible = true; });
    ownMaterials(c);
    return c;
  }

  function icon(hero, gearId) {
    const k = `${hero}:${gearId || ''}`;
    if (icons.has(k)) return icons.get(k);
    if (!assets) return null;
    const c = nodeOf(hero, gearId);
    if (!c) { icons.set(k, null); return null; }
    const holder = new THREE.Group();
    holder.add(c);
    scene.add(holder);
    // Face the flat of the blade (or the bow) to the camera: of the two yaws, keep the one
    // with the wider silhouette; then tilt it up-right the way an item sprite sits.
    const footprint = (yaw) => { c.rotation.y = yaw; holder.updateMatrixWorld(true); const s = new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3()); return s.x * s.y; };
    c.rotation.y = footprint(0) >= footprint(Math.PI / 2) ? 0 : Math.PI / 2;
    holder.rotation.z = -0.62;
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y) * 0.54 + 0.04;
    camera.aspect = 1; camera.fov = 30; camera.updateProjectionMatrix();
    camera.position.set(centre.x, centre.y, centre.z + r / Math.tan(THREE.MathUtils.degToRad(15)));
    camera.lookAt(centre);
    const prev = mounted ? [canvas.width, canvas.height] : null;
    renderer.setPixelRatio(1);
    renderer.setSize(ICON, ICON, false);
    renderer.render(scene, camera);
    const out = document.createElement('canvas');
    out.width = out.height = ICON;
    out.getContext('2d').drawImage(canvas, 0, 0);
    scene.remove(holder);
    if (prev) renderer.setSize(prev[0], prev[1], false);
    const url = out.toDataURL('image/png');
    icons.set(k, url);
    return url;
  }

  // ---------------------------------------------------------------- turntable
  let mounted = null;   // { hero, model, holder, raf, last, container }
  function fit(container) {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = 30; camera.updateProjectionMatrix();
    camera.position.set(0, 1.15, 4.9);
    camera.lookAt(0, 1.02, 0);
  }
  // gear: { id, plus } or null - the plus sets the glow the turntable shows.
  function mount(container, hero, gear) {
    if (!assets) return;
    if (mounted && mounted.hero !== hero) unmount();
    if (!mounted) {
      const model = assets[hero].clone();
      restPose(model, hero);
      ownMaterials(model);
      const holder = new THREE.Group();
      holder.add(model);
      scene.add(holder);
      mounted = { hero, model, holder, raf: 0, t: 0, last: performance.now(), container: null };
      // A slow swing about the front rather than a spin: the weapon hand stays in view and
      // the flat of the blade catches the light on every pass.
      const loop = (now) => {
        mounted.raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, (now - mounted.last) / 1000);
        mounted.last = now;
        mounted.t += dt;
        mounted.holder.rotation.y = 0.85 * Math.sin(mounted.t * 0.6);
        renderer.render(scene, camera);
      };
      mounted.raf = requestAnimationFrame(loop);
    }
    if (mounted.container !== container) { container.appendChild(canvas); mounted.container = container; fit(container); }
    setGear(gear);
  }
  function setGear(gear) {
    if (!mounted) return;
    showWeapon(mounted.model, gear?.id ?? null);
    const glow = glowOf(gear);
    mounted.model.traverse((o) => {
      if (!(o.name === 'weapon' || /^weapon_[a-z]+$/.test(o.name)) || !o.visible) return;
      ownMaterials(o, glow);
    });
  }
  function unmount() {
    if (!mounted) return;
    cancelAnimationFrame(mounted.raf);
    scene.remove(mounted.holder);
    canvas.remove();
    mounted = null;
  }

  return { setAssets(a) { assets = a; }, icon, mount, setGear, unmount, get ready() { return !!assets; } };
}
