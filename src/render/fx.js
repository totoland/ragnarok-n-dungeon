// Effects: drains game.events into particles, damage numbers, slash arcs, projectiles, rings
// and camera shake. Own clock, never touches the sim.
import * as THREE from 'three';
import { particleSprite, textTexture } from './textures.js';
import { addShake } from './scene.js';

const MAX_PARTICLES = 1500;

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
  function number(x, y, z, text, color, big = false, crit = false) {
    // A critical is drawn the way Ragnarok draws one: red digits rimmed in gold, bigger than
    // any other number, punched in at 1.7x and settling as it rises.
    const tex = crit
      ? textTexture(text, { color: '#ff3b2a', size: 96, stroke: '#ffd85a' })
      : textTexture(text, { color, size: big ? 80 : 60 });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const w = crit ? 3.2 : big ? 2.4 : 1.6, h = crit ? 1.6 : big ? 1.2 : 0.8;
    sp.scale.set(w, h, 1);
    sp.position.set(x + (Math.random() - 0.5) * 0.4, y, z + 0.3);
    sp.renderOrder = crit ? 11 : 10;
    scene.add(sp);
    numbers.push({ sp, t: 0, vy: crit ? 2.0 : 2.6 + Math.random(), life: crit ? 1.0 : 0.8, w, h, pop: crit ? 0.7 : 0 });
  }

  // ---- transient meshes (slash arcs, rings, shockwaves)
  const transients = [];
  const arcGeo = new THREE.RingGeometry(0.8, 1.9, 24, 1, 0, Math.PI * 0.8);
  function slash(x, y, z, facing, { color = 0xd8ecff, scale = 1, tilt = 0.35, life = 0.16, spin = -1.2 } = {}) {
    const m = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(x + facing * 0.9, y + 1.1, z + 0.35);
    m.scale.setScalar(scale);
    m.rotation.set(tilt, 0, facing > 0 ? -0.9 : Math.PI + 0.9 - 2.2);
    m.renderOrder = 5;
    scene.add(m);
    transients.push({ m, t: 0, life, kind: 'slash', spin: spin * facing, grow: 1.35 });
  }
  const ringGeo = new THREE.RingGeometry(0.6, 1.0, 40);
  function ring(x, z, { color = 0xff7a20, radius = 2.4, life = 0.45, y = 0.05 } = {}) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(x, y, z);
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(0.2);
    m.renderOrder = 4;
    scene.add(m);
    transients.push({ m, t: 0, life, kind: 'ring', radius });
  }
  const flashLight = new THREE.PointLight(0xffb060, 0, 9, 1.5);
  scene.add(flashLight);

  // ---- projectiles (sim-owned, mirrored here by id)
  const projectiles = new Map();
  const arrowGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.85, 5);
  const headGeo = new THREE.ConeGeometry(0.05, 0.16, 5);
  const fletchGeo = new THREE.BoxGeometry(0.012, 0.16, 0.08);
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.7 });
  const boneArrowMat = new THREE.MeshStandardMaterial({ color: 0x3a3238, roughness: 0.6 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xc9c9d4, metalness: 0.7, roughness: 0.3 });
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
    const light = new THREE.PointLight(0xff5a1e, 6, 4.5, 2);
    g.add(light);
    return g;
  }

  function makeArrow(kind) {
    if (kind === 'hellOrb') return makeOrb();
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(arrowGeo, kind === 'boneArrow' ? boneArrowMat : arrowMat);
    shaft.rotation.z = -Math.PI / 2;
    g.add(shaft);
    const head = new THREE.Mesh(headGeo, headMat);
    head.rotation.z = -Math.PI / 2; head.position.x = 0.48;
    g.add(head);
    const f = new THREE.Mesh(fletchGeo, new THREE.MeshStandardMaterial({ color: kind === 'boneArrow' ? 0x777 : 0xe9e2c8 }));
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
    const glow = new THREE.PointLight(c, 3, 2.5, 2); glow.position.y = 0.3; g.add(glow);
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
          number(ev.x, ev.y + 0.4, ev.z, String(ev.dmg), '#ffffff', crit, crit);
          burst(ev.x, ev.y, ev.z, crit ? 26 : 12, { color: crit ? 0xffd24a : 0xfff4d0, speed: crit ? 5.5 : 4, up: 3, life: 0.35, size: crit ? 0.34 : 0.28, dir: Math.sign(ev.launched ? 0 : 1) });
          if (crit) {   // the two crossed gold slashes that stamp a critical in RO
            slash(ev.x, ev.y + 0.9, ev.z, 1, { color: 0xffe08a, scale: 1.3, tilt: 0.8, life: 0.18, spin: -2.5 });
            slash(ev.x, ev.y + 0.9, ev.z, -1, { color: 0xffe08a, scale: 1.3, tilt: -0.8, life: 0.18, spin: 2.5 });
          }
          if (ev.monster === 'poring' || ev.monster === 'lunatic') burst(ev.x, ev.y, ev.z, 8, { color: ev.monster === 'poring' ? 0xff86b4 : 0xffffff, speed: 3, up: 3, life: 0.5, size: 0.3, gravity: 12 });
          addShake(world, crit ? 0.35 : 0.14);
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
      case 'autoBlitz':   // feathers as the bird launches; the strike itself is a normal hit
        burst(ev.x, ev.y + 1.4, ev.z, 6, { color: 0xf0e6d0, speed: 2, up: 2.5, life: 0.45, size: 0.22, gravity: 3 });
        break;
      case 'drain': {     // Soul Drain: a green heal number and a red/blue pair of motes
        number(ev.x, ev.y, ev.z, `+${ev.hp}`, '#7dff9a');
        burst(ev.x, ev.y - 0.6, ev.z, 8, { color: 0xff6a6a, speed: 1.2, up: 2.2, life: 0.6, size: 0.24, gravity: -1 });
        burst(ev.x, ev.y - 0.6, ev.z, 6, { color: 0x7fb0ff, speed: 1.2, up: 2.4, life: 0.6, size: 0.22, gravity: -1 });
        break;
      }
      case 'dodge':
        number(ev.x, ev.y, ev.z, 'MISS', 0xa0f0ff);
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
        burst(ev.x, 1.5, ev.z, 40, { color: 0xa040ff, speed: 3, up: 3, life: 0.8, size: 0.4, gravity: -1 });
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

    // numbers
    for (let i = numbers.length - 1; i >= 0; i--) {
      const n = numbers[i];
      n.t += dt;
      n.sp.position.y += n.vy * dt;
      n.vy -= 5 * dt;
      const k = n.t / n.life;
      n.sp.material.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      if (n.pop) {   // overshoot then settle: 1 + pop at t=0, back to 1 by 0.16s, eased
        const u = Math.min(1, n.t / 0.16), ease = 1 - (1 - u) * (1 - u);
        const sc = 1 + n.pop * (1 - ease);
        n.sp.scale.set(n.w * sc, n.h * sc, 1);
      }
      if (n.t >= n.life) { scene.remove(n.sp); n.sp.material.dispose(); numbers.splice(i, 1); }
    }

    // transients
    for (let i = transients.length - 1; i >= 0; i--) {
      const t = transients[i];
      t.t += dt;
      const k = t.t / t.life;
      if (t.kind === 'slash') { t.m.rotation.z += t.spin * dt * 6; t.m.scale.multiplyScalar(1 + (t.grow - 1) * dt * 4); t.m.material.opacity = 0.9 * (1 - k); }
      else if (t.kind === 'ring') { const s = 0.2 + (t.radius - 0.2) * (1 - Math.pow(1 - k, 3)); t.m.scale.setScalar(s); t.m.material.opacity = 0.95 * (1 - k); }
      if (t.t >= t.life) { scene.remove(t.m); t.m.material.dispose(); transients.splice(i, 1); }
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

    // falling arrows
    for (let i = rain.length - 1; i >= 0; i--) {
      const r = rain[i];
      r.t += dt;
      if (r.t < 0) continue;
      if (r.stuck) { r.stuck += dt; if (r.stuck > 0.9) { scene.remove(r.m); rain.splice(i, 1); } continue; }
      r.m.position.y += r.vy * dt;
      if (r.m.position.y <= 0.15) { r.m.position.y = 0.15; r.stuck = 0.001; burst(r.m.position.x, 0.1, r.m.position.z, 4, { color: 0xa0e0ff, speed: 1.5, up: 1.5, life: 0.3, size: 0.2 }); }
    }
  }

  function clear() {
    parts.length = 0;
    for (const n of numbers) { scene.remove(n.sp); n.sp.material.dispose(); }
    numbers.length = 0;
    for (const t of transients) { scene.remove(t.m); t.m.material.dispose(); }
    transients.length = 0;
    for (const [, m] of projectiles) scene.remove(m);
    projectiles.clear();
    for (const [, m] of pickups) scene.remove(m);
    pickups.clear();
    for (const r of rain) scene.remove(r.m);
    rain.length = 0;
  }

  return { update, clear, burst, number };
}
