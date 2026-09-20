// The profile panel: two tabs. Skills spends the points a level earns; Equipment is the
// hero's inventory - a grid of slots drawn from the real models - with a turntable of the
// hero wielding whatever is selected, and one Equip button. Owns no game state: it edits
// the profile, persists it, and calls back so the title and a live run pick the change up.
import { HEROES, SKILL_INFO, PASSIVE_INFO } from '../sim/data/heroes.js';
import { ITEMS, itemName, DEFAULT_WEAPON } from '../sim/data/items.js';
import { MONSTERS } from '../sim/data/monsters.js';
import { TOWNS } from '../sim/data/dungeon.js';
import { xpAtLevel, xpToNext } from '../sim/progress.js';
import { heroOf, skillPointsLeft, spendSkillPoint, setEquip, saveProfile } from '../profile.js';
import { SKILL, REFINE } from '../config.js';
import { createPreview } from './preview.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const SLOTS = 12;

export function createCharacterUI({ input, getProfile, onChange }) {
  const root = $('character');
  const body = $('character-body');
  const title = $('character-title');
  const note = $('character-note');
  const tabs = [...document.querySelectorAll('#character-tabs .tab')];
  const preview = createPreview();
  let hero = 'knight';
  let tab = 'skills';
  let selected;          // item id picked in the inventory; null = the hero's own weapon

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
  // Every entry the inventory can show: the hero's own weapon, what he holds, and what the
  // towns still have for him (dimmed, with where it drops).
  function entries(h) {
    const list = [{ id: null, name: DEFAULT_WEAPON[hero], held: true, tip: 'Your own weapon. No bonuses, nothing to refine.' }];
    for (const [key, town] of Object.entries(TOWNS)) {
      const id = town.loot?.[hero];
      if (!id || !ITEMS[id]) continue;
      const held = h.items[id];
      list.push(held
        ? { id, name: itemName({ id, plus: held.plus }, hero), held: true, plus: held.plus, tip: ITEMS[id].tip }
        : { id, name: ITEMS[id].name, held: false, tip: ITEMS[id].tip, source: `Drops from ${bossOf(town)} · ${town.town}`, townKey: key });
    }
    return list;
  }

  function slot(entry, h, { equipped = false } = {}) {
    const b = el('button', 'slotb');
    b.type = 'button';
    if (!entry) { b.classList.add('empty'); b.disabled = true; return b; }
    const url = preview.icon(hero, entry.id);
    if (url) { const img = el('img'); img.src = url; img.alt = entry.name; img.draggable = false; b.appendChild(img); }
    else b.appendChild(el('span', 'noicon', entry.name[0]));
    if (!entry.held) b.classList.add('unknown');
    if (entry.plus) b.appendChild(el('span', 'badge', `+${entry.plus}`));
    if (equipped) b.appendChild(el('span', 'tag', 'E'));
    b.classList.toggle('selected', entry.id === selected);
    b.title = entry.held ? entry.name : `${entry.name} — ${entry.source}`;
    b.addEventListener('click', () => { selected = entry.id; preview.setGear(selected); render(); });
    return b;
  }

  function renderEquipment(profile, h, def) {
    const list = entries(h);
    if (selected === undefined || !list.some((e) => e.id === selected)) selected = h.gear?.id ?? null;
    const wrap = el('div', 'equip');

    // Left: the wielded slot, then the grid.
    const inv = el('div', 'inv');
    inv.appendChild(el('div', 'bgroup', 'Wielding'));
    const worn = el('div', 'slots');
    worn.appendChild(slot(list.find((e) => e.id === (h.gear?.id ?? null)), h, { equipped: true }));
    const wornName = el('div', 'wornname', itemName(h.gear, hero));
    const wornRow = el('div', 'wornrow'); wornRow.append(worn, wornName);
    inv.appendChild(wornRow);
    const held = list.filter((e) => e.held).length;
    const head = el('div', 'bgroup', 'Inventory');
    head.append(el('span', 'pts', ` · ${held} / ${SLOTS}`));
    inv.appendChild(head);
    const grid = el('div', 'slots grid');
    for (const e of list) grid.appendChild(slot(e, h, { equipped: e.id === (h.gear?.id ?? null) }));
    for (let i = list.length; i < SLOTS; i++) grid.appendChild(slot(null, h));
    inv.appendChild(grid);

    // Right: the turntable and what is selected.
    const look = el('div', 'look');
    const stage = el('div', 'stage');
    look.appendChild(stage);
    const e = list.find((x) => x.id === selected) || list[0];
    const detail = el('div', 'detail');
    detail.appendChild(el('strong', null, e.name));
    detail.appendChild(el('div', 'stat', e.tip));
    if (e.held && e.id) {
      const plus = e.plus || 0;
      const bits = [];
      if (plus) bits.push(`+${Math.round(REFINE.atk * plus * 100)}% ATK from refining`);
      if (plus >= REFINE.glowAt) bits.push(`glowing, +${Math.round(REFINE.critDmg * 100)}% crit damage`);
      bits.push(plus >= REFINE.max ? 'fully refined' : `next duplicate → +${plus + 1}`);
      detail.appendChild(el('div', 'stat', bits.join(' · ')));
    }
    if (!e.held) detail.appendChild(el('div', 'src', e.source));
    const isWorn = e.id === (h.gear?.id ?? null);
    const btn = el('button', 'equipbtn', !e.held ? 'Not yet found' : isWorn ? 'Wielding' : 'Equip');
    btn.type = 'button';
    btn.disabled = !e.held || isWorn;
    btn.addEventListener('click', () => { if (setEquip(profile, hero, e.id)) { commit(); render(); } });
    detail.appendChild(btn);
    look.appendChild(detail);

    wrap.append(inv, look);
    body.appendChild(wrap);
    if (preview.ready) preview.mount(stage, hero, selected);
    else stage.appendChild(el('div', 'stagenote', 'Loading models…'));
    note.textContent = 'Tap a slot to preview it on your hero, then Equip. A duplicate drop refines the weapon you hold by +1; from +5 it glows.';
  }

  function open(key, which) {
    if (key) hero = key;
    if (which) tab = which;
    selected = undefined;
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
