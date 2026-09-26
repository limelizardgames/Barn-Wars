// Procedural low-poly models for every fighter.
// Each builder returns { root, rig } where root sits on the ground facing +Z
// and rig exposes the parts that the animator moves.
import * as THREE from 'three';
import { mat, box, sphere, cyl, cone, torus, group, leg } from './kit.js';

const BLACK = mat('#1d1a18');
const EYE_WHITE = mat('#ffffff');
const PINK = mat('#f59aac');
const HOOF = mat('#3a2a20');

function eyes(parent, x, y, z, size = 0.09) {
  for (const s of [-1, 1]) {
    sphere(size, EYE_WHITE, s * x, y, z, parent, 0);
    sphere(size * 0.55, BLACK, s * x, y, z + size * 0.6, parent, 0);
  }
}

function scarf(parent, y, z, r, color) {
  const m = mat(color);
  const ring = torus(r, 0.09, m, 0, y, z, parent);
  ring.rotation.x = Math.PI / 2;
  const tail = box(0.18, 0.35, 0.06, m, r * 0.7, y - 0.2, z - r * 0.5, parent);
  tail.rotation.z = 0.3;
  return ring;
}

// ---------------------------------------------------------------------------

function buildCow(accent) {
  const root = new THREE.Group();
  const white = mat('#f4f1ea');
  const body = group(root, 0, 1.3, 0);
  box(1.35, 1.05, 2.2, white, 0, 0, 0, body);
  // spots
  box(0.05, 0.5, 0.6, BLACK, 0.68, 0.15, 0.3, body);
  box(0.05, 0.4, 0.5, BLACK, -0.68, -0.05, -0.4, body);
  box(0.7, 0.05, 0.6, BLACK, 0.2, 0.53, -0.5, body);
  box(0.05, 0.35, 0.4, BLACK, 0.68, 0.05, -0.7, body);
  sphere(0.28, PINK, 0, -0.55, -0.6, body, 0); // udder

  const head = group(body, 0, 0.45, 1.25);
  box(0.8, 0.8, 0.75, white, 0, 0, 0, head);
  box(0.82, 0.4, 0.3, PINK, 0, -0.2, 0.45, head);
  sphere(0.05, BLACK, -0.18, -0.2, 0.61, head, 0);
  sphere(0.05, BLACK, 0.18, -0.2, 0.61, head, 0);
  box(0.4, 0.3, 0.05, BLACK, 0.18, 0.25, 0.38, head);
  eyes(head, 0.22, 0.12, 0.38);
  const horn = mat('#e8dcc0');
  for (const s of [-1, 1]) {
    const h = cone(0.09, 0.4, horn, s * 0.45, 0.45, 0, head);
    h.rotation.z = -s * 0.7;
    const ear = box(0.35, 0.1, 0.2, white, s * 0.55, 0.2, -0.1, head);
    ear.rotation.z = s * 0.3;
  }
  // bell collar
  scarf(body, 0.05, 1.05, 0.5, accent);
  cyl(0.12, 0.18, 0.2, mat('#e3b53b', { metalness: 0.6, roughness: 0.3 }), 0, -0.45, 1.2, body);

  const legs = [
    leg(root, 0.45, 0.85, 0.75, 0.85, 0.16, white, HOOF),
    leg(root, -0.45, 0.85, 0.75, 0.85, 0.16, white, HOOF),
    leg(root, 0.45, 0.85, -0.8, 0.85, 0.16, white, HOOF),
    leg(root, -0.45, 0.85, -0.8, 0.85, 0.16, white, HOOF),
  ];
  const tail = group(body, 0, 0.35, -1.1);
  cyl(0.04, 0.04, 0.8, white, 0, -0.4, 0, tail, 4);
  sphere(0.1, BLACK, 0, -0.82, 0, tail, 0);
  tail.rotation.x = 0.3;
  return { root, rig: { body, head, legs, tail, bodyY: 1.3, headZ: 1.25 } };
}

