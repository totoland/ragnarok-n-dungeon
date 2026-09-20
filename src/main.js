// Boot: load hero GLBs, hero select, fixed-timestep sim loop with hit-stop, render every frame.
// `window.__dro` is the debug handle.
import { SIM } from './config.js';
import { TOWNS } from './sim/data/dungeon.js';
import { MONSTERS } from './sim/data/monsters.js';
import { createGame, update as simUpdate } from './sim/game.js';
import { loadProfile, saveProfile, clearProfile, heroOf, isUnlocked, tierFor, prevTown, recordRun } from './profile.js';
import { createInput, attachTouch } from './input.js';
import { loadSettings, lookup, hintLine } from './settings.js';
import { createSettingsUI } from './render/settings-ui.js';
import { createScene, buildRoom, disposeRoom, updateScene } from './render/scene.js';
import { loadHeroAssets, createHeroView } from './render/heroes.js';
import { createMonsterViews, loadMonsterAssets } from './render/monsters.js';
import { createFx } from './render/fx.js';
import { createHud } from './render/hud.js';
import { sfx } from './audio.js';
import * as THREE from 'three';

const canvas = document.getElementById('view');
const world = createScene(canvas);
const hud = createHud();
const settings = loadSettings();
const input = createInput(window, { settings });
const touch = attachTouch(input, { settings });
let keyLookup = lookup(settings.keys);

// Hints are generated from the live bindings, so a rebind shows up everywhere at once.
function applyBindings() {
  keyLookup = lookup(settings.keys);
  const line = hintLine(settings);
  hud.el.hint.textContent = line;
  const titleControls = document.getElementById('title-controls');
  if (titleControls) titleControls.textContent = `${line} · Enter start`;
  const pauseSub = document.getElementById('pause-sub');
  if (pauseSub) {
    const k = (settings.keys.pause || [])[0];
    pauseSub.textContent = k ? `Press ${hintKey(k)} to resume` : 'Use the button below to resume';
  }
}
const hintKey = (code) => (code.startsWith('Key') ? code.slice(3) : code === 'Escape' ? 'Esc' : code);

const settingsUI = createSettingsUI({ input, touch, settings, onChange: applyBindings });
applyBindings();
document.getElementById('title-settings').addEventListener('click', () => settingsUI.open());
document.getElementById('pause-settings').addEventListener('click', () => settingsUI.open());
document.getElementById('pause-resume').addEventListener('click', () => { paused = false; hud.showPause(false); });
const fx = createFx(world);
const monsters = createMonsterViews(world);

let assets = null;
let game = null;
let heroView = null;
// Progress: xp and town clears per hero, in localStorage. The last pick is restored so
// Enter at the title continues where the player left off.
let profile = loadProfile();
let selectedHero = profile.last.hero;
let selectedTown = profile.last.town;
let progress = null;   // what recordRun() said about the run that just ended
let paused = false;
let hitstop = 0;
let roomBuilt = -1;
let acc = 0;
let last = performance.now();
let ended = false;

// hero selection
const heroButtons = [...document.querySelectorAll('.hero')];
for (const b of heroButtons) {
  b.disabled = true;
  b.addEventListener('click', () => { selectedHero = b.dataset.hero; sfx.init(); start(); });
}
// town selection - a click just marks it; the hero buttons / Enter still start the run.
// A locked town is disabled until the one before it has been cleared by any hero.
const townButtons = [...document.querySelectorAll('.town')];
const townBlurb = new Map(townButtons.map((b) => [b.dataset.town, b.querySelector('em').textContent]));
function markTown() {
  if (!isUnlocked(profile, selectedTown)) selectedTown = 'prontera';
  for (const b of townButtons) b.classList.toggle('selected', b.dataset.town === selectedTown);
  refreshTitle();
}
for (const b of townButtons) b.addEventListener('click', () => { if (b.disabled) return; selectedTown = b.dataset.town; markTown(); });

