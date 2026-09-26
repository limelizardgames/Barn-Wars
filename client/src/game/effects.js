// Cheap particle + shockwave effects.
import * as THREE from 'three';

const MAX_PARTICLES = 1200;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, material, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    // seed the instance colour buffer
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.particles = [];
    this.shapes = []; // rings, flashes, bubbles
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  burst(x, y, z, { count = 12, colors = ['#ffffff'], speed = 5, up = 3, size = 0.15, life = 0.7, gravity = -15, spread = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x: x + (Math.random() - 0.5) * spread * 0.5,
        y: y + (Math.random() - 0.5) * spread * 0.5,
        z: z + (Math.random() - 0.5) * spread * 0.5,
        vx: Math.cos(a) * s,
        vy: up * (0.4 + Math.random()),
        vz: Math.sin(a) * s,
        rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 12,
        life: life * (0.6 + Math.random() * 0.6),
        max: life,
        size: size * (0.6 + Math.random() * 0.8),
        color: colors[i % colors.length],
        gravity,
      });
    }
  }

  // floating particles that drift upward (heals, buffs)
  rise(x, y, z, colors, count = 8) {
    this.burst(x, y, z, { count, colors, speed: 1, up: 2.5, size: 0.14, life: 1, gravity: 1, spread: 1.5 });
  }

  dust(x, y, z, count = 6) {
    this.burst(x, y + 0.1, z, { count, colors: ['#c9ab82', '#b39670', '#dcc7a5'], speed: 2.5, up: 1.2, size: 0.25, life: 0.6, gravity: -2 });
  }

  ring(x, y, z, radius, color = '#fff2c4', duration = 0.45) {
    const geo = new THREE.RingGeometry(0.8, 1, 32);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(x, y + 0.15, z);
    this.scene.add(m);
    this.shapes.push({ mesh: m, t: 0, dur: duration, from: 0.3, to: radius, fade: true });
  }

  flash(x, y, z, radius, color = '#ffcf5a', duration = 0.35) {
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    m.position.set(x, y, z);
    this.scene.add(m);
    this.shapes.push({ mesh: m, t: 0, dur: duration, from: radius * 0.3, to: radius, fade: true });
  }

  explosion(x, y, z, radius) {
    this.flash(x, y, z, radius * 0.9, '#ffb13b', 0.4);
    this.flash(x, y, z, radius * 0.6, '#fff1b0', 0.25);
    this.ring(x, 0.05, z, radius * 1.1, '#ffdca0', 0.5);
    this.burst(x, y, z, { count: 40, colors: ['#ffb02e', '#ff5a1f', '#444444', '#fff7d6'], speed: 14, up: 8, size: 0.3, life: 0.9 });
  }

  update(dt) {
    const { mesh, _m: m, _q: q, _e: e, _v: v, _s: s, _c: c } = this;
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      p.rx += p.spin * dt; p.ry += p.spin * dt;
      const k = Math.min(1, p.life / (p.max * 0.4));
      e.set(p.rx, p.ry, 0);
      q.setFromEuler(e);
      v.set(p.x, p.y, p.z);
      s.setScalar(p.size * k);
      m.compose(v, q, s);
      mesh.setMatrixAt(n, m);
      mesh.setColorAt(n, c.set(p.color));
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const sh = this.shapes[i];
      sh.t += dt;
      const k = Math.min(1, sh.t / sh.dur);
      const r = sh.from + (sh.to - sh.from) * (1 - (1 - k) * (1 - k));
      sh.mesh.scale.setScalar(r);
      if (sh.fade) sh.mesh.material.opacity = 0.9 * (1 - k);
      if (k >= 1) {
        this.scene.remove(sh.mesh);
        sh.mesh.geometry.dispose();
        sh.mesh.material.dispose();
        this.shapes.splice(i, 1);
      }
    }
  }
}
