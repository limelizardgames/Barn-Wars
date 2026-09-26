// Procedural stylised models for every fighter.
// Each builder returns { root, rig } where root sits on the ground facing +Z
// and rig exposes the parts that the animator moves.
import * as THREE from 'three';
import {
  smooth, box, rbox, ball, capsule, cyl, cone, torus, tube, group, leg, outline, canvasTexture, mulberry,
} from './kit.js';

const INK = 0.028;
const BLACK = smooth('#1d1a18', { roughness: 0.4 });
const EYE_WHITE = smooth('#ffffff', { roughness: 0.2 });
const SHINE = new THREE.MeshBasicMaterial({ color: '#ffffff' });
const PINK = smooth('#f39aad');
const HOOF = smooth('#3a2a20', { roughness: 0.5 });

// Big cartoon eyes. `pupil` can be 'round' or 'bar' (goats and sheep).
function eyes(parent, x, y, z, size = 0.1, pupil = 'round', yaw = 0.35) {
  const list = [];
  for (const s of [-1, 1]) {
    const g = group(parent, s * x, y, z);
    g.rotation.y = s * yaw;
    const white = ball(size, EYE_WHITE, 0, 0, 0, g, 14);
    outline(white, 0.012);
    if (pupil === 'bar') {
      const p = box(size * 0.95, size * 0.35, size * 0.2, BLACK, 0, 0, size * 0.9, g);
      p.castShadow = false;
    } else {
      ball(size * 0.58, BLACK, 0, 0, size * 0.55, g, 12).castShadow = false;
    }
    const shine = ball(size * 0.2, SHINE, size * 0.25, size * 0.3, size * 0.95, g, 8);
    shine.castShadow = false;
    list.push(g);
  }
  return list;
}

function scarf(parent, y, z, r, color, tilt = 0) {
  const m = smooth(color);
  const g = group(parent, 0, y, z);
  g.rotation.x = tilt;
  const ring = torus(r, 0.085, m, 0, 0, 0, g, Math.PI * 2, 20);
  ring.rotation.x = Math.PI / 2;
  outline(ring, 0.015);
  ball(0.1, m, r * 0.75, -0.05, -r * 0.55, g, 10); // knot
  const tail1 = rbox(0.16, 0.38, 0.05, 0.02, m, r * 0.8, -0.25, -r * 0.6, g);
  tail1.rotation.z = 0.35;
  const tail2 = rbox(0.14, 0.3, 0.05, 0.02, m, r * 0.95, -0.2, -r * 0.45, g);
  tail2.rotation.z = 0.8;
  return g;
}

function inked(mesh, t = INK) {
  return outline(mesh, t);
}

// ---- textures -----------------------------------------------------------------------

let cowTex = null;
function cowHide() {
  if (!cowTex) {
    cowTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#f6f3ec';
      ctx.fillRect(0, 0, w, h);
      const rnd = mulberry(42);
      ctx.fillStyle = '#231d1a';
      for (let i = 0; i < 9; i++) {
        const cx = rnd() * w, cy = rnd() * h, r = 18 + rnd() * 30;
        ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 10) {
          const rr = r * (0.7 + rnd() * 0.5);
          ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.fill();
      }
    });
  }
  return cowTex;
}

let horseTex = null;
function horseCoat() {
  if (!horseTex) {
    horseTex = canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#7a4a22');
      g.addColorStop(0.6, '#94602f');
      g.addColorStop(1, '#a8733d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const rnd = mulberry(7);
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `rgba(60,30,10,${rnd() * 0.12})`;
        ctx.fillRect(rnd() * w, rnd() * h, 1, 4);
      }
    });
  }
  return horseTex;
}

// ---------------------------------------------------------------------------

