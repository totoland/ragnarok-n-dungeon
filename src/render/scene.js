// Renderer, camera, lights and the dungeon rooms. Everything that knows about pixels and
// Three.js scene graph lives under render/; the sim never imports any of it.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CAMERA, FLOOR } from '../config.js';
import { stoneFloor, brickWall } from './textures.js';

const THEMES = {
  sewer: { floor: '#4f5a55', grout: '#1f2622', wall: '#3f4a48', mortar: '#1b211f', fog: 0x0a1210, hemi: [0x7d9a93, 0x1c2a24], torch: 0xffa040, props: 'barrels' },
  crypt: { floor: '#5a5560', grout: '#221f28', wall: '#4a4452', mortar: '#1e1a24', fog: 0x0d0a12, hemi: [0x8a80a8, 0x241c30], torch: 0x9fd0ff, props: 'bones' },
  throne: { floor: '#5c4a46', grout: '#251b19', wall: '#5a3f3a', mortar: '#221513', fog: 0x140a0a, hemi: [0xb08a70, 0x2e1a14], torch: 0xff7a30, props: 'throne' },
};

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07060a);
  scene.fog = new THREE.Fog(0x07060a, 18, 34);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 80);
  camera.position.set(0, CAMERA.height, CAMERA.dist);

  const hemi = new THREE.HemisphereLight(0x8899bb, 0x223322, 0.42);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1dc, 1.5);
  key.position.set(-4, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 40;
  key.shadow.camera.left = -14; key.shadow.camera.right = 14;
  key.shadow.camera.top = 10; key.shadow.camera.bottom = -8;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x6a8cff, 0.5);
  rim.position.set(6, 6, -8);
  scene.add(rim);

  const world = { renderer, scene, camera, hemi, key, rim, room: null, torches: [], shake: 0, camX: 2, t: 0 };

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  world.resize = resize;
  return world;
}

// ---------------------------------------------------------------- rooms

function disposeRoom(world) {
  if (!world.room) return;
  world.scene.remove(world.room);
  world.room.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { for (const k of ['map']) if (m[k]) m[k].dispose(); m.dispose(); }
    }
  });
  world.room = null;
  world.torches = [];
}

