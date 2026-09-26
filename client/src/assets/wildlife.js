// Ambient life: butterflies over the meadow, birds circling overhead and
// pollen drifting through the sunlight around the camera.
import * as THREE from 'three';
import { mulberry } from './kit.js';
import { ARENA_HALF } from '../../../shared/arena.js';

const A = ARENA_HALF;

function wingTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(34, 22, 26, 18, -0.3, 0, Math.PI * 2);
  ctx.ellipse(28, 48, 16, 12, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.arc(44, 16, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,10,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(34, 22, 26, 18, -0.3, 0, Math.PI * 2);
  ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWildlife(scene) {
  const rng = mulberry(99);
  const root = new THREE.Group();
  scene.add(root);

  // --- butterflies -------------------------------------------------------------------
  const colors = ['#ffb13b', '#f4f4f4', '#7cc7ff', '#ff7ab6', '#ffe14a'];
  const wingGeo = new THREE.PlaneGeometry(0.32, 0.32);
  wingGeo.translate(0.16, 0, 0);
  wingGeo.rotateX(-Math.PI / 2);
  const butterflies = [];
  for (let i = 0; i < 26; i++) {
    const m = new THREE.MeshBasicMaterial({ map: wingTexture(colors[i % colors.length]), transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 });
    const b = new THREE.Group();
    const l = new THREE.Mesh(wingGeo, m);
    const r = new THREE.Mesh(wingGeo, m);
    r.scale.x = -1;
    b.add(l, r);
    const home = new THREE.Vector3((rng() - 0.5) * A * 1.8, 0, (rng() - 0.5) * A * 1.8);
    b.position.set(home.x, 0.8 + rng(), home.z);
    root.add(b);
    butterflies.push({ b, l, r, home, phase: rng() * 10, speed: 0.8 + rng() * 0.8, heading: rng() * 6 });
  }

  // --- birds circling high above --------------------------------------------------------
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, 0, 0, -0.2, 1.2, 0, -0.1], 3));
  birdGeo.computeVertexNormals();
  const birdMat = new THREE.MeshBasicMaterial({ color: '#2a2a33', side: THREE.DoubleSide, fog: false });
  const flocks = [];
  for (let f = 0; f < 3; f++) {
    const flock = new THREE.Group();
    const centre = new THREE.Vector3((rng() - 0.5) * 120, 38 + rng() * 18, (rng() - 0.5) * 120);
    const birds = [];
    for (let i = 0; i < 6; i++) {
      const bird = new THREE.Group();
      const lw = new THREE.Mesh(birdGeo, birdMat);
      const rw = new THREE.Mesh(birdGeo, birdMat);
      rw.scale.x = -1;
      bird.add(lw, rw);
      const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      bird.position.set(i === 0 ? 0 : side * row * 1.6, (rng() - 0.5) * 0.6, -row * 1.6);
      flock.add(bird);
      birds.push({ lw, rw, phase: rng() * 6 });
    }
    root.add(flock);
    flocks.push({ flock, birds, centre, radius: 40 + rng() * 40, speed: (rng() < 0.5 ? -1 : 1) * (0.05 + rng() * 0.04), angle: rng() * 6 });
  }

  // --- pollen / dust motes drifting in the light ------------------------------------------------
  const moteCount = 320;
  const motePos = new Float32Array(moteCount * 3);
  const moteSeed = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (rng() - 0.5) * 50;
    motePos[i * 3 + 1] = rng() * 8;
    motePos[i * 3 + 2] = (rng() - 0.5) * 50;
    moteSeed[i] = rng() * 100;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const dot = document.createElement('canvas');
  dot.width = dot.height = 32;
  const dctx = dot.getContext('2d');
  const g = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(1, 'rgba(255,250,220,0)');
  dctx.fillStyle = g;
  dctx.fillRect(0, 0, 32, 32);
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    size: 0.12, map: new THREE.CanvasTexture(dot), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  motes.frustumCulled = false;
  root.add(motes);
  const moteBase = motePos.slice();

  return {
    update(dt, t, camera) {
      for (const f of butterflies) {
        // meander around a home spot, bobbing up and down
        f.heading += Math.sin(t * 0.7 + f.phase) * dt * 2.2;
        const p = f.b.position;
        const toHome = Math.atan2(f.home.x - p.x, f.home.z - p.z);
        if (Math.hypot(f.home.x - p.x, f.home.z - p.z) > 6) f.heading += Math.sin(toHome - f.heading) * dt * 2;
        p.x += Math.sin(f.heading) * f.speed * dt;
        p.z += Math.cos(f.heading) * f.speed * dt;
        p.y = 0.7 + Math.sin(t * 1.6 + f.phase) * 0.35 + Math.abs(Math.sin(t * 9 + f.phase)) * 0.1;
        f.b.rotation.y = f.heading;
        const flap = Math.sin(t * 18 + f.phase) * 1.1;
        f.l.rotation.z = flap;
        f.r.rotation.z = -flap;
      }
      for (const fl of flocks) {
        fl.angle += fl.speed * dt;
        fl.flock.position.set(fl.centre.x + Math.cos(fl.angle) * fl.radius, fl.centre.y + Math.sin(t * 0.3) * 2, fl.centre.z + Math.sin(fl.angle) * fl.radius);
        fl.flock.rotation.y = -fl.angle + (fl.speed > 0 ? Math.PI : 0);
        for (const b of fl.birds) {
          const flap = Math.sin(t * 6 + b.phase) * 0.5;
          b.lw.rotation.z = flap;
          b.rw.rotation.z = -flap;
        }
      }
      // motes follow the camera in a wrapping box
      const cx = camera.position.x, cz = camera.position.z;
      const pos = moteGeo.attributes.position;
      for (let i = 0; i < moteCount; i++) {
        const s = moteSeed[i];
        let x = moteBase[i * 3] + Math.sin(t * 0.3 + s) * 1.5 + t * 0.4;
        let z = moteBase[i * 3 + 2] + Math.cos(t * 0.25 + s) * 1.5;
        x = ((x - cx) % 50 + 75) % 50 - 25 + cx;
        z = ((z - cz) % 50 + 75) % 50 - 25 + cz;
        pos.setXYZ(i, x, (moteBase[i * 3 + 1] + Math.sin(t * 0.5 + s) * 0.6 + 8) % 8 + 0.2, z);
      }
      pos.needsUpdate = true;
    },
  };
}