function buildCow(accent) {
  const root = new THREE.Group();
  const hide = smooth('#ffffff', { map: cowHide() });
  const white = smooth('#f6f3ec');
  const cream = smooth('#efe4c8');
  const body = group(root, 0, 1.3, 0);
  inked(rbox(1.35, 1.1, 2.2, 0.38, hide, 0, 0, 0, body, 4));
  // udder
  const udder = ball(0.3, PINK, 0, -0.52, -0.55, body);
  udder.scale.set(1, 0.7, 1);
  for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) cyl(0.035, 0.03, 0.14, PINK, x, -0.72, -0.55 + z, body, 6);

  const head = group(body, 0, 0.42, 1.2);
  inked(rbox(0.82, 0.78, 0.8, 0.25, white, 0, 0.02, 0, head));
  inked(rbox(0.86, 0.44, 0.42, 0.18, PINK, 0, -0.22, 0.42, head));
  for (const s of [-1, 1]) {
    const n = ball(0.055, smooth('#9b4a5a'), s * 0.18, -0.18, 0.64, head, 8);
    n.scale.set(1, 0.6, 0.5);
  }
  const tuft = ball(0.2, smooth('#2a211c'), 0, 0.38, 0.12, head, 10);
  tuft.scale.set(1.2, 0.5, 1);
  const eyeL = eyes(head, 0.24, 0.12, 0.37, 0.11);
  for (const s of [-1, 1]) {
    inked(tube([[s * 0.35, 0.3, 0], [s * 0.58, 0.42, 0], [s * 0.66, 0.66, 0.05]], 0.065, cream, head, { taper: true }), 0.015);
    const ear = ball(0.2, white, s * 0.55, 0.18, -0.12, head, 12);
    ear.scale.set(1.1, 0.35, 0.65);
    ear.rotation.z = s * 0.35;
    inked(ear, 0.015);
    const inner = ball(0.13, PINK, s * 0.58, 0.19, -0.08, head, 10);
    inner.scale.set(1, 0.2, 0.55);
    inner.rotation.z = s * 0.35;
  }
  // bell collar
  scarf(body, 0.12, 1.02, 0.46, accent, -0.2);
  const gold = smooth('#e3b53b', { metalness: 0.7, roughness: 0.3 });
  const bell = cyl(0.1, 0.18, 0.22, gold, 0, -0.38, 1.2, body, 14);
  inked(bell, 0.015);
  ball(0.05, BLACK, 0, -0.5, 1.2, body, 8);

  const legs = [
    leg(root, 0.42, 0.9, 0.72, 0.9, 0.17, white, { hoof: HOOF }),
    leg(root, -0.42, 0.9, 0.72, 0.9, 0.17, white, { hoof: HOOF }),
    leg(root, 0.42, 0.9, -0.78, 0.9, 0.17, white, { hoof: HOOF }),
    leg(root, -0.42, 0.9, -0.78, 0.9, 0.17, white, { hoof: HOOF }),
  ];
  const tail = group(body, 0, 0.4, -1.1);
  tube([[0, 0, 0], [0, -0.3, -0.12], [0, -0.75, -0.08]], 0.04, white, tail);
  const tip = ball(0.11, smooth('#2a211c'), 0, -0.82, -0.08, tail, 10);
  tip.scale.set(0.8, 1.3, 0.8);
  return { root, rig: { body, head, legs, tail, eyes: eyeL, bodyY: 1.3, headZ: 1.2 } };
}