// Everything on the title that depends on the profile or the pick: level pills on the hero
// cards, lock / tier state on the town cards, and the one-line blurb for the selected town.
function refreshTitle() {
  for (const b of heroButtons) {
    const h = heroOf(profile, b.dataset.hero);
    b.querySelector('.lv').textContent = h.level > 1 || h.xp > 0 ? `Lv ${h.level}` : '';
  }
  for (const b of townButtons) {
    const key = b.dataset.town, em = b.querySelector('em');
    const open = isUnlocked(profile, key);
    b.disabled = !open;
    if (!open) { em.textContent = `Clear ${TOWNS[prevTown(key)].town} to unlock`; continue; }
    const t = profile.heroes[selectedHero]?.towns?.[key];
    const tier = tierFor(profile, selectedHero, key);
    em.innerHTML = '';
    em.append(townBlurb.get(key));
    if (t?.clears) {
      const span = document.createElement('span');
      span.className = 'tier';
      span.textContent = ` · cleared ×${t.clears}${tier ? ` · NG+${tier}` : ''}`;
      em.append(span);
    }
  }
  const town = TOWNS[selectedTown];
  const last = town.rooms[town.rooms.length - 1];
  const boss = MONSTERS[last.waves?.[0]?.[0]?.type]?.name || last.name;
  const tier = tierFor(profile, selectedHero, selectedTown);
  const sub = document.getElementById('title-sub');
  if (sub) sub.textContent = `${town.name} — ${town.rooms.length} rooms, one ${boss}.${tier ? ` New Game+${tier}: monsters ${Math.round(tier * 35)}% tougher.` : ''}`;
}
input.on('confirm', () => {
  if (settingsUI.isOpen) return;
  sfx.init();
  if (!hud.el.title.hidden && assets) start();
  else if (!hud.el.end.hidden) endPrimary();
});
window.addEventListener('keydown', (e) => {
  if (hud.el.title.hidden || !assets || settingsUI.isOpen) return;
  const a = keyLookup[e.code];
  if (a === 'left' || a === 'right') { selectedHero = selectedHero === 'knight' ? 'hunter' : 'knight'; markSelected(); }
});
input.on('mute', () => { sfx.init(); sfx.toggleMute(); });
input.on('pause', () => { if (!game || ended || settingsUI.isOpen) return; paused = !paused; hud.showPause(paused); });
hud.el.retry.addEventListener('click', () => start());
hud.el.endContinue.addEventListener('click', () => continueRun());
hud.el.endHome.addEventListener('click', () => toTitle());
// Enter on the end screen takes the primary button: Continue when a next town is offered,
// otherwise the same town again.
function endPrimary() { if (!hud.el.endContinue.hidden) continueRun(); else start(); }
function continueRun() {
  const next = progress?.won ? progress.next : null;
  if (next && isUnlocked(profile, next)) selectedTown = next;
  start();
}
window.addEventListener('pointerdown', () => sfx.init(), { once: true });
markTown();
markSelected();

