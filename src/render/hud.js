// DOM overlay: bars, room label, score/combo, boss bar, skill slots, GO arrow, overlays.
import { SKILL_INFO } from '../sim/data/heroes.js';
import { MONSTERS } from '../sim/data/monsters.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const el = {
    hud: $('hud'), heroName: $('hero-name'), hpFill: $('hp-fill'), hpText: $('hp-text'), mpFill: $('mp-fill'), mpText: $('mp-text'),
    roomName: $('room-name'), roomWave: $('room-wave'), score: $('score-value'), combo: $('combo'), comboCount: $('combo-count'),
    boss: $('boss'), bossName: $('boss-name'), bossFill: $('boss-fill'), go: $('go'), skills: $('skills'), banner: $('banner'),
    title: $('title'), end: $('end'), endTitle: $('end-title'), endStats: $('end-stats'), retry: $('retry'), pause: $('pause'), loading: $('loading'),
    hint: $('hint'), settings: $('settings'),
  };
  let slots = [];
  let lastCombo = 0;

  function bindHero(player) {
    el.heroName.textContent = player.def.name;
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
      const label = left > 0.05 ? (left >= 1 ? left.toFixed(0) : left.toFixed(1)) : '';
      s.num.textContent = label;
      const poor = p.mp < atk.mp;
      s.el.classList.toggle('poor', poor);

      if (s.tb) {
        s.tb.style.setProperty('--cd', cd.toFixed(4));
        s.tb.classList.toggle('poor', poor);
        s.tb.classList.toggle('cooling', cd > 0);
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
  function showEnd(game, won) {
    el.endTitle.textContent = won ? 'Dungeon cleared!' : 'You fell…';
    const mins = Math.floor(game.t / 60), secs = Math.floor(game.t % 60).toString().padStart(2, '0');
    el.endStats.textContent = `${won ? '' : `Reached room ${game.roomIndex + 1}: ${game.room.name}\n`}Score ${Math.round(game.score).toLocaleString()} · ${game.kills} kills · best combo ${game.combo.best} hits\nDamage dealt ${game.stats.damageDealt} · time ${mins}:${secs}`;
    el.end.hidden = false;
  }
  function hideEnd() { el.end.hidden = true; }
  function showPause(show) { el.pause.hidden = !show; }
  function setLoading(text) { el.loading.textContent = text; }

  return { el, bindHero, update, showTitle, showEnd, hideEnd, showPause, setLoading, banner };
}
