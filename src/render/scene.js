// Renderer, camera, lights and the dungeon rooms. Everything that knows about pixels and
// Three.js scene graph lives under render/; the sim never imports any of it.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CAMERA, FLOOR } from '../config.js';
import { stoneFloor, brickWall, grassFloor, sandFloor, duneSky } from './textures.js';

const THEMES = {
  // Outdoor map. `bg` swaps the tiling brick wall for a painted backdrop plane, and
  // `outdoor` drops the dungeon pillars and torches - a torch bracket standing in open
  // grass was the thing that read as wrong. Fog and hemisphere go daylight.
  field: {
    floor: '#5f7a3c', grout: '#3c4a26', wall: '#6d7a58', mortar: '#3a4430',
    fog: 0xcfdcc6, hemi: [0xdfeaff, 0x6d7a44], torch: 0xffd9a0, props: 'grove',
    bg: 'assets/maps/prontera-forest.png', bgH: 12, ground: 'grass', outdoor: true,
  },
  // Sograt Desert. No painted map: `bgMake` draws the dune sky on a canvas per room, so the
  // town ships with zero image files. Warm fog, low warm hemisphere, sandstone exit arch.
  desert: {
    floor: '#d6b26f', grout: '#a8834a', wall: '#c9a468', mortar: '#8a6a3a',
    fog: 0xe8d3a6, hemi: [0xfff1d0, 0xa88650], torch: 0xffd9a0, props: 'desert',
    bgMake: (i) => duneSky(i + 5), bgH: 12, ground: 'sand', outdoor: true,
    sideWall: 0xb08a55, ledge: 0x9c7a46, arch: 0xc8a874,
  },
  quarry: {
    floor: '#c4a066', grout: '#8f6f3e', wall: '#b39058', mortar: '#7a5c32',
    fog: 0xd9c39a, hemi: [0xf6e6c4, 0x8f6f45], torch: 0xffd9a0, props: 'quarry',
    bgMake: (i) => duneSky(i + 11, { rocky: true }), bgH: 12, ground: 'sand', outdoor: true,
    sideWall: 0x8f7046, ledge: 0x7d5f37, arch: 0xb59565,
  },
  sewer: { floor: '#4f5a55', grout: '#1f2622', wall: '#3f4a48', mortar: '#1b211f', fog: 0x0a1210, hemi: [0x7d9a93, 0x1c2a24], torch: 0xffa040, props: 'barrels' },
  crypt: { floor: '#5a5560', grout: '#221f28', wall: '#4a4452', mortar: '#1e1a24', fog: 0x0d0a12, hemi: [0x8a80a8, 0x241c30], torch: 0x9fd0ff, props: 'bones' },
  throne: { floor: '#5c4a46', grout: '#251b19', wall: '#5a3f3a', mortar: '#221513', fog: 0x140a0a, hemi: [0xb08a70, 0x2e1a14], torch: 0xff7a30, props: 'throne' },
};

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // A tablet at its native 2x is four times the pixels of 1x on a mobile GPU that also has
  // to run the shadow pass; 1.5x is where an iPad stops dropping frames and still looks
  // crisp. The loop in main.js lowers this further while frames run long (world.setDpr).
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const dprMax = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
  renderer.setPixelRatio(dprMax);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = coarse ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
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
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 40;
  key.shadow.camera.left = -14; key.shadow.camera.right = 14;
  key.shadow.camera.top = 10; key.shadow.camera.bottom = -8;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x6a8cff, 0.5);
  rim.position.set(6, 6, -8);
  scene.add(rim);

  const world = { renderer, scene, camera, hemi, key, rim, room: null, torches: [], shake: 0, camX: 2, t: 0, dpr: dprMax, dprMax, coarse };

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  world.resize = resize;
  world.setDpr = (r) => {
    r = Math.max(0.75, Math.min(dprMax, Math.round(r * 4) / 4));
    if (r === world.dpr) return;
    world.dpr = r;
    renderer.setPixelRatio(r);
    resize();
  };
  return world;
}

// ---------------------------------------------------------------- rooms

