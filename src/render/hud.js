// DOM overlay: bars, room label, score/combo, boss bar, skill slots, GO arrow, overlays.
import { SKILL_INFO, PASSIVE_INFO } from '../sim/data/heroes.js';
import { MONSTERS } from '../sim/data/monsters.js';
import { TOWNS } from '../sim/data/dungeon.js';
import { levelFromXp, xpAtLevel, xpToNext } from '../sim/progress.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const el = {
    hud: $('hud'), heroName: $('hero-name'), heroBadge: $('hero-badge'), heroLv: $('hero-lv'), hpFill: $('hp-fill'), hpText: $('hp-text'), mpFill: $('mp-fill'), mpText: $('mp-text'),
    xpBar: $('xp-bar'), xpFill: $('xp-fill'),
    roomName: $('room-name'), roomWave: $('room-wave'), score: $('score-value'), combo: $('combo'), comboCount: $('combo-count'),
    boss: $('boss'), bossName: $('boss-name'), bossFill: $('boss-fill'), go: $('go'), skills: $('skills'), banner: $('banner'),
    title: $('title'), end: $('end'), endTitle: $('end-title'), endStats: $('end-stats'), endProgress: $('end-progress'),
    retry: $('retry'), endContinue: $('end-continue'), endHome: $('end-home'), pause: $('pause'), loading: $('loading'),
    hint: $('hint'), settings: $('settings'),
  };
  let slots = [];
  let lastCombo = 0;
  let lastXp = -1;

  function bindHero(player) {
    el.heroName.textContent = player.def.name;
    lastXp = -1;
    // The passive has no slot of its own; the badge carries it as a tooltip and the title
    // screen blurb names it, and its procs announce themselves in play.
    const pv = player.def.passive && PASSIVE_INFO[player.def.passive.id];
    el.heroName.title = pv ? `${pv.name} — ${pv.tip}` : '';
    el.skills.innerHTML = '';
    slots = player.def.skills.map((id, i) => {
      const info = SKILL_INFO[id];
      const atk = player.def.attacks[id];
      const d = document.createElement('div');
      d.className = 'skill';
      d.title = info.tip;
      d.innerHTML = `<span class="key">${info.key}</span><span class="cost">${atk.mp} MP</span><span class="name">${info.name}</span>`
        + '<div class="cd"></div><span class="cdnum"></span>';
      el.skills.appendChild(d);
      // The touch button for the same skill. On a phone #skills is hidden, so without this
      // there is no cooldown feedback anywhere at all.
      const tb = document.querySelector(`#touch .tbtn.s[data-k="skill${i + 1}"]`);
      if (tb) tb.innerHTML = `<span class="tlabel">${info.name.split(' ')[0]}</span><span class="tcd"></span>`;
      return {
        id, el: d, cd: d.querySelector('.cd'), num: d.querySelector('.cdnum'),
        tb, tcd: tb ? tb.querySelector('.tcd') : null,
        flashT: 0, readyT: 0, wasCd: 0,
      };
    });
  }

  let bannerT = 0;
  function banner(text, cls = '') {
    el.banner.textContent = text;
    el.banner.className = cls;
    el.banner.hidden = false;
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    bannerT = 1.7;
  }

  function onEvent(ev, game) {
    switch (ev.type) {
      case 'wave': if (ev.index > 0) banner(`Wave ${ev.index + 1}`); break;
      case 'roomEnter': {
        // Read the boss's name out of the room's own wave, so swapping the boss in
        // sim/data/dungeon.js is enough and this string never goes stale.
        if (ev.boss) {
          const type = game.dungeon.rooms[ev.index]?.waves?.[0]?.[0]?.type;
          const name = MONSTERS[type]?.name || ev.name;
          setTimeout(() => banner(name, 'boss'), 900);
        } else if (ev.index > 0) banner(ev.name);
        break;
      }
      case 'roomClear': banner(ev.last ? 'Victory' : 'Clear!'); break;
      case 'bossAdds': banner('Reinforcements', 'boss'); break;
      case 'levelUp':
        banner(`Level ${ev.level}`);
        el.heroBadge.classList.remove('pop'); void el.heroBadge.offsetWidth; el.heroBadge.classList.add('pop');
        break;
      case 'comboEnd': break;
    }
  }

  function update(game, dt) {
    for (const ev of game.events) onEvent(ev, game);
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) el.banner.hidden = true; }
    const p = game.player;
    el.hpFill.style.width = `${(100 * p.hp) / p.hpMax}%`;
    el.hpText.textContent = `${Math.ceil(p.hp)} / ${p.hpMax}`;
    el.mpFill.style.width = `${(100 * p.mp) / p.mpMax}%`;
    el.mpText.textContent = `${Math.floor(p.mp)} / ${p.mpMax}`;
    if (game.xp !== lastXp) {
      // Read off the sim's lifetime xp, not the player: the bar is the level's window into it.
      lastXp = game.xp;
      const lv = levelFromXp(game.xp), at = xpAtLevel(lv), need = xpToNext(lv);
      el.heroLv.textContent = `Lv ${lv}`;
      el.xpFill.style.width = `${need ? (100 * (game.xp - at)) / need : 100}%`;
      el.xpBar.title = need ? `${(game.xp - at).toLocaleString()} / ${need.toLocaleString()} XP to level ${lv + 1}` : 'Max level';
    }
    el.roomName.textContent = `${game.roomIndex + 1}. ${game.room.name}`;
    el.roomWave.textContent = game.phase === 'cleared' ? 'CLEARED' : game.waveIndex < 0 ? 'get ready' : `wave ${game.waveIndex + 1} / ${game.room.waves.length}`;
    el.score.textContent = Math.round(game.score).toLocaleString();

    const c = game.combo.count;
    el.combo.classList.toggle('on', c >= 2);
    if (c !== lastCombo) {
      el.comboCount.textContent = c;
      if (c > lastCombo) { el.comboCount.classList.remove('pop'); void el.comboCount.offsetWidth; el.comboCount.classList.add('pop'); }
      lastCombo = c;
    }

    const boss = game.enemies.find((e) => e.boss && !e.dead);
    el.boss.hidden = !boss;
    if (boss) { el.bossName.textContent = boss.name; el.bossFill.style.width = `${(100 * boss.hp) / boss.hpMax}%`; }

    el.go.hidden = !(game.phase === 'cleared' && game.roomIndex < game.dungeon.rooms.length - 1);

    for (const s of slots) {
      const atk = p.def.attacks[s.id];
      const left = Math.max(0, p.cooldowns[s.id] || 0);
      const cd = left > 0 ? left / atk.cd : 0;
      // Driven straight off the sim every frame rather than a CSS transition: a transition
      // would lag the real cooldown and lie about when the skill is actually ready.
      s.el.style.setProperty('--cd', cd.toFixed(4));
      // A buff skill shows how long the buff has left while it is up - that is the number the
      // player is actually managing - and falls back to the cooldown once it has lapsed.
      const buff = atk.buff ? p.buffs?.[atk.buff.id] : null;
      const active = !!buff;
      const label = active ? buff.t.toFixed(0) : left > 0.05 ? (left >= 1 ? left.toFixed(0) : left.toFixed(1)) : '';
      s.num.textContent = label;
      s.el.classList.toggle('active', active);
      if (active) s.el.style.setProperty('--buff', (buff.t / atk.buff.dur).toFixed(4));
      const poor = p.mp < atk.mp;
      s.el.classList.toggle('poor', poor);

      if (s.tb) {
        s.tb.style.setProperty('--cd', cd.toFixed(4));
        s.tb.classList.toggle('poor', poor);
        s.tb.classList.toggle('cooling', cd > 0);
        s.tb.classList.toggle('active', active);
        if (s.tcd) s.tcd.textContent = label;
      }

      // One pulse the moment it comes back, so you can look away from the bar and still
      // notice. Edge-triggered on the frame the cooldown actually reaches zero.
      if (s.wasCd > 0 && cd === 0) s.readyT = 0.45;
      s.wasCd = cd;
      s.readyT = Math.max(0, s.readyT - dt);
      const ready = s.readyT > 0;
      s.el.classList.toggle('ready', ready);
      s.tb?.classList.toggle('ready', ready);

      if (p.state === 'attack' && p.attack === s.id) s.flashT = 0.25;
      s.flashT = Math.max(0, s.flashT - dt);
      s.el.classList.toggle('flash', s.flashT > 0);
    }
  }

  function showTitle(show) { el.title.hidden = !show; }
  // `progress` is what profile.recordRun() returned for this run: xp banked, levels gained,
  // whether a town opened. `next` is the key of the town Continue leads to, or null.
  function showEnd(game, won, progress = null) {
    el.endTitle.textContent = won ? 'Dungeon cleared!' : 'You fell…';
    const mins = Math.floor(game.t / 60), secs = Math.floor(game.t % 60).toString().padStart(2, '0');
    el.endStats.textContent = `${won ? '' : `Reached room ${game.roomIndex + 1}: ${game.room.name}\n`}Score ${Math.round(game.score).toLocaleString()} · ${game.kills} kills · best combo ${game.combo.best} hits\nDamage dealt ${game.stats.damageDealt} · time ${mins}:${secs}`;
    el.endProgress.innerHTML = '';
    const next = progress?.won ? progress.next : null;
    if (progress) {
      const lv = progress.levelAfter > progress.levelBefore
        ? `Lv ${progress.levelBefore} → ${progress.levelAfter} · +${progress.skillPoints} skill point${progress.skillPoints === 1 ? '' : 's'}`
        : `Lv ${progress.levelAfter}`;
      const line = document.createElement('span');
      line.textContent = `+${progress.xpGained.toLocaleString()} XP · ${lv}`;
      el.endProgress.appendChild(line);
      if (progress.unlocked) {
        const u = document.createElement('span');
        u.className = 'unlock';
        u.textContent = `${TOWNS[progress.unlocked].town} unlocked`;
        el.endProgress.appendChild(u);
      }
    }
    el.endContinue.hidden = !next;
    if (next) el.endContinue.textContent = `Continue → ${TOWNS[next].town}`;
    el.retry.textContent = won ? (progress?.tier ? `Play again · NG+${progress.tier}` : 'Play again') : 'Retry';
    el.end.hidden = false;
  }
  function hideEnd() { el.end.hidden = true; }
  function showPause(show) { el.pause.hidden = !show; }
  function setLoading(text) { el.loading.textContent = text; }

  return { el, bindHero, update, showTitle, showEnd, hideEnd, showPause, setLoading, banner };
}
