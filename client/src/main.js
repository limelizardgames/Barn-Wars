import { io } from 'socket.io-client';
import { ANIMAL_IDS, ANIMALS } from '../../shared/animals.js';
import { ANIMAL_EMOJI } from './assets/animals.js';
import { Menu } from './ui/menu.js';
import { Hud } from './ui/hud.js';
import { Game } from './game/Game.js';
import { initAudio, sfx } from './game/audio.js';
import { preloadAnimalModels } from './assets/rig.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

const menuEl = $('menu');
const nameInput = $('name-input');
const roomInput = $('room-input');
const playBtn = $('play-btn');
const errorEl = $('menu-error');
const hud = new Hud();

let chosen = store.get('bw-animal', 'cow');
if (!ANIMALS[chosen]) chosen = 'cow';
nameInput.value = store.get('bw-name', '');
const params = new URLSearchParams(location.search);
roomInput.value = params.get('room') || store.get('bw-room', '');

const menu = new Menu({ onSelect: (id) => { chosen = id; store.set('bw-animal', id); } });
menu.select(chosen);
// swap the preview to the sculpted model once the models have downloaded
preloadAnimalModels().then(() => menu.showModel(menu.selected));

let game = null;

function showMenu(error = '') {
  menuEl.classList.remove('hidden');
  hud.hide();
  playBtn.disabled = false;
  errorEl.textContent = error;
  menu.setPaused(false);
}

function play() {
  initAudio();
  sfx.ui();
  const name = nameInput.value.trim();
  const room = roomInput.value.trim();
  store.set('bw-name', name);
  store.set('bw-room', room);
  playBtn.disabled = true;
  errorEl.textContent = 'Heading to the barnyard…';

  const socket = io({ transports: ['websocket', 'polling'], reconnection: false, timeout: 8000 });
  socket.on('connect_error', () => {
    socket.disconnect();
    showMenu('Could not reach the farm server. Is it running?');
  });
  socket.on('connect', () => {
    socket.emit('join', { name, animal: chosen, room }, (res) => {
      if (!res || !res.ok) {
        socket.disconnect();
        showMenu(res?.error || 'Could not join.');
        return;
      }
      errorEl.textContent = '';
      menuEl.classList.add('hidden');
      menu.setPaused(true);
      hud.show();
      if (room) history.replaceState(null, '', `?room=${encodeURIComponent(res.room)}`);
      game = new Game({
        canvas: $('game'),
        socket,
        welcome: res,
        hud,
        onLeave: () => { game = null; showMenu(); },
      });
      window.__barnWars = game; // handy for debugging from the console
      buildSwapPanel(socket);
    });
  });
}

function buildSwapPanel(socket) {
  const panel = hud.swapPanel;
  panel.innerHTML = '<h3>Choose your next animal</h3>';
  for (const id of ANIMAL_IDS) {
    const b = document.createElement('button');
    b.className = 'animal-card';
    b.innerHTML = `<span class="emoji">${ANIMAL_EMOJI[id]}</span><span class="nm">${ANIMALS[id].name}</span>`;
    b.onclick = () => {
      chosen = id;
      store.set('bw-animal', id);
      socket.emit('changeAnimal', id);
      panel.classList.add('hidden');
      hud.announce(`${ANIMALS[id].name} selected — takes effect on respawn`, 1500);
      sfx.call(id, 0.6);
    };
    panel.appendChild(b);
  }
}

playBtn.addEventListener('click', play);
nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') play(); });
roomInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') play(); });

const openSwap = () => hud.swapPanel.classList.toggle('hidden');
$('swap-btn').addEventListener('click', openSwap);
$('pause-swap-btn').addEventListener('click', openSwap);
$('leave-btn').addEventListener('click', () => game && game.leave());
