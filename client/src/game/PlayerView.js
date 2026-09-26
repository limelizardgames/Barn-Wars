// Visual representation of one fighter: model, nameplate, status effects, animation.
import * as THREE from 'three';
import { buildAnimal, accentFor } from '../assets/animals.js';
import { buildSculptedAnimal, hasSculptedModel } from '../assets/rig.js';
import { getAnimal } from '../../../shared/animals.js';
import { Animator } from './animator.js';

const STAR_MAT = new THREE.MeshBasicMaterial({ color: '#ffe14a' });
const SHIELD_MAT = new THREE.MeshStandardMaterial({
  color: '#bfe8ff', transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.1, depthWrite: false, flatShading: true,
});

export class PlayerView {
  constructor(scene, state, isLocal) {
    this.scene = scene;
    this.id = state.id;
    this.isLocal = isLocal;
    this.accent = accentFor(this.id);
    this.group = new THREE.Group();
    this.yawGroup = new THREE.Group();
    this.pose = new THREE.Group();
    this.group.add(this.yawGroup);
    this.yawGroup.add(this.pose);
    scene.add(this.group);
    this.animalId = null;
    this.lastAct = state.act || 0;
    this.deadT = 0;
    this.wasAlive = !!state.alive;
    this.hp = -1;
    this.name = '';
    this.yaw = state.yaw || 0;

    this.nameplate = this.makeNameplate();
    this.group.add(this.nameplate.sprite);

    // ground ring: gold for you, the player's accent colour for everyone else
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, isLocal ? 1.1 : 1.0, 32),
      new THREE.MeshBasicMaterial({ color: isLocal ? '#ffe14a' : this.accent, transparent: true, opacity: isLocal ? 0.65 : 0.4, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    this.group.add(ring);
    this.marker = ring;

    // stun stars
    this.stars = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), STAR_MAT);
      const a = (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
      this.stars.add(s);
    }
    this.stars.visible = false;
    this.group.add(this.stars);

    // shield bubble
    this.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), SHIELD_MAT);
    this.shield.visible = false;
    this.group.add(this.shield);

    this.setAnimal(state.animal);
    this.setName(state.name);
    if (state.alive) this.animator.spawn();
  }

  setAnimal(id) {
    if (id === this.animalId && !(this.fallback && hasSculptedModel(id))) return;
    if (this.model) this.pose.remove(this.model.root);
    this.animalId = id;
    this.def = getAnimal(id);
    const sculpted = buildSculptedAnimal(id);
    this.fallback = !sculpted;
    this.model = sculpted || buildAnimal(id, this.accent);
    this.pose.add(this.model.root);
    this.animator = new Animator(this.model, id, this.def);
    const h = this.def.stats.height;
    this.nameplate.sprite.position.y = h + 0.9;
    this.stars.position.y = h + 0.35;
    const r = this.def.stats.radius;
    this.shield.scale.set(r * 1.6, h * 0.85, r * 1.6);
    this.shield.position.y = h * 0.5;
    this.marker.scale.setScalar(r * 1.1);
    this.hp = -1;
  }

  makeNameplate() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.scale.set(2.6, 0.65, 1);
    sprite.renderOrder = 10;
    return { canvas, tex, sprite };
  }

  setName(name) {
    if (name === this.name) return;
    this.name = name;
    this.hp = -1;
  }

  drawNameplate(hp, maxHp) {
    const { canvas, tex } = this.nameplate;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 24px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.fillStyle = this.isLocal ? '#ffe14a' : '#ffffff';
    ctx.strokeText(this.name, 128, 26);
    ctx.fillText(this.name, 128, 26);
    // accent pip so same-animal players are easy to tell apart
    ctx.fillStyle = this.accent;
    ctx.beginPath();
    ctx.arc(34, 45, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const w = 160, x = 48, y = 38;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - 2, y - 2, w + 4, 16);
    const k = Math.max(0, hp / maxHp);
    ctx.fillStyle = k > 0.5 ? '#6fd65a' : k > 0.25 ? '#f2c14e' : '#e04b3a';
    ctx.fillRect(x, y, w * k, 12);
    tex.needsUpdate = true;
  }

  hurt() {
    this.animator?.hurt();
  }

  // Called every frame with the interpolated (or predicted) state.
  update(dt, s, time) {
    if (s.animal && (s.animal !== this.animalId || (this.fallback && hasSculptedModel(s.animal)))) this.setAnimal(s.animal);
    if (s.name) this.setName(s.name);

    const alive = !!s.alive;
    if (!alive) {
      this.deadT += dt;
      this.wasAlive = false;
      this.animator.updateDead(dt, this.deadT, this.pose);
      this.group.visible = this.deadT < 1.1;
      this.stars.visible = this.shield.visible = false;
      this.marker.visible = false;
      this.nameplate.sprite.visible = false;
      return;
    }
    if (!this.wasAlive) {
      this.wasAlive = true;
      this.deadT = 0;
      this.animator.spawn();
    }
    this.group.visible = true;
    this.marker.visible = true;

    this.group.position.set(s.x, s.y, s.z);
    let d = s.yaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * (this.isLocal ? 30 : 15));
    this.yawGroup.rotation.y = this.yaw;

    const hp = Math.ceil(s.hp);
    if (hp !== this.hp) {
      this.hp = hp;
      this.drawNameplate(hp, this.def.stats.maxHp);
    }
    this.nameplate.sprite.visible = !this.isLocal;

    if (s.act !== undefined && s.act !== this.lastAct) {
      this.lastAct = s.act;
      if (s.actSlot) this.animator.trigger(s.actSlot);
    }

    this.animator.update(dt, { ...s, yaw: this.yaw }, time, this.pose, this.group.position);

    this.stars.visible = s.stunT > 0;
    if (this.stars.visible) this.stars.rotation.y = time * 5;
    this.shield.visible = s.shieldT > 0 && this.animalId !== 'sheep';
    if (this.shield.visible) this.shield.rotation.y = time;
    this.marker.material.opacity = (this.isLocal ? 0.65 : 0.4) * (s.prot ? 0.5 + 0.5 * Math.sin(time * 12) : 1);

    // spawn protection: gentle shimmer instead of harsh blinking
    this.model.root.visible = !(s.prot && Math.floor(time * 8) % 3 === 0);
  }

  dispose() {
    this.scene.remove(this.group);
    this.nameplate.tex.dispose();
    this.nameplate.sprite.material.dispose();
    for (const m of this.model?.materials || []) m.dispose();
  }
}
