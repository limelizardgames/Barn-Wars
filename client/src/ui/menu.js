// Main menu: animal roster, stats, moves, and a spinning 3D preview.
import * as THREE from 'three';
import { ANIMALS, ANIMAL_IDS, MOVE_SLOTS } from '../../../shared/animals.js';
import { buildAnimal, ANIMAL_EMOJI } from '../assets/animals.js';
import { escapeHtml } from './hud.js';
import { sfx } from '../game/audio.js';

const KEYS = { primary: 'LMB', ability1: 'RMB / Q', ability2: 'E' };

// normalise stats for the bars
const max = (k) => Math.max(...ANIMAL_IDS.map((id) => ANIMALS[id].stats[k]));
const STAT_BARS = [
  ['Health', 'maxHp'],
  ['Speed', 'speed'],
  ['Jump', 'jump'],
];

export class Menu {
  constructor({ onSelect }) {
    this.onSelect = onSelect;
    this.roster = document.getElementById('roster');
    this.info = document.getElementById('animal-info');
    this.canvas = document.getElementById('preview');
    this.selected = null;
    this.buildRoster();
    this.initPreview();
  }

  buildRoster() {
    for (const id of ANIMAL_IDS) {
      const a = ANIMALS[id];
      const btn = document.createElement('button');
      btn.className = 'animal-card';
      btn.dataset.id = id;
      btn.innerHTML = `<span class="emoji">${ANIMAL_EMOJI[id]}</span><span class="nm">${a.name}</span><br><span class="role">${a.role}</span>`;
      btn.addEventListener('click', () => { this.select(id); sfx.call(id, 0.6); });
      this.roster.appendChild(btn);
    }
  }

  select(id) {
    this.selected = id;
    for (const el of this.roster.children) el.classList.toggle('selected', el.dataset.id === id);
    const a = ANIMALS[id];
    const bars = STAT_BARS.map(([label, k]) => `<div class="stat-row"><span>${label}</span><div class="stat-bar"><div style="width:${(a.stats[k] / max(k)) * 100}%"></div></div></div>`).join('');
    const moves = MOVE_SLOTS.map((slot) => {
      const m = a[slot];
      return `<div class="move"><span class="key">${KEYS[slot]}</span><b>${escapeHtml(m.name)}</b> <small>(${m.cooldown}s)</small><br>${escapeHtml(m.description)}</div>`;
    }).join('');
    this.info.innerHTML = `
      <h2>${ANIMAL_EMOJI[id]} ${a.name}<small>${escapeHtml(a.title)} · ${a.role}</small></h2>
      <p class="blurb">${escapeHtml(a.blurb)}</p>
      ${bars}
      <div class="moves">
        <div class="move power"><span class="key">POWER</span><b>${escapeHtml(a.power.name)}</b><br>${escapeHtml(a.power.description)}</div>
        ${moves}
      </div>`;
    this.showModel(id);
    if (this.onSelect) this.onSelect(id);
  }

  initPreview() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    } catch {
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 2, 0.1, 100);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#6a8f4a', 1.4));
    const sun = new THREE.DirectionalLight('#fff4dd', 2);
    sun.position.set(3, 6, 4);
    this.scene.add(sun);
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 2, 0.3, 24),
      new THREE.MeshStandardMaterial({ color: '#e9c25a', flatShading: true }),
    );
    plinth.position.y = -0.15;
    this.scene.add(plinth);
    this.turntable = new THREE.Group();
    this.scene.add(this.turntable);
    this.running = true;
    const tick = this.tick = () => {
      if (!this.running) return;
      requestAnimationFrame(tick);
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (w && h && (this.canvas.width !== Math.floor(w * this.renderer.getPixelRatio()))) {
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
      }
      this.turntable.rotation.y += 0.01;
      if (this.model) {
        const t = performance.now() / 1000;
        this.model.rig.head.rotation.x = Math.sin(t * 2) * 0.1;
        if (this.model.rig.tail) this.model.rig.tail.rotation.z = Math.sin(t * 5) * 0.3;
      }
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  showModel(id) {
    if (!this.turntable) return;
    this.turntable.clear();
    this.model = buildAnimal(id, '#e0302a');
    this.turntable.add(this.model.root);
    const h = ANIMALS[id].stats.height;
    const d = 3 + h * 2.2;
    this.camera.position.set(0, h * 0.9 + 0.8, d);
    this.camera.lookAt(0, h * 0.5, 0);
  }

  setPaused(paused) {
    const wasRunning = this.running;
    this.running = !paused;
    if (!paused && !wasRunning && this.tick) this.tick();
  }
}
