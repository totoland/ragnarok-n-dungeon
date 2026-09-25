// The studio: a stage for looking at one hero and one monster move by move, and at every
// effect on its own, without a fight getting in the way.
//
// It is a run like any other - createGame, the real sim, the real views - in a room with no
// waves, so nothing spawns and nothing clears. The one thing it asks of the sim is
// g.cheats.hold (sim/enemies.js), which keeps the monster standing where it was put instead
// of coming for the hero; everything else here drives the game through the same entry points
// the game uses: startAttack for the hero, a wind-up state for the monster, events and
// pending jobs for the effects. So what it shows is what a run would show.
//
// Reached from the test panel (render/test-ui.js) or straight in with ?studio=1.
import { HEROES } from '../sim/data/heroes.js';
import { MONSTERS } from '../sim/data/monsters.js';
import { createEnemy } from '../sim/enemies.js';
import { startAttack, hurtPlayer } from '../sim/player.js';
import { applyHit } from '../sim/combat.js';
import { PLAYER } from '../config.js';

const THEMES = ['field', 'forest', 'desert', 'graveyard', 'throne', 'plaza', 'shore', 'coral', 'warcamp', 'terrace', 'crypt', 'mirrors'];
const MOVES = ['attack', 'charge', 'slam', 'cast', 'meteor', 'heal'];
const SPEEDS = [1, 0.5, 0.25, 0.1];

const STYLE = `
#studio { position: fixed; top: 8px; right: 8px; bottom: 8px; width: 300px; z-index: 50;
  background: rgba(14, 12, 20, 0.88); color: #eee; border: 1px solid #5a4a2a; border-radius: 10px;
  font: 12px/1.35 system-ui, sans-serif; display: flex; flex-direction: column; }
#studio[hidden] { display: none; }   /* display:flex above would otherwise beat the hidden attribute */
#studio header { display: flex; align-items: center; padding: 8px 10px; border-bottom: 1px solid #3a3040; }
#studio header h2 { font-size: 14px; margin: 0; flex: 1; color: #e8b64a; }
#studio .body { overflow-y: auto; padding: 6px 10px 12px; }
#studio h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #b9a680; margin: 10px 0 4px; }
#studio .row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 3px 0; }
#studio button, #studio select { font: inherit; color: #eee; background: #2a2433; border: 1px solid #4a4058;
  border-radius: 6px; padding: 4px 7px; cursor: pointer; }
#studio button:hover { border-color: #e8b64a; }
#studio button.on { background: #6a5020; border-color: #e8b64a; }
#studio select { flex: 1; min-width: 0; }
#studio .hint { color: #9a90a8; margin: 2px 0; }
@media (max-width: 700px) { #studio { width: auto; left: 8px; top: auto; height: 46%; } }
`;