function buildChicken(accent) {
  const root = new THREE.Group();
  const white = smooth('#fdfcf8');
  const cream = smooth('#f4ead2');
  const orange = smooth('#f5a524');
  const red = smooth('#e0302a');
  const body = group(root, 0, 0.62, 0);
  const torso = ball(0.42, white, 0, 0, 0, body, 22);
  torso.scale.set(1, 0.95, 1.22);
  inked(torso, 0.022);
  const chest = ball(0.3, cream, 0, -0.05, 0.28, body, 16);
  chest.scale.set(1, 1, 0.8);

  const head = group(body, 0, 0.44, 0.33);
  inked(ball(0.25, white, 0, 0, 0, head, 18), 0.02);
  const beakTop = cone(0.09, 0.22, orange, 0, 0.0, 0.28, head, 10);
  beakTop.rotation.x = Math.PI / 2;
  beakTop.scale.set(1.2, 1, 0.55);
  const beakBot = cone(0.07, 0.14, smooth('#d98612'), 0, -0.05, 0.25, head, 10);
  beakBot.rotation.x = Math.PI / 2;
  beakBot.scale.set(1.1, 1, 0.5);
  for (const [z, y, r] of [[0.1, 0.25, 0.08], [0.0, 0.29, 0.09], [-0.1, 0.25, 0.075]]) ball(r, red, 0, y, z, head, 10);
  const w1 = ball(0.06, red, -0.03, -0.14, 0.2, head, 8);
  w1.scale.set(0.8, 1.4, 0.8);
  const w2 = ball(0.06, red, 0.03, -0.14, 0.2, head, 8);
  w2.scale.set(0.8, 1.4, 0.8);
  const eyeL = eyes(head, 0.14, 0.06, 0.16, 0.075, 'round', 0.6);
  // Cluck Norris' headband
  const bandMat = smooth(accent);
  const band = torus(0.245, 0.035, bandMat, 0, 0.1, 0, head, Math.PI * 2, 20);
  band.rotation.x = Math.PI / 2 - 0.15;
  const t1 = rbox(0.06, 0.24, 0.04, 0.015, bandMat, 0.06, 0.02, -0.27, head);
  t1.rotation.set(0.4, 0, 0.5);
  const t2 = rbox(0.06, 0.24, 0.04, 0.015, bandMat, -0.06, 0.02, -0.27, head);
  t2.rotation.set(0.4, 0, -0.5);

  const wings = [];
  for (const s of [-1, 1]) {
    const w = group(body, s * 0.38, 0.1, 0);
    for (let i = 0; i < 3; i++) {
      const f = ball(0.26 - i * 0.04, i === 2 ? cream : white, s * 0.04, -0.06 - i * 0.05, -0.02 - i * 0.1, w, 12);
      f.scale.set(0.28, 0.75, 1.15);
      if (i === 0) inked(f, 0.02);
    }
    wings.push(w);
  }
  const tail = group(body, 0, 0.12, -0.45);
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 1.1;
    const f = ball(0.13, i % 2 ? cream : white, Math.sin(a) * 0.12, 0.18, 0, tail, 10);
    f.scale.set(0.35, 1.9, 0.8);
    f.rotation.set(-0.7, 0, -a);
    if (i === 2) inked(f, 0.02);
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const l = leg(root, s * 0.15, 0.36, 0.02, 0.36, 0.035, orange, { ink: false });
    for (const a of [-0.5, 0, 0.5]) {
      const toe = cyl(0.022, 0.018, 0.16, orange, Math.sin(a) * 0.07, -0.35, 0.06 + Math.cos(a) * 0.02, l, 6);
      toe.rotation.set(Math.PI / 2, 0, -a);
    }
    const back = cyl(0.02, 0.016, 0.08, orange, 0, -0.35, -0.05, l, 6);
    back.rotation.x = Math.PI / 2;
    legs.push(l);
  }
  return { root, rig: { body, head, legs, wings, tail, eyes: eyeL, bodyY: 0.62, headZ: 0.33, biped: true } };
}

function buildPig(accent) {
  const root = new THREE.Group();
  const pink = smooth('#f7aabb');
  const deep = smooth('#e98aa0');
  const mud = smooth('#7a5230', { roughness: 0.4 });
  const body = group(root, 0, 0.82, 0);
  const torso = capsule(0.6, 0.75, pink, 0, 0, 0, body);
  torso.rotation.x = Math.PI / 2;
  torso.scale.set(1, 1, 0.9);
  inked(torso);
  for (const [x, y, z, r] of [[0.18, 0.5, -0.3, 0.2], [-0.12, 0.52, 0.2, 0.13], [0.3, 0.42, 0.35, 0.1]]) {
    const m = ball(r, mud, x, y, z, body, 10);
    m.scale.y = 0.3;
  }

  const head = group(body, 0, 0.22, 1.0);
  inked(ball(0.44, pink, 0, 0, 0, head, 20));
  const snout = cyl(0.21, 0.23, 0.2, deep, 0, -0.06, 0.42, head, 18);
  snout.rotation.x = Math.PI / 2;
  inked(snout, 0.015);
  for (const s of [-1, 1]) {
    const n = ball(0.05, smooth('#8a3b4d'), s * 0.08, -0.06, 0.52, head, 8);
    n.scale.set(0.8, 1.2, 0.4);
    const blush = ball(0.09, smooth('#ff8fa6'), s * 0.3, -0.12, 0.28, head, 10);
    blush.scale.set(1, 0.6, 0.4);
    const ear = cone(0.16, 0.34, pink, s * 0.27, 0.36, 0.1, head, 12);
    ear.rotation.set(0.9, 0, -s * 0.45);
    ear.scale.set(1, 1, 0.4);
    inked(ear, 0.015);
  }
  const eyeL = eyes(head, 0.18, 0.13, 0.34, 0.085);
  scarf(body, 0.1, 0.72, 0.45, accent, -0.2);

  const legs = [
    leg(root, 0.33, 0.47, 0.45, 0.47, 0.13, pink, { hoof: HOOF }),
    leg(root, -0.33, 0.47, 0.45, 0.47, 0.13, pink, { hoof: HOOF }),
    leg(root, 0.33, 0.47, -0.45, 0.47, 0.13, pink, { hoof: HOOF }),
    leg(root, -0.33, 0.47, -0.45, 0.47, 0.13, pink, { hoof: HOOF }),
  ];
  const tail = group(body, 0, 0.15, -0.95);
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = i * 0.8;
    pts.push([Math.cos(a) * 0.07, 0.03 + i * 0.012, -Math.sin(a) * 0.07 - i * 0.012]);
  }
  tube(pts, 0.03, pink, tail, { seg: 40 });
  return { root, rig: { body, head, legs, tail, eyes: eyeL, bodyY: 0.82, headZ: 1.0 } };
}

