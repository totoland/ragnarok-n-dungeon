// Write docs/items.md from the game's own data.
//
// Every table in it - what a thing does, who drops it, how often, whether it has a model -
// already exists somewhere in src/ or in an exported GLB's meta.json, so writing the page by
// hand would mean keeping a second copy of all of it in step. This reads the first copy.
//
//   npm run docs        rewrite docs/items.md
//   npm run docs -- -c  check it is current, and fail if it is not (tests/items.test.js)
//
// Nothing here is a judgement about balance; it reports the numbers as they are.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS, ATTRS, ATTR_IDS, SLOT_INFO, itemMods } from '../src/sim/data/items.js';
import { TOWNS } from '../src/sim/data/dungeon.js';
import { MONSTERS } from '../src/sim/data/monsters.js';
import { REFINE } from '../src/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'items.md');

// ---------------------------------------------------------------- models

// A worn thing has a model of its own when the exporter made one for it: its own GLB in
// assets/gear (hats, and weapons since the Under Water Sword), or - for the Katana alone,
// which predates that - a `weapon_<id>` node baked into the hero holding it.
function modelIndex() {
  const read = (p) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return {}; } };
  const nodes = new Set();
  for (const hero of Object.values(read('assets/heroes/meta.json'))) for (const k of Object.keys(hero.parts || {})) nodes.add(k);
  const own = new Set(Object.keys(read('assets/gear/meta.json')));
  return (id, slot) => own.has(id) || nodes.has(`${slot}_${id}`);
}
const hasModel = modelIndex();
// A weapon with no model of its own still shows one - the hero's own, the same in every town.
// A hat with none shows nothing at all, which is the gap worth telling apart.
const modelCell = (id, slot) => (hasModel(id, slot) ? 'yes'
  : slot === 'weapon' ? 'no — shows the hero’s own weapon'
  : slot === 'hat' ? 'no — nothing appears'
  : slot === 'cape' ? 'no — the knight keeps his own cape, the hunter has no cape node at all'
  : 'no');

// ---------------------------------------------------------------- drops

// Who drops what. A town's `loot` is the boss payout, one weapon per class, always; a
// monster's `drops` is its own table, each entry rolled on its own.
function dropIndex() {
  const out = new Map();                       // item id -> [{town, from, chance}]
  const add = (id, row) => out.set(id, [...(out.get(id) || []), row]);
  for (const t of Object.values(TOWNS)) {
    for (const [hero, id] of Object.entries(t.loot)) {
      const boss = bossOf(t);
      add(id, { town: t.town, from: `${MONSTERS[boss]?.name ?? boss} (boss, ${hero})`, chance: 1 });
    }
    for (const type of typesIn(t)) for (const d of MONSTERS[type]?.drops || []) {
      add(d.item, { town: t.town, from: MONSTERS[type].name, chance: d.chance });
    }
  }
  return out;
}
const typesIn = (t) => [...new Set(t.rooms.flatMap((r) => r.waves.flat().map((g) => g.type)))];
const bossOf = (t) => typesIn(t).find((ty) => MONSTERS[ty]?.boss);
const drops = dropIndex();
const pct = (c) => (c >= 1 ? 'always' : `${+(c * 100).toFixed(2)}%`);
const sourceCell = (id) => (drops.get(id) || []).map((d) => `${d.from} · ${pct(d.chance)}`).join('<br>') || '— not dropped by anything —';
const townOf = (id) => [...new Set((drops.get(id) || []).map((d) => d.town))].join(', ') || '—';

// ---------------------------------------------------------------- effects

// What a mod set does, in the words the game uses for it. `tip` is what the player is shown,
// so it leads; the raw keys follow, because that is what you grep for in src/.
const rawMods = (m) => Object.entries(m).map(([k, v]) => `${k} ${v}`).join(', ');

