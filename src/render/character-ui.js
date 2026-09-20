// The profile panel: two tabs. Skills spends the points a level earns; Equipment is the
// hero's inventory - a grid of slots drawn from the real models - with a turntable of the
// hero wielding whatever is selected, and one Equip button. Owns no game state: it edits
// the profile, persists it, and calls back so the title and a live run pick the change up.
import { HEROES, SKILL_INFO, PASSIVE_INFO } from '../sim/data/heroes.js';
import { ITEMS, itemName, DEFAULT_WEAPON, SLOTS, SLOT_INFO, slotOf, fits, auraOf, attrText } from '../sim/data/items.js';
import { MONSTERS } from '../sim/data/monsters.js';
import { TOWNS } from '../sim/data/dungeon.js';
import { xpAtLevel, xpToNext } from '../sim/progress.js';
import { heroOf, skillPointsLeft, spendSkillPoint, setEquip, discard, saveProfile } from '../profile.js';
import { SKILL, REFINE } from '../config.js';
import { createPreview } from './preview.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const GRID = 12;
// Slot glyphs for items that have no model yet (everything but weapons, for now).
const GLYPH = {
  cape: '<svg viewBox="0 0 40 40"><path d="M12 6 L28 6 L34 34 Q20 28 6 34 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M20 6 L20 30" stroke="currentColor" stroke-width="1.4" opacity=".5"/></svg>',
  hat: '<svg viewBox="0 0 40 40"><path d="M10 24 Q10 9 20 9 Q30 9 30 24 Z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M5 25 Q20 32 35 25" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  accessory: '<svg viewBox="0 0 40 40"><circle cx="20" cy="23" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15 12 L20 6 L25 12 L20 15 Z" fill="currentColor"/></svg>',
  weapon: '<svg viewBox="0 0 40 40"><path d="M8 32 L28 8 M24 4 L32 12 M10 26 L14 30" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
};