function buildSheep(accent) {
  const root = new THREE.Group();
  const woolA = smooth('#f7f5ef', { roughness: 1 });
  const woolB = smooth('#ebe8df', { roughness: 1 });
  const face = smooth('#2f2a28', { roughness: 0.6 });
  const muzzle = smooth('#4a423e');
  const body = group(root, 0, 0.92, 0);
  const woolGroup = group(body);
  const rnd = mulberry(5);
  // a lumpy shell of wool balls around an ellipsoid
  const core = ball(0.6, woolA, 0, 0, 0, woolGroup, 18);
  core.scale.set(1, 0.9, 1.25);
  inked(core, 0.02);
  for (let i = 0; i < 60; i++) {
    const u = rnd() * Math.PI * 2, v = Math.acos(rnd() * 1.7 - 0.7);
    const x = Math.sin(v) * Math.cos(u) * 0.62, y = Math.cos(v) * 0.52, z = Math.sin(v) * Math.sin(u) * 0.78;
    const b = ball(0.14 + rnd() * 0.1, i % 3 ? woolA : woolB, x, y, z, woolGroup, 10);
    if (i % 3 === 0) inked(b, 0.015);
  }

  const head = group(body, 0, 0.25, 0.85);
  const skull = ball(0.27, face, 0, 0, 0, head, 18);
  skull.scale.set(0.85, 1, 1.2);
  inked(skull, 0.02);
  const mz = ball(0.16, muzzle, 0, -0.1, 0.24, head, 14);
  mz.scale.set(1.1, 0.8, 0.9);
  for (let i = 0; i < 5; i++) ball(0.11, woolA, (i - 2) * 0.08, 0.24 + (i % 2) * 0.05, -0.05, head, 10);
  const eyeL = eyes(head, 0.13, 0.07, 0.2, 0.075, 'bar', 0.45);
  for (const s of [-1, 1]) {
    const ear = ball(0.15, face, s * 0.3, 0.06, -0.02, head, 10);
    ear.scale.set(1.3, 0.35, 0.6);
    ear.rotation.z = -s * 0.35;
  }
  // bow
  const bowMat = smooth(accent);
  ball(0.07, bowMat, 0.12, 0.34, 0.02, head, 10);
  for (const s of [-1, 1]) {
    const loop = ball(0.09, bowMat, 0.12 + s * 0.1, 0.36, 0.02, head, 10);
    loop.scale.set(1.2, 0.8, 0.5);
    inked(loop, 0.01);
  }

  const legs = [
    leg(root, 0.28, 0.58, 0.35, 0.58, 0.075, face, { hoof: HOOF }),
    leg(root, -0.28, 0.58, 0.35, 0.58, 0.075, face, { hoof: HOOF }),
    leg(root, 0.28, 0.58, -0.4, 0.58, 0.075, face, { hoof: HOOF }),
    leg(root, -0.28, 0.58, -0.4, 0.58, 0.075, face, { hoof: HOOF }),
  ];
  const tail = group(body, 0, 0.12, -0.92);
  ball(0.15, woolA, 0, 0, 0, tail, 10);
  return { root, rig: { body, head, legs, tail, wool: woolGroup, eyes: eyeL, bodyY: 0.92, headZ: 0.85 } };
}