// Title screen: both heroes on plinths, turning slowly; the selected one steps forward.
let preview = null;
function buildPreview() {
  const g = new THREE.Group();
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x1a1620, roughness: 0.6, metalness: 0.2 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xe8b64a, roughness: 0.3, metalness: 0.8 });
  const stands = {};
  for (const [key, x] of [['knight', -2.1], ['hunter', 2.1]]) {
    const stand = new THREE.Group();
    stand.position.set(x, 0, 0);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.25, 32), plinthMat);
    plinth.position.y = -0.125; plinth.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.27, 0.03, 8, 48), rimMat);
    rim.rotation.x = Math.PI / 2;
    const model = assets[key].clone();
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    stand.add(plinth, rim, model);
    stands[key] = { stand, model, rim };
    g.add(stand);
  }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: 0x0c0a12, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.26; floor.receiveShadow = true;
  g.add(floor);
  const spot = new THREE.SpotLight(0xfff0d8, 60, 20, 0.5, 0.6, 1.2);
  spot.position.set(0, 7, 4); spot.target.position.set(0, 1, 0); spot.castShadow = true;
  g.add(spot, spot.target);
  world.scene.add(g);
  world.scene.background.set(0x07060a);
  world.scene.fog.color.set(0x07060a);
  world.camera.position.set(0, 2.2, 7.4);
  world.camera.lookAt(0, 1.05, 0);
  return { group: g, stands, t: 0 };
}
function updatePreview(dt) {
  preview.t += dt;
  for (const [key, s] of Object.entries(preview.stands)) {
    const sel = key === selectedHero;
    s.model.rotation.y += dt * (sel ? 0.5 : 0.25);
    const targetZ = sel ? 0.9 : -0.3;
    s.stand.position.z += (targetZ - s.stand.position.z) * Math.min(1, 4 * dt);
    s.rim.material.emissive.setHex(sel ? 0xe8b64a : 0x000000);
    s.rim.material.emissiveIntensity = sel ? 0.8 + 0.3 * Math.sin(preview.t * 3) : 0;
  }
}
function disposePreview() {
  if (!preview) return;
  world.scene.remove(preview.group);
  preview = null;
}

// The boss is a GLB like the heroes, so it loads on the same gate: the title screen stays
// on "Loading" until every model the run can need is in memory.
Promise.all([loadHeroAssets(), loadMonsterAssets()]).then(([a]) => {
  assets = a;
  hud.setLoading('Pick a hero, or press Enter for the Knight.');
  for (const b of heroButtons) { b.disabled = false; b.addEventListener('mouseenter', () => { selectedHero = b.dataset.hero; markSelected(); }); }
  markTown();
  markSelected();
  preview = buildPreview();
}).catch((err) => {
  hud.setLoading(`Failed to load heroes: ${err.message}`);
  console.error(err);
});

function markSelected() {
  for (const b of heroButtons) b.classList.toggle('selected', b.dataset.hero === selectedHero);
  if (!hud.el.title.hidden) refreshTitle();
}

function start() {
  if (!assets) return;
  disposePreview();
  if (heroView) heroView.dispose();
  monsters.clear();
  fx.clear();
  if (!isUnlocked(profile, selectedTown)) selectedTown = 'prontera';
  // The run is a function of the profile at its start: the hero's lifetime xp sets the
  // level, the town's clear count sets the New Game+ tier. Nothing else crosses over.
  game = createGame({
    hero: selectedHero, seed: (Date.now() % 100000) | 0, dungeon: TOWNS[selectedTown] || TOWNS.prontera,
    tier: tierFor(profile, selectedHero, selectedTown), xp: heroOf(profile, selectedHero).xp,
  });
  profile.last = { hero: selectedHero, town: selectedTown };
  saveProfile(profile);
  progress = null;
  heroView = createHeroView(world, selectedHero, assets);
  hud.bindHero(game.player);
  hud.showTitle(false);
  hud.hideEnd();
  hud.showPause(false);
  hud.el.hud.hidden = false;
  paused = false;
  ended = false;
  roomBuilt = -1;
  acc = 0;
  hitstop = 0;
  syncRoom();
  markSelected();
}

// Back to the title from the end screen: tear the run down and put the plinths back.
function toTitle() {
  if (!game) return;
  if (heroView) { heroView.dispose(); heroView = null; }
  monsters.clear();
  fx.clear();
  disposeRoom(world);
  game = null;
  ended = false;
  paused = false;
  roomBuilt = -1;
  hud.el.hud.hidden = true;
  hud.hideEnd();
  hud.showPause(false);
  hud.showTitle(true);
  markTown();
  markSelected();
  preview = buildPreview();
}