function buildChicken(accent) {
  const root = new THREE.Group();
  const white = mat('#ffffff');
  const orange = mat('#f39c2b');
  const red = mat('#e0302a');
  const body = group(root, 0, 0.6, 0);
  const torso = sphere(0.42, white, 0, 0, 0, body);
  torso.scale.set(1, 0.95, 1.2);

  const head = group(body, 0, 0.42, 0.32);
  sphere(0.24, white, 0, 0, 0, head);
  const beak = cone(0.08, 0.2, orange, 0, -0.02, 0.26, head, 4);
  beak.rotation.x = Math.PI / 2;
  box(0.05, 0.14, 0.2, red, 0, 0.24, 0, head); // comb
  box(0.05, 0.1, 0.1, red, 0, 0.3, 0.05, head);
  sphere(0.05, red, 0, -0.14, 0.2, head, 0); // wattle
  eyes(head, 0.13, 0.05, 0.17, 0.06);
  // Cluck Norris' headband
  const band = torus(0.235, 0.035, mat(accent), 0, 0.1, 0, head);
  band.rotation.x = Math.PI / 2;
  box(0.05, 0.18, 0.05, mat(accent), 0.05, 0.02, -0.26, head).rotation.z = 0.5;
  box(0.05, 0.18, 0.05, mat(accent), -0.05, 0.02, -0.26, head).rotation.z = -0.5;

  const wings = [];
  for (const s of [-1, 1]) {
    const w = group(body, s * 0.38, 0.08, 0);
    const wing = sphere(0.28, white, s * 0.05, -0.08, -0.02, w, 0);
    wing.scale.set(0.3, 0.8, 1.1);
    wings.push(w);
  }
  const tail = group(body, 0, 0.1, -0.45);
  for (const [x, rz] of [[-0.08, 0.3], [0, 0], [0.08, -0.3]]) {
    const f = cone(0.1, 0.4, white, x, 0.15, 0, tail, 4);
    f.rotation.set(-0.6, 0, rz);
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const l = leg(root, s * 0.15, 0.35, 0.02, 0.35, 0.04, orange);
    const foot = box(0.16, 0.03, 0.2, orange, 0, -0.34, 0.06, l);
    foot.castShadow = true;
    legs.push(l);
  }
  return { root, rig: { body, head, legs, wings, tail, bodyY: 0.6, headZ: 0.32, biped: true } };
}

function buildPig(accent) {
  const root = new THREE.Group();
  const pink = mat('#f7a8b8');
  const darkPink = mat('#e27d93');
  const body = group(root, 0, 0.8, 0);
  const torso = sphere(0.62, pink, 0, 0, 0, body);
  torso.scale.set(1, 0.88, 1.35);
  box(0.4, 0.05, 0.4, mat('#7a5230'), 0.3, 0.5, -0.2, body).rotation.y = 0.4; // mud splotch

  const head = group(body, 0, 0.18, 0.78);
  sphere(0.42, pink, 0, 0, 0, head);
  const snout = cyl(0.2, 0.22, 0.2, darkPink, 0, -0.05, 0.4, head, 10);
  snout.rotation.x = Math.PI / 2;
  sphere(0.045, BLACK, -0.08, -0.05, 0.5, head, 0);
  sphere(0.045, BLACK, 0.08, -0.05, 0.5, head, 0);
  eyes(head, 0.18, 0.14, 0.33, 0.07);
  for (const s of [-1, 1]) {
    const ear = cone(0.15, 0.3, pink, s * 0.28, 0.35, 0.05, head, 3);
    ear.rotation.set(0.5, 0, -s * 0.5);
  }
  scarf(body, 0.05, 0.55, 0.42, accent);

  const legs = [
    leg(root, 0.33, 0.45, 0.45, 0.45, 0.13, pink, HOOF),
    leg(root, -0.33, 0.45, 0.45, 0.45, 0.13, pink, HOOF),
    leg(root, 0.33, 0.45, -0.45, 0.45, 0.13, pink, HOOF),
    leg(root, -0.33, 0.45, -0.45, 0.45, 0.13, pink, HOOF),
  ];
  const tail = group(body, 0, 0.2, -0.82);
  const curl = torus(0.1, 0.035, pink, 0, 0, -0.05, tail, Math.PI * 1.6);
  curl.rotation.y = Math.PI / 2;
  return { root, rig: { body, head, legs, tail, bodyY: 0.8, headZ: 0.78 } };
}