function buildGoat(accent) {
  const root = new THREE.Group();
  const tan = smooth('#d2c1a5');
  const dark = smooth('#8d7a60');
  const white = smooth('#f1eadb');
  const horn = smooth('#5b4b3a', { roughness: 0.5 });
  const body = group(root, 0, 1.02, 0);
  inked(rbox(0.78, 0.68, 1.4, 0.3, tan, 0, 0, 0, body));
  const saddle = ball(0.42, dark, 0, 0.12, -0.1, body, 16); // darker saddle patch
  saddle.scale.set(0.95, 0.55, 1.45);
  const belly = ball(0.34, white, 0, -0.2, 0, body, 14);
  belly.scale.set(1, 0.45, 1.6);

  const neck = capsule(0.19, 0.45, tan, 0, 0.38, 0.62, body);
  neck.rotation.x = 0.5;
  inked(neck, 0.02);
  const head = group(body, 0, 0.72, 0.86);
  inked(rbox(0.4, 0.42, 0.56, 0.16, tan, 0, 0, 0.05, head));
  inked(rbox(0.32, 0.28, 0.24, 0.1, white, 0, -0.08, 0.36, head), 0.015);
  ball(0.035, BLACK, -0.07, -0.02, 0.48, head, 6);
  ball(0.035, BLACK, 0.07, -0.02, 0.48, head, 6);
  const beard = cone(0.08, 0.34, white, 0, -0.36, 0.32, head, 8);
  beard.rotation.x = Math.PI + 0.2;
  const eyeL = eyes(head, 0.19, 0.08, 0.16, 0.075, 'bar', 0.7);
  for (const s of [-1, 1]) {
    inked(tube([[s * 0.1, 0.18, 0.05], [s * 0.14, 0.45, -0.1], [s * 0.18, 0.5, -0.38], [s * 0.2, 0.3, -0.5]], 0.065, horn, head, { taper: true }), 0.012);
    const ear = ball(0.16, tan, s * 0.3, 0.08, -0.05, head, 10);
    ear.scale.set(1.4, 0.3, 0.55);
    ear.rotation.z = s * 0.45;
    inked(ear, 0.012);
  }
  scarf(body, 0.25, 0.68, 0.24, accent, -0.5);
  const legs = [
    leg(root, 0.25, 0.72, 0.5, 0.72, 0.08, tan, { hoof: HOOF, sock: dark }),
    leg(root, -0.25, 0.72, 0.5, 0.72, 0.08, tan, { hoof: HOOF, sock: dark }),
    leg(root, 0.25, 0.72, -0.5, 0.72, 0.08, tan, { hoof: HOOF, sock: dark }),
    leg(root, -0.25, 0.72, -0.5, 0.72, 0.08, tan, { hoof: HOOF, sock: dark }),
  ];
  const tail = group(body, 0, 0.28, -0.7);
  const t = cone(0.07, 0.26, dark, 0, 0.1, 0, tail, 8);
  t.rotation.x = -0.5;
  return { root, rig: { body, head, legs, tail, eyes: eyeL, bodyY: 1.02, headZ: 0.86 } };
}