const table = (head, rows) => [
  `| ${head.join(' | ')} |`,
  `|${head.map(() => '---').join('|')}|`,
  ...rows.map((r) => `| ${r.join(' | ')} |`),
].join('\n');

const bySlot = (slot) => Object.entries(ITEMS).filter(([, it]) => it.slot === slot);

// ---------------------------------------------------------------- page

const L = [];
L.push('# Items');
L.push('');
L.push('_Generated from the game data by `tools/items_doc.mjs` — do not edit by hand._');
L.push('_Run `npm run docs` after changing `src/sim/data/items.js`, a monster\'s `drops`, a town\'s `loot`, or re-exporting a model._');
L.push('');
L.push(`Slots: ${Object.entries(SLOT_INFO).map(([k, s]) => `**${s.name}** (\`${k}\`)`).join(' · ')}. One of each is worn at a time.`);
L.push('');

// ---- weapons
L.push('## Weapons');
L.push('');
L.push('Every town boss pays one per class, always, and a duplicate refines the held one instead of stacking.');
L.push('ATK is flat and on one curve across the towns.');
L.push('');
L.push(table(['Item', 'Town', 'Class', 'ATK', 'Effect', 'Model', 'From'],
  bySlot('weapon')
    .sort((a, b) => (a[1].mods.atkAdd || 0) - (b[1].mods.atkAdd || 0))
    .map(([id, it]) => [
      `**${it.name}${it.slots ? ` [${it.slots}]` : ''}**<br>\`${id}\``, townOf(id), it.hero, it.mods.atkAdd ?? '—',
      it.tip, modelCell(id, 'weapon'), sourceCell(id),
    ])));
L.push('');

// ---- hats and capes
for (const slot of ['hat', 'cape']) {
  L.push(`## ${SLOT_INFO[slot].name}s`);
  L.push('');
  L.push(table(['Item', 'Town', 'Effect', 'Model', 'From'],
    bySlot(slot).map(([id, it]) => [
      `**${it.name}**<br>\`${id}\``, townOf(id), it.tip, modelCell(id, slot), sourceCell(id),
    ])));
  L.push('');
}

// ---- accessories
L.push('## Accessories');
L.push('');
L.push('No model, and no refine. Every drop is rolled on the run\'s own rng: a main attribute fixed by the kind,');
L.push('at a value from its range, plus one secondary from the pool the kind allows.');
L.push('');
L.push('**An accessory that names no `secondary` draws from the whole pool** (`rollItem`: `def.secondary || ATTR_IDS`),');
L.push(`which means a common Ring can roll Undertow, Auto Meteor, Auto Cold Bolt, Double Attack or SP Drain as its`);
L.push(`second attribute, at about ${(100 / (ATTR_IDS.length - 1)).toFixed(1)}% each - and can roll \`atkHi\` (+5 - +15 ATK), which is five times its own main.`);
L.push('Only Orvane\'s three charms narrow it.');
L.push('');
L.push(table(['Item', 'Town', 'Main', 'Secondary pool', 'Rarity', 'From'],
  bySlot('accessory').map(([id, it]) => [
    `**${it.name}**<br>\`${id}\``, townOf(id),
    `${ATTRS[it.main].name} ${attrRange(it.main)}`,
    poolCell(it),
    it.rarity || '—', sourceCell(id),
  ])));
L.push('');

L.push('### The attribute pool');
L.push('');
L.push(table(['Attribute', 'Key in `mods`', 'Range', 'How it combines', 'Can be rolled by'],
  Object.entries(ATTRS).map(([id, a]) => [
    `${a.name}<br>\`${id}\``, `\`${a.key}\``, attrRange(id),
    a.mult ? 'multiplies' : 'sums across everything worn',
    rolledBy(id),
  ])));
L.push('');

