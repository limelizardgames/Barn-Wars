// Decorative farm clutter that makes the barnyard feel lived-in. None of these
// collide; they sit where they won't get in the way of fights.
import * as THREE from 'three';
import {
  smooth, box, rbox, ball, cyl, cone, torus, tube, group, outline, canvasTexture, mulberry,
} from './kit.js';
import { straw, planks } from './textures.js';
import { CORN_FIELDS } from '../../../shared/arena.js';

let plaidTex = null;
function plaid() {
  if (!plaidTex) {
    plaidTex = canvasTexture(64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#b8322a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(30,20,20,0.45)';
      for (let i = 0; i < w; i += 16) { ctx.fillRect(i, 0, 6, h); ctx.fillRect(0, i, w, 6); }
      ctx.fillStyle = 'rgba(255,230,200,0.25)';
      for (let i = 8; i < w; i += 16) { ctx.fillRect(i, 0, 2, h); ctx.fillRect(0, i, w, 2); }
    }, { repeat: [2, 2] });
  }
  return plaidTex;
}

export function buildProps(world) {
  const animated = [];

  // --- scarecrow in the corn --------------------------------------------------------
  const corn = CORN_FIELDS[0];
  if (corn) {
    const sc = group(world, corn.x + 2, 0, corn.z - 1);
    sc.rotation.y = 0.5;
    const wood = smooth('#6e4a2a');
    cyl(0.08, 0.1, 3.6, wood, 0, 1.8, 0, sc, 6);
    const arms = cyl(0.06, 0.06, 2.6, wood, 0, 2.6, 0, sc, 6);
    arms.rotation.z = Math.PI / 2;
    const shirt = rbox(0.9, 1.0, 0.45, 0.12, new THREE.MeshStandardMaterial({ map: plaid(), roughness: 0.9 }), 0, 2.35, 0, sc);
    outline(shirt, 0.03);
    for (const s of [-1, 1]) {
      const sleeve = rbox(1.0, 0.3, 0.3, 0.1, new THREE.MeshStandardMaterial({ map: plaid(), roughness: 0.9 }), s * 0.9, 2.6, 0, sc);
      outline(sleeve, 0.02);
      const tuft = cone(0.14, 0.35, new THREE.MeshStandardMaterial({ map: straw(), roughness: 1 }), s * 1.45, 2.6, 0, sc, 6);
      tuft.rotation.z = s * Math.PI / 2;
    }
    box(0.9, 0.5, 0.42, smooth('#4a6fa5'), 0, 1.65, 0, sc); // overalls
    const head = ball(0.36, smooth('#d8b98a', { roughness: 1 }), 0, 3.25, 0, sc, 16);
    outline(head, 0.02);
    for (const s of [-1, 1]) ball(0.05, smooth('#1d1a18'), s * 0.12, 3.3, 0.33, sc, 6);
    tube([[-0.14, 3.13, 0.32], [0, 3.08, 0.36], [0.14, 3.13, 0.32]], 0.018, smooth('#1d1a18'), sc);
    const hat = group(sc, 0, 3.52, 0);
    cyl(0.6, 0.6, 0.05, smooth('#c9a24a'), 0, 0, 0, hat, 20);
    cyl(0.3, 0.34, 0.35, smooth('#c9a24a'), 0, 0.18, 0, hat, 16);
    cyl(0.345, 0.345, 0.08, smooth('#7d1f19'), 0, 0.06, 0, hat, 16);
    hat.rotation.z = 0.12;
    // a crow keeping it company
    const crow = group(sc, 0.9, 2.72, 0);
    const cb = ball(0.13, smooth('#1f1f26'), 0, 0.1, 0, crow, 10);
    cb.scale.set(0.8, 0.8, 1.3);
    ball(0.08, smooth('#1f1f26'), 0, 0.2, 0.13, crow, 8);
    const beak = cone(0.03, 0.1, smooth('#e3b53b'), 0, 0.2, 0.24, crow, 5);
    beak.rotation.x = Math.PI / 2;
    animated.push((dt, t) => { crow.rotation.y = Math.sin(t * 0.7) * 0.8; crow.children[1].position.y = 0.2 + Math.max(0, Math.sin(t * 3)) * 0.03; });
  }

  // --- pumpkin patch & picket fence by the farmhouse ---------------------------------------
  const patch = group(world, -66, 0, -42);
  const pumpkinMat = smooth('#f08a24', { roughness: 0.6 });
  const stemMat = smooth('#5b6b2a');
  const vine = smooth('#4f8a35');
  const r = mulberry(88);
  for (let i = 0; i < 9; i++) {
    const x = (r() - 0.5) * 5, z = (r() - 0.5) * 3.6, s = 0.35 + r() * 0.3;
    const pk = group(patch, x, s * 0.75, z);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const lobe = ball(s * 0.55, pumpkinMat, Math.cos(a) * s * 0.35, 0, Math.sin(a) * s * 0.35, pk, 12);
      lobe.scale.set(0.8, 0.95, 0.8);
    }
    cyl(0.04, 0.05, 0.25, stemMat, 0, s * 0.6, 0, pk, 6).rotation.z = 0.3;
    const leaf = ball(0.25, vine, s * 0.8, -s * 0.6, 0, pk, 8);
    leaf.scale.y = 0.2;
  }
  const picket = smooth('#f4efe4');
  for (let i = 0; i <= 14; i++) {
    for (const [x, z, rot] of [[-3.4 + i * 0.5, 2.4, 0], [-3.4 + i * 0.5, -2.4, 0]]) {
      const p = box(0.12, 0.8, 0.05, picket, x, 0.4, z, patch);
      p.rotation.y = rot;
      cone(0.085, 0.14, picket, x, 0.87, z, patch, 4).rotation.y = Math.PI / 4;
    }
  }
  for (const z of [2.4, -2.4]) for (const y of [0.25, 0.6]) box(7.1, 0.08, 0.04, picket, 0.1, y, z, patch);

  // --- sunflowers along the north fence ----------------------------------------------------
  const petal = smooth('#ffcc1f');
  const centre = smooth('#5b3a1f', { roughness: 1 });
  const stalk = smooth('#4f8a35');
  for (let i = 0; i < 16; i++) {
    const x = 6 + i * 1.7 + (r() - 0.5) * 0.5;
    const z = 73.2 + (r() - 0.5) * 0.4;
    const h = 2 + r() * 0.8;
    const f = group(world, x, 0, z);
    cyl(0.05, 0.07, h, stalk, 0, h / 2, 0, f, 6);
    const leafL = ball(0.28, stalk, 0.25, h * 0.5, 0, f, 8);
    leafL.scale.set(1, 0.15, 0.6);
    const head = group(f, 0, h, 0.1);
    head.rotation.x = 0.35 + r() * 0.2;
    head.rotation.y = Math.PI + (r() - 0.5) * 0.5; // face into the farm
    cyl(0.22, 0.22, 0.08, centre, 0, 0, 0, head, 16).rotation.x = Math.PI / 2;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const pt = ball(0.12, petal, Math.cos(a) * 0.3, Math.sin(a) * 0.3, -0.01, head, 6);
      pt.scale.set(k % 2 ? 0.55 : 0.5, 1.25, 0.2);
      pt.rotation.z = a - Math.PI / 2;
    }
    animated.push((dt, t) => { head.rotation.z = Math.sin(t * 1.1 + i) * 0.06; });
  }

  // --- laundry line behind the farmhouse -----------------------------------------------------
  const line = group(world, -58, 0, -64);
  const post = smooth('#6e4a2a');
  for (const x of [-6, 6]) {
    cyl(0.07, 0.09, 2.6, post, x, 1.3, 0, line, 6);
    cyl(0.04, 0.04, 0.7, post, x, 2.5, 0, line, 6).rotation.x = Math.PI / 2;
  }
  tube([[-6, 2.5, 0.3], [0, 2.25, 0.3], [6, 2.5, 0.3]], 0.012, smooth('#dddddd'), line);
  const clothColors = ['#ffffff', '#5aa0e0', '#f2c14e', '#e05a8a', '#8fd06a'];
  const cloths = [];
  for (let i = 0; i < 6; i++) {
    const x = -4.6 + i * 1.8;
    const w = 0.9 + r() * 0.5, h = 0.8 + r() * 0.6;
    const geo = new THREE.PlaneGeometry(w, h, 6, 6);
    geo.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(geo, smooth(clothColors[i % clothColors.length], { side: THREE.DoubleSide, roughness: 0.95 }));
    m.position.set(x, 2.28 + Math.abs(x) * 0.035, 0.3);
    m.castShadow = true;
    line.add(m);
    cloths.push({ m, base: geo.attributes.position.array.slice(), h, phase: r() * 6 });
  }
  animated.push((dt, t) => {
    for (const c of cloths) {
      const pos = c.m.geometry.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const bx = c.base[v * 3], by = c.base[v * 3 + 1];
        const k = -by / c.h; // 0 at the peg, 1 at the hem
        pos.setZ(v, Math.sin(t * 2.2 + bx * 2 + c.phase) * 0.18 * k * k + Math.sin(t * 3.7 + by * 3) * 0.04 * k);
      }
      pos.needsUpdate = true;
      c.m.geometry.computeVertexNormals();
    }
  });

  // --- tire swing in the orchard ------------------------------------------------------------
  const swing = group(world, 41.6, 4.3, 48);
  cyl(0.025, 0.025, 2.4, smooth('#c9a878'), 0, -1.2, 0, swing, 5); // rope
  const tire = torus(0.42, 0.14, smooth('#222222', { roughness: 0.9 }), 0, -2.55, 0, swing, Math.PI * 2, 18);
  outline(tire, 0.02);
  animated.push((dt, t) => { swing.rotation.x = Math.sin(t * 1.4) * 0.22; swing.rotation.z = Math.sin(t * 0.9) * 0.05; });

  // --- wheelbarrow of hay, milk cans and a mailbox ---------------------------------------------
  const wb = group(world, 11, 0, -22.5);
  wb.rotation.y = -0.6;
  const tray = rbox(1.1, 0.45, 1.5, 0.08, smooth('#3c8d3a', { metalness: 0.3, roughness: 0.5 }), 0, 0.7, 0, wb);
  outline(tray, 0.02);
  rbox(0.95, 0.3, 1.3, 0.12, new THREE.MeshStandardMaterial({ map: straw(), roughness: 1 }), 0, 0.95, 0, wb);
  const wheel = cyl(0.28, 0.28, 0.12, smooth('#222222'), 0, 0.28, 0.85, wb, 16);
  wheel.rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) {
    const handle = cyl(0.035, 0.035, 1.4, smooth('#6e4a2a'), s * 0.4, 0.75, -1.05, wb, 6);
    handle.rotation.x = Math.PI / 2 - 0.35;
    cyl(0.03, 0.03, 0.55, smooth('#555555'), s * 0.35, 0.3, -0.45, wb, 6);
  }

  const cans = group(world, -7.5, 0, -26.8);
  const tin = smooth('#c7cfd4', { metalness: 0.7, roughness: 0.35 });
  for (const [x, z] of [[0, 0], [0.6, 0.15], [0.25, 0.6]]) {
    const c = group(cans, x, 0, z);
    outline(cyl(0.22, 0.25, 0.7, tin, 0, 0.35, 0, c, 14), 0.015);
    cyl(0.14, 0.2, 0.2, tin, 0, 0.8, 0, c, 14);
    cyl(0.16, 0.16, 0.06, tin, 0, 0.92, 0, c, 14);
  }

  const mailbox = group(world, -50.5, 0, -47.5);
  cyl(0.06, 0.06, 1.1, smooth('#6e4a2a'), 0, 0.55, 0, mailbox, 6);
  const mb = rbox(0.35, 0.35, 0.6, 0.15, smooth('#4a6fa5', { metalness: 0.4, roughness: 0.4 }), 0, 1.25, 0, mailbox);
  outline(mb, 0.015);
  const flag = box(0.03, 0.25, 0.1, smooth('#d6281e'), 0.2, 1.35, -0.1, mailbox);
  animated.push((dt, t) => { flag.rotation.x = Math.sin(t * 0.5) > 0.6 ? -0.8 : 0; });

  // --- apple crates by the orchard ------------------------------------------------------------
  const crates = group(world, 51.5, 0, 52);
  const apple = smooth('#d8322a', { roughness: 0.45 });
  for (const [x, z] of [[0, 0], [0.9, 0.2]]) {
    const c = group(crates, x, 0, z);
    box(0.8, 0.45, 0.6, new THREE.MeshStandardMaterial({ map: planks('#a8763f', 4, 5), roughness: 0.9 }), 0, 0.225, 0, c);
    for (let k = 0; k < 8; k++) ball(0.1, apple, (k % 4) * 0.17 - 0.26, 0.47, (k < 4 ? -0.1 : 0.12), c, 8);
  }

  return {
    update(dt, t) {
      for (const fn of animated) fn(dt, t);
    },
  };
}