export function createCharacterUI({ input, getProfile, onChange }) {
  const root = $('character');
  const body = $('character-body');
  const title = $('character-title');
  const note = $('character-note');
  const tabs = [...document.querySelectorAll('#character-tabs .tab')];
  const preview = createPreview();
  let hero = 'knight';
  let tab = 'skills';
  let selected;          // key of the entry picked in the inventory (item id, or a bag uid); null = the hero's own weapon
  let filter = 'all';    // which slot the inventory shows, or every one
  let confirmDiscard = null;   // uid awaiting a second tap on Discard

  const commit = () => { saveProfile(getProfile()); onChange?.(); };

  for (const b of tabs) b.addEventListener('click', () => { tab = b.dataset.tab; render(); });

  function bossOf(town) {
    const last = town.rooms[town.rooms.length - 1];
    return MONSTERS[last.waves?.[0]?.[0]?.type]?.name || last.name;
  }

  function render() {
    const profile = getProfile();
    const h = heroOf(profile, hero);
    const def = HEROES[hero];
    title.textContent = `Profile — ${def.name} · Lv ${h.level}`;
    for (const b of tabs) b.classList.toggle('selected', b.dataset.tab === tab);
    body.innerHTML = '';
    if (tab !== 'equip') preview.unmount();

    // XP, on both tabs
    const at = xpAtLevel(h.level), need = xpToNext(h.level);
    const xp = el('div', 'cxp');
    const bar = el('div', 'cxpbar'); const fill = el('div', 'fill'); bar.appendChild(fill);
    fill.style.width = `${need ? (100 * (h.xp - at)) / need : 100}%`;
    xp.append(bar, el('span', 'cxptext', need ? `${(h.xp - at).toLocaleString()} / ${need.toLocaleString()} XP to level ${h.level + 1}` : 'Max level'));
    body.appendChild(xp);

    if (tab === 'equip') renderEquipment(profile, h, def);
    else renderSkills(profile, h, def);
  }

  // ---------------------------------------------------------------- skills
  function renderSkills(profile, h, def) {
    const left = skillPointsLeft(profile, hero);
    const head = el('div', 'bgroup', 'Skills');
    head.append(el('span', `pts${left ? ' has' : ''}`, left ? ` · ${left} point${left === 1 ? '' : 's'} to spend` : ' · no points to spend'));
    body.appendChild(head);
    const rows = el('div', 'skills');
    for (const id of def.skills) {
      const info = SKILL_INFO[id];
      const atk = def.attacks[id];
      const lv = h.skills[id] || 0;
      const row = el('div', 'srow skillrow');   // not `.skill`: that is the HUD slot's class
      const name = el('div');
      name.append(el('div', 'slabel', info.name), el('div', 'shint', info.tip));
      const pips = el('div', 'pips');
      for (let i = 0; i < SKILL.maxLevel; i++) pips.appendChild(el('span', `pip${i < lv ? ' on' : ''}`));
      const effect = atk.buff
        ? `+${Math.round(SKILL.buffDur * lv * 100)}% duration (${(atk.buff.dur * (1 + SKILL.buffDur * lv)).toFixed(0)}s)`
        : `+${Math.round(SKILL.dmg * lv * 100)}% damage`;
      const right = el('div', 'sright');
      const plus = el('button', 'plus', '+');
      plus.type = 'button';
      plus.disabled = left <= 0 || lv >= SKILL.maxLevel;
      plus.title = lv >= SKILL.maxLevel ? 'Maxed' : left <= 0 ? 'Level up to earn points' : `Raise ${info.name} to ${lv + 1}`;
      plus.addEventListener('click', () => { if (spendSkillPoint(profile, hero, id)) { commit(); render(); } });
      right.append(el('span', 'seffect', lv ? effect : 'Lv 0'), plus);
      row.append(name, pips, right);
      rows.appendChild(row);
    }
    body.appendChild(rows);
    const pv = def.passive && PASSIVE_INFO[def.passive.id];
    if (pv) body.appendChild(el('p', 'tip', `Passive: ${pv.name} — ${pv.tip}`));
    note.textContent = 'One skill point per level; + raises a skill at once, even mid-run. Points stay where you put them.';
  }

  // ---------------------------------------------------------------- equipment
  // Every entry the inventory can show: the hero's own weapon, everything he holds, and the
  // weapons the towns still have for him (dimmed, with where they drop).
  function entries(h) {
    const list = [{ id: null, slot: 'weapon', name: DEFAULT_WEAPON[hero], held: true, tip: 'Your own weapon. No bonuses, nothing to refine.' }];
    const seen = new Set();
    for (const [key, town] of Object.entries(TOWNS)) {
      const id = town.loot?.[hero];
      if (!id || !ITEMS[id]) continue;
      seen.add(id);
      const held = h.items[id];
      list.push(held
        ? { id, slot: 'weapon', name: itemName({ id, plus: held.plus }, hero), held: true, plus: held.plus, tip: ITEMS[id].tip }
        : { id, slot: 'weapon', name: ITEMS[id].name, held: false, tip: ITEMS[id].tip, source: `Drops from ${bossOf(town)} · ${town.town}`, townKey: key });
    }
    for (const [id, it] of Object.entries(h.items)) {
      if (seen.has(id) || !fits(id, hero)) continue;
      list.push({ id, slot: slotOf(id), name: itemName({ id, plus: it.plus }, hero), held: true, plus: it.plus, tip: ITEMS[id].tip });
    }
    // Rolled instances: one entry each, keyed by uid, newest last.
    for (const inst of h.bag) {
      if (!ITEMS[inst.id]) continue;
      list.push({ id: inst.id, uid: inst.uid, key: inst.uid, slot: slotOf(inst.id), name: ITEMS[inst.id].name, held: true, inst, rarity: ITEMS[inst.id].rarity, tip: ITEMS[inst.id].tip });
    }
    for (const e of list) if (e.key === undefined) e.key = e.id;
    return list;
  }
  // What is worn in a slot, as an entry key: the item id, or the bag uid for the accessory.
  const wornKey = (h, slot) => (slot === 'weapon' ? h.gear?.id ?? null : h.wear[slot]?.uid ?? h.wear[slot]?.id ?? null);

  function slot(entry, h, { equipped = false, label = null } = {}) {
    const b = el('button', 'slotb');
    b.type = 'button';
    if (!entry) {
      b.classList.add('empty');
      if (label) { b.appendChild(el('span', 'slotlabel', label)); b.disabled = false; } else b.disabled = true;
      return b;
    }
    const url = entry.inst ? null : preview.icon(hero, entry.id);
    if (url) { const img = el('img'); img.src = url; img.alt = entry.name; img.draggable = false; b.appendChild(img); }
    else { const g = el('span', `glyph${entry.rarity ? ` r-${entry.rarity}` : ''}`); g.innerHTML = GLYPH[entry.slot] || GLYPH.weapon; b.appendChild(g); }
    if (!entry.held) b.classList.add('unknown');
    if (entry.plus) b.appendChild(el('span', 'badge', `+${entry.plus}`));
    if (entry.inst) b.appendChild(el('span', 'badge', attrText(entry.inst.main).split(' ')[0]));
    if (equipped) b.appendChild(el('span', 'tag', 'E'));
    b.classList.toggle('selected', entry.key === selected);
    b.title = entry.inst ? `${entry.name} · ${attrText(entry.inst.main)} · ${attrText(entry.inst.sub)}` : entry.held ? entry.name : `${entry.name} — ${entry.source}`;
    b.addEventListener('click', () => { selected = entry.key; confirmDiscard = null; render(); });
    return b;
  }

  function renderEquipment(profile, h, def) {
    const list = entries(h);
    if (selected === undefined || !list.some((e) => e.key === selected)) selected = h.gear?.id ?? null;
    const wrap = el('div', 'equip');

    // Left: what is worn, one slot each, then the inventory. Tapping a worn slot filters
    // the inventory to that slot; tapping it again shows everything.
    const inv = el('div', 'inv');
    inv.appendChild(el('div', 'bgroup', 'Equipped'));
    const wornRow = el('div', 'slots worn');
    for (const sl of SLOTS) {
      const key = wornKey(h, sl);
      const entry = key !== null ? list.find((e) => e.key === key && e.slot === sl) : null;
      const cell = el('div', `wornslot${filter === sl ? ' on' : ''}`);
      const b = entry ? slot(entry, h, { equipped: true }) : slot(null, h, { label: SLOT_INFO[sl].name });
      if (entry) b.classList.toggle('selected', false);
      b.addEventListener('click', (ev) => { ev.stopPropagation(); filter = filter === sl ? 'all' : sl; if (entry) selected = entry.key; confirmDiscard = null; render(); }, true);
      cell.append(b, el('span', 'wornlabel', SLOT_INFO[sl].name));
      wornRow.appendChild(cell);
    }
    inv.appendChild(wornRow);
    const shown = filter === 'all' ? list : list.filter((e) => e.slot === filter);
    const head = el('div', 'bgroup', filter === 'all' ? 'Inventory' : `Inventory · ${SLOT_INFO[filter].name}`);
    head.append(el('span', 'pts', ` · ${list.filter((e) => e.held && e.id).length} / ${GRID}`));
    if (filter !== 'all') { const all = el('button', 'showall', 'show all'); all.type = 'button'; all.addEventListener('click', () => { filter = 'all'; render(); }); head.append(all); }
    inv.appendChild(head);
    const grid = el('div', 'slots grid');
    for (const e of shown) grid.appendChild(slot(e, h, { equipped: e.key === wornKey(h, e.slot) }));
    for (let i = shown.length; i < GRID; i++) grid.appendChild(slot(null, h));
    inv.appendChild(grid);

    // Right: the turntable and what is selected.
    const look = el('div', 'look');
    const stage = el('div', 'stage');
    look.appendChild(stage);
    const e = list.find((x) => x.key === selected) || list[0];
    const detail = el('div', 'detail');
    const nameEl = el('strong', null, e.name);
    if (e.rarity) nameEl.appendChild(el('span', `rar r-${e.rarity}`, ` ${e.rarity}`));
    detail.appendChild(nameEl);
    if (e.inst) {
      detail.appendChild(el('div', 'stat', `${SLOT_INFO[e.slot].name} · main ${attrText(e.inst.main)}`));
      detail.appendChild(el('div', 'stat', e.inst.sub ? `secondary ${attrText(e.inst.sub)}` : 'no secondary'));
    } else detail.appendChild(el('div', 'stat', `${SLOT_INFO[e.slot].name} · ${e.tip}`));
    if (e.held && e.id && !e.inst) {   // refine line: stackable kinds only, never a rolled instance
      const plus = e.plus || 0;
      const bits = [];
      if (plus) bits.push(e.slot === 'weapon' ? `+${Math.round(REFINE.atk * plus * 100)}% ATK from refining` : `+${Math.round(REFINE.hp * plus * 100)}% HP from refining`);
      const au = e.slot === 'weapon' ? auraOf({ id: e.id, plus }) : null;
      if (au) bits.push(`${au.name} aura, +${Math.round(REFINE.critDmg * 100)}% crit damage`);
      bits.push(plus >= REFINE.max ? 'fully refined' : `next duplicate → +${plus + 1}`);
      detail.appendChild(el('div', 'stat', bits.join(' · ')));
    }
    if (!e.held) detail.appendChild(el('div', 'src', e.source));
    const isWorn = e.key === wornKey(h, e.slot);
    const ref = e.uid || e.id;
    const btns = el('div', 'equipbtns');
    const btn = el('button', 'equipbtn', !e.held ? 'Not yet found' : isWorn ? (e.slot === 'weapon' ? 'Wielding' : 'Wearing') : 'Equip');
    btn.type = 'button';
    btn.disabled = !e.held || isWorn;
    btn.addEventListener('click', () => { if (setEquip(profile, hero, ref, e.slot)) { commit(); render(); } });
    btns.appendChild(btn);
    if (isWorn && e.key && e.slot !== 'weapon') {
      const off = el('button', 'equipbtn ghost', 'Take off');
      off.type = 'button';
      off.addEventListener('click', () => { if (setEquip(profile, hero, null, e.slot)) { commit(); render(); } });
      btns.appendChild(off);
    }
    if (e.uid) {   // rolled things can be thrown away; two taps, so a slip costs nothing
      const armed = confirmDiscard === e.uid;
      const del = el('button', `equipbtn ghost discard${armed ? ' armed' : ''}`, armed ? 'Really discard?' : 'Discard');
      del.type = 'button';
      del.addEventListener('click', () => {
        if (!armed) { confirmDiscard = e.uid; render(); return; }
        if (discard(profile, hero, e.uid)) { confirmDiscard = null; selected = undefined; commit(); render(); }
      });
      btns.appendChild(del);
    }
    detail.appendChild(btns);
    look.appendChild(detail);

    wrap.append(inv, look);
    body.appendChild(wrap);
    // The turntable shows the selected weapon (with its glow), or the wielded one while a
    // cape or hat is selected, since those have no models yet.
    const onStage = e.slot === 'weapon' ? e : list.find((x) => x.key === wornKey(h, 'weapon') && x.slot === 'weapon');
    if (preview.ready) preview.mount(stage, hero, onStage?.id ? { id: onStage.id, plus: onStage.plus || 0 } : null);
    else stage.appendChild(el('div', 'stagenote', 'Loading models…'));
    note.textContent = 'Tap a slot to preview it, then Equip. Duplicate weapons refine by +1 (aura from +5); accessories are rolled on the drop - a main stat by kind and a random secondary - and never merge.';
  }

  function open(key, which) {
    if (key) hero = key;
    if (which) tab = which;
    selected = undefined;
    filter = 'all';
    confirmDiscard = null;
    render();
    root.hidden = false;
    input.setEnabled(false);
  }
  function close() {
    preview.unmount();
    root.hidden = true;
    input.setEnabled(true);
    onChange?.();
  }
  $('character-close').addEventListener('click', () => close());
  document.addEventListener('keydown', (e) => {
    if (root.hidden || e.key !== 'Escape') return;
    e.preventDefault();
    close();
  });
  window.addEventListener('resize', () => { if (!root.hidden && tab === 'equip') render(); });

  return { open, close, render, setAssets: (a) => preview.setAssets(a), get isOpen() { return !root.hidden; } };
}
