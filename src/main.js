// Boot: load hero GLBs, hero select, fixed-timestep sim loop with hit-stop, render every frame.
// `window.__dro` is the debug handle.
import { SIM } from './config.js';
import { TOWNS, SOAK } from './sim/data/dungeon.js';
import { MONSTERS } from './sim/data/monsters.js';
import { createGame, update as simUpdate, setGear, loadRoom } from './sim/game.js';
import { loadProfile, saveProfile, clearProfile, heroOf, isUnlocked, tierFor, prevTown, recordRun, dropFor, skillPointsLeft } from './profile.js';
import { createCharacterUI } from './render/character-ui.js';
import { itemName, ITEMS } from './sim/data/items.js';
import { xpAtLevel } from './sim/progress.js';
import { createInput, attachTouch } from './input.js';
import { loadSettings, lookup, hintLine } from './settings.js';
import { createSettingsUI } from './render/settings-ui.js';
import { createTestUI, testEnabled, setTestEnabled } from './render/test-ui.js';
import { createMenuNav } from './render/menu-nav.js';
import { createScene, buildRoom, disposeRoom, updateScene, prewarmRoom, prewarmTick, warmProps, WARM_X, WARM_Z } from './render/scene.js';
import { loadHeroAssets, createHeroView, showWeapon, restPose } from './render/heroes.js';
import { auraTick, stripAura } from './render/aura.js';
import { createTelemetry } from './telemetry.js';
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
hud.onSkill = (i) => { if (game && !paused && !ended) input.press(`skill${i + 1}`); };
const telemetry = createTelemetry({
  world, input, game: () => game,
  extra: () => (soak && game ? { soak: { loops: game.loops || 0, kills: game.kills, wave: game.waveIndex + 1 } } : null),
});
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
const characterUI = createCharacterUI({ input, getProfile: () => profile, onChange: () => { refreshTitle(); applyLoadout(); } });
document.getElementById('title-character').addEventListener('click', () => characterUI.open(selectedHero));
document.getElementById('pause-profile').addEventListener('click', () => characterUI.open(selectedHero));
// The profile panel edits the wielded weapon and the skill levels; mid-run those land on the
// live hero straight away (the sim re-resolves him, the view swaps the model), so a point
// earned in the boss room can be spent in the boss room.
function applyLoadout() {
  if (!game || ended) return;
  const me = heroOf(profile, selectedHero);
  setGear(game, me.gear, me.wear);
  game.player.skillLv = { ...me.skills };
}
document.getElementById('title-soak')?.addEventListener('click', () => {
  soak = true;
  sfx.init();
  start();
});

// The test panel, off unless ?test=1 ever asked for it. Its host is the only surface it
// gets: the profile, the pick, and start(). See render/test-ui.js.
const testUI = testEnabled() ? createTestUI({
  profile: () => profile,
  game: () => game,
  hero: () => selectedHero,
  town: () => selectedTown,
  room: () => testRoom,
  setHero(h) { selectedHero = h; markSelected(); },
  setTown(t) { selectedTown = t; testRoom = 0; markTown({ force: true }); },
  setRoom(i) { testRoom = i; },
  levelOf: (h) => heroOf(profile, h).level,
  setLevel(h, lv) { profile.heroes[h].xp = xpAtLevel(lv); saveProfile(profile); refreshTitle(); },
  setSkill(h, id, lv) { profile.heroes[h].skills[id] = lv; saveProfile(profile); refreshTitle(); },
  setEquip(h, slot, id) {
    const row = profile.heroes[h];
    if (id && !row.items[id]) row.items[id] = { plus: 0 };
    row.equip[slot] = id;
    saveProfile(profile); markSelected();
  },
  setRefine(h, id, plus) {
    if (!id) return;
    (profile.heroes[h].items[id] ||= { plus: 0 }).plus = plus;
    saveProfile(profile); markSelected();
  },
  grantRolled(h, inst) {
    const row = profile.heroes[h];
    row.bag = [...(row.bag || []).filter((b) => b.uid !== row.equip.accessory), inst];
    row.equip.accessory = inst.uid;
    saveProfile(profile); markSelected();
  },
  grantAll(h) {
    const row = profile.heroes[h];
    for (const [id, it] of Object.entries(ITEMS)) {
      if (it.slot === 'accessory' || (it.hero && it.hero !== h)) continue;
      row.items[id] ||= { plus: 0 };
    }
    saveProfile(profile);
  },
  start() { testTown = selectedTown; soak = false; start(); },
}) : null;
if (testUI) document.getElementById('title-test').hidden = false;
document.getElementById('title-test')?.addEventListener('click', () => testUI?.open());