export function createStudio(host) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'studio';
  root.hidden = true;
  document.body.appendChild(root);
  // A click on the panel must not also land in the game as an attack.
  for (const t of ['pointerdown', 'mousedown', 'click', 'contextmenu']) root.addEventListener(t, (e) => e.stopPropagation());

  const spec = { hero: 'knight', monster: 'baphomet', theme: 'throne' };
  let speed = 1, paused = false, monsterWalk = false;

  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const row = (...nodes) => { const r = el('div', null, 'row'); for (const n of nodes) r.appendChild(n); return r; };
  const btn = (label, fn, on) => { const b = el('button', label, on ? 'on' : null); b.type = 'button'; b.addEventListener('click', () => { fn(b); }); return b; };
  const pick = (opts, value, onPick) => {
    const s = el('select');
    for (const [v, label] of opts) { const o = el('option', label); o.value = v; s.appendChild(o); }
    s.value = value;
    s.addEventListener('change', () => onPick(s.value));
    return s;
  };

  const g = () => host.game();
  const hero = () => g()?.player;
  const mon = () => g()?.enemies.find((e) => e.studio && !e.dead) || null;

  // ---------------------------------------------------------------- the stage

  function dungeon() {
    return {
      town: 'Studio', name: 'Studio', loot: {},
      rooms: [{ name: 'Studio', width: 16, theme: spec.theme, waves: [] }],
    };
  }

  // Called by main.js once the studio's game exists: hero centre stage, monster facing him.
  function setup(game) {
    game.cheats = { invuln: true, hold: true };
    const p = game.player;
    p.x = 6; p.z = 0; p.facing = 1;
    spawnMonster(game);
  }

  function spawnMonster(game = g()) {
    if (!game) return;
    for (const e of game.enemies) if (e.studio) { e.dead = true; e.hp = 0; e.deathT = 99; }
    game.enemies = game.enemies.filter((e) => !e.studio);
    if (!spec.monster) return;
    const e = createEnemy(game, spec.monster, game.player.x + 4.2, game.player.z);
    e.studio = true;
    e.state = 'chase';
    e.hp = e.hpMax = 1e7;       // it is here to be looked at, not killed by the effects
    e.cd = 1e9;
    e.walkDemo = monsterWalk;
    game.enemies.push(e);
  }

  function resetPositions() {
    const game = g(); if (!game) return;
    const p = game.player;
    p.x = 6; p.z = 0; p.vx = p.vz = 0;
    const e = mon();
    if (e) { e.x = p.x + 4.2; e.z = p.z; e.vx = e.vz = 0; e.state = 'chase'; e.stateT = 0; }
  }

  // ---------------------------------------------------------------- hero

  function heroAttack(id) {
    const game = g(), p = hero(); if (!p) return;
    const atk = p.def.attacks[id];
    p.mp = p.mpMax;
    delete p.cooldowns[id];
    if (atk.air) { p.vy = PLAYER.jumpVel * 0.8; p.grounded = false; p.y = Math.max(p.y, 0.4); }
    if (p.state === 'dead') revive();
    startAttack(game, p, id);
  }
  function heroHurt() {
    const game = g(), p = hero(); if (!p) return;
    game.cheats.invuln = false;
    p.hp = p.hpMax; p.iframes = 0; p.dodge = 0;
    hurtPlayer(game, p, 1, [3, 0], PLAYER.hurt.stun, -p.facing);
    game.cheats.invuln = true;
  }
  function heroJump() { const p = hero(); if (!p || !p.grounded) return; p.vy = PLAYER.jumpVel; p.grounded = false; p.state = 'air'; }
  function heroDie() { const p = hero(); if (!p) return; p.state = 'dead'; p.stateT = 0; p.attack = null; }
  function revive() {
    const game = g(), p = hero(); if (!p) return;
    p.hp = p.hpMax; p.mp = p.mpMax; p.state = 'idle'; p.stateT = 0;
    game.phase = 'fight';
  }

  // ---------------------------------------------------------------- monster

  function monsterMove(name) {
    const game = g(), e = mon(); if (!e) return;
    e.state = 'windup'; e.stateT = 0; e.move = name; e.hitDone = false;
    e.facing = Math.sign(game.player.x - e.x) || -1;
    if (name === 'heal') { e.healFrom = e.hp; e.hp = Math.min(e.hp, e.hpMax * 0.1); }
    game.events.push({ type: 'windup', id: e.id, move: name, x: e.x, z: e.z, monster: e.type });
  }
  function monsterHit(knock, stun) {
    const game = g(), e = mon(); if (!e) return;
    applyHit(e, 1, knock, stun, Math.sign(e.x - game.player.x) || 1, e.mass);
    e.flash = 0.12;
    game.events.push({ type: 'hit', target: e.id, dmg: 1, x: e.x, z: e.z, y: e.y + e.hurtbox.h * 0.6, crit: false });
  }
  function monsterFreeze() {
    const game = g(), e = mon(); if (!e) return;
    e.frozen = 1.2;
    game.events.push({ type: 'freeze', id: e.id, x: e.x, y: e.y, z: e.z });
  }
  function monsterDie() { const e = mon(); if (e) e.hp = 0; }

  // ---------------------------------------------------------------- effects

  const at = (who) => (who === 'mon' ? (mon() || hero()) : hero());
  const EFFECTS = [
    ['Cold Bolt', () => { const p = hero(); g().pending.push({ kind: 'autoBolt', t: 0.28, x: p.x, z: p.z }); g().events.push({ type: 'autoBolt', x: p.x, z: p.z, y: p.y }); }],
    ['Auto Meteor', () => { const e = at('mon'); g().pending.push({ kind: 'autoMeteor', target: e.id, t: 0.55, x: e.x, z: e.z }); g().events.push({ type: 'autoMeteor', target: e.id, x: e.x, z: e.z, y: e.y }); }],
    ['Fire Meteor', () => { const p = hero(); g().events.push({ type: 'bossMeteorCall', x: p.x, z: p.z, y: 0, at: 0.6 }); setTimeout(() => g()?.events.push({ type: 'meteor', x: p.x, z: p.z, y: 0, fire: true }), 600); }],
    ['Auto Magnum', () => { const p = hero(); g().events.push({ type: 'autoMagnum', x: p.x, z: p.z, y: p.y, facing: p.facing }); }],
    ['Freeze', monsterFreeze],
    ['Undertow', () => { const e = at('mon'); g().events.push({ type: 'undertow', id: e.id, x: e.x, z: e.z, y: e.y + 0.4 }); }],
    ['Soul Drain', () => { const p = hero(); g().events.push({ type: 'drain', hp: 120, sp: 0, x: p.x, z: p.z, y: p.y + 1.6 }); }],
    ['Boss heal', () => { const e = at('mon'); g().events.push({ type: 'bossHeal', id: e.id, x: e.x, z: e.z, y: e.y, amount: 333 }); }],
    ['Heal broken', () => { const e = at('mon'); g().events.push({ type: 'healBroken', id: e.id, x: e.x, z: e.z, y: e.y }); }],
    ['Level up', () => { const p = hero(); g().events.push({ type: 'levelUp', level: 26, x: p.x, z: p.z, y: p.y }); }],
    ['Boss drop', () => { const p = hero(); g().events.push({ type: 'bossDrop', item: 'underWaterSword', x: p.x + 1.5, z: p.z, y: 0 }); }],
    ['Miss', () => { const p = hero(); g().events.push({ type: 'dodge', x: p.x, z: p.z, y: p.y + 1.4 }); }],
  ];

  // ---------------------------------------------------------------- the panel

  function render() {
    root.replaceChildren();
    const head = el('header');
    head.appendChild(el('h2', 'Studio'));
    head.appendChild(btn('✕', () => host.exit()));
    root.appendChild(head);
    const body = el('div', null, 'body');
    root.appendChild(body);

    body.appendChild(el('h3', 'Stage'));
    body.appendChild(row(
      pick(Object.keys(HEROES).map((k) => [k, HEROES[k].name || k]), spec.hero, (v) => { spec.hero = v; host.rebuild(); }),
      pick([['', '— no monster —'], ...Object.entries(MONSTERS).map(([k, m]) => [k, (m.boss ? '★ ' : '') + (m.name || k)])], spec.monster || '', (v) => { spec.monster = v || null; spawnMonster(); render(); }),
    ));
    body.appendChild(row(
      pick(THEMES.map((t) => [t, t]), spec.theme, (v) => { spec.theme = v; host.rebuild(); }),
      btn('Reset positions', resetPositions),
    ));

    body.appendChild(el('h3', 'Speed'));
    const speeds = row();
    for (const s of SPEEDS) speeds.appendChild(btn(`${s}×`, () => { speed = s; render(); }, speed === s && !paused));
    speeds.appendChild(btn(paused ? '▶ Play' : '❚❚ Pause', () => { paused = !paused; render(); }, paused));
    speeds.appendChild(btn('Step', () => host.step()));
    body.appendChild(speeds);

    const p = hero();
    if (p) {
      body.appendChild(el('h3', `Hero · ${p.def.name || spec.hero}`));
      const moves = row();
      for (const id of Object.keys(p.def.attacks)) moves.appendChild(btn(id, () => heroAttack(id)));
      body.appendChild(moves);
      body.appendChild(row(btn('Jump', heroJump), btn('Hurt', heroHurt), btn('Die', heroDie), btn('Revive', revive)));
      body.appendChild(el('p', 'Walk with the arrow keys; the monster stays put.', 'hint'));
    }

    const e = mon();
    if (spec.monster && e) {
      body.appendChild(el('h3', `Monster · ${e.def.name || e.type}`));
      const moves = row();
      for (const m of MOVES) if (m === 'attack' ? e.def.attack : e.def[m]) moves.appendChild(btn(m, () => monsterMove(m)));
      body.appendChild(moves);
      body.appendChild(row(
        btn('Walk', (b) => { monsterWalk = !monsterWalk; e.walkDemo = monsterWalk; b.classList.toggle('on', monsterWalk); }, monsterWalk),
        btn('Hurt', () => monsterHit([2.5, 0], 0.34)),
        btn('Knock up', () => monsterHit([4, 7], 0.6)),
        btn('Die', monsterDie),
        btn('Respawn', () => { spawnMonster(); render(); }),
      ));
    }

    body.appendChild(el('h3', 'Effects'));
    const fxRow = row();
    for (const [label, fn] of EFFECTS) fxRow.appendChild(btn(label, () => { if (g()) fn(); }));
    body.appendChild(fxRow);
    body.appendChild(el('p', 'Effects play at the hero, or at the monster when they belong to one.', 'hint'));
  }

  return {
    get spec() { return spec; },
    get timeScale() { return paused ? 0 : speed; },
    dungeon, setup,
    open() { render(); root.hidden = false; },
    close() { root.hidden = true; },
    refresh() { if (!root.hidden) render(); },
    get isOpen() { return !root.hidden; },
  };
}
