// Visual representation of one fighter: model, nameplate, status effects, animation.
import * as THREE from 'three';
import { buildAnimal, accentFor } from '../assets/animals.js';
import { getAnimal } from '../../../shared/animals.js';

const STAR_MAT = new THREE.MeshBasicMaterial({ color: '#ffe14a' });
const SHIELD_MAT = new THREE.MeshStandardMaterial({
  color: '#bfe8ff', transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.1, depthWrite: false, flatShading: true,
});

export class PlayerView {
  constructor(scene, state, isLocal) {
    this.scene = scene;
    this.id = state.id;
    this.isLocal = isLocal;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.animalId = null;
    this.walkPhase = 0;
    this.attackT = 0;
    this.lastAct = state.act || 0;
    this.deathT = 0;
    this.visible = true;
    this.hp = -1;
    this.name = '';
    this.yaw = state.yaw || 0;
    this.renderPos = new THREE.Vector3(state.x, state.y, state.z);

    this.nameplate = this.makeNameplate();
    this.group.add(this.nameplate.sprite);

    // local-player marker ring
    if (isLocal) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.1, 24),
        new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.6, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      this.group.add(ring);
      this.marker = ring;
    }

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
    this.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), SHIELD_MAT);
    this.shield.visible = false;
    this.group.add(this.shield);

    this.setAnimal(state.animal);
    this.setName(state.name);
  }

  setAnimal(id) {
    if (id === this.animalId) return;
    if (this.model) this.group.remove(this.model.root);
    this.animalId = id;
    this.def = getAnimal(id);
    this.model = buildAnimal(id, accentFor(this.id));
    this.group.add(this.model.root);
    const h = this.def.stats.height;
    this.nameplate.sprite.position.y = h + 0.9;
    this.stars.position.y = h + 0.35;
    const r = this.def.stats.radius;
    this.shield.scale.set(r * 1.5, h * 0.8, r * 1.5);
    this.shield.position.y = h * 0.5;
    if (this.marker) this.marker.scale.setScalar(r * 1.1);
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
    // hp bar
    const w = 160, x = 48, y = 38;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - 2, y - 2, w + 4, 16);
    const k = Math.max(0, hp / maxHp);
    ctx.fillStyle = k > 0.5 ? '#6fd65a' : k > 0.25 ? '#f2c14e' : '#e04b3a';
    ctx.fillRect(x, y, w * k, 12);
    tex.needsUpdate = true;
  }

  // Called every frame with the interpolated (or predicted) state.
  update(dt, s, time) {
    if (s.animal && s.animal !== this.animalId) this.setAnimal(s.animal);
    if (s.name) this.setName(s.name);

    const rig = this.model.rig;
    const alive = !!s.alive;

    // death animation: tip over, then hide
    if (!alive) {
      this.deathT += dt;
      if (this.deathT < 0.6) {
        this.model.root.rotation.z = Math.min(Math.PI / 2, this.deathT * 5);
        this.group.visible = true;
      } else {
        this.group.visible = false;
      }
      return;
    }
    if (this.deathT > 0) {
      this.deathT = 0;
      this.model.root.rotation.z = 0;
    }
    this.group.visible = true;

    this.group.position.set(s.x, s.y, s.z);
    // smooth yaw for remote players
    let d = s.yaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * (this.isLocal ? 30 : 15));
    this.model.root.rotation.y = this.yaw;

    // nameplate
    const hp = Math.ceil(s.hp);
    if (hp !== this.hp) {
      this.hp = hp;
      this.drawNameplate(hp, this.def.stats.maxHp);
    }
    this.nameplate.sprite.visible = !this.isLocal;

    // attack trigger
    if (s.act !== undefined && s.act !== this.lastAct) {
      this.lastAct = s.act;
      this.attackT = 0.3;
    }
    this.attackT = Math.max(0, this.attackT - dt);

    // walking cycle
    const moving = s.moving && s.grounded;
    const speed = this.def.stats.speed * (s.speedMult || 1);
    if (moving) this.walkPhase += dt * speed * (rig.biped ? 2.6 : 1.6);
    const swing = moving ? Math.sin(this.walkPhase) * (rig.biped ? 0.8 : 0.6) : 0;
    rig.legs.forEach((l, i) => {
      const phase = rig.biped ? (i === 0 ? 1 : -1) : (i === 0 || i === 3 ? 1 : -1);
      const target = s.grounded ? swing * phase : (i < 2 ? -0.6 : 0.6);
      l.rotation.x += (target - l.rotation.x) * Math.min(1, dt * 15);
    });
    const bob = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.08 : Math.sin(time * 2) * 0.02;
    rig.body.position.y = rig.bodyY + bob;

    // dash lean / attack lunge
    const lunge = this.attackT > 0 ? Math.sin((this.attackT / 0.3) * Math.PI) : 0;
    rig.head.position.z = rig.headZ + lunge * 0.3;
    rig.body.rotation.x = (s.dashT > 0 ? 0.25 : 0) + lunge * 0.12;
    if (rig.tail) rig.tail.rotation.z = Math.sin(time * 6 + this.walkPhase) * 0.3;
    if (rig.wings) {
      const flap = !s.grounded || this.attackT > 0 ? Math.sin(time * 30) * 0.9 : 0;
      rig.wings[0].rotation.z = -Math.abs(flap);
      rig.wings[1].rotation.z = Math.abs(flap);
    }
    if (rig.wool) {
      const puff = s.shieldT > 0 ? 1.25 : 1;
      rig.wool.scale.lerp(new THREE.Vector3(puff, puff, puff), Math.min(1, dt * 8));
    }

    // statuses
    this.stars.visible = s.stunT > 0;
    if (this.stars.visible) this.stars.rotation.y = time * 5;
    this.shield.visible = s.shieldT > 0 && this.animalId !== 'sheep';
    if (this.shield.visible) this.shield.rotation.y = time;

    // spawn protection blink
    this.model.root.visible = !(s.prot && Math.floor(time * 10) % 2 === 0);
  }

  dispose() {
    this.scene.remove(this.group);
    this.nameplate.tex.dispose();
    this.nameplate.sprite.material.dispose();
  }
}