// The way into the test panel on a device with no address bar. ?test=1 is fine in a browser
// and impossible inside the native shell, where there is nowhere to type it - so five taps on
// the game's own title toggles it and reloads. Deliberately a gesture nobody performs by
// accident, and deliberately not automatic on native: a store build must not ship a panel
// that hands out every item in the game.
{
  const title = document.querySelector('#title h1');
  let taps = 0, first = 0;
  title?.addEventListener('click', () => {
    const now = performance.now();
    if (now - first > 2500) { taps = 0; first = now; }
    if (++taps < 5) return;
    taps = 0;
    const turningOn = !testEnabled();
    if (!setTestEnabled(turningOn)) return;
    hud.setLoading(`Test mode ${turningOn ? 'on' : 'off'} - reloading…`);
    // Reload without the test parameter. testEnabled() reads the query string before the
    // stored flag, so reloading onto a ?test=0 still in the address bar would undo the tap
    // that just happened - the gesture has to leave with the URL it wants to come back to.
    setTimeout(() => {
      try {
        const u = new URL(location.href);
        u.searchParams.delete('test');
        location.replace(u.toString());
      } catch { location.reload(); }
    }, 450);
  });
}
// The way in. Enter still works - this is the same call, wearing a button.
const startBtn = document.getElementById('title-start');
startBtn.disabled = true;
startBtn.addEventListener('click', () => { if (!startBtn.disabled) { soak = false; start(); } });

// The title screen on a pad. Everything on it is already a real button, so the same loop the
// character panel uses drives it: the stick moves focus between hero, town and the way in,
// and confirm presses what is focused. Without this the screen could only be reached with a
// finger or a mouse, which on a tablet in a stand is no way at all.
//
// It answers only while the title is up and nothing is sitting over it - the panels own the
// pad while they are open, and two loops reading the same stick would move two cursors.
const titleEl = document.getElementById('title');
const titleNav = createMenuNav({
  input,
  root: titleEl,
  active: () => !titleEl.hidden && !settingsUI.isOpen && !characterUI.isOpen && !testUI?.isOpen,
});
titleNav.start();

// The pause and end screens are menus too, and a player who reached them with a pad should
// not have to find a mouse to leave. Same loop, same ring; back resumes a pause, and does
// nothing on the end screen, where every way out is a deliberate choice.
const pauseEl = document.getElementById('pause');
const endEl = document.getElementById('end');
const pauseNav = createMenuNav({
  input, root: pauseEl,
  active: () => !pauseEl.hidden && !settingsUI.isOpen && !characterUI.isOpen && !testUI?.isOpen,
  onBack: () => { if (game && !ended) { paused = false; hud.showPause(false); } },
});
pauseNav.start();
const endNav = createMenuNav({
  input, root: endEl,
  active: () => !endEl.hidden && !settingsUI.isOpen && !characterUI.isOpen && !testUI?.isOpen,
});
endNav.start();

// Moving to a hero or a town card should pick it, the way hovering already does: on a pad
// there is no separate "hover", and having to press confirm just to look at the next town
// makes a two-button job out of a one-button one.
titleEl.addEventListener('focusin', (e) => {
  const b = e.target.closest?.('button');
  if (!b || titleEl.hidden) return;
  if (b.dataset.hero && b.dataset.hero !== selectedHero) { selectedHero = b.dataset.hero; markSelected(); }
  else if (b.dataset.town && !b.disabled && b.dataset.town !== selectedTown) { selectedTown = b.dataset.town; markTown(); }
});
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
let preview = null;    // the title's plinths (built once the assets are in)
// A New Game+ tier picked below the hero's own on a town card, keyed hero:town; unset
// means the hero's clear count, which is the default and the ceiling.
const tierRow = document.getElementById('tier-row');
const tierLabel = document.getElementById('tier-label');
const tierDown = document.getElementById('tier-down');
const tierUp = document.getElementById('tier-up');
const tierPick = new Map();
const pickedTier = () => Math.min(tierFor(profile, selectedHero, selectedTown), tierPick.get(`${selectedHero}:${selectedTown}`) ?? Infinity);
let paused = false;
let hitstop = 0;
let roomBuilt = -1;
let prewarmed = -1;   // room index whose textures are already drawn and uploaded
let acc = 0;
let last = performance.now();
let ended = false;
let soak = false;      // the endless room, played by autoInput() rather than by a person