// Room textures are procedural canvases (a floor, a wall, a dune sky) or one painted
// backdrop, and drawing them is most of a room build - the 70-80 ms frame on entering a
// room on a tablet. They are cached by theme and room index and uploaded ahead of time by
// prewarmRoom(), which the shell calls while the player walks to the exit of the room
// before. disposeRoom() leaves cached textures alone; the cache evicts its oldest itself.
const texCache = new Map();
function cachedTex(key, make) {
  let t = texCache.get(key);
  if (!t) {
    t = make();
    t.userData.cached = true;
    texCache.set(key, t);
    if (texCache.size > 18) { const [k0, t0] = texCache.entries().next().value; texCache.delete(k0); t0.dispose(); }
  }
  return t;
}
function roomTextures(theme, themeKey, index) {
  const ground = cachedTex(`ground:${themeKey}:${index}`, () => (theme.ground === 'grass'
    ? grassFloor(theme.floor, theme.grout, index + 3)
    : theme.ground === 'sand'
      ? sandFloor(theme.floor, theme.grout, index + 3)
      : stoneFloor(theme.floor, theme.grout, index + 3)));
  const sky = (t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
  const bg = theme.bg
    ? cachedTex(`bg:${theme.bg}`, () => { const t = new THREE.TextureLoader().load(theme.bg, () => { if (t.userData.warm) t.userData.warm.initTexture(t); }); return sky(t); })
    : theme.bgMake ? cachedTex(`sky:${themeKey}:${index}`, () => sky(theme.bgMake(index))) : null;
  const wall = bg ? null : cachedTex(`wall:${themeKey}:${index}`, () => brickWall(theme.wall, theme.mortar, index + 7));
  return { ground, bg, wall };
}

// Draw and upload a room's textures now, so building it later costs geometry alone.
// Drawing the next room's textures ahead of time is the right idea; doing all three in the
// frame that decides to is a 48 ms one, which the tablet reported as the only spike left once
// the shader churn was gone. Queue them and upload one a frame, the way the next room's
// monsters are already built one a frame, over a walk that lasts seconds.
let warmQueue = [];
export function prewarmRoom(world, roomDef, index) {
  const theme = THEMES[roomDef.theme] || THEMES.sewer;
  const { ground, bg, wall } = roomTextures(theme, roomDef.theme, index);
  warmQueue = [];
  for (const t of [ground, bg, wall]) {
    if (!t) continue;
    t.userData.warm = world.renderer;
    warmQueue.push(t);
  }
}

// Upload one queued texture. Returns true while there is more to do.
export function prewarmTick(world) {
  const t = warmQueue.shift();
  if (!t) return false;
  if (t.image && (t.image.width || t.image.complete)) { try { world.renderer.initTexture(t); } catch { /* not uploadable yet */ } }
  return warmQueue.length > 0;
}

export function disposeRoom(world) {
  if (!world.room) return;
  world.scene.remove(world.room);
  world.room.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      // Every texture slot, not just `map`. A room material with a normal or emissive map
      // would otherwise hold its texture forever, and the only symptom is memory creeping up
      // once there are enough maps to notice - the worst kind of bug to go looking for later.
      for (const m of mats) {
        for (const k in m) { const t = m[k]; if (t && t.isTexture && !t.userData.cached) t.dispose(); }
        m.dispose();
      }
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

  const tex = roomTextures(theme, roomDef.theme, index);
  const floorMat = new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 0.92, metalness: 0.02 });
  floorMat.map.repeat.set((W + pad * 2) / 2.2, depth / 2.2);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W + pad * 2, 0.3, depth), floorMat);
  floor.position.set(W / 2, -0.15, (FLOOR.zMin + FLOOR.zMax) / 2 - 0.4);
  floor.receiveShadow = true;
  g.add(floor);

  // A painted backdrop is unlit on purpose: it already has its own light baked in, and
  // letting torches or the key light touch it makes the distance read as a nearby wall.
  // Its height is chosen so the art maps 1:1 with no stretch - see assets/maps/README.md.
  const backdrop = !!(theme.bg || theme.bgMake);
  const bgH = backdrop ? (theme.bgH || 12) : 14;
  let wallMat;
  if (backdrop) {
    // A painted file, or a canvas the theme draws itself (the desert's dune sky).
    wallMat = new THREE.MeshBasicMaterial({ map: tex.bg, toneMapped: false });
  } else {
    wallMat = new THREE.MeshStandardMaterial({ map: tex.wall, roughness: 0.95 });
    wallMat.map.repeat.set((W + pad * 2) / 4, 14 / 4);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(W + pad * 2, bgH, 0.6), wallMat);
  back.position.set(W / 2, bgH / 2, zBack - 0.3);
  back.receiveShadow = !backdrop; back.castShadow = !backdrop;
  g.add(back);
  // dado / ledge along the wall base
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(W + pad * 2, 0.35, 0.5), new THREE.MeshStandardMaterial({ color: theme.ledge || (theme.outdoor ? 0x3f4a2c : 0x2b2730), roughness: 0.9 }));
  ledge.position.set(W / 2, 0.17, zBack + 0.05);
  ledge.castShadow = true; ledge.receiveShadow = true;
  g.add(ledge);

  // side walls with the exit arch on the right.
  // Outdoors these must NOT clone wallMat: that material is the painted backdrop, and
  // cloning it smears the whole forest image down a 14-unit slab at each end of the room.
  const sideMat = backdrop
    ? new THREE.MeshStandardMaterial({ color: theme.sideWall || 0x33522a, roughness: 0.96 })
    : wallMat.clone();
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
  if (theme.outdoor) {
    // Frame the dark opening as a mossy stone culvert mouth. The next room is the sewer, so
    // this doubles as the story beat instead of a black rectangle in open daylight.
    // Built as a real arch profile - an extruded shape with a semicircular head and a hole
    // through it - because stacked boxes plus sphere "moss" read as grey slab and green balls.
    const mossStone = new THREE.MeshStandardMaterial({ color: theme.arch || 0x8d9180, roughness: 0.96 });
    const halfW = 1.9, pierW = 1.42, springY = 2.1, jamb = 2.0;

    const profile = new THREE.Shape();
    profile.moveTo(-halfW, 0);
    profile.lineTo(-halfW, springY);
    profile.absarc(0, springY, halfW, Math.PI, 0, true);
    profile.lineTo(halfW, 0);
    profile.lineTo(-halfW, 0);

    const hole = new THREE.Path();
    hole.moveTo(-pierW, 0);
    hole.lineTo(-pierW, jamb);
    hole.absarc(0, jamb, pierW, Math.PI, 0, true);
    hole.lineTo(pierW, 0);
    hole.lineTo(-pierW, 0);
    profile.holes.push(hole);

    const archGeo = new THREE.ExtrudeGeometry(profile, { depth: 0.8, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1, curveSegments: 20 });
    const mouth = new THREE.Mesh(archGeo, mossStone);
    mouth.rotation.y = Math.PI / 2;        // shape spans the room's depth, extrudes along x
    mouth.position.set(W - 0.1, 0, 0);
    mouth.castShadow = true; mouth.receiveShadow = true;
    g.add(mouth);

    // A dark plane just behind the opening so the hole reads as depth, not as the skybox.
    const throat = new THREE.Mesh(new THREE.PlaneGeometry(pierW * 2.2, jamb + pierW), new THREE.MeshBasicMaterial({ color: 0x0a1410 }));
    throat.rotation.y = -Math.PI / 2;
    throat.position.set(W + 0.5, (jamb + pierW) / 2, 0);
    g.add(throat);

    // Moss reads as a creeping edge, not as beads: a thin band hugging the arch crown.
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x4f6f33, roughness: 0.99 });
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI * (i / 12);
      const z = Math.cos(a) * halfW, y = springY + Math.sin(a) * halfW;
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.17 + (i % 3) * 0.04, 7, 6), mossMat);
      blob.position.set(W - 0.42, y, z);
      blob.scale.set(0.5, 0.75, 1.15);
      g.add(blob);
    }
  }
  const archGlow = new THREE.PointLight(0xe8b64a, 0, 6, 2);
  archGlow.position.set(W - 0.5, 1.8, 0);
  archGlow.name = 'exitGlow';
  g.add(archGlow);

  // pillars + torches along the back wall
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a3540, roughness: 0.85 });
  const torchMat = new THREE.MeshStandardMaterial({ color: theme.torch, emissive: theme.torch, emissiveIntensity: 2.2, roughness: 0.6 });
  for (let x = 2; x < W && !theme.outdoor; x += 5) {
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
  if (theme.props === 'grove') {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x77776b, roughness: 0.92 });
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x3f6330, roughness: 0.95 });
    for (let i = 0; i < 7; i++) {
      const r = 0.22 + (i % 3) * 0.14;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat);
      rock.position.set(1.4 + i * (W / 7.2), r * 0.55, zBack + 0.9 + (i % 3) * 0.45);
      rock.rotation.set(i, i * 1.7, i * 0.6);
      rock.castShadow = true; rock.receiveShadow = true;
      g.add(rock);
    }
    for (let i = 0; i < 5; i++) {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.5 + (i % 2) * 0.22, 9, 7), bushMat);
      bush.position.set(2.6 + i * (W / 5.1), 0.34, zBack + 0.75);
      bush.scale.set(1, 0.72, 0.85);
      bush.castShadow = true; bush.receiveShadow = true;
      g.add(bush);
    }
  } else if (theme.props === 'desert' || theme.props === 'quarry') {
    const sandRock = new THREE.MeshStandardMaterial({ color: theme.props === 'quarry' ? 0x8b7250 : 0xb89468, roughness: 0.93 });
    const cactus = new THREE.MeshStandardMaterial({ color: 0x5f8a4a, roughness: 0.85 });
    const bleach = new THREE.MeshStandardMaterial({ color: 0xe9e2cf, roughness: 0.6 });
    const n = theme.props === 'quarry' ? 8 : 5;
    for (let i = 0; i < n; i++) {
      const r = (theme.props === 'quarry' ? 0.35 : 0.2) + (i % 3) * 0.16;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), sandRock);
      rock.position.set(1.2 + i * (W / (n + 0.4)), r * 0.55, zBack + 0.9 + (i % 3) * 0.45);
      rock.rotation.set(i * 0.9, i * 1.7, i * 0.4);
      rock.castShadow = true; rock.receiveShadow = true;
      g.add(rock);
    }
    if (theme.props === 'desert') {
      // saguaro cacti: a trunk and two raised arms, the one silhouette that says desert
      for (let i = 0; i < 3; i++) {
        const x = 3.2 + i * (W / 3.1), base = zBack + 0.8 + (i % 2) * 0.5, hgt = 1.6 + (i % 2) * 0.5;
        const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, hgt, 4, 8), cactus);
        trunk.position.set(x, hgt / 2 + 0.1, base);
        trunk.castShadow = true;
        g.add(trunk);
        for (const side of [-1, 1]) {
          const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.6, 4, 8), cactus);
          arm.position.set(x + side * 0.34, hgt * 0.55 + side * 0.1, base);
          arm.castShadow = true;
          g.add(arm);
          const elbow = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.34, 4, 8), cactus);
          elbow.rotation.z = side * Math.PI / 2;
          elbow.position.set(x + side * 0.2, hgt * 0.42 + side * 0.1, base);
          g.add(elbow);
        }
      }
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), bleach);
      skull.position.set(W * 0.7, 0.24, zBack + 1.5);
      skull.scale.set(1.2, 0.9, 1);
      skull.castShadow = true;
      g.add(skull);
    } else {
      // quarry: cut sandstone blocks stacked where the golems were hewn
      for (let i = 0; i < 4; i++) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(1.1 + (i % 2) * 0.4, 0.7, 0.8), sandRock);
        block.position.set(2.5 + i * (W / 4.3), 0.35 + (i % 2) * 0.7, zBack + 1.2 + (i % 2) * 0.3);
        block.rotation.y = i * 0.25;
        block.castShadow = true; block.receiveShadow = true;
        g.add(block);
      }
    }
  } else if (theme.props === 'barrels') {
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
