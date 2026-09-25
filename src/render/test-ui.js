// The test panel: set up a run instead of playing your way to it.
//
// Everything in here is a shortcut past progression - any town whether or not it is unlocked,
// any room in it, any level, any skill spread, any item at any refine - so that a map, a drop
// or a boss phase can be looked at in the state it is meant to be seen in rather than the one
// forty minutes of play happens to leave.
//
// It is never on by itself. The title button appears only with ?test=1 (sticky in
// localStorage, ?test=0 forgets), the same gate the telemetry badge uses, and the one line it
// asks of the sim - g.cheats.invuln in player.js - reads as false in every ordinary run.
import { TOWNS } from '../sim/data/dungeon.js';
import { HEROES } from '../sim/data/heroes.js';
import { ITEMS, SLOTS, isRolled, rollItem, fits } from '../sim/data/items.js';
import { LEVEL, REFINE, SKILL } from '../config.js';
import { xpAtLevel } from '../sim/progress.js';
import { loadRoom } from '../sim/game.js';

const KEY = 'dro.test';
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** Turn the panel on or off and remember it. The native shell has no address bar, so this is
 *  the only way in there - see the tap gesture in main.js. */
export function setTestEnabled(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); return true; } catch { return false; }
}

/** On with ?test=1, off with ?test=0, and sticky in between - so a tablet keeps it across a
 *  reload without the query string having to be retyped. */
export function testEnabled() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.has('test')) {
      const on = params.get('test') !== '0';
      localStorage.setItem(KEY, on ? '1' : '0');
      return on;
    }
    return localStorage.getItem(KEY) === '1';
  } catch { return false; }
}

