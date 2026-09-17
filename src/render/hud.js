// DOM overlay: bars, room label, score/combo, boss bar, skill slots, GO arrow, overlays.
import { SKILL_INFO } from '../sim/data/heroes.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const el = {
    hud: $('hud'), heroName: $('hero-name'), hpFill: $('hp-fill'), hpText: $('hp-text'), mpFill: $('mp-fill'), mpText: $('mp-text'),
    roomName: $('room-name'), roomWave: $('room-wave'), score: $('score-value'), combo: $('combo'), comboCount: $('combo-count'),
    boss: $('boss'), bossName: $('boss-name'), bossFill: $('boss-fill'), go: $('go'), skills: $('skills'), banner: $('banner'),
    title: $('title'), end: $('end'), endTitle: $('end-title'), endStats: $('end-stats'), retry: $('retry'), pause: $('pause'), loading: $('loading'),
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
      d.innerHTML = `<span class="key">${info.key}</span><span class="cost">${atk.mp} MP</span><span class="name">${info.name}</span><div class="cd"></div>`;
      el.skills.appendChild(d);
      return { id, el: d, cd: d.querySelector('.cd'), flashT: 0 };
    });
    // touch skill buttons show the skill's name
    document.querySelectorAll('#touch .tbtn.s').forEach((b, i) => { const id = player.def.skills[i]; if (id) b.textContent = SKILL_INFO[id].name.split(' ')[0]; });
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
      case 'roomEnter': if (ev.boss) setTimeout(() => banner('Orc Lord', 'boss'), 900); else if (ev.index > 0) banner(ev.name); break;
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
      const cd = p.cooldowns[s.id] > 0 ? p.cooldowns[s.id] / atk.cd : 0;
      s.cd.style.height = `${cd * 100}%`;
      s.el.classList.toggle('poor', p.mp < atk.mp);
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
