// Effects: drains game.events into particles, damage numbers, slash arcs, projectiles, rings
// and camera shake. Own clock, never touches the sim.
import * as THREE from 'three';
import { WARM_X, WARM_Z } from './scene.js';
import { ITEMS } from '../sim/data/items.js';
import { particleSprite, textTexture } from './textures.js';
import { addShake } from './scene.js';

const MAX_PARTICLES = 1500;

const HALF_PI = Math.PI / 2;

export function createFx(world) {
  const scene = world.scene;

  // ---- particles: one Points cloud, CPU-simulated
  const pos = new Float32Array(MAX_PARTICLES * 3);
  const col = new Float32Array(MAX_PARTICLES * 3);
  const size = new Float32Array(MAX_PARTICLES);
  const parts = [];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const pmat = new THREE.PointsMaterial({ map: particleSprite(), size: 0.3, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  pmat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('uniform float size;', 'attribute float size;');
  };
  const points = new THREE.Points(geo, pmat);
  points.frustumCulled = false;
  scene.add(points);

  function burst(x, y, z, n, { color = 0xffffff, speed = 4, up = 2, life = 0.5, size: sz = 0.3, spread = 0.2, gravity = 9, dir = 0 } = {}) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n && parts.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      parts.push({
        x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread, z: z + (Math.random() - 0.5) * spread,
        vx: Math.cos(a) * s + dir * speed * 0.6, vy: up * (0.3 + Math.random()) , vz: Math.sin(a) * s * 0.6,
        life, t: 0, r: c.r, g: c.g, b: c.b, size: sz * (0.6 + Math.random() * 0.8), gravity,
      });
    }
  }

  // ---- damage numbers
  const numbers = [];
  // A hit lands, a number is born, and 0.8 s later it dies. Doing that with a fresh
  // SpriteMaterial each time churns shader programs exactly when the screen is busiest,
  // which is the one moment the frame cannot afford it. The sprites come back here instead
  // and are handed out again with a different glyph; textTexture already caches the glyph.
  const numberPool = [];
  function takeNumber(tex, order) {
    const sp = numberPool.pop() || new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    sp.material.map = tex;
    sp.material.opacity = 1;
    sp.material.needsUpdate = true;
    sp.renderOrder = order;
    sp.visible = true;
    return sp;
  }
  function freeNumber(sp) {
    scene.remove(sp);
    if (numberPool.length < 120) numberPool.push(sp); else sp.material.dispose();
  }
  // Ten glyphs, drawn once, spelled out. Caching whole numbers meant a new canvas for every
  // damage value the game had not shown before, and damage has hundreds of values - the cache
  // was climbing towards its three-hundred ceiling on a tablet, every entry a 256x128 image.
  // Digits do not run out: twenty of these exist, ten plain and ten in the critical's colours,
  // and after warm-up a number never draws anything again.
  const GLYPH_W = 80, GLYPH_H = 128;
  // The colour belongs to the glyph, not to the sprite: a heal is green, a miss is pale blue,
  // an item's name is gold. Dropping it on the way through - which the first version of this
  // did - turns every number in the game white.
  const glyph = (ch, color, crit) => (crit
    ? textTexture(ch, { color: '#ff3b2a', size: 96, stroke: '#ffd85a', w: GLYPH_W, h: GLYPH_H })
    : textTexture(ch, { color, size: 88, w: GLYPH_W, h: GLYPH_H }));

  function number(x, y, z, text, color, big = false, crit = false) {
    // A critical is drawn the way Ragnarok draws one: red digits rimmed in gold, bigger than
    // any other number, punched in at 1.7x and settling as it rises.
    const h = crit ? 1.6 : big ? 1.2 : 0.8;
    const dw = h * (GLYPH_W / GLYPH_H);
    const kern = 0.78;                       // digits sit closer than their boxes suggest
    const chars = String(text);
    const sps = [], offs = [];
    const order = crit ? 11 : 10;
    for (let i = 0; i < chars.length; i++) {
      const sp = takeNumber(glyph(chars[i], color, crit), order);
      sp.scale.set(dw, h, 1);
      sps.push(sp);
      offs.push((i - (chars.length - 1) / 2) * dw * kern);
      scene.add(sp);
    }
    const bx = x + (Math.random() - 0.5) * 0.4;
    numbers.push({ sps, offs, x: bx, y, z: z + 0.3, t: 0, vy: crit ? 2.0 : 2.6 + Math.random(), life: crit ? 1.0 : 0.8, dw, h, pop: crit ? 0.7 : 0 });
  }

  // ---- transient meshes (slash arcs, rings, shockwaves)
  const transients = [];
  // An arc is drawn on every swing and every arrow that lands, and each one used to bring a
  // material with it and take it away again a sixth of a second later. That is the busiest
  // allocation in a fight, and a material with no users left hands its shader program back,
  // so the next swing compiled one. Keep the bodies and swap the colour instead; the colour
  // and the opacity are uniforms, which is exactly what a reused material is for.
  const transientPool = { slash: [], beam: [], ring: [] };
  function takeTransient(kind, geo, color, opacity, order) {
    const m = transientPool[kind].pop()
      || new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.material.color.setHex(color);
    m.material.opacity = opacity;
    m.renderOrder = order;
    m.visible = true;
    m.scale.setScalar(1);
    m.rotation.set(0, 0, 0);
    return m;
  }
  function freeTransient(t) {
    scene.remove(t.m);
    const list = transientPool[t.kind];
    if (list && list.length < 16) list.push(t.m); else t.m.material.dispose();
  }
  const arcGeo = new THREE.RingGeometry(0.8, 1.9, 24, 1, 0, Math.PI * 0.8);
  function slash(x, y, z, facing, { color = 0xd8ecff, scale = 1, tilt = 0.35, life = 0.16, spin = -1.2 } = {}) {
    const m = takeTransient('slash', arcGeo, color, 0.9, 5);
    m.position.set(x + facing * 0.9, y + 1.1, z + 0.35);
    m.scale.setScalar(scale);
    m.rotation.set(tilt, 0, facing > 0 ? -0.9 : Math.PI + 0.9 - 2.2);
    scene.add(m);
    transients.push({ m, t: 0, life, kind: 'slash', spin: spin * facing, grow: 1.35 });
  }
  // A pillar of light where the boss fell: an open cylinder that rises and thins out.
  const beamGeo = new THREE.CylinderGeometry(0.5, 0.7, 9, 24, 1, true);
  function beam(x, z, { color = 0xffe08a, life = 1.6 } = {}) {
    const m = takeTransient('beam', beamGeo, color, 0.55, 6);
    m.position.set(x, 4.5, z);
    m.scale.set(0.2, 0.05, 0.2);
    scene.add(m);
    transients.push({ m, t: 0, life, kind: 'beam' });
  }
  const ringGeo = new THREE.RingGeometry(0.6, 1.0, 40);
  function ring(x, z, { color = 0xff7a20, radius = 2.4, life = 0.45, y = 0.05 } = {}) {
    const m = takeTransient('ring', ringGeo, color, 0.95, 4);
    m.position.set(x, y, z);
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(0.2);
    scene.add(m);
    transients.push({ m, t: 0, life, kind: 'ring', radius });
  }
  const flashLight = new THREE.PointLight(0xffb060, 0, 9, 1.5);
  scene.add(flashLight);

  // Glows for projectiles and drops, pooled - the same lesson the room's torches taught, in
  // the one place it was still being ignored. A light added to the scene changes the light
  // count every material's shader is compiled against, so an orb cast of three used to
  // invalidate every program on screen, and a potion dropping did it again on the way out.
  // Three is a full cast, or three drops; anything past that goes without, which nobody can
  // see because the things themselves are emissive.
  const FX_LIGHTS = 3;
  const fxLights = [];
  for (let i = 0; i < FX_LIGHTS; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 5, 2);
    l.position.set(0, -60, 0);
    scene.add(l);
    fxLights.push(l);
  }
  // Hand them out to whatever is asking this frame, and park the rest.
  function placeFxLights() {
    let n = 0;
    const give = (m) => {
      const want = m.userData.glow;
      if (!want || n >= FX_LIGHTS) return;
      const l = fxLights[n++];
      l.color.set(want.color); l.intensity = want.intensity; l.distance = want.distance;
      m.getWorldPosition(l.position);
      l.position.y += want.y || 0;
    };
    for (const m of projectiles.values()) give(m);
    for (const m of pickups.values()) give(m);
    for (; n < FX_LIGHTS; n++) { fxLights[n].intensity = 0; fxLights[n].position.set(0, -60, 0); }
  }

  // ---- projectiles (sim-owned, mirrored here by id)
  const projectiles = new Map();
  const arrowGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.85, 5);
  const headGeo = new THREE.ConeGeometry(0.05, 0.16, 5);
  const fletchGeo = new THREE.BoxGeometry(0.012, 0.16, 0.08);
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.7 });
  const boneArrowMat = new THREE.MeshStandardMaterial({ color: 0x3a3238, roughness: 0.6 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xc9c9d4, metalness: 0.7, roughness: 0.3 });
  // Two fletchings exist in the whole game. Building one per arrow meant a material born and
  // buried on every shot, and a material with no users left is a shader program handed back
  // to the driver - to be compiled again by the next arrow.
  const fletchMat = new THREE.MeshStandardMaterial({ color: 0xe9e2c8, roughness: 0.8 });
  const boneFletchMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8 });
  // The boss's Hellfire orbs are not arrows: a glowing core with a darker shell, so they
  // stay readable against the bright forest map as well as the dark crypt.
  const orbCoreMat = new THREE.MeshBasicMaterial({ color: 0xffb04a, toneMapped: false });
  const orbShellMat = new THREE.MeshBasicMaterial({ color: 0xff3a10, transparent: true, opacity: 0.45, toneMapped: false });
  const orbCoreGeo = new THREE.SphereGeometry(0.17, 12, 10);
  const orbShellGeo = new THREE.SphereGeometry(0.32, 12, 10);
  function makeOrb() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(orbCoreGeo, orbCoreMat));
    g.add(new THREE.Mesh(orbShellGeo, orbShellMat));
    g.userData.glow = { color: 0xff5a1e, intensity: 6, distance: 4.5 };
    return g;
  }

  // Foxfire: the same orb, in the colour it burns in Toto's reference - a cold blue spirit
  // flame rather than the hell orb's ember.
  const foxCoreMat = new THREE.MeshBasicMaterial({ color: 0xd8f4ff, toneMapped: false });
  const foxShellMat = new THREE.MeshBasicMaterial({ color: 0x3fd0ff, transparent: true, opacity: 0.45, toneMapped: false });
  // Bairune's water bolt: a pale core in a deep blue shell, with a ring of foam around it so
  // it reads as a thing the sea threw rather than another orb.
  const tideCoreMat = new THREE.MeshBasicMaterial({ color: 0xeafaff, toneMapped: false });
  const tideShellMat = new THREE.MeshBasicMaterial({ color: 0x2f9fd8, transparent: true, opacity: 0.5, toneMapped: false });
  const foamGeo = new THREE.TorusGeometry(0.28, 0.05, 5, 12);
  function makeTide() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(orbCoreGeo, tideCoreMat));
    g.add(new THREE.Mesh(orbShellGeo, tideShellMat));
    const foam = new THREE.Mesh(foamGeo, tideShellMat);
    foam.rotation.y = HALF_PI;
    g.add(foam);
    g.userData.glow = { color: 0x4fc8ff, intensity: 5, distance: 4 };
    return g;
  }

  function makeFoxfire() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(orbCoreGeo, foxCoreMat));
    g.add(new THREE.Mesh(orbShellGeo, foxShellMat));
    g.userData.glow = { color: 0x5ac8ff, intensity: 6, distance: 4.5 };
    return g;
  }

  // Desert projectiles: a fistful of sand and a thrown rock, neither an arrow.
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xd9b878, roughness: 1 });
  const grainMat = new THREE.MeshStandardMaterial({ color: 0xa8864e, roughness: 1 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6f5a44, roughness: 0.95 });
  function makeSandBall() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), sandMat));
    for (let i = 0; i < 5; i++) {
      const gr = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), grainMat);
      gr.position.set(Math.cos(i * 1.3) * 0.2, Math.sin(i * 2.1) * 0.15, Math.sin(i * 1.3) * 0.2);
      g.add(gr);
    }
    return g;
  }
  function makeRock() {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), rockMat);
    m.castShadow = true;
    return m;
  }

  // Cold Bolt's wedges. One geometry and one material between all of them, like the arrow:
  // a shard per icicle would hand the driver a new program on the frame the spell lands.
  const icicleGeo = new THREE.ConeGeometry(0.15, 0.85, 5);
  const icicleMat = new THREE.MeshStandardMaterial({
    color: 0x8fd4ef, roughness: 0.2, metalness: 0.05,
    emissive: 0x1f5e80, emissiveIntensity: 0.7, transparent: true, opacity: 0.88,
  });
  function makeIcicle() {
    const m = new THREE.Mesh(icicleGeo, icicleMat);
    m.rotation.x = Math.PI;                 // the point leads, the way a falling spike would
    m.castShadow = true;
    return m;
  }

  function makeArrow(kind) {
    if (kind === 'icicle') return makeIcicle();
    if (kind === 'hellOrb') return makeOrb();
    if (kind === 'foxfire') return makeFoxfire();
    if (kind === 'tide') return makeTide();
    if (kind === 'sandBall') return makeSandBall();
    if (kind === 'rock') return makeRock();
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(arrowGeo, kind === 'boneArrow' ? boneArrowMat : arrowMat);
    shaft.rotation.z = -Math.PI / 2;
    g.add(shaft);
    const head = new THREE.Mesh(headGeo, headMat);
    head.rotation.z = -Math.PI / 2; head.position.x = 0.48;
    g.add(head);
    const f = new THREE.Mesh(fletchGeo, kind === 'boneArrow' ? boneFletchMat : fletchMat);
    f.position.x = -0.36;
    g.add(f);
    g.castShadow = true;
    return g;
  }

  // ---- potions (sim-owned, mirrored by id)
  const pickups = new Map();
  const bottleGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.26, 10);
  const neckGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8);
  const corkGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.06, 6);
  const corkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.9 });
  function makePotion(kind) {
    const c = kind === 'hp' ? 0xff3b3b : 0x3b8bff;
    const g = new THREE.Group();
    const body = new THREE.Mesh(bottleGeo, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.25, transparent: true, opacity: 0.9 }));
    body.position.y = 0.13; body.castShadow = true;
    g.add(body);
    const neck = new THREE.Mesh(neckGeo, body.material); neck.position.y = 0.31; g.add(neck);
    const cork = new THREE.Mesh(corkGeo, corkMat); cork.position.y = 0.39; g.add(cork);
    g.userData.glow = { color: c, intensity: 3, distance: 2.5, y: 0.3 };
    return g;
  }

  // ---- arrow shower: cosmetic falling arrows
  const rain = [];
  function arrowShower(x, z, facing) {
    for (let i = 0; i < 10; i++) {
      const a = makeArrow('arrow');
      a.position.set(x + facing * (1.2 + Math.random() * 3.6), 5 + Math.random() * 2, z + (Math.random() - 0.5) * 2.2);
      a.rotation.z = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
      scene.add(a);
      rain.push({ m: a, vy: -(11 + Math.random() * 4), t: -Math.random() * 0.18, stuck: 0 });
    }
  }

  // ---- ice shower: the same falling-and-sticking machinery the arrows use, in a ring
  // around the hero rather than a fan in front of him.
  function iceShower(x, z) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
      const r = 0.6 + Math.random() * 1.9;
      const m = makeIcicle();
      m.position.set(x + Math.cos(a) * r, 4.6 + Math.random() * 1.6, z + Math.sin(a) * r * 0.55);
      m.rotation.z = (Math.random() - 0.5) * 0.35;
      scene.add(m);
      // Fast enough to be on the ground about when the spell resolves - the sim gives them
      // 0.28 s of flight, and a wedge that lands after the damage reads as a miss.
      rain.push({ m, vy: -(16 + Math.random() * 4), t: -Math.random() * 0.1, stuck: 0, color: 0x9fe8ff });
    }
  }

  const skillColor = { slash1: 0xd8ecff, slash2: 0xd8ecff, slash3: 0xfff0b0, airSlash: 0xd8ecff, bash: 0xffd070, bowlingBash: 0xffa040, arrow: 0xd0f0ff, doubleStrafe: 0xa0e0ff, blitzBeat: 0xffe0a0, arrowShower: 0xa0e0ff, magnumBreak: 0xff8030 };

  function onEvent(ev, game) {
    switch (ev.type) {
      case 'attack': {
        const id = ev.id;
        if (['slash1', 'slash2', 'slash3', 'airSlash', 'bash'].includes(id)) {
          const big = id === 'bash' || id === 'slash3';
          setTimeout(() => slash(ev.x, ev.y, ev.z, ev.facing, { color: skillColor[id], scale: big ? 1.5 : 1.1, tilt: id === 'slash2' ? -1.3 : 0.35, spin: id === 'slash2' ? 3 : -1.4 }), (id === 'bash' ? 250 : 100));
        } else if (id === 'magnumBreak') {
          setTimeout(() => { ring(ev.x, ev.z, { color: 0xff7020, radius: 3.2, life: 0.5 }); ring(ev.x, ev.z, { color: 0xffd040, radius: 2.2, life: 0.35, y: 0.1 }); burst(ev.x, 0.6, ev.z, 90, { color: 0xff8020, speed: 7, up: 5, life: 0.7, size: 0.5, gravity: 4 }); burst(ev.x, 0.4, ev.z, 40, { color: 0xffe080, speed: 4, up: 7, life: 0.6, size: 0.35 }); flashLight.position.set(ev.x, 1.5, ev.z); flashLight.intensity = 30; addShake(world, 0.7); }, 280);
        } else if (id === 'quicken') {
          // The cast: a gold ring rushes out and sparks climb the blade. The aura that
          // follows is drawn every frame below, off the player's buff state.
          ring(ev.x, ev.z, { color: 0xffc040, radius: 1.8, life: 0.4 });
          burst(ev.x, 0.9, ev.z, 40, { color: 0xffd060, speed: 1.5, up: 4, life: 0.7, size: 0.32, gravity: -2 });
        } else if (id === 'windWalk') {
          // A gust at the feet: two pale rings racing outward and a ground-hugging puff of
          // dust, the way wind announces itself by what it kicks up.
          ring(ev.x, ev.z, { color: 0xe6ecef, radius: 2.4, life: 0.5, y: 0.04 });
          ring(ev.x, ev.z, { color: 0xc9d3d8, radius: 1.5, life: 0.35, y: 0.1 });
          burst(ev.x, 0.15, ev.z, 60, { color: 0xd9dfe2, speed: 4.5, up: 0.9, life: 0.55, size: 0.42, gravity: -0.4 });
        } else if (id === 'bowlingBash') {
          addShake(world, 0.25);
        } else if (id === 'arrowShower') {
          setTimeout(() => arrowShower(ev.x, ev.z, ev.facing), 180);
        } else if (id === 'shoot3') {
          setTimeout(() => burst(ev.x + ev.facing * 0.8, ev.y + 1.1, ev.z, 8, { color: 0xa0e0ff, speed: 2, up: 1, life: 0.3, size: 0.25 }), 150);
        }
        break;
      }
      case 'hit': {
        if (ev.target === 'enemy') {
          const crit = ev.crit;
          // A critical reads from its number: red digits rimmed in gold, bigger, punched in.
          // It used to add two gold arcs crossing over the enemy and spinning apart, which
          // is the pair of turning blades Toto spotted, plus twice the sparks and two and a
          // half times the shake. All of it landed on the frame a critical did, which is
          // also the frame carrying the biggest hit in the fight. The number says it well
          // enough on its own; a crit is otherwise an ordinary hit now.
          number(ev.x, ev.y + 0.4, ev.z, String(ev.dmg), '#ffffff', crit, crit);
          burst(ev.x, ev.y, ev.z, 12, { color: 0xfff4d0, speed: 4, up: 3, life: 0.35, size: 0.28, dir: Math.sign(ev.launched ? 0 : 1) });
          if (ev.monster === 'poring' || ev.monster === 'lunatic') burst(ev.x, ev.y, ev.z, 8, { color: ev.monster === 'poring' ? 0xff86b4 : 0xffffff, speed: 3, up: 3, life: 0.5, size: 0.3, gravity: 12 });
          addShake(world, 0.14);
          if (ev.attack === 'blitzBeat' || ev.attack === 'autoBlitz') burst(ev.x, ev.y + 0.6, ev.z, 14, { color: 0xffe0a0, speed: 5, up: 2, life: 0.4, size: 0.3 });
        } else {
          number(ev.x, ev.y + 0.6, ev.z, String(ev.dmg), '#ff5a4a', true);
          burst(ev.x, ev.y, ev.z, 16, { color: 0xff5040, speed: 4, up: 3, life: 0.4, size: 0.3 });
          addShake(world, 0.5);
        }
        break;
      }
      case 'kill': {
        const c = ev.monster === 'poring' ? 0xff86b4 : ev.monster === 'lunatic' ? 0xffffff : ev.boss ? 0xff4020 : 0xd9d1c0;
        burst(ev.x, ev.y + 0.5, ev.z, ev.boss ? 200 : 30, { color: c, speed: ev.boss ? 8 : 4, up: ev.boss ? 8 : 4, life: ev.boss ? 1.4 : 0.7, size: 0.35, gravity: 10 });
        if (ev.boss) { addShake(world, 1.2); ring(ev.x, ev.z, { color: 0xff6030, radius: 6, life: 1.0 }); }
        break;
      }
      case 'bossDrop': {  // the boss's weapon: a pillar of light, gold sparks, its name
        beam(ev.x, ev.z);
        ring(ev.x, ev.z, { color: 0xffe08a, radius: 3.5, life: 0.9 });
        burst(ev.x, ev.y + 0.3, ev.z, 60, { color: 0xffe08a, speed: 1.4, up: 6, life: 1.4, size: 0.32, gravity: -2 });
        setTimeout(() => number(ev.x, ev.y + 2.6, ev.z, ITEMS[ev.item]?.name || 'Loot', '#ffe08a', true), 500);
        break;
      }
      case 'itemDrop': {  // a monster's drop: a smaller pillar, the name, no shake
        beam(ev.x, ev.z, { life: 1.1 });
        burst(ev.x, ev.y + 0.3, ev.z, 24, { color: 0xffe08a, speed: 1.2, up: 4, life: 1.0, size: 0.28, gravity: -2 });
        number(ev.x, ev.y + 1.8, ev.z, ITEMS[ev.item]?.name || 'Loot', '#ffe08a', true);
        break;
      }
      case 'levelUp': {   // a gold column climbing the hero, a ring at the feet, the words
        number(ev.x, ev.y + 2.3, ev.z, 'LEVEL UP', '#ffe08a', true);
        ring(ev.x, ev.z, { color: 0xffd76a, radius: 2.2, life: 0.7 });
        burst(ev.x, ev.y + 0.2, ev.z, 46, { color: 0xffe08a, speed: 0.9, up: 5.5, life: 1.1, size: 0.3, gravity: -3 });
        burst(ev.x, ev.y + 0.4, ev.z, 18, { color: 0xffffff, speed: 2.2, up: 3, life: 0.6, size: 0.2, gravity: 0 });
        break;
      }
      case 'autoBlitz':   // feathers as the bird launches; the strike itself is a normal hit
        burst(ev.x, ev.y + 1.4, ev.z, 6, { color: 0xf0e6d0, speed: 2, up: 2.5, life: 0.45, size: 0.22, gravity: 3 });
        break;
      case 'drain': {     // Soul Drain: a green heal number and a red/blue pair of motes.
        // Orvane's Mana Clasp takes only SP, so it sends the same event with hp 0 - and then
        // the number is the SP, in the mana potion's blue, which warm() already has glyphs for.
        if (ev.hp) {
          number(ev.x, ev.y, ev.z, `+${ev.hp}`, '#7dff9a');
          burst(ev.x, ev.y - 0.6, ev.z, 8, { color: 0xff6a6a, speed: 1.2, up: 2.2, life: 0.6, size: 0.24, gravity: -1 });
        } else if (ev.sp) {
          number(ev.x, ev.y, ev.z, `+${ev.sp}`, '#7db8ff');
        }
        burst(ev.x, ev.y - 0.6, ev.z, 6, { color: 0x7fb0ff, speed: 1.2, up: 2.4, life: 0.6, size: 0.22, gravity: -1 });
        break;
      }
      // Orvane's Auto Meteor, in two halves: the mark on the floor when it is called, and the
      // star landing on that spot half a second later, wherever the target has got to.
      case 'undertow':   // the sea taking hold: a tight ring and foam dragged inwards
        ring(ev.x, ev.z, { color: 0x3fc8f0, radius: 1.1, life: 0.3, y: 0.06 });
        burst(ev.x, ev.y, ev.z, 10, { color: 0x9fe4ff, speed: 1.6, up: 1.2, life: 0.35, size: 0.22, gravity: 2 });
        break;
      case 'autoMeteor':
        ring(ev.x, ev.z, { color: 0xb070ff, radius: 1.5, life: 0.5, y: 0.04 });
        break;
      case 'autoBolt':
        // The wedges leave on the call, not on the landing: the sim holds the damage 0.28 s
        // and this is that 0.28 s made visible. Beams read as a thing arriving from nowhere;
        // real shards falling read as a thing that was already on its way.
        iceShower(ev.x, ev.z);
        ring(ev.x, ev.z, { color: 0x50c0ff, radius: 2.6, life: 0.3, y: 0.04 });
        break;
      case 'coldBolt': {
        // and the ground answers when they land
        ring(ev.x, ev.z, { color: 0xd8f4ff, radius: 2.4, life: 0.3, y: 0.06 });
        burst(ev.x, 0.3, ev.z, 10, { color: 0xffffff, speed: 2.4, up: 1.8, life: 0.3, size: 0.16 });
        flashLight.position.set(ev.x, 1.2, ev.z); flashLight.intensity = 13;
        addShake(world, 0.16);
        break;
      }
      case 'autoMagnum':   // the weapon casting it: the same burst, without the hero's swing
        ring(ev.x, ev.z, { color: 0xff8030, radius: 2.6, life: 0.4, y: 0.05 });
        burst(ev.x, 0.4, ev.z, 28, { color: 0xff9040, speed: 6, up: 3.4, life: 0.5, size: 0.3, gravity: 5 });
        burst(ev.x, 0.3, ev.z, 10, { color: 0xffe0a0, speed: 3, up: 2, life: 0.35, size: 0.2 });
        flashLight.position.set(ev.x, 1.2, ev.z); flashLight.intensity = 14;
        addShake(world, 0.3);
        break;
      case 'bossHeal': {
        // It worked. Green going UP, against every other number in the game going down.
        number(ev.x, ev.y + 2.2, ev.z, '+' + ev.amount, '#7dff9a');
        ring(ev.x, ev.z, { color: 0x7dff9a, radius: 2.2, life: 0.5, y: 0.05 });
        burst(ev.x, 0.3, ev.z, 26, { color: 0x9dffb0, speed: 1.2, up: 5.5, life: 0.7, size: 0.26, gravity: -3 });
        flashLight.position.set(ev.x, 1.4, ev.z); flashLight.intensity = 10;
        break;
      }
      case 'healBroken':  // and this is what it looks like when the hero got there in time
        number(ev.x, ev.y + 2.2, ev.z, 'BROKEN', '#ffd070');
        burst(ev.x, 1.2, ev.z, 20, { color: 0xffd070, speed: 5, up: 2, life: 0.4, size: 0.24, gravity: 8 });
        addShake(world, 0.25);
        break;
      case 'freeze':     // it stops: a hard white crack, then nothing while the tint holds it
        burst(ev.x, ev.y + 0.5, ev.z, 14, { color: 0xcdf2ff, speed: 2.2, up: 1.6, life: 0.4, size: 0.2, gravity: 4 });
        ring(ev.x, ev.z, { color: 0x9fe8ff, radius: 0.7, life: 0.35, y: 0.05 });
        break;
      case 'bossMeteorCall':
        // Where one of the king's is going to land, drawn the moment he calls it: the whole
        // of the dodge is reading this ring before the rock arrives.
        ring(ev.x, ev.z, { color: 0xff4a1a, radius: 1.5, life: (ev.at ?? 0.6) + 0.1, y: 0.04 });
        break;
      case 'meteor': {
        // Two meteors share this: the hero's own Auto Meteor, violet, and the King Orc's,
        // which is fire and falls on the hero rather than for him.
        const hot = !!ev.fire;
        beam(ev.x, ev.z, { color: hot ? 0xff7a2a : 0xc48aff, life: 0.5 });
        ring(ev.x, ev.z, { color: hot ? 0xffb060 : 0xe0b0ff, radius: 2.0, life: 0.35, y: 0.06 });
        burst(ev.x, 0.4, ev.z, 34, { color: hot ? 0xff5a18 : 0xb070ff, speed: 5, up: 3.5, life: 0.5, size: 0.34, gravity: 5 });
        burst(ev.x, 0.3, ev.z, 14, { color: hot ? 0xffe08a : 0xffffff, speed: 2.4, up: 2.2, life: 0.35, size: 0.2 });
        flashLight.position.set(ev.x, 1.2, ev.z); flashLight.intensity = 18;
        addShake(world, 0.3);
        break;
      }
      case 'dodge':
        number(ev.x, ev.y, ev.z, 'MISS', '#a0f0ff');
        burst(ev.x, ev.y - 0.4, ev.z, 10, { color: 0xa0f0ff, speed: 2.5, up: 1, life: 0.3, size: 0.2, gravity: 0 });
        break;
      case 'land':
        if (ev.hard) { burst(ev.x, 0.1, ev.z, 14, { color: 0x9a8a70, speed: 2.5, up: 1.5, life: 0.45, size: 0.35, gravity: 6 }); addShake(world, 0.15); }
        break;
      case 'dash':
        burst(ev.x, 0.2, ev.z, 10, { color: 0xc0c8d8, speed: 1.5, up: 1, life: 0.35, size: 0.3, gravity: 3, dir: -ev.facing });
        break;
      case 'enemyAttack':
        if (ev.move === 'slam') { ring(ev.x, ev.z, { color: 0xc04020, radius: 3.6, life: 0.5 }); burst(ev.x, 0.2, ev.z, 60, { color: 0x8a6a40, speed: 6, up: 4, life: 0.6, size: 0.4, gravity: 7 }); addShake(world, 1.0); }
        else if (ev.move === 'charge') addShake(world, 0.3);
        else if (ev.monster !== 'skelArcher') slash(ev.x, ev.y, ev.z, ev.facing, { color: 0xff8070, scale: ev.monster === 'orcLord' ? 1.6 : 0.9, life: 0.14 });
        break;
      case 'windup':
        if (ev.move === 'slam' || ev.move === 'charge') burst(ev.x, 1.5, ev.z, 20, { color: 0xff3020, speed: 1.5, up: 2, life: 0.6, size: 0.35, gravity: -2 });
        break;
      case 'bossAdds':
        // The half-health break. The boss's own change is a tint and a widening of whatever
        // he carries loose (render/monsters.js); this is the moment it happens - a ring out
        // from under him and embers off the floor, so it reads as a turn rather than a spawn.
        burst(ev.x, 1.5, ev.z, 40, { color: 0xa040ff, speed: 3, up: 3, life: 0.8, size: 0.4, gravity: -1 });
        ring(ev.x, ev.z, { color: 0xc04a6a, radius: 4.2, life: 0.6 });
        ring(ev.x, ev.z, { color: 0x8a30ff, radius: 2.6, life: 0.45, y: 0.12 });
        burst(ev.x, 0.3, ev.z, 26, { color: 0xff3a50, speed: 2.2, up: 4.5, life: 1.0, size: 0.3, gravity: -1.5 });
        flashLight.position.set(ev.x, 1.6, ev.z); flashLight.intensity = 22;
        addShake(world, 0.55);
        break;
      case 'roomClear':
        burst(game.player.x, 1.2, game.player.z, 60, { color: 0xe8b64a, speed: 3, up: 5, life: 1.2, size: 0.35, gravity: 4 });
        break;
      case 'drop':
        burst(ev.x, ev.y, ev.z, 8, { color: ev.kind === 'hp' ? 0xff6060 : 0x60a0ff, speed: 1.5, up: 2, life: 0.4, size: 0.25 });
        break;
      case 'pickup':
        number(ev.x, ev.y, ev.z, `+${ev.amount}`, ev.kind === 'hp' ? '#7dff7d' : '#7db8ff', true);
        burst(ev.x, ev.y - 0.6, ev.z, 26, { color: ev.kind === 'hp' ? 0x7dff7d : 0x7db8ff, speed: 1.8, up: 4, life: 0.7, size: 0.3, gravity: -2 });
        break;
      case 'playerDead':
        burst(ev.x, 1, ev.z, 40, { color: 0xff4040, speed: 3, up: 3, life: 1, size: 0.4 });
        addShake(world, 0.8);
        break;
    }
  }

  let auraAcc = 0, windAcc = 0.4;
  function update(game, dt) {
    for (const ev of game.events) onEvent(ev, game);

    // Buff aura: motes drifting up around the hero for as long as the buff lasts. Read off
    // the player's buff state rather than an event, so it stops the instant the buff does.
    const p = game.player;
    const quick = !!p?.buffs?.quicken, wind = !!p?.buffs?.windWalk;
    if ((quick || wind) && p.state !== 'dead') {
      auraAcc += dt * (quick ? 26 : 34);
      while (auraAcc >= 1) {
        auraAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        if (quick) {   // gold motes climbing the body
          const r = 0.45 + Math.random() * 0.35;
          burst(p.x + Math.cos(a) * r, p.y + 0.15 + Math.random() * 0.4, p.z + Math.sin(a) * r * 0.5, 1,
            { color: 0xffd060, speed: 0.2, up: 1.6, life: 0.7, size: 0.22, spread: 0, gravity: -0.6 });
        }
        if (wind) {    // dust kicked up around the feet, drifting out and barely rising
          const r = 0.3 + Math.random() * 0.5;
          burst(p.x + Math.cos(a) * r, p.y + 0.05 + Math.random() * 0.12, p.z + Math.sin(a) * r * 0.55, 1,
            { color: Math.random() < 0.5 ? 0xd9dfe2 : 0xb9c3c8, speed: 1.4, up: 0.35, life: 0.6, size: 0.36, spread: 0, gravity: -0.15 });
        }
      }
      // and, while the wind lasts, a faint gust ring rolling out from the feet now and then
      if (wind) { windAcc += dt; if (windAcc >= 0.55) { windAcc = 0; ring(p.x, p.z, { color: 0xdfe6ea, radius: 1.6, life: 0.45, y: 0.03 }); } }
    } else { auraAcc = 0; windAcc = 0.4; }

    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
    }
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i], k = 1 - p.t / p.life;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 3] = p.r * k; col[i * 3 + 1] = p.g * k; col[i * 3 + 2] = p.b * k;
      size[i] = p.size * (0.5 + k);
    }
    geo.setDrawRange(0, parts.length);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;

    // numbers - a row of digit sprites that rise, fade and are put back together
    for (let i = numbers.length - 1; i >= 0; i--) {
      const n = numbers[i];
      n.t += dt;
      n.y += n.vy * dt;
      n.vy -= 5 * dt;
      const k = n.t / n.life;
      const op = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      let sc = 1;
      if (n.pop) {   // overshoot then settle: 1 + pop at t=0, back to 1 by 0.16s, eased
        const u = Math.min(1, n.t / 0.16), ease = 1 - (1 - u) * (1 - u);
        sc = 1 + n.pop * (1 - ease);
      }
      for (let j = 0; j < n.sps.length; j++) {
        const sp = n.sps[j];
        sp.position.set(n.x + n.offs[j] * sc, n.y, n.z);
        sp.material.opacity = op;
        if (n.pop) sp.scale.set(n.dw * sc, n.h * sc, 1);
      }
      if (n.t >= n.life) { for (const sp of n.sps) freeNumber(sp); numbers.splice(i, 1); }
    }

    // transients
    for (let i = transients.length - 1; i >= 0; i--) {
      const t = transients[i];
      t.t += dt;
      const k = t.t / t.life;
      if (t.kind === 'slash') { t.m.rotation.z += t.spin * dt * 6; t.m.scale.multiplyScalar(1 + (t.grow - 1) * dt * 4); t.m.material.opacity = 0.9 * (1 - k); }
      else if (t.kind === 'ring') { const s = 0.2 + (t.radius - 0.2) * (1 - Math.pow(1 - k, 3)); t.m.scale.setScalar(s); t.m.material.opacity = 0.95 * (1 - k); }
      else if (t.kind === 'beam') { const up = Math.min(1, k * 4); t.m.scale.set(0.2 + 0.8 * up, up, 0.2 + 0.8 * up); t.m.rotation.y += dt * 1.5; t.m.material.opacity = 0.55 * (1 - Math.pow(k, 2)); }
      if (t.t >= t.life) { freeTransient(t); transients.splice(i, 1); }
    }
    flashLight.intensity = Math.max(0, flashLight.intensity - 220 * dt);

    // projectiles mirror
    const seen = new Set();
    for (const pr of game.projectiles) {
      seen.add(pr.id);
      let m = projectiles.get(pr.id);
      if (!m) { m = makeArrow(pr.kind); scene.add(m); projectiles.set(pr.id, m); }
      m.position.set(pr.x, pr.y, pr.z);
      if (pr.kind === 'hellOrb') {
        const t = performance.now() * 0.006;
        m.scale.setScalar(1 + 0.12 * Math.sin(t + pr.id));
        m.rotation.y = t * 0.5;
      }
      m.rotation.set(0, pr.facing > 0 ? 0 : Math.PI, Math.atan2(pr.vy, Math.abs(pr.vx)) * pr.facing);
    }
    for (const [id, m] of projectiles) if (!seen.has(id)) { scene.remove(m); projectiles.delete(id); }

    // potions: bob and spin while they lie on the floor
    const seenP = new Set();
    for (const it of game.pickups) {
      seenP.add(it.id);
      let m = pickups.get(it.id);
      if (!m) { m = makePotion(it.kind); scene.add(m); pickups.set(it.id, m); }
      const bob = it.y <= 0 ? 0.08 + 0.06 * Math.sin(world.t * 4 + it.id) : 0;
      m.position.set(it.x, it.y + bob, it.z);
      m.rotation.y += 1.6 * dt;
      m.rotation.z = it.y > 0 ? it.t * 6 : 0;
      const left = 20 - it.t;
      m.visible = left > 3 || Math.floor(world.t * 8) % 2 === 0;
    }
    for (const [id, m] of pickups) if (!seenP.has(id)) { scene.remove(m); pickups.delete(id); }
    placeFxLights();   // after both lists have settled, so nothing holds a light it no longer owns

    // falling arrows
    for (let i = rain.length - 1; i >= 0; i--) {
      const r = rain[i];
      r.t += dt;
      if (r.t < 0) continue;
      if (r.stuck) { r.stuck += dt; if (r.stuck > 0.9) { scene.remove(r.m); rain.splice(i, 1); } continue; }
      r.m.position.y += r.vy * dt;
      if (r.m.position.y <= 0.15) { r.m.position.y = 0.15; r.stuck = 0.001; burst(r.m.position.x, 0.1, r.m.position.z, 4, { color: r.color ?? 0xa0e0ff, speed: 1.5, up: 1.5, life: 0.3, size: 0.2 }); }
    }
  }

  function clear() {
    parts.length = 0;
    for (const n of numbers) for (const sp of n.sps) freeNumber(sp);
    numbers.length = 0;
    for (const t of transients) freeTransient(t);
    transients.length = 0;
    for (const [, m] of projectiles) scene.remove(m);
    projectiles.clear();
    for (const [, m] of pickups) scene.remove(m);
    pickups.clear();
    for (const r of rain) scene.remove(r.m);
    rain.length = 0;
  }

  // Shader warm-up: one of every visual the run can spawn, off-screen, into the same
  // containers clear() empties. burst() writes into the one particle cloud that already
  // exists, so it only needs the points to have been drawn once.
  function warm() {
    burst(WARM_X, 1, WARM_Z, 4, { life: 9 });
    // Every glyph the game can show, in the colour it shows it in - and no others. Warming
    // each character against every colour instead came to three hundred textures and most of
    // a second, for combinations nothing ever asks for. Drawing the canvas is only half of
    // it; initTexture does the upload here, where nothing else is happening, rather than on
    // the frame a ring lands.
    const DIGITS = '0123456789';
    const names = new Set(['Loot']);
    for (const it of Object.values(ITEMS)) if (it.name) names.add(it.name);
    const wanted = [
      [DIGITS, '#ffffff'],            // damage dealt
      [DIGITS, '#ff5a4a'],            // damage taken
      ['+' + DIGITS, '#7dff9a'],      // Soul Drain
      ['+' + DIGITS, '#7dff7d'],      // a health potion
      ['+' + DIGITS, '#7db8ff'],      // a mana potion
      ['MISS', '#a0f0ff'],
      ['BROKEN', '#ffd070'],          // a boss's second wind, cut off
      ['LEVEL UP' + DIGITS + [...names].join(''), '#ffe08a'],
    ];
    const up = (t) => { try { world.renderer.initTexture(t); } catch { /* not ready yet */ } };
    for (const [chars, color] of wanted) for (const ch of new Set(chars)) up(glyph(ch, color, false));
    for (const ch of DIGITS) up(glyph(ch, '#ffffff', true));   // the critical's own red and gold
    number(WARM_X, 1, WARM_Z, '99', '#fff', true); number(WARM_X, 1, WARM_Z, '99', '#fff', false, true);
    slash(WARM_X, 0, WARM_Z, 1); ring(WARM_X, WARM_Z, { life: 9 }); beam(WARM_X, WARM_Z, { life: 9 });
    let id = -1;
    for (const kind of ['arrow', 'icicle', 'hellOrb', 'foxfire', 'tide', 'sandBall', 'rock']) { const m = makeArrow(kind); m.position.set(WARM_X, 1, WARM_Z); scene.add(m); projectiles.set(id--, m); }
    for (const kind of ['hp', 'mp']) { const m = makePotion(kind); m.position.set(WARM_X, 0, WARM_Z); scene.add(m); pickups.set(id--, m); }
  }
  return { update, clear, burst, number, warm };
}
