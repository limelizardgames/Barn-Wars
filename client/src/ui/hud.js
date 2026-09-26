// DOM heads-up display.
import { getAnimal, MOVE_SLOTS } from '../../../shared/animals.js';
import { ANIMAL_EMOJI } from '../assets/animals.js';
import { SCORE_LIMIT } from '../../../shared/constants.js';

const $ = (id) => document.getElementById(id);

const MOVE_ICONS = {
  melee: '💥', projectile: '🎯', dash: '💨', leap: '🦘', shout: '📢', buff: '✨',
};
const KEY_LABELS = { primary: 'LMB', ability1: 'RMB/Q', ability2: 'E' };

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class Hud {
  constructor() {
    this.root = $('hud');
    this.hpFill = $('hp-fill');
    this.hpText = $('hp-text');
    this.playerName = $('player-name');
    this.status = $('status-icons');
    this.abilities = $('abilities');
    this.timer = $('match-timer');
    this.matchSub = $('match-sub');
    this.killfeed = $('killfeed');
    this.announceEl = $('announce');
    this.hitmarker = $('hitmarker');
    this.vignette = $('vignette');
    this.dmgLayer = $('damage-numbers');
    this.scoreboard = $('scoreboard');
    this.death = $('death-screen');
    this.deathTitle = $('death-title');
    this.deathSub = $('death-sub');
    this.respawnCount = $('respawn-count');
    this.chatLog = $('chat-log');
    this.chatInput = $('chat-input');
    this.pause = $('pause');
    this.swapPanel = $('swap-panel');
    this.numbers = [];
    this.animal = null;
    this.abilityEls = {};
    this.announceTimer = null;
    this.scoreboardForced = false;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setAnimal(id, name) {
    if (this.animal === id && this.name === name) return;
    this.animal = id;
    this.name = name;
    const def = getAnimal(id);
    this.playerName.textContent = `${ANIMAL_EMOJI[id]} ${name} — ${def.title}`;
    this.abilities.innerHTML = '';
    this.abilityEls = {};
    for (const slot of MOVE_SLOTS) {
      const m = def[slot];
      const el = document.createElement('div');
      el.className = 'ab ready';
      el.title = `${m.name}: ${m.description}`;
      el.innerHTML = `<span class="key">${KEY_LABELS[slot]}</span><span class="ico">${MOVE_ICONS[m.type]}</span><span>${escapeHtml(m.name)}</span><div class="cd-mask"></div><div class="cd-text"></div>`;
      this.abilities.appendChild(el);
      this.abilityEls[slot] = { el, mask: el.querySelector('.cd-mask'), text: el.querySelector('.cd-text'), max: m.cooldown };
    }
  }

  updatePlayer(me, cooldowns) {
    const def = getAnimal(me.animal);
    const k = Math.max(0, me.hp / def.stats.maxHp);
    this.hpFill.style.width = `${k * 100}%`;
    this.hpFill.style.background = k > 0.3 ? 'var(--hp)' : 'var(--hp-low)';
    this.hpText.textContent = `${Math.max(0, Math.ceil(me.hp))} / ${def.stats.maxHp}`;

    const icons = [];
    if (me.stunT > 0) icons.push('<span>💫 Stunned</span>');
    if (me.slowT > 0) icons.push('<span>🐌 Slowed</span>');
    if (me.shieldT > 0) icons.push('<span>🛡️ Shielded</span>');
    if (me.speedT > 0) icons.push('<span>⚡ Galloping</span>');
    if (me.glideT > 0) icons.push('<span>🪶 Gliding</span>');
    if (me.prot) icons.push('<span>✨ Spawn shield</span>');
    const html = icons.join('');
    if (html !== this._statusHtml) { this.status.innerHTML = html; this._statusHtml = html; }

    MOVE_SLOTS.forEach((slot, i) => {
      const a = this.abilityEls[slot];
      if (!a) return;
      const cd = cooldowns[i];
      const frac = Math.min(1, cd / a.max);
      a.mask.style.height = `${frac * 100}%`;
      a.text.textContent = cd > 0.05 && a.max > 1 ? Math.ceil(cd) : '';
      a.el.className = `ab ${cd > 0.05 ? 'cooling' : 'ready'}`;
    });
  }

  updateMatch(match, playersCount, room, ping) {
    const t = Math.max(0, match.timeLeft);
    const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
    if (match.state === 'playing') {
      this.timer.textContent = `${mm}:${ss}`;
      this.matchSub.textContent = `First to ${SCORE_LIMIT} · Room "${room}" · ${playersCount} fighters · ${ping}ms`;
    } else {
      this.timer.textContent = `Next match in ${t}`;
      this.matchSub.textContent = match.winner ? `${match.winner.name} wins!` : 'Match over';
    }
  }

  killfeedAdd(killer, victim, move, involvesMe) {
    const el = document.createElement('div');
    el.className = `kf${involvesMe ? ' me' : ''}`;
    if (killer) {
      el.innerHTML = `${ANIMAL_EMOJI[killer.animal] || ''} ${escapeHtml(killer.name)}<span class="mv">${escapeHtml(move || 'bonked')}</span>${ANIMAL_EMOJI[victim.animal] || ''} ${escapeHtml(victim.name)}`;
    } else {
      el.innerHTML = `${ANIMAL_EMOJI[victim.animal] || ''} ${escapeHtml(victim.name)}<span class="mv">tripped over</span>`;
    }
    this.killfeed.prepend(el);
    while (this.killfeed.children.length > 6) this.killfeed.lastChild.remove();
    setTimeout(() => el.remove(), 7000);
  }

  announce(text, ms = 1600) {
    this.announceEl.textContent = text;
    this.announceEl.classList.add('show');
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => this.announceEl.classList.remove('show'), ms);
  }

  hitmark() {
    this.hitmarker.classList.add('show');
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => this.hitmarker.classList.remove('show'), 60);
  }

  hurt(amount) {
    this.vignette.style.transition = 'none';
    this.vignette.style.opacity = Math.min(0.9, 0.25 + amount / 60);
    requestAnimationFrame(() => {
      this.vignette.style.transition = 'opacity 0.5s';
      this.vignette.style.opacity = 0;
    });
  }

  damageNumber(pos, text, cls) {
    const el = document.createElement('div');
    el.className = `dmg ${cls || ''}`;
    el.textContent = text;
    this.dmgLayer.appendChild(el);
    this.numbers.push({ el, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 30 });
    if (this.numbers.length > 40) this.numbers.shift().el.remove();
  }

  updateNumbers(dt, camera, width, height) {
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t += dt;
      if (n.t > 0.9) { n.el.remove(); this.numbers.splice(i, 1); continue; }
      const p = n.pos.clone();
      p.y += n.t * 1.5;
      p.project(camera);
      if (p.z > 1) { n.el.style.display = 'none'; continue; }
      n.el.style.display = '';
      n.el.style.left = `${(p.x * 0.5 + 0.5) * width + n.dx * n.t}px`;
      n.el.style.top = `${(-p.y * 0.5 + 0.5) * height}px`;
      n.el.style.opacity = String(1 - Math.max(0, n.t - 0.5) / 0.4);
    }
  }

  showScoreboard(on, players, myId, match) {
    const visible = on || this.scoreboardForced;
    this.scoreboard.classList.toggle('hidden', !visible);
    if (!visible) return;
    const sorted = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const title = match && match.state === 'intermission' && match.winner
      ? `🏆 ${escapeHtml(match.winner.name)} the ${escapeHtml(getAnimal(match.winner.animal).name)} wins!`
      : 'Scoreboard';
    const rows = sorted.map((p) => `<tr class="${p.id === myId ? 'me' : ''}">
      <td>${ANIMAL_EMOJI[p.animal] || ''} ${escapeHtml(p.name)}${p.bot ? ' <small>(bot)</small>' : ''}</td>
      <td class="num">${p.kills}</td><td class="num">${p.deaths}</td><td class="num">${p.streak || 0}</td></tr>`).join('');
    const html = `<h2>${title}</h2><table><tr><th>Fighter</th><th class="num">Kills</th><th class="num">Deaths</th><th class="num">Streak</th></tr>${rows}</table>`;
    if (html !== this._sbHtml) { this.scoreboard.innerHTML = html; this._sbHtml = html; }
  }

  showDeath(on, title, sub, respawnT) {
    this.death.classList.toggle('hidden', !on);
    if (!on) return;
    if (title) this.deathTitle.textContent = title;
    if (sub !== undefined) this.deathSub.textContent = sub;
    this.respawnCount.textContent = respawnT > 0 ? `Respawning in ${Math.ceil(respawnT)}…` : 'Waiting for the next match…';
  }

  chat(name, text, system = false) {
    const el = document.createElement('div');
    el.innerHTML = system ? `<i>${escapeHtml(text)}</i>` : `<b>${escapeHtml(name)}:</b> ${escapeHtml(text)}`;
    this.chatLog.appendChild(el);
    while (this.chatLog.children.length > 8) this.chatLog.firstChild.remove();
    setTimeout(() => el.classList.add('fade'), 9000);
    setTimeout(() => el.remove(), 10500);
  }
}