function syncRoom() {
  if (game.roomIndex !== roomBuilt) {
    buildRoom(world, game.room, game.roomIndex);
    roomBuilt = game.roomIndex;
    monsters.clear();
    fx.clear();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;

  // Keyboard and touch arrive as DOM events, which fire whatever the loop is doing. A
  // gamepad has to be asked, and the only place that asked was the sim step - so on the
  // title screen and in the pause menu the pad went completely unread, and a controller
  // could not even start a run. Snapshot here for exactly those two cases: it polls the pad,
  // fires confirm/pause, and drains the edges, so a button mashed at the title does not
  // arrive as the first frame of input.
  if (!game || paused) input.snapshot();

  if (!game) { if (preview) updatePreview(dtReal); world.renderer.render(world.scene, world.camera); return; }

  if (!paused) {
    // hit-stop: freeze the sim for a few ms after a solid hit, the belt-scroller crunch
    if (hitstop > 0) hitstop -= dtReal;
    else {
      acc += dtReal;
      let steps = 0;
      while (acc >= SIM.dt && steps < 5) {
        simUpdate(game, input.snapshot(), SIM.dt);
        acc -= SIM.dt;
        steps++;
      }
      for (const ev of game.events) {
        if (ev.type === 'hit') hitstop = Math.max(hitstop, ev.crit || ev.target === 'player' ? 0.07 : ev.attack === 'bash' || ev.attack === 'slash3' ? 0.06 : 0.028);
      }
    }
  }

  renderFrame(paused ? 0 : dtReal);
  world.renderer.render(world.scene, world.camera);
}
requestAnimationFrame(frame);

// The visual layer for one frame: drain events into sfx / fx / hud, advance the views.
function renderFrame(dt) {
  syncRoom();
  for (const ev of game.events) sfx.handle(ev);
  fx.update(game, dt);
  heroView.update(game, dt);
  monsters.update(game, dt);
  updateScene(world, game, dt);
  hud.update(game, dt);
  if (!ended && (game.phase === 'won' || game.phase === 'dead')) {
    ended = true;
    // Bank the run the moment it ends, not when the overlay shows: a tab closed during the
    // victory beat still keeps its xp and its clear.
    const g = game, won = g.phase === 'won';
    progress = recordRun(profile, g, { hero: selectedHero, town: selectedTown });
    saveProfile(profile);
    setTimeout(() => { if (game === g) hud.showEnd(g, won, progress); }, won ? 1800 : 1400);
  }
  game.events.length = 0;
}

// Render one frame at `w`×`h` and upload it to the dev server (see serve.mjs). Returns the reply.
async function shot(name, w = 1600, h = 900, frames = 3) {
  const r = world.renderer, cam = world.camera;
  const pr = r.getPixelRatio();
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  cam.aspect = w / h; cam.updateProjectionMatrix();
  if (game) { updateScene(world, game, 5); world.shake = 0; for (let i = 0; i < frames; i++) renderFrame(SIM.dt); }
  else if (preview) { updatePreview(SIM.dt); world.camera.position.set(0, 2.2, 7.4); world.camera.lookAt(0, 1.05, 0); }
  r.render(world.scene, cam);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  r.setPixelRatio(pr);
  world.resize();
  const reply = await fetch(`/__screenshot/${name}`, { method: 'PUT', body: blob });
  return reply.text();
}

window.__dro = {
  shot,
  get game() { return game; },
  get heroView() { return heroView; },
  world, fx, monsters, input,
  tick(n = 1) { for (let i = 0; i < n; i++) simUpdate(game, input.snapshot(), SIM.dt); },
  play(n = 1) { for (let i = 0; i < n; i++) { simUpdate(game, input.snapshot(), SIM.dt); renderFrame(SIM.dt); } },
  start, hero(key) { selectedHero = key; start(); },
  town(key) { selectedTown = key; markTown(); },
  toTitle,
  get profile() { return profile; },
  // Debug: grant xp to the selected hero / wipe the profile, then redraw the title.
  grant(xp) { profile.heroes[selectedHero].xp += xp | 0; saveProfile(profile); markTown(); markSelected(); },
  resetProfile() { profile = clearProfile(); selectedTown = 'prontera'; markTown(); markSelected(); },
};