// `host` is what main.js is willing to let this touch: the profile and the two calls that
// start or restart a run. Nothing here reaches into the sim except through it.
export function createTestUI(host) {
  const root = $('testmode');
  const body = $('test-body');
  const note = $('test-note');
  let seq = 0;

  const say = (text) => { note.textContent = text; };

  function row(label, ...nodes) {
    const line = el('div', 'line');
    if (label) line.appendChild(el('label', null, label));
    for (const n of nodes) line.appendChild(n);
    return line;
  }

  function group(title) {
    const g = el('div', 'grp');
    g.appendChild(el('h3', null, title));
    return g;
  }

  function select(options, value, onPick) {
    const s = el('select');
    for (const [v, label] of options) {
      const o = el('option', null, label);
      o.value = v;
      s.appendChild(o);
    }
    s.value = value;
    s.addEventListener('change', () => onPick(s.value));
    return s;
  }

  function slider(min, max, value, onSet, fmt = (v) => v) {
    const wrap = el('div', 'line');
    const r = el('input');
    r.type = 'range'; r.min = min; r.max = max; r.step = 1; r.value = value;
    const out = el('span', 'val', fmt(value));
    r.addEventListener('input', () => { out.textContent = fmt(+r.value); onSet(+r.value); });
    wrap.appendChild(r); wrap.appendChild(out);
    wrap.style.flex = '1 1 auto';
    return wrap;
  }

  function toggle(label, get, set) {
    const b = el('button', get() ? 'on' : null, label);
    b.addEventListener('click', () => { set(!get()); b.classList.toggle('on', get()); });
    return b;
  }

  function action(label, fn) {
    const b = el('button', null, label);
    b.addEventListener('click', () => { fn(); render(); });
    return b;
  }

  // ---------------------------------------------------------------- the form

  function render() {
    const p = host.profile();
    const hero = host.hero();
    const rowFor = p.heroes[hero];
    body.replaceChildren();

    // ---- run: which town, which room, and go
    const run = group('Run');
    run.appendChild(row('Town',
      select(Object.entries(TOWNS).map(([k, t]) => [k, t.name]), host.town(), (v) => { host.setTown(v); render(); }),
      select(TOWNS[host.town()].rooms.map((r, i) => [String(i), `${i + 1}. ${r.name}`]), String(host.room()), (v) => host.setRoom(+v)),
    ));
    run.appendChild(row('', action('Start run', () => { root.hidden = true; host.start(); })));
    run.appendChild(el('p', 'hint', 'Start drops you straight into the chosen room, unlocked or not.'));
    body.appendChild(run);

    // ---- studio: one hero, one monster, every move and effect on a button (render/studio.js)
    const st = group('Studio');
    st.appendChild(row('', action('Open studio', () => { root.hidden = true; host.studio(); })));
    st.appendChild(el('p', 'hint', 'A stage to look at moves and effects one at a time, with slow motion. Also ?studio=1.'));
    body.appendChild(st);

    // ---- hero: class, level, skill points spent
    const who = group('Hero');
    who.appendChild(row('Class',
      select(Object.entries(HEROES).map(([k, h]) => [k, h.name || k]), hero, (v) => { host.setHero(v); render(); }),
    ));
    const lv = host.levelOf(hero);
    who.appendChild(row('Level', slider(1, LEVEL.max, lv, (v) => host.setLevel(hero, v), (v) => `Lv ${v}`)));
    for (const id of HEROES[hero].skills || []) {
      const at = rowFor.skills?.[id] ?? 0;
      who.appendChild(row(id, slider(0, SKILL.maxLevel, at, (v) => host.setSkill(hero, id, v))));
    }
    body.appendChild(who);

    // ---- gear: one control per slot, plus refine on whatever takes it
    const kit = group('Gear');
    for (const slot of SLOTS) {
      const wearable = Object.entries(ITEMS)
        .filter(([id, it]) => it.slot === slot && !isRolled(id) && fits(id, hero))
        .map(([id, it]) => [id, it.name]);
      if (slot === 'accessory') {
        const kinds = Object.entries(ITEMS).filter(([id, it]) => it.slot === 'accessory' && isRolled(id));
        kit.appendChild(row('accessory',
          select([['', '— none —'], ...kinds.map(([id, it]) => [id, it.name])], '', (v) => {
            if (!v) { host.setEquip(hero, 'accessory', null); say('Accessory cleared.'); return; }
            const inst = rollItem(v, { next: () => Math.random(), chance: () => false });
            inst.uid = `t${++seq}`;
            host.grantRolled(hero, inst);
            say(`${ITEMS[v].name}: ${inst.main.stat} ${inst.main.v} · ${inst.sub.stat} ${inst.sub.v}`);
          }),
          action('Reroll', () => {
            const cur = rowFor.bag?.find((b) => b.uid === rowFor.equip?.accessory);
            if (!cur) { say('Nothing in the accessory slot to reroll.'); return; }
            const inst = rollItem(cur.id, { next: () => Math.random(), chance: () => false });
            inst.uid = `t${++seq}`;
            host.grantRolled(hero, inst);
            say(`${ITEMS[cur.id].name}: ${inst.main.stat} ${inst.main.v} · ${inst.sub.stat} ${inst.sub.v}`);
          }),
        ));
        continue;
      }
      const worn = slot === 'weapon' ? rowFor.equip?.weapon : rowFor.equip?.[slot];
      const plus = worn ? (rowFor.items?.[worn]?.plus ?? 0) : 0;
      kit.appendChild(row(slot,
        select([['', '— none —'], ...wearable], worn || '', (v) => { host.setEquip(hero, slot, v || null); render(); }),
        slider(0, REFINE.max, plus, (v) => host.setRefine(hero, worn, v), (v) => `+${v}`),
      ));
    }
    kit.appendChild(row('', action('Grant every item', () => { host.grantAll(hero); say('Every weapon, cape and hat added at +0.'); })));
    body.appendChild(kit);

    // ---- live: only useful mid-run, so it says so when there is no run
    const live = group('In the run');
    const g = host.game();
    if (!g) {
      live.appendChild(el('p', 'hint', 'Start a run to clear waves, jump rooms or push a boss into its second phase.'));
    } else {
      live.appendChild(row('',
        toggle('Invulnerable', () => !!g.cheats?.invuln, (on) => { (g.cheats ||= {}).invuln = on; }),
        action('Refill HP / SP', () => { g.player.hp = g.player.hpMax; g.player.mp = g.player.mpMax; }),
        action('Kill wave', () => { for (const e of g.enemies) if (!e.dead) e.hp = 0; }),
      ));
      const idx = g.roomIndex;
      live.appendChild(row('Room',
        action('◀ prev', () => { if (idx > 0) loadRoom(g, idx - 1); }),
        el('span', 'val', `${idx + 1}/${g.dungeon.rooms.length}`),
        action('next ▶', () => { if (idx < g.dungeon.rooms.length - 1) loadRoom(g, idx + 1); }),
      ));
      const boss = g.enemies.find((e) => e.boss && !e.dead);
      live.appendChild(row('Boss',
        boss
          ? action('Drop to 50 % (phase 2)', () => { boss.hp = Math.min(boss.hp, boss.hpMax * 0.49); })
          : el('span', 'val', '—'),
        boss ? action('Drop to 10 %', () => { boss.hp = Math.min(boss.hp, boss.hpMax * 0.1); }) : el('span'),
      ));
    }
    body.appendChild(live);

    const p2 = host.profile();
    say(note.textContent || `${hero} Lv ${host.levelOf(hero)} · ${Object.keys(p2.heroes[hero].items || {}).length} items owned`);
  }

  $('test-close').addEventListener('click', () => { root.hidden = true; });
  root.addEventListener('click', (e) => { if (e.target === root) root.hidden = true; });

  return {
    open() { note.textContent = ''; render(); root.hidden = false; },
    close() { root.hidden = true; },
    get isOpen() { return !root.hidden; },
    refresh() { if (!root.hidden) render(); },
  };
}