// The pool rollItem will actually draw from for one accessory - the same expression it uses.
function poolOf(it) { return (it.secondary || ATTR_IDS).filter((k) => k !== it.main); }
function poolCell(it) {
  const pool = poolOf(it);
  return it.secondary ? pool.map((s) => ATTRS[s].name).join(', ') : `the whole pool — any of ${pool.length}`;
}
// Which accessories can put a given attribute on a hero, as a main or as a secondary.
function rolledBy(attr) {
  const main = bySlot('accessory').filter(([, it]) => it.main === attr).map(([, it]) => `${it.name} (main)`);
  const sub = bySlot('accessory').filter(([, it]) => poolOf(it).includes(attr)).map(([, it]) => it.name);
  const all = [...main, ...sub];
  return all.length ? all.join(', ') : '**nothing — unreachable**';
}

function attrRange(id) {
  const a = ATTRS[id];
  const f = (v) => (a.flat ? `+${v}` : `${+(v * 100).toFixed(1)}%`);
  return a.min === a.max ? f(a.min) : `${f(a.min)} – ${f(a.max)}`;
}

// ---- refine
L.push('## Refine');
L.push('');
L.push(`A duplicate of something already held refines it by +1, up to **+${REFINE.max}**, where further copies are lost.`);
L.push(`A weapon gains **${+(REFINE.atk * 100).toFixed(0)}% of its own ATK per level**; at **+${REFINE.glowAt}** and above it also gains`);
L.push(`a one-off **×${(1 + REFINE.critDmg).toFixed(2)} crit damage** (it does not grow past that), and the blade starts to glow.`);
L.push(`Anything worn that is not a weapon gains **+${+(REFINE.hp * 100).toFixed(0)}% HP per level** instead.`);
L.push('');
const refineRows = bySlot('weapon').sort((a, b) => (a[1].mods.atkAdd || 0) - (b[1].mods.atkAdd || 0));
L.push(table(['Weapon', '+0', `+${REFINE.glowAt}`, `+${REFINE.max}`],
  refineRows.map(([id, it]) => [
    it.name,
    String(it.mods.atkAdd ?? '—'),
    String(round(itemMods({ id, plus: REFINE.glowAt }).atkAdd)),
    String(round(itemMods({ id, plus: REFINE.max }).atkAdd)),
  ])));
L.push('');
function round(v) { return v == null ? '—' : Math.round(v * 100) / 100; }

// ---- procs
L.push('## What the rates actually do');
L.push('');
L.push('These are the `*Add` attributes above, summed across the weapon and everything worn, then rolled once per');
L.push('landed hit off the run\'s rng (`sim/game.js` `rollGearProcs`) — so a proc is as reproducible as a crit.');
L.push('Each is capped at 50%, and none of them can roll off a hit that one of them caused.');
L.push('');
L.push(table(['Rate', 'What lands', 'Notes'], [
  ['Auto Meteor', 'A meteor falls on the spot 0.55 s later, for 10% of ATK as magic', 'Hits everything within 1.6 × 1.1 units of where it lands. Never crits, never knocks.'],
  ['Auto Cold Bolt', 'A shaft of ice, 0.32 s later, for 10% of ATK as magic', 'The same spell through a narrower hole: 0.9 × 0.8 units. Never crits, never knocks.'],
  ['Double Attack', 'The same blow lands a second time', 'Same damage roll, no knockback of its own, and nothing if the first one killed.'],
  ['SP Drain', '1% of max SP back', 'On the hit, not the kill.'],
  ['Undertow', 'A reversed knockback of 6 ÷ mass, plus 0.2 s of stun', 'No damage. A boss (mass ≥ 3) keeps its hyper armour, so it takes the shove and not the stun.'],
]));
L.push('');
L.push('Undertow\'s shove decays against the enemy step\'s own friction, so how far something is actually dragged');
L.push('depends entirely on its mass:');
L.push('');
L.push(table(['Target', 'Mass', 'Dragged'], pullRows()));
L.push('');
function pullRows() {
  const slide = (v0) => { let x = 0, v = v0, dt = 1 / 60; for (let i = 0; i < 600 && Math.abs(v) >= 0.05; i++) { x += v * dt; v *= Math.max(0, 1 - 7 * dt); } return x; };
  const seen = new Map();
  for (const [key, m] of Object.entries(MONSTERS)) if (!seen.has(m.mass)) seen.set(m.mass, { key, m });
  return [...seen.values()]
    .sort((a, b) => a.m.mass - b.m.mass)
    .map(({ key, m }) => [`${m.name}${m.boss ? ' (boss)' : ''}<br>\`${key}\``, m.mass, `${slide(6 / Math.max(0.35, m.mass)).toFixed(2)} units`]);
}