function buildSheep(accent) {
  const root = new THREE.Group();
  const wool = mat('#f3f1ec');
  const face = mat('#2f2a28');
  const body = group(root, 0, 0.9, 0);
  const puffs = [
    [0, 0, 0, 0.55], [0.3, 0.15, 0.35, 0.4], [-0.3, 0.15, 0.35, 0.4], [0.3, 0.15, -0.35, 0.4],
    [-0.3, 0.15, -0.35, 0.4], [0, 0.35, 0, 0.42], [0, 0.05, 0.55, 0.38], [0, 0.05, -0.6, 0.4],
    [0.38, -0.1, 0, 0.38], [-0.38, -0.1, 0, 0.38],
  ];
  const woolGroup = group(body);
  for (const [x, y, z, r] of puffs) sphere(r, wool, x, y, z, woolGroup, 0);

  const head = group(body, 0, 0.22, 0.82);
  const skull = sphere(0.28, face, 0, 0, 0, head, 0);
  skull.scale.set(0.9, 1, 1.25);
  sphere(0.2, wool, 0, 0.22, -0.05, head, 0); // wool tuft
  eyes(head, 0.14, 0.06, 0.25, 0.065);
  for (const s of [-1, 1]) {
    const ear = box(0.28, 0.08, 0.14, face, s * 0.3, 0.05, 0, head);
    ear.rotation.z = -s * 0.4;
  }
  // bow
  const bowMat = mat(accent);
  box(0.14, 0.14, 0.14, bowMat, 0, 0.36, 0.05, head);
  box(0.1, 0.18, 0.08, bowMat, -0.12, 0.36, 0.05, head).rotation.z = 0.8;
  box(0.1, 0.18, 0.08, bowMat, 0.12, 0.36, 0.05, head).rotation.z = -0.8;

  const legs = [
    leg(root, 0.28, 0.55, 0.35, 0.55, 0.08, face),
    leg(root, -0.28, 0.55, 0.35, 0.55, 0.08, face),
    leg(root, 0.28, 0.55, -0.4, 0.55, 0.08, face),
    leg(root, -0.28, 0.55, -0.4, 0.55, 0.08, face),
  ];
  const tail = group(body, 0, 0.1, -0.9);
  sphere(0.15, wool, 0, 0, 0, tail, 0);
  return { root, rig: { body, head, legs, tail, wool: woolGroup, bodyY: 0.9, headZ: 0.82 } };
}

function buildGoat(accent) {
  const root = new THREE.Group();
  const tan = mat('#c9b79c');
  const darkTan = mat('#8d7a60');
  const horn = mat('#5b4b3a');
  const body = group(root, 0, 1.0, 0);
  box(0.75, 0.65, 1.35, tan, 0, 0, 0, body);
  box(0.77, 0.2, 1.37, darkTan, 0, 0.25, 0, body); // back stripe

  const neck = box(0.35, 0.6, 0.35, tan, 0, 0.35, 0.65, body);
  neck.rotation.x = 0.4;
  const head = group(body, 0, 0.7, 0.85);
  box(0.4, 0.42, 0.55, tan, 0, 0, 0.05, head);
  box(0.32, 0.28, 0.2, darkTan, 0, -0.08, 0.38, head);
  const beard = cone(0.08, 0.3, mat('#efe6d6'), 0, -0.35, 0.3, head, 4);
  beard.rotation.x = Math.PI;
  eyes(head, 0.2, 0.08, 0.2, 0.065);
  for (const s of [-1, 1]) {
    const h = torus(0.22, 0.06, horn, s * 0.12, 0.3, -0.12, head, Math.PI * 1.1, 8);
    h.rotation.set(0, Math.PI / 2, 0.2);
    const ear = box(0.3, 0.08, 0.12, tan, s * 0.3, 0.1, -0.05, head);
    ear.rotation.z = s * 0.4;
  }
  scarf(body, 0.25, 0.7, 0.24, accent);
  const legs = [
    leg(root, 0.25, 0.7, 0.5, 0.7, 0.08, tan, HOOF),
    leg(root, -0.25, 0.7, 0.5, 0.7, 0.08, tan, HOOF),
    leg(root, 0.25, 0.7, -0.5, 0.7, 0.08, tan, HOOF),
    leg(root, -0.25, 0.7, -0.5, 0.7, 0.08, tan, HOOF),
  ];
  const tail = group(body, 0, 0.25, -0.68);
  const t = cone(0.07, 0.25, darkTan, 0, 0.1, 0, tail, 4);
  t.rotation.x = -0.4;
  return { root, rig: { body, head, legs, tail, bodyY: 1.0, headZ: 0.85 } };
}