function buildHorse(accent) {
  const root = new THREE.Group();
  const coat = smooth('#ffffff', { map: horseCoat() });
  const brown = smooth('#8b5a2b');
  const muzzleMat = smooth('#5e3b1c');
  const mane = smooth('#2e1d12', { roughness: 0.9 });
  const blaze = smooth('#f4eee2');
  const body = group(root, 0, 1.48, 0);
  const torso = capsule(0.53, 1.05, coat, 0, 0, 0, body);
  torso.rotation.x = Math.PI / 2;
  inked(torso);

  const neck = capsule(0.28, 0.75, brown, 0, 0.45, 0.85, body);
  neck.rotation.x = 0.55;
  inked(neck, 0.02);
  for (let i = 0; i < 6; i++) {
    const m = rbox(0.1, 0.28, 0.22, 0.04, mane, 0, 0.3 + i * 0.13, 0.55 + i * 0.075, body);
    m.rotation.x = 0.55 + (i % 2 ? 0.2 : -0.1);
  }

  const head = group(body, 0, 1.02, 1.25);
  inked(rbox(0.42, 0.46, 0.85, 0.16, brown, 0, 0, 0.12, head));
  inked(rbox(0.4, 0.38, 0.3, 0.13, muzzleMat, 0, -0.07, 0.56, head), 0.015);
  rbox(0.12, 0.05, 0.5, 0.02, blaze, 0, 0.23, 0.25, head);
  for (const s of [-1, 1]) {
    const n = ball(0.045, BLACK, s * 0.1, -0.02, 0.71, head, 8);
    n.scale.set(0.7, 1, 0.5);
    const ear = cone(0.08, 0.26, brown, s * 0.13, 0.33, -0.18, head, 8);
    ear.rotation.z = -s * 0.15;
    inked(ear, 0.012);
  }
  const eyeL = eyes(head, 0.21, 0.1, 0.06, 0.075, 'round', 0.9);
  // Neigh-poleon's bicorne
  const hat = group(head, 0, 0.36, -0.08);
  const hatMat = smooth('#1e1e2a', { roughness: 0.5 });
  const brim = ball(0.42, hatMat, 0, 0, 0, hat, 20);
  brim.scale.set(1.15, 0.45, 0.35);
  inked(brim, 0.015);
  const trim = torus(0.35, 0.02, smooth('#e3b53b', { metalness: 0.6, roughness: 0.3 }), 0, -0.02, 0, hat, Math.PI, 16);
  trim.scale.set(1.35, 0.5, 1);
  ball(0.07, smooth(accent), 0.28, 0.07, 0.12, hat, 10);

  const legs = [
    leg(root, 0.27, 1.08, 0.72, 1.08, 0.14, brown, { hoof: HOOF, sock: blaze }),
    leg(root, -0.27, 1.08, 0.72, 1.08, 0.14, brown, { hoof: HOOF }),
    leg(root, 0.27, 1.08, -0.72, 1.08, 0.14, brown, { hoof: HOOF }),
    leg(root, -0.27, 1.08, -0.72, 1.08, 0.14, brown, { hoof: HOOF, sock: blaze }),
  ];
  scarf(body, 0.42, 0.95, 0.3, accent, -0.6);
  const tail = group(body, 0, 0.25, -0.95);
  for (const s of [-0.06, 0, 0.06]) {
    tube([[s, 0, 0], [s * 2, -0.2, -0.3], [s * 3, -0.7, -0.35], [s * 3, -1.05, -0.2]], 0.07, mane, tail, { taper: true });
  }
  return { root, rig: { body, head, legs, tail, eyes: eyeL, bodyY: 1.48, headZ: 1.25 } };
}

const BUILDERS = {
  cow: buildCow,
  chicken: buildChicken,
  pig: buildPig,
  sheep: buildSheep,
  goat: buildGoat,
  horse: buildHorse,
};

export const ANIMAL_EMOJI = {
  cow: '🐄', chicken: '🐔', pig: '🐖', sheep: '🐑', goat: '🐐', horse: '🐎',
};

// Minimap colours
export const ANIMAL_COLORS = {
  cow: '#f4f1ea', chicken: '#ffe14a', pig: '#f7a8b8', sheep: '#d8d4ff', goat: '#c9b79c', horse: '#b87a3d',
};

export function buildAnimal(id, accent = '#e0302a') {
  const build = BUILDERS[id] || buildCow;
  const model = build(accent);
  model.root.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline) {
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  return model;
}

// Accent colours used for scarves/bows so same-animal players are distinguishable.
export const ACCENTS = ['#e0302a', '#2a7de0', '#2ab84a', '#e0a82a', '#9b3ae0', '#e03ab8', '#2ad0d0', '#ff7a1a', '#444444', '#ffffff'];

export function accentFor(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ACCENTS[Math.abs(h) % ACCENTS.length];
}