// ---- drops by town
L.push('## Who drops what');
L.push('');
for (const t of Object.values(TOWNS)) {
  const boss = bossOf(t);
  L.push(`### ${t.town} — ${t.name}`);
  L.push('');
  L.push(`Boss: **${MONSTERS[boss]?.name ?? boss}**, who pays ${Object.entries(t.loot).map(([h, id]) => `${ITEMS[id].name} (${h})`).join(' / ')} every time.`);
  L.push('');
  const rows = [];
  for (const type of typesIn(t)) {
    const m = MONSTERS[type];
    for (const d of m.drops || []) rows.push([m.name, `${ITEMS[d.item].name} (\`${d.item}\`)`, SLOT_INFO[ITEMS[d.item].slot].name, pct(d.chance)]);
  }
  L.push(rows.length ? table(['Monster', 'Drops', 'Slot', 'Chance'], rows) : '_Its monsters have no drop tables; the boss\'s weapon is the whole of it._');
  L.push('');
}

// ---- gaps
L.push('## Gaps');
L.push('');
const noModel = Object.entries(ITEMS).filter(([id, it]) => it.slot !== 'accessory' && !hasModel(id, it.slot));
const undropped = Object.entries(ITEMS).filter(([id]) => !drops.has(id));
L.push(`**${noModel.length} of ${Object.keys(ITEMS).length - bySlot('accessory').length} worn things have no model of their own** (accessories are excluded — they are meant to have none):`);
L.push('');
L.push(noModel.map(([id, it]) => `- ${it.name} (\`${id}\`, ${SLOT_INFO[it.slot].name.toLowerCase()}) — ${modelCell(id, it.slot).replace(/^no — /, '')}`).join('\n'));
L.push('');
if (undropped.length) {
  L.push('**Nothing drops these:**');
  L.push('');
  L.push(undropped.map(([id, it]) => `- ${it.name} (\`${id}\`)`).join('\n'));
  L.push('');
}
const unrollable = Object.keys(ATTRS).filter((a) => !bySlot('accessory').some(([, it]) => it.main === a || poolOf(it).includes(a)));
L.push(unrollable.length
  ? `**Attributes nothing can roll:** ${unrollable.map((a) => `${ATTRS[a].name} (\`${a}\`)`).join(', ')} — in the pool, but no accessory reaches them.`
  : '**Every attribute in the pool is reachable.** The five common accessories name no `secondary`, so each of them can roll any of the others.');
L.push('');
const noMain = Object.keys(ATTRS).filter((a) => !bySlot('accessory').some(([, it]) => it.main === a));
L.push(`**Attributes no accessory carries as its _main_:** ${noMain.map((a) => `${ATTRS[a].name} (\`${a}\`)`).join(', ')} — reachable only as a second roll, so never at a chosen value.`);
L.push('');

const page = L.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';

if (process.argv.includes('-c') || process.argv.includes('--check')) {
  const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (have !== page) {
    console.error('docs/items.md is out of date - run `npm run docs`');
    process.exit(1);
  }
  console.log('docs/items.md is current');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, page);
  console.log(`wrote docs/items.md (${Object.keys(ITEMS).length} items, ${page.split('\n').length} lines)`);
}
