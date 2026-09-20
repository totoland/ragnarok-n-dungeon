// The character panel: what the profile knows about a hero, and the two things the player
// does with it between runs - wield a weapon and spend skill points. Owns no game state: it
// edits the profile, persists it, and calls back so the title can redraw its labels.
import { HEROES, SKILL_INFO, PASSIVE_INFO } from '../sim/data/heroes.js';
import { ITEMS, itemName } from '../sim/data/items.js';
import { MONSTERS } from '../sim/data/monsters.js';
import { TOWNS } from '../sim/data/dungeon.js';
import { xpAtLevel, xpToNext } from '../sim/progress.js';
import { heroOf, skillPointsLeft, spendSkillPoint, setEquip, saveProfile } from '../profile.js';
import { SKILL, REFINE } from '../config.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function createCharacterUI({ input, getProfile, onChange }) {
  const root = $('character');
  const body = $('character-body');
  const title = $('character-title');
  const note = $('character-note');
  let hero = 'knight';

  const commit = () => { saveProfile(getProfile()); onChange?.(); };

  function render() {
    const profile = getProfile();
    const h = heroOf(profile, hero);
    const def = HEROES[hero];
    const left = skillPointsLeft(profile, hero);
    title.textContent = `Profile — ${def.name} · Lv ${h.level}`;
    body.innerHTML = '';

    // XP
    const at = xpAtLevel(h.level), need = xpToNext(h.level);
    const xp = el('div', 'cxp');
    const bar = el('div', 'cxpbar'); const fill = el('div', 'fill'); bar.appendChild(fill);
    fill.style.width = `${need ? (100 * (h.xp - at)) / need : 100}%`;
    xp.append(bar, el('span', 'cxptext', need ? `${(h.xp - at).toLocaleString()} / ${need.toLocaleString()} XP to level ${h.level + 1}` : 'Max level'));
    body.appendChild(xp);

    // Weapon: every weapon a town drops for this class, held or not, so the player can see
    // where the next one comes from.
    body.appendChild(el('div', 'bgroup', 'Weapon'));
    const chips = el('div', 'chips');
    const bare = el('button', `chip${h.gear ? '' : ' on'}`);
    bare.type = 'button';
    bare.append(el('strong', null, 'Bare hands'), el('em', null, 'No weapon'));
    bare.addEventListener('click', () => { setEquip(profile, hero, null); commit(); render(); });
    chips.appendChild(bare);
    for (const [key, town] of Object.entries(TOWNS)) {
      const id = town.loot?.[hero];
      if (!id || !ITEMS[id]) continue;
      const held = h.items[id];
      const chip = el('button', `chip${held ? '' : ' locked'}${h.gear?.id === id ? ' on' : ''}`);
      chip.type = 'button';
      const last = town.rooms[town.rooms.length - 1];
      const boss = MONSTERS[last.waves?.[0]?.[0]?.type]?.name || last.name;
      chip.append(
        el('strong', null, held ? itemName({ id, plus: held.plus }) : ITEMS[id].name),
        el('em', null, held ? ITEMS[id].tip : `Drops from ${boss} · ${town.town}`),
      );
      if (held && held.plus >= REFINE.glowAt) chip.classList.add('glow');
      if (held) chip.addEventListener('click', () => { setEquip(profile, hero, id); commit(); render(); });
      else chip.disabled = true;
      chips.appendChild(chip);
    }
    body.appendChild(chips);
    body.appendChild(el('p', 'tip', `A duplicate drop refines the weapon you hold by +1 (+${Math.round(REFINE.atk * 100)}% ATK each); from +${REFINE.glowAt} it glows and crits deal ${Math.round(REFINE.critDmg * 100)}% more.`));

    // Skills
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
    note.textContent = 'Tap a weapon to wield it, + to raise a skill. Both take effect at once, even mid-run. One skill point per level; points stay where you put them.';
  }

  function open(key) {
    if (key) hero = key;
    render();
    root.hidden = false;
    input.setEnabled(false);
  }
  function close() {
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

  return { open, close, render, get isOpen() { return !root.hidden; } };
}