// hero selection
const heroButtons = [...document.querySelectorAll('.hero')];
for (const b of heroButtons) {
  b.disabled = true;
  b.addEventListener('click', () => { selectedHero = b.dataset.hero; sfx.init(); soak = false; start(); });
}
// town selection - a click just marks it; the hero buttons / Enter still start the run.
// A locked town is disabled until the one before it has been cleared by any hero.
// The town picker is generated, not written out: every town in the table gets a card, in
// the table's own unlock order. Orvane spent a release missing from the title screen because
// the markup listed three towns by hand and nobody thought to add a fourth.
const townsEl = document.getElementById('towns');
for (const [key, t] of Object.entries(TOWNS)) {
  const b = document.createElement('button');
  b.className = 'town';
  b.type = 'button';
  b.dataset.town = key;
  const name = document.createElement('strong');
  name.textContent = t.town;
  const blurb = document.createElement('em');
  blurb.textContent = t.blurb || t.name;
  // The town's own colour, so the row reads as four places rather than four boxes.
  if (t.accent) b.style.setProperty('--accent', t.accent);
  b.append(name, blurb);
  townsEl.appendChild(b);
}
const townButtons = [...document.querySelectorAll('.town')];
const townBlurb = new Map(townButtons.map((b) => [b.dataset.town, b.querySelector('em').textContent]));
// `force` is the test panel's: it promises any town "unlocked or not", and this guard used to
// quietly send a locked pick back to Prontera - which nobody noticed until Varkhol, the first
// town anyone tried to test before clearing the one ahead of it.
function markTown({ force = false } = {}) {
  if (!force && !isUnlocked(profile, selectedTown)) selectedTown = 'prontera';
  if (assets) { prewarmRoom(world, TOWNS[selectedTown].rooms[0], 0); monsters.prebuild(TOWNS[selectedTown].rooms[0], MONSTERS); }
  for (const b of townButtons) b.classList.toggle('selected', b.dataset.town === selectedTown);
  refreshTitle();
}
for (const b of townButtons) b.addEventListener('click', () => { if (b.disabled) return; selectedTown = b.dataset.town; markTown(); });
const stepTier = (delta) => {
  const max = tierFor(profile, selectedHero, selectedTown);
  const next = Math.max(0, Math.min(max, pickedTier() + delta));
  tierPick.set(`${selectedHero}:${selectedTown}`, next);
  refreshTitle();
};
tierDown.addEventListener('click', () => stepTier(-1));
tierUp.addEventListener('click', () => stepTier(1));