export function buildRoom(world, roomDef, index) {
  disposeRoom(world);
  const theme = THEMES[roomDef.theme] || THEMES.sewer;
  const g = new THREE.Group();
  const W = roomDef.width;
  const pad = 6;
  const depth = FLOOR.zMax - FLOOR.zMin + 2.4;
  const zBack = FLOOR.zMin - 1.3;

  world.scene.fog.color.set(theme.fog);
  world.scene.background.set(theme.fog);
  world.hemi.color.set(theme.hemi[0]);
  world.hemi.groundColor.set(theme.hemi[1]);

  const floorMat = new THREE.MeshStandardMaterial({ map: stoneFloor(theme.floor, theme.grout, index + 3), roughness: 0.92, metalness: 0.02 });
  floorMat.map.repeat.set((W + pad * 2) / 2.2, depth / 2.2);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W + pad * 2, 0.3, depth), floorMat);
  floor.position.set(W / 2, -0.15, (FLOOR.zMin + FLOOR.zMax) / 2 - 0.4);
  floor.receiveShadow = true;
  g.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ map: brickWall(theme.wall, theme.mortar, index + 7), roughness: 0.95 });
  wallMat.map.repeat.set((W + pad * 2) / 4, 14 / 4);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W + pad * 2, 14, 0.6), wallMat);
  back.position.set(W / 2, 7, zBack - 0.3);
  back.receiveShadow = true; back.castShadow = true;
  g.add(back);
  // dado / ledge along the wall base
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(W + pad * 2, 0.35, 0.5), new THREE.MeshStandardMaterial({ color: 0x2b2730, roughness: 0.9 }));
  ledge.position.set(W / 2, 0.17, zBack + 0.05);
  ledge.castShadow = true; ledge.receiveShadow = true;
  g.add(ledge);

  // side walls with the exit arch on the right
  const sideMat = wallMat.clone();
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.6, 14, depth + 1), sideMat);
  left.position.set(-0.6, 7, (FLOOR.zMin + FLOOR.zMax) / 2 - 0.5);
  left.castShadow = true; left.receiveShadow = true;
  g.add(left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.6, 14, depth + 1), sideMat);
  right.position.set(W + 0.6, 7, (FLOOR.zMin + FLOOR.zMax) / 2 - 0.5);
  right.castShadow = true; right.receiveShadow = true;
  g.add(right);
  const arch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.4, 2.4), new THREE.MeshStandardMaterial({ color: 0x050408, roughness: 1 }));
  arch.position.set(W + 0.6, 1.7, 0);
  arch.name = 'exit';
  g.add(arch);
  const archGlow = new THREE.PointLight(0xe8b64a, 0, 6, 2);
  archGlow.position.set(W - 0.5, 1.8, 0);
  archGlow.name = 'exitGlow';
  g.add(archGlow);

  // pillars + torches along the back wall
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a3540, roughness: 0.85 });
  const torchMat = new THREE.MeshStandardMaterial({ color: theme.torch, emissive: theme.torch, emissiveIntensity: 2.2, roughness: 0.6 });
  for (let x = 2; x < W; x += 5) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 14, 10), pillarMat);
    p.position.set(x, 7, zBack + 0.35);
    p.castShadow = true; p.receiveShadow = true;
    g.add(p);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.2), pillarMat);
    cap.position.set(x, 1.0, zBack + 0.35);
    g.add(cap);
    if ((x / 5) % 2 === 0) continue;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8), torchMat);
    flame.position.set(x + 0.55, 3.1, zBack + 0.8);
    g.add(flame);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x2a1a10 }));
    stick.position.set(x + 0.55, 2.6, zBack + 0.8);
    g.add(stick);
    const light = new THREE.PointLight(theme.torch, 18, 10, 1.7);
    light.position.set(x + 0.55, 3.3, zBack + 1.2);
    g.add(light);
    world.torches.push({ light, flame, base: 18, seed: x });
  }

  // themed props
  const propMat = new THREE.MeshStandardMaterial({ color: 0x5b3f2a, roughness: 0.8 });
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 0.6 });
  if (theme.props === 'barrels') {
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12), propMat);
      b.position.set(3 + i * (W / 4.2) + (i % 2) * 0.6, 0.5, zBack + 1.1 + (i % 2) * 0.5);
      b.castShadow = true; b.receiveShadow = true;
      g.add(b);
    }
    const water = new THREE.Mesh(new THREE.BoxGeometry(W + pad * 2, 0.12, 1.6), new THREE.MeshStandardMaterial({ color: 0x1c4a44, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 }));
    water.position.set(W / 2, -0.08, FLOOR.zMax + 1.0);
    g.add(water);
  } else if (theme.props === 'bones') {
    for (let i = 0; i < 6; i++) {
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), boneMat);
      skull.position.set(1.5 + i * (W / 6.5), 0.22, zBack + 1.0 + (i % 3) * 0.3);
      skull.castShadow = true;
      g.add(skull);
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6), boneMat);
      bone.rotation.z = Math.PI / 2; bone.rotation.y = i;
      bone.position.set(2.2 + i * (W / 6.5), 0.06, zBack + 1.4);
      g.add(bone);
    }
    const coffin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.9), new THREE.MeshStandardMaterial({ color: 0x3a2e3c, roughness: 0.7 }));
    coffin.position.set(W / 2, 0.35, zBack + 1.0);
    coffin.castShadow = true; coffin.receiveShadow = true;
    g.add(coffin);
  } else if (theme.props === 'throne') {
    const stone = new THREE.MeshStandardMaterial({ color: 0x4a3030, roughness: 0.7 });
    const dais = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 3), stone);
    dais.position.set(W / 2, 0.25, zBack + 1.6);
    dais.receiveShadow = true; dais.castShadow = true;
    g.add(dais);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0x6b1c1c, roughness: 0.5, metalness: 0.2 }));
    seat.position.set(W / 2, 1.1, zBack + 1.4);
    seat.castShadow = true;
    g.add(seat);
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.2, 0.35), new THREE.MeshStandardMaterial({ color: 0xb08a2a, roughness: 0.35, metalness: 0.7 }));
    backrest.position.set(W / 2, 2.1, zBack + 0.85);
    backrest.castShadow = true;
    g.add(backrest);
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(W - 2, 0.03, 2.0), new THREE.MeshStandardMaterial({ color: 0x4a1414, roughness: 0.95 }));
    carpet.position.set(W / 2, 0.02, 0);
    carpet.receiveShadow = true;
    g.add(carpet);
    for (const side of [-1, 1]) {
      const brazier = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.25, 0.9, 10), pillarMat);
      brazier.position.set(W / 2 + side * 3.2, 0.45, zBack + 1.8);
      g.add(brazier);
      const fire = new THREE.PointLight(0xff6a20, 18, 10, 1.6);
      fire.position.set(W / 2 + side * 3.2, 1.4, zBack + 1.8);
      g.add(fire);
      world.torches.push({ light: fire, flame: null, base: 18, seed: side * 3 });
    }
  }

  world.scene.add(g);
  world.room = g;
  world.roomWidth = W;
  world.camX = 2;
  return g;
}