function buildHorse(accent) {
  const root = new THREE.Group();
  const brown = mat('#8b5a2b');
  const mane = mat('#2e1d12');
  const blaze = mat('#f4eee2');
  const body = group(root, 0, 1.45, 0);
  box(0.85, 0.85, 2.0, brown, 0, 0, 0, body);

  const neck = group(body, 0, 0.3, 0.85);
  const n = box(0.45, 1.0, 0.5, brown, 0, 0.35, 0.15, neck);
  n.rotation.x = 0.45;
  for (let i = 0; i < 4; i++) box(0.12, 0.25, 0.22, mane, 0, 0.1 + i * 0.22, -0.12 + i * 0.1, neck);

  const head = group(body, 0, 1.0, 1.25);
  box(0.42, 0.45, 0.8, brown, 0, 0, 0.1, head);
  box(0.38, 0.35, 0.3, mat('#6e4520'), 0, -0.07, 0.55, head);
  box(0.1, 0.3, 0.44, blaze, 0, 0.1, 0.25, head).position.y = 0.2;
  sphere(0.04, BLACK, -0.1, -0.05, 0.71, head, 0);
  sphere(0.04, BLACK, 0.1, -0.05, 0.71, head, 0);
  eyes(head, 0.22, 0.1, 0.05, 0.065);
  for (const s of [-1, 1]) cone(0.08, 0.25, brown, s * 0.14, 0.33, -0.2, head, 4);
  // Neigh-poleon's bicorne
  const hat = group(head, 0, 0.35, -0.1);
  const hatMat = mat('#1e1e28');
  const brim = box(0.9, 0.25, 0.25, hatMat, 0, 0.05, 0, hat);
  brim.scale.set(1, 1, 1);
  cone(0.3, 0.3, hatMat, 0, 0.2, 0, hat, 3).rotation.set(0, Math.PI / 2, 0);
  sphere(0.07, mat(accent), 0.25, 0.12, 0.13, hat, 0);

  const legs = [
    leg(root, 0.28, 1.05, 0.75, 1.05, 0.12, brown, HOOF),
    leg(root, -0.28, 1.05, 0.75, 1.05, 0.12, brown, HOOF),
    leg(root, 0.28, 1.05, -0.75, 1.05, 0.12, brown, HOOF),
    leg(root, -0.28, 1.05, -0.75, 1.05, 0.12, brown, HOOF),
  ];
  scarf(body, 0.35, 0.95, 0.32, accent);
  const tail = group(body, 0, 0.3, -1.0);
  const t = box(0.18, 0.9, 0.18, mane, 0, -0.4, -0.1, tail);
  t.rotation.x = 0.25;
  tail.rotation.x = 0.35;
  return { root, rig: { body, head, legs, tail, bodyY: 1.45, headZ: 1.25 } };
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

export function buildAnimal(id, accent = '#e0302a') {
  const build = BUILDERS[id] || buildCow;
  const model = build(accent);
  model.root.traverse((o) => {
    if (o.isMesh) {
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