// Everything on the title that depends on the profile or the pick: level pills on the hero
// cards, lock / tier state on the town cards, and the one-line blurb for the selected town.
function refreshTitle() {
  for (const b of heroButtons) {
    const h = heroOf(profile, b.dataset.hero);
    const pts = skillPointsLeft(profile, b.dataset.hero);
    b.querySelector('.lv').textContent = h.level > 1 || h.xp > 0 ? `Lv ${h.level}${pts ? ` · ${pts} pt${pts === 1 ? '' : 's'}` : ''}` : '';
  }
  const me = heroOf(profile, selectedHero), myPts = skillPointsLeft(profile, selectedHero);
  if (preview) for (const [key, s] of Object.entries(preview.stands)) showWeapon(s.model, heroOf(profile, key).gear?.id ?? null);
  const cbtn = document.getElementById('title-character');
  cbtn.innerHTML = '';
  cbtn.append(`Profile · ${itemName(me.gear, selectedHero)}`);
  if (myPts) { const sp = document.createElement('span'); sp.className = 'pts'; sp.textContent = ` · ${myPts} skill point${myPts === 1 ? '' : 's'} to spend`; cbtn.append(sp); }
  cbtn.classList.toggle('attention', myPts > 0);
  for (const b of townButtons) {
    const key = b.dataset.town, em = b.querySelector('em');
    const open = isUnlocked(profile, key);
    b.disabled = !open;
    if (!open) { em.textContent = `Clear ${TOWNS[prevTown(key)].town} to unlock`; continue; }
    const t = profile.heroes[selectedHero]?.towns?.[key];
    const max = tierFor(profile, selectedHero, key);
    const tier = key === selectedTown ? pickedTier() : max;
    em.innerHTML = '';
    em.append(townBlurb.get(key));
    if (t?.clears) {
      const span = document.createElement('span');
      span.className = 'tier';
      span.textContent = ` · cleared ×${t.clears}`;
      em.append(span);
      if (tier) em.append(` · NG+${tier}`);
    }
  }
  // The difficulty row: shown only where there is a choice, which is a town already cleared.
  const maxTier = tierFor(profile, selectedHero, selectedTown);
  const now = pickedTier();
  tierRow.hidden = !(maxTier > 0);
  if (!tierRow.hidden) {
    tierLabel.textContent = now ? `New Game+${now}` : 'Normal';
    tierDown.disabled = now <= 0;
    tierUp.disabled = now >= maxTier;
  }

  const town = TOWNS[selectedTown];
  const last = town.rooms[town.rooms.length - 1];
  // The thing flagged as a boss, wherever in the room it is queued - not the first monster
  // of the first wave, which is what this used to read and why Orvane, whose boss room opens
  // with a wave of its own, announced itself as "one Velmara".
  const bossType = (last.waves || []).flat().map((g) => g.type).find((t) => MONSTERS[t]?.boss);
  const boss = MONSTERS[bossType]?.name || MONSTERS[last.waves?.at(-1)?.[0]?.type]?.name || last.name;
  const tier = pickedTier();
  const sub = document.getElementById('title-sub');
  if (sub) sub.textContent = `${town.name} — ${town.rooms.length} rooms, one ${boss}.${tier ? ` New Game+${tier}: monsters ${Math.round(tier * 35)}% tougher.` : ''}`;
}
input.on('confirm', () => {
  if (settingsUI.isOpen || characterUI.isOpen || testUI?.isOpen) return;
  sfx.init();
  if (!hud.el.title.hidden && assets) start();
  else if (!hud.el.end.hidden) endPrimary();
});
window.addEventListener('keydown', (e) => {
  if (hud.el.title.hidden || !assets || settingsUI.isOpen || characterUI.isOpen || testUI?.isOpen) return;
  const a = keyLookup[e.code];
  if (a === 'left' || a === 'right') { selectedHero = selectedHero === 'knight' ? 'hunter' : 'knight'; markSelected(); }
});
input.on('mute', () => { sfx.init(); sfx.toggleMute(); });
// A controller whose state froze (seen on iPadOS Safari): the hero has already let go of
// the attack; say why the pad is dead, and that it came back.
input.on('padStale', () => { if (game && !ended) hud.banner('Controller stalled', 'boss'); });
input.on('padLive', () => { if (game && !ended) hud.banner('Controller back'); });
input.on('pause', () => {
  if (!game || ended || settingsUI.isOpen || characterUI.isOpen || testUI?.isOpen) return;
  paused = !paused;
  hud.showPause(paused);
  if (paused) pauseNav.focusFirst();
});
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
    stripAura(model);
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    restPose(model, key);                                          // a run may have left the shared asset mid-swing
    showWeapon(model, heroOf(profile, key).gear?.id ?? null);   // the plinth shows what is wielded
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
    auraTick(s.model, heroOf(profile, key).gear, preview.t);
  }
}
function disposePreview() {
  if (!preview) return;
  world.scene.remove(preview.group);
  preview = null;
}

// The boss is a GLB like the heroes, so it loads on the same gate: the title screen stays
// on "Loading" until every model the run can need is in memory.
// Compile every shader the run can need while the title is still up - each monster, each
// effect, both heroes with a refined blade - so the first boss, the first skill and the
// first drop do not each cost a 60-100 ms frame on Safari, which compiles lazily and slowly.
function warmUp() {
  const t0 = performance.now();
  const heroes = ['knight', 'hunter'].map((k, i) => { const m = assets[k].clone(); stripAura(m); m.position.set(WARM_X + i * 1.5 - 1, 0, WARM_Z); world.scene.add(m); auraTick(m, { id: 'katana', plus: 9 }, 0); return m; });
  const undoMonsters = monsters.warm();
  const undoProps = warmProps(world);
  fx.warm();
  try { world.renderer.compile(world.scene, world.camera); } catch (err) { console.warn('warm-up compile failed', err); }
  world.renderer.render(world.scene, world.camera);   // uploads the textures the compile did not
  for (const m of heroes) world.scene.remove(m);
  undoMonsters();
  undoProps();
  fx.clear();
  world.warmMs = Math.round(performance.now() - t0);
}