// ---------------------------------------------------------------- per frame

export function updateScene(world, game, dt) {
  world.t += dt;
  const p = game.player;
  // camera follows the player along x, clamped to the room, with a little lead and shake
  // half the visible width at the play line (z = 0); on narrow (portrait) screens pull the
  // camera back so at least CAMERA.minHalfView metres are visible ahead of the hero
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2));
  const zoom = Math.max(1, CAMERA.minHalfView / (tanHalf * CAMERA.dist * world.camera.aspect));
  const dist = CAMERA.dist * zoom, height = CAMERA.height * zoom;
  const halfView = tanHalf * dist * world.camera.aspect;
  const target = p.x + p.facing * CAMERA.lead;
  const lo = game.bounds.xMin + halfView - 0.3, hi = game.bounds.xMax - halfView + 0.3;
  const clamped = lo < hi ? Math.min(hi, Math.max(lo, target)) : (lo + hi) / 2;
  world.camX += (clamped - world.camX) * Math.min(1, CAMERA.lag * dt);
  world.shake = Math.max(0, world.shake - dt * 2.4);
  const s = world.shake * world.shake;
  const sx = (Math.random() - 0.5) * s * 0.7, sy = (Math.random() - 0.5) * s * 0.5;
  world.camera.position.set(world.camX + sx, height + sy, dist);
  world.camera.lookAt(world.camX + sx, CAMERA.lookY + sy, 0);
  world.scene.fog.near = 18 * zoom;
  world.scene.fog.far = 34 * zoom;

  // shadow camera and rim light track the view
  world.key.position.set(world.camX - 4, 9, 6);
  world.key.target.position.set(world.camX, 0, 0);
  world.rim.position.set(world.camX + 6, 6, -8);
  world.rim.target.position.set(world.camX, 1, 0);

  for (const t of world.torches) {
    const f = 0.85 + 0.15 * Math.sin(world.t * 9 + t.seed) + 0.1 * Math.sin(world.t * 23.7 + t.seed * 1.7);
    t.light.intensity = t.base * f;
    if (t.flame) t.flame.scale.set(1, 0.85 + 0.3 * f, 1);
  }
  if (world.room) {
    const glow = world.room.getObjectByName('exitGlow');
    if (glow) glow.intensity += (((game.phase === 'cleared') ? 30 : 0) - glow.intensity) * Math.min(1, 4 * dt);
  }
}

export function addShake(world, amount) {
  world.shake = Math.min(1.2, world.shake + amount);
}