Promise.all([loadHeroAssets(), loadMonsterAssets()]).then(([a]) => {
  assets = a;
  characterUI.setAssets(a);
  warmUp();
  prewarmRoom(world, TOWNS[selectedTown].rooms[0], 0);
  while (prewarmTick(world));   // the first room is drawn next; spreading it over frames it does not have would only defer the cost into them
  monsters.prebuild(TOWNS[selectedTown].rooms[0], MONSTERS);
  hud.setLoading('Pick a hero and a town, then go.');
  startBtn.disabled = false;
  titleNav.focusFirst(startBtn);
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

// The test panel sets these and start() honours them once: a town it may not have unlocked,
// and a room part way in. Null in every ordinary run, which is the only reason start() is
// allowed to read them at all.
let testTown = null, testRoom = 0;
function start() {
  if (!assets) return;
  disposePreview();
  if (heroView) heroView.dispose();
  monsters.clear();
  fx.clear();
  if (!testTown && !isUnlocked(profile, selectedTown)) selectedTown = 'prontera';
  // The run is a function of the profile at its start: the hero's lifetime xp sets the
  // level, the picked tier (the clear count by default) the difficulty, the wielded weapon
  // and spent skill points the loadout, the clear count whether the boss's drop is certain.
  const me = heroOf(profile, selectedHero);
  game = createGame({
    hero: selectedHero, seed: (Date.now() % 100000) | 0, dungeon: soak ? SOAK : (TOWNS[selectedTown] || TOWNS.prontera),
    tier: pickedTier(), xp: me.xp, gear: me.gear, wear: me.wear, skills: { ...me.skills }, branches: { ...me.branches },
    drop: dropFor(profile, selectedHero, selectedTown),
  });
  if (testTown) { testTown = null; if (testRoom > 0) loadRoom(game, Math.min(testRoom, game.dungeon.rooms.length - 1)); }
  if (!soak) { profile.last = { hero: selectedHero, town: selectedTown }; saveProfile(profile); }
  if (soak) {
    prewarmRoom(world, SOAK.rooms[0], 0);
    while (prewarmTick(world));
    monsters.prebuild(SOAK.rooms[0], MONSTERS);
    while (monsters.tick());
  }
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
  prewarmed = -1;
  acc = 0;
  hitstop = 0;
  syncRoom();
  markSelected();
}

// Back to the title from the end screen: tear the run down and put the plinths back.
function toTitle() {
  if (!game) return;
  soak = false;
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
  // A pad has no pointer, so nothing is under it until something has focus. Put the ring on
  // the way in, which is where a player coming back to the title is heading anyway.
  titleNav.focusFirst(startBtn);
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

// Frame pacing. The sim is fixed at 60 Hz. On a 120 Hz tablet requestAnimationFrame comes
// twice per sim step, and on a mobile GPU drawing the same state twice costs a full render
// for nothing; so on a coarse-pointer device that has measured a high refresh the loop
// draws only on frames that stepped the sim. A desktop keeps every frame: its GPU has the
// headroom, and the view layer's blending and particles do move between sim steps, which
// is exactly why Chrome on a ProMotion Mac feels smoother than a 60 Hz cap. And when drawn
// frames run long the resolution comes down a notch at a time (and back up when they are
// comfortably short), which is what keeps a tablet at its native 2x from stuttering.
let refreshEma = 1 / 60;    // measured frame interval
let pendingDt = 0;          // render time carried over skipped frames
let tuneAt = 0;
let longFrames = 0, drawnFrames = 0, cleanSeconds = 0;
// ?dpr=1.5 pins the pixel ratio and turns the auto-tuner off - for measuring, or a player
// who prefers crisp over smooth.
const dprPin = Number(new URLSearchParams(location.search).get('dpr'));
if (dprPin > 0) { world.setDpr(dprPin); world.autoDpr = false; } else world.autoDpr = true;
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;
  refreshEma += (dtReal - refreshEma) * 0.05;
  const hiHz = refreshEma < 0.0125;
  world.refreshHz = Math.round(1 / refreshEma);

  // Keyboard and touch arrive as DOM events, which fire whatever the loop is doing. A
  // gamepad has to be asked, and the only place that asked was the sim step - so on the
  // title screen and in the pause menu the pad went completely unread, and a controller
  // could not even start a run. Snapshot here for exactly those two cases: it polls the pad,
  // fires confirm/pause, and drains the edges, so a button mashed at the title does not
  // arrive as the first frame of input.
  if (!game || paused) input.snapshot();

  if (!game) { touch.setPlaying(false); if (preview) updatePreview(dtReal); monsters.tick(); prewarmTick(world); world.renderer.render(world.scene, world.camera); return; }

  const frameStart = performance.now();
  for (const k in phase) phase[k] = 0;
  readCounts(counts);
  // The title, the end screen and the pause menu are all places where there is nothing to
  // drive, and the controls sit over their buttons. One line, checked every frame, rather
  // than a call at each of the six places the run's state changes.
  touch.setPlaying(!paused && !ended);

  if (!paused) {
    // hit-stop: freeze the sim for a few ms after a solid hit, the belt-scroller crunch
    if (hitstop > 0) hitstop -= dtReal;
    else {
      acc += dtReal;
      let steps = 0;
      const simStart = performance.now();
      while (acc >= SIM.dt && steps < 5) {
        simUpdate(game, soak ? autoInput(game) : input.snapshot(), SIM.dt);
        if (soak) game.player.hp = game.player.hpMax;   // the point is the frames, not the fight
        acc -= SIM.dt;
        steps++;
      }
      phase.sim = performance.now() - simStart;
      for (const ev of game.events) {
        if (ev.type === 'hit') hitstop = Math.max(hitstop, ev.crit || ev.target === 'player' ? 0.07 : ev.attack === 'bash' || ev.attack === 'slash3' ? 0.06 : 0.028);
      }
      // 120 Hz on a tablet: this frame did not move the sim, so there is nothing new to draw.
      world.pacing = hiHz ? (world.coarse ? 'skip-dup' : 'every-frame') : '60hz';
      if (hiHz && world.coarse && steps === 0) { pendingDt += dtReal; return; }
    }
    // Adaptive resolution, judged once a second on the share of drawn frames that ran
    // long. A mean hides a GPU that misses every fifth vsync; a share does not. Down a
    // notch when more than 8 % of frames overran, up a notch after three clean seconds.
    //
    // "Clean" used to mean exactly zero - not one frame over budget in three seconds
    // running - and in a fight that never happens: one hitch from a monster being built or a
    // room loading resets it. So the resolution only ever went one way. Toto's session came
    // down to 0.75 in its first twenty seconds and stayed there to the end, blurred, through
    // a solid minute at 59 fps. Clean is now 2 % or under: far enough below the 8 % that
    // drops a notch that the two cannot chase each other, close enough to zero to be real.
    const drawn = dtReal + pendingDt;
    drawnFrames++;
    if (drawn > (1 / 60) * 1.25) longFrames++;
    if (now > tuneAt) {
      tuneAt = now + 1000;
      const share = drawnFrames ? longFrames / drawnFrames : 0;
      world.longShare = Math.round(share * 100);
      if (world.autoDpr && drawnFrames >= 20) {
        if (share > 0.08) { cleanSeconds = 0; if (world.dpr > 0.75) world.setDpr(world.dpr - 0.25); }
        else if (share <= 0.02) { if (++cleanSeconds >= 3 && world.dpr < world.dprMax) { world.setDpr(world.dpr + 0.25); cleanSeconds = 0; } }
        else cleanSeconds = 0;
      }
      longFrames = 0; drawnFrames = 0;
    }
  }

  renderFrame(paused ? 0 : dtReal + pendingDt);
  pendingDt = 0;
  const drawStart = performance.now();
  world.renderer.render(world.scene, world.camera);
  phase.draw = performance.now() - drawStart;
  // The draw time here is how long it took to hand the commands over, not how long the GPU
  // spent on them. A long frame with a cheap draw is the CPU's fault; a long frame that is
  // almost all draw is the GPU telling us it is behind.
  const total = performance.now() - frameStart;
  if (total > 34) phaseMark(total);
}
requestAnimationFrame(frame);

// The visual layer for one frame: drain events into sfx / fx / hud, advance the views.
// Notable moments, stamped with the clock the stats overlay uses, so a long frame can be
// blamed on what was happening: a room build, a boss walking in, a first skill.
const MARKED = { roomEnter: (e) => `room ${e.name}`, wave: (e) => `wave ${e.index + 1}`, bossAdds: () => 'boss adds', levelUp: (e) => `level ${e.level}`, bossDrop: (e) => `drop ${e.item}`, itemDrop: (e) => `drop ${e.item}`, won: () => 'won', gameOver: () => 'game over', attack: (e) => (e.id?.startsWith('slash') || e.id?.startsWith('arrow') ? null : `skill ${e.id}`) };
world.marks = [];
function mark(label) { world.marks.push({ at: performance.now(), label }); if (world.marks.length > 12) world.marks.shift(); }

// A spike label says what the game was doing; it does not say where the time went. Two
// suspects for the stutter with several monsters on screen were both cleared by the marks
// that name them, which leaves the frame itself. Time its parts, and when one runs long say
// which part it was and what the rest cost - a fix aimed at the wrong half of a frame is
// worse than no fix, because it looks like progress.
const phase = { sim: 0, pre: 0, fx: 0, hero: 0, monsters: 0, scene: 0, hud: 0, draw: 0 };
// "draw" is still three different answers in one number: a shader compiled, something
// uploaded, or the GPU simply having too much to do. The renderer counts the first two, so
// take the counts either side of a long frame and let the difference say which it was.
const counts = { prog: 0, tex: 0, geo: 0 };
// Knowing that seven programs were compiled does not say seven of what, and two rounds of
// fixing the wrong thing came out of guessing. A program's cache key opens with the shader
// it was built from - meshstandard, sprite, points, or a pair of ids for a custom one - so
// remember which ids have been seen and let a long frame name the newcomers itself.
const seenPrograms = new Set();
function newProgramKinds() {
  const list = world.renderer.info.programs || [];
  const kinds = [];
  for (const prog of list) {
    if (seenPrograms.has(prog.id)) continue;
    seenPrograms.add(prog.id);
    // The field is cacheKey; program.code belongs to the shader cache, not the program, and
    // reading it gave an empty string for everything - which reads exactly like a custom
    // shader and sent one more round of this in the wrong direction.
    const key = String(prog.cacheKey || '');
    kinds.push(key.split(',')[0] || (key ? 'custom' : '?'));
  }
  const tally = {};
  for (const k of kinds) tally[k] = (tally[k] || 0) + 1;
  return Object.entries(tally).map(([k, n]) => (n > 1 ? `${n}x${k}` : k)).join(' ');
}
function readCounts(into) {
  const r = world.renderer;
  into.prog = r.info.programs ? r.info.programs.length : 0;
  into.tex = r.info.memory.textures;
  into.geo = r.info.memory.geometries;
}
function phaseMark(total) {
  let name = '', worst = 0;
  for (const k in phase) if (phase[k] > worst) { worst = phase[k]; name = k; }
  const rest = Object.entries(phase).filter(([k, v]) => k !== name && v >= 1.5).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' ');
  const now = {};
  readCounts(now);
  const grew = ['prog', 'tex', 'geo'].map((k) => (now[k] > counts[k] ? `+${now[k] - counts[k]}${k}` : '')).filter(Boolean).join(' ');
  const kinds = now.prog > counts.prog ? newProgramKinds() : '';
  mark(`${Math.round(total)}ms frame: ${name} ${worst.toFixed(0)}ms${rest ? ` + ${rest}` : ''}${grew ? ` [${grew}${kinds ? ': ' + kinds : ''}]` : ' [no new gpu objects]'}`);
}
// A hand that never gets tired, for a soak run. It writes the input a player would: walk at
// the nearest thing alive, hold the attack, and spend a skill when one is off cooldown. It
// re-presses every so often because a skill disarms hold-to-attack, and hold only re-arms on
// a fresh edge - the same rule a controller is held to.
let autoFrame = 0, autoKills = -1, autoStuck = 0, autoSkipNearest = false;
const autoHeld = {}, autoPressed = {};
function autoInput(g) {
  for (const k in autoHeld) delete autoHeld[k];
  for (const k in autoPressed) delete autoPressed[k];
  autoFrame++;
  const p = g.player;
  let target = null, best = autoSkipNearest ? -Infinity : Infinity;
  for (const e of g.enemies) {
    if (e.dead) continue;
    const d = Math.abs(e.x - p.x) + Math.abs(e.z - p.z) * 0.5;
    if (autoSkipNearest ? d > best : d < best) { best = d; target = e; }
  }
  if (target) {
    const dx = target.x - p.x, dz = target.z - p.z;
    // Close to arm's length whoever the hero is. A standoff for the hunter looked right and
    // was not: a monster pinned against the far wall ends up nearer than the standoff, the
    // walk key is never pressed, and the hero faces wherever it last walked - which is how a
    // soak run spent a minute firing away from four skeletons standing behind it, with the
    // wave unable to end and nothing new able to spawn. Facing follows the walk key here, so
    // the walk key has to follow the target.
    if (dx > 0.8) autoHeld.right = true; else if (dx < -0.8) autoHeld.left = true;
    if (dz > 0.4) autoHeld.down = true; else if (dz < -0.4) autoHeld.up = true;
  }
  // And if a wave still refuses to die, stop asking the same monster. Every few seconds
  // without a kill, take the one furthest away instead and dash at it.
  if (g.kills !== autoKills) { autoKills = g.kills; autoStuck = 0; } else autoStuck++;
  if (autoStuck > 300) {
    autoStuck = 0;
    autoSkipNearest = !autoSkipNearest;
    autoPressed.dash = true;
  }
  autoHeld.attack = true;
  if (autoFrame % 9 === 0) autoPressed.attack = true;       // a fresh edge, to re-arm the hold
  const skills = p.def.skills || [];
  if (skills.length) {
    const slot = ['skill1', 'skill2', 'skill3'][(autoFrame / 40 | 0) % Math.min(3, skills.length)];
    if (autoFrame % 40 === 0) autoPressed[slot] = true;
  }
  return { held: autoHeld, pressed: autoPressed };
}

let heldSince = 0;
function renderFrame(dt) {
  if (game.roomIndex !== roomBuilt) mark(`build room ${game.room.name}`);
  // A held attack that never lets go is the bug being chased; stamp it with what the input
  // layer sees the moment it passes six seconds, so the report can be read back.
  // A finished run freezes the last hold, and a soak run holds the attack on purpose for as
  // long as it runs; neither is the stuck button this watches for.
  const live = !soak && game.phase !== 'won' && game.phase !== 'dead';
  if (live && game.player.holdAttack) {
    if (!heldSince) heldSince = performance.now();
    else if (heldSince > 0 && performance.now() - heldSince > 6000) {
      const raw = input.raw();
      mark(`attack held 6s+ (held ${raw.held.join('/')}; pad ${raw.pad ? raw.pad.buttons.join(',') : '-'})`);
      heldSince = -1;   // said once; -1 is the latch, and the next release resets it
    }
  } else heldSince = 0;
  const preStart = performance.now();
  syncRoom();
  // The walk to the exit is the quiet moment to draw the next room's textures.
  const next = game.roomIndex + 1;
  if (game.phase === 'cleared' && next < game.dungeon.rooms.length && prewarmed !== next) {
    prewarmed = next;
    prewarmRoom(world, game.dungeon.rooms[next], next);
    monsters.prebuild(game.dungeon.rooms[next], MONSTERS);
    mark(`prewarm room ${game.dungeon.rooms[next].name}`);
  }
  // The walk out is the budget: one monster view and one room texture per frame, not all of
  // either in the frame that noticed.
  if (game.phase === 'cleared') { monsters.tick(); prewarmTick(world); }
  for (const ev of game.events) { const f = MARKED[ev.type]; const label = f && f(ev); if (label) mark(label); sfx.handle(ev); }
  phase.pre = performance.now() - preStart;   // room sync, the next room's textures, the event drain
  let t = performance.now();
  fx.update(game, dt);              phase.fx = performance.now() - t; t = performance.now();
  heroView.update(game, dt);        phase.hero = performance.now() - t; t = performance.now();
  monsters.update(game, dt);        phase.monsters = performance.now() - t; t = performance.now();
  updateScene(world, game, dt);     phase.scene = performance.now() - t; t = performance.now();
  hud.update(game, dt);             phase.hud = performance.now() - t;
  if (!ended && (game.phase === 'won' || game.phase === 'dead')) {
    ended = true;
    // Bank the run the moment it ends, not when the overlay shows: a tab closed during the
    // victory beat still keeps its xp and its clear.
    const g = game, won = g.phase === 'won';
    progress = recordRun(profile, g, { hero: selectedHero, town: selectedTown });
    saveProfile(profile);
    setTimeout(() => { if (game === g) { hud.showEnd(g, won, progress); endNav.focusFirst(); } }, won ? 1800 : 1400);
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
  world, fx, monsters, input, telemetry,
  tick(n = 1) { for (let i = 0; i < n; i++) simUpdate(game, input.snapshot(), SIM.dt); },
  play(n = 1) { for (let i = 0; i < n; i++) { simUpdate(game, input.snapshot(), SIM.dt); renderFrame(SIM.dt); } },
  start, hero(key) { selectedHero = key; start(); },
  town(key) { selectedTown = key; markTown(); },
  toTitle,
  get profile() { return profile; },
  // Debug: grant xp to the selected hero / wipe the profile, then redraw the title.
  grant(xp) { profile.heroes[selectedHero].xp += xp | 0; saveProfile(profile); markTown(); markSelected(); },
  resetProfile() { profile = clearProfile(); selectedTown = 'prontera'; tierPick.clear(); markTown(); markSelected(); },
  // Debug: hand the selected hero a weapon at +N (a fresh one is wielded).
  give(id, plus = 0) { const row = profile.heroes[selectedHero]; row.items[id] = { plus }; if (!row.equip) row.equip = id; saveProfile(profile); markSelected(); },
  character: characterUI,
};
