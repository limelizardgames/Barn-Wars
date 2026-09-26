// Builds the barnyard from shared/arena.js so visuals line up with collisions.
import * as THREE from 'three';
import { mat, box, sphere, cyl, cone, group } from './kit.js';
import { ARENA_HALF, OBSTACLES, MUD_PITS } from '../../../shared/arena.js';

const RED = mat('#b8322a');
const RED_DARK = mat('#8e241d');
const WHITE = mat('#f4efe4');
const WOOD = mat('#8a5a33');
const WOOD_DARK = mat('#5e3b1f');
const HAY = mat('#e9c25a');
const HAY_DARK = mat('#c99d36');
const STONE = mat('#9a9a92');
const METAL = mat('#9aa3a8', { metalness: 0.4, roughness: 0.5 });
const ROOF = mat('#5a5f66');
const LEAF = mat('#4f9a3a');
const LEAF2 = mat('#3f8a33');

export function buildEnvironment(scene) {
  const world = group(scene);

  // --- sky, fog & light -------------------------------------------------
  scene.background = new THREE.Color('#9fd4f2');
  scene.fog = new THREE.Fog('#bfe3f5', 90, 230);

  const hemi = new THREE.HemisphereLight('#dff3ff', '#5f8a3a', 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  sun.position.set(40, 70, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 180;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  // --- ground --------------------------------------------------------------
  const groundGeo = new THREE.PlaneGeometry(400, 400, 80, 80);
  groundGeo.rotateX(-Math.PI / 2);
  const colors = [];
  const pos = groundGeo.attributes.position;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const inside = Math.abs(x) < ARENA_HALF + 2 && Math.abs(z) < ARENA_HALF + 2;
    if (!inside) {
      // rolling hills outside the fence
      const d = Math.max(Math.abs(x), Math.abs(z)) - ARENA_HALF;
      pos.setY(i, Math.max(0, d) * 0.06 * (1.2 + Math.sin(x * 0.05) * Math.cos(z * 0.04)) * 3);
    }
    const n = Math.sin(x * 0.3) * Math.cos(z * 0.27) * 0.5 + Math.random() * 0.5;
    c.setHSL(0.27 + n * 0.03, 0.45, 0.42 + n * 0.08);
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  ground.receiveShadow = true;
  world.add(ground);

  // dirt yard in front of the barn
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(16, 24), mat('#b08858', { roughness: 1 }));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(0, 0.02, -18);
  dirt.receiveShadow = true;
  world.add(dirt);

  // mud pits
  for (const m of MUD_PITS) {
    const pit = new THREE.Mesh(new THREE.CircleGeometry(m.r, 20), mat('#6b4526', { roughness: 0.25 }));
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(m.x, 0.04, m.z);
    pit.receiveShadow = true;
    world.add(pit);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * m.r * 0.7;
      const blob = sphere(0.3 + Math.random() * 0.3, mat('#5a391f'), m.x + Math.cos(a) * r, 0, m.z + Math.sin(a) * r, world, 0);
      blob.scale.y = 0.3;
    }
  }

  // --- obstacles from the shared arena ------------------------------------------
  for (const o of OBSTACLES) {
    const builder = PROP_BUILDERS[o.kind];
    if (builder) builder(world, o);
  }

  buildPerimeterFence(world);
  buildScenery(world);
  const clouds = buildClouds(world);
  const windmill = buildWindmill(world, -70, 62);
  const grass = buildGrass(world);

  return {
    world,
    sun,
    update(dt, t) {
      windmill.rotation.z += dt * 0.8;
      for (const cl of clouds) {
        cl.position.x += dt * cl.userData.speed;
        if (cl.position.x > 200) cl.position.x = -200;
      }
      grass.material.userData.time = t;
    },
    followSun(target) {
      sun.position.set(target.x + 40, 70, target.z + 25);
      sun.target.position.set(target.x, 0, target.z);
    },
  };
}

// ---------------------------------------------------------------------------
// Props

const PROP_BUILDERS = {
  barn(world, o) {
    const g = group(world, o.x, 0, o.z);
    box(o.w, o.h, o.d, RED, 0, o.h / 2, 0, g);
    // white corner trim
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.4, o.h, 0.4, WHITE, sx * (o.w / 2), o.h / 2, sz * (o.d / 2), g);
    // gable roof
    const roofH = 5;
    const shape = new THREE.Shape();
    shape.moveTo(-o.w / 2 - 0.8, 0);
    shape.lineTo(0, roofH);
    shape.lineTo(o.w / 2 + 0.8, 0);
    shape.lineTo(-o.w / 2 - 0.8, 0);
    const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: o.d - 0.2, bevelEnabled: false }), RED_DARK);
    gable.position.set(0, o.h, -o.d / 2 + 0.1);
    gable.castShadow = true;
    g.add(gable);
    const slope = Math.hypot(o.w / 2 + 1.2, roofH);
    const ang = Math.atan2(roofH, o.w / 2 + 1.2);
    for (const s of [-1, 1]) {
      const r = box(slope, 0.3, o.d + 1, ROOF, s * (o.w / 4 + 0.3), o.h + roofH / 2 + 0.1, 0, g);
      r.rotation.z = -s * ang;
    }
    // doors with the classic white X
    const front = o.d / 2 + 0.05;
    box(6, 6, 0.1, RED_DARK, 0, 3, front, g);
    const f1 = box(0.4, 8.4, 0.15, WHITE, 0, 3, front + 0.05, g);
    f1.rotation.z = Math.atan2(6, 6);
    const f2 = box(0.4, 8.4, 0.15, WHITE, 0, 3, front + 0.05, g);
    f2.rotation.z = -Math.atan2(6, 6);
    box(6.4, 0.4, 0.15, WHITE, 0, 6.1, front + 0.05, g);
    box(0.4, 6.2, 0.15, WHITE, -3.1, 3, front + 0.05, g);
    box(0.4, 6.2, 0.15, WHITE, 3.1, 3, front + 0.05, g);
    // hay loft window
    box(2.4, 2, 0.1, mat('#3a2412'), 0, o.h + 1.5, front + 0.05, g);
    box(2.8, 0.3, 0.15, WHITE, 0, o.h + 2.6, front + 0.08, g);
    box(1.4, 0.8, 0.6, HAY, 0, o.h + 0.8, front, g);
  },

  silo(world, o) {
    const g = group(world, o.x, 0, o.z);
    const r = o.w / 2;
    cyl(r, r, o.h, mat('#c7ccd0', { metalness: 0.3, roughness: 0.55 }), 0, o.h / 2, 0, g, 16);
    for (let y = 2; y < o.h; y += 3) cyl(r + 0.05, r + 0.05, 0.2, METAL, 0, y, 0, g, 16);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#8d969c', { metalness: 0.4 }));
    dome.position.y = o.h;
    dome.castShadow = true;
    g.add(dome);
  },

  coop(world, o) {
    const g = group(world, o.x, 0, o.z);
    box(o.w, o.h * 0.35, o.d, WOOD_DARK, 0, o.h * 0.175, 0, g); // stilts area
    box(o.w - 0.2, o.h * 0.55, o.d - 0.2, mat('#e7d2a2'), 0, o.h * 0.35 + o.h * 0.275, 0, g);
    const roof = box(o.w + 0.8, 0.25, o.d + 0.8, RED, 0, o.h + 0.05, 0, g);
    roof.rotation.x = 0.08;
    box(0.8, 0.9, 0.1, mat('#2a1a10'), 0, o.h * 0.6, o.d / 2 - 0.05, g);
    const ramp = box(0.8, 0.08, 2.2, WOOD, 0, o.h * 0.2, o.d / 2 + 0.9, g);
    ramp.rotation.x = 0.55;
  },

  tractor(world, o) {
    const g = group(world, o.x, 0, o.z);
    const green = mat('#3c8d3a');
    const yellow = mat('#f2c230');
    box(1.8, 1.2, 3.2, green, 0, 1.4, 0.5, g);
    box(1.6, 1.6, 1.6, green, 0, 2.0, -0.9, g);
    box(1.5, 1.1, 1.5, mat('#bfe6f5', { roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.6 }), 0, 2.2, -0.9, g);
    box(1.8, 0.15, 1.8, green, 0, 2.9, -0.9, g);
    cyl(0.12, 0.12, 1.2, METAL, 0.5, 2.3, 1.4, g);
    for (const s of [-1, 1]) {
      const back = cyl(1.2, 1.2, 0.7, mat('#222222'), s * 1.25, 1.2, -1.3, g, 14);
      back.rotation.z = Math.PI / 2;
      const hub = cyl(0.5, 0.5, 0.72, yellow, s * 1.25, 1.2, -1.3, g, 10);
      hub.rotation.z = Math.PI / 2;
      const front = cyl(0.65, 0.65, 0.45, mat('#222222'), s * 1.0, 0.65, 1.7, g, 12);
      front.rotation.z = Math.PI / 2;
      const fhub = cyl(0.3, 0.3, 0.47, yellow, s * 1.0, 0.65, 1.7, g, 8);
      fhub.rotation.z = Math.PI / 2;
    }
  },

  trough(world, o) {
    const g = group(world, o.x, 0, o.z);
    box(o.w, o.h, o.d, WOOD, 0, o.h / 2, 0, g);
    const water = box(o.w - 0.3, 0.05, o.d - 0.3, mat('#4fa3d8', { roughness: 0.1, metalness: 0.1 }), 0, o.h - 0.1, 0, g);
    water.castShadow = false;
  },

  well(world, o) {
    const g = group(world, o.x, 0, o.z);
    cyl(o.w / 2, o.w / 2 + 0.1, o.h, STONE, 0, o.h / 2, 0, g, 10);
    cyl(o.w / 2 - 0.3, o.w / 2 - 0.3, 0.05, mat('#1f3a5a'), 0, o.h - 0.1, 0, g, 10);
    for (const s of [-1, 1]) box(0.2, 2.2, 0.2, WOOD_DARK, s * (o.w / 2 - 0.1), o.h + 1.1, 0, g);
    const roof = cone(o.w / 2 + 0.6, 1.2, RED, 0, o.h + 2.7, 0, g, 4);
    roof.rotation.y = Math.PI / 4;
    const crank = cyl(0.08, 0.08, o.w, WOOD, 0, o.h + 1.6, 0, g);
    crank.rotation.z = Math.PI / 2;
  },

  hay(world, o) {
    const g = group(world, o.x, o.y, o.z);
    g.rotation.y = ((o.id * 37) % 7) * 0.02;
    box(o.w, o.h, o.d, HAY, 0, o.h / 2, 0, g);
    for (const s of [-0.3, 0.3]) box(0.08, o.h + 0.02, o.d + 0.02, HAY_DARK, s * o.w, o.h / 2, 0, g);
  },

  crate(world, o) {
    const g = group(world, o.x, o.y, o.z);
    box(o.w, o.h, o.d, WOOD, 0, o.h / 2, 0, g);
    const e = 0.14;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(e, o.h + 0.02, e, WOOD_DARK, sx * (o.w / 2 - e / 2), o.h / 2, sz * (o.d / 2 - e / 2), g);
    for (const sy of [0, 1]) for (const sz of [-1, 1]) box(o.w, e, e, WOOD_DARK, 0, sy * (o.h - e) + e / 2, sz * (o.d / 2 - e / 2), g);
    const diag = box(Math.hypot(o.w, o.h) - 0.2, e, 0.05, WOOD_DARK, 0, o.h / 2, o.d / 2 + 0.01, g);
    diag.rotation.z = Math.atan2(o.h, o.w);
  },

  fence(world, o) {
    const g = group(world, o.x, 0, o.z);
    const alongX = o.w > o.d;
    const len = alongX ? o.w : o.d;
    fenceRun(g, len, alongX, o.h);
  },

  tree(world, o) {
    tree(world, o.x, o.z, 1 + (o.id % 3) * 0.15);
  },
};

function fenceRun(g, len, alongX, h = 1.2) {
  const posts = Math.max(2, Math.round(len / 2.5) + 1);
  for (let i = 0; i < posts; i++) {
    const t = -len / 2 + (len * i) / (posts - 1);
    box(0.25, h + 0.2, 0.25, WOOD_DARK, alongX ? t : 0, (h + 0.2) / 2, alongX ? 0 : t, g);
  }
  for (const y of [h * 0.45, h * 0.9]) {
    box(alongX ? len : 0.12, 0.18, alongX ? 0.12 : len, WOOD, 0, y, 0, g);
  }
}

function tree(world, x, z, s = 1) {
  const g = group(world, x, 0, z);
  cyl(0.35 * s, 0.5 * s, 4 * s, WOOD_DARK, 0, 2 * s, 0, g, 6);
  sphere(2.4 * s, LEAF, 0, 5 * s, 0, g, 0);
  sphere(1.8 * s, LEAF2, 1.2 * s, 6 * s, 0.4 * s, g, 0);
  sphere(1.7 * s, LEAF, -1 * s, 6.2 * s, -0.6 * s, g, 0);
  return g;
}

function buildPerimeterFence(world) {
  const L = ARENA_HALF * 2;
  const n = group(world, 0, 0, ARENA_HALF); fenceRun(n, L, true);
  const s = group(world, 0, 0, -ARENA_HALF); fenceRun(s, L, true);
  const e = group(world, ARENA_HALF, 0, 0); fenceRun(e, L, false);
  const w = group(world, -ARENA_HALF, 0, 0); fenceRun(w, L, false);
}

function buildScenery(world) {
  // trees & bushes outside the fence
  const rng = mulberry(7);
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2;
    const r = ARENA_HALF + 10 + rng() * 60;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const d = Math.max(Math.abs(x), Math.abs(z)) - ARENA_HALF;
    const y = Math.max(0, d) * 0.06 * (1.2 + Math.sin(x * 0.05) * Math.cos(z * 0.04)) * 3;
    const t = tree(world, x, z, 0.9 + rng() * 0.8);
    t.position.y = y - 0.3;
  }
  // flowers inside the arena
  const flowerColors = ['#ffffff', '#ffd93b', '#ff6fa8', '#b58cff'].map((col) => mat(col));
  for (let i = 0; i < 120; i++) {
    const x = (rng() - 0.5) * ARENA_HALF * 1.9, z = (rng() - 0.5) * ARENA_HALF * 1.9;
    const f = sphere(0.12, flowerColors[i % flowerColors.length], x, 0.15, z, world, 0);
    f.castShadow = false;
  }
}

function buildGrass(world) {
  const geo = new THREE.ConeGeometry(0.08, 0.5, 3);
  geo.translate(0, 0.25, 0);
  const material = mat('#5da83d');
  const count = 2500;
  const inst = new THREE.InstancedMesh(geo, material, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const rng = mulberry(3);
  let placed = 0;
  while (placed < count) {
    const x = (rng() - 0.5) * ARENA_HALF * 2, z = (rng() - 0.5) * ARENA_HALF * 2;
    if (Math.hypot(x, z + 18) < 16) continue; // keep the dirt yard clear
    e.set((rng() - 0.5) * 0.4, rng() * Math.PI, (rng() - 0.5) * 0.4);
    q.setFromEuler(e);
    const s = 0.6 + rng() * 0.9;
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
    inst.setMatrixAt(placed++, m);
  }
  inst.receiveShadow = true;
  world.add(inst);
  return inst;
}

function buildClouds(world) {
  const cloudMat = mat('#ffffff', { roughness: 1 });
  const rng = mulberry(11);
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const g = group(world, (rng() - 0.5) * 400, 45 + rng() * 25, (rng() - 0.5) * 300);
    const n = 3 + Math.floor(rng() * 4);
    for (let j = 0; j < n; j++) {
      const s = sphere(3 + rng() * 3, cloudMat, j * 3.5 - n * 1.7, rng() * 1.5, (rng() - 0.5) * 3, g, 0);
      s.castShadow = false;
    }
    g.userData.speed = 1 + rng() * 2;
    clouds.push(g);
  }
  return clouds;
}

function buildWindmill(world, x, z) {
  const g = group(world, x, 4, z);
  g.rotation.y = Math.PI * 0.75;
  cyl(1.5, 3, 16, WHITE, 0, 8, 0, g, 8);
  cone(2.2, 3, RED, 0, 17.5, 0, g, 8);
  const hub = group(g, 0, 14, 2.4);
  sphere(0.6, WOOD_DARK, 0, 0, 0, hub, 0);
  for (let i = 0; i < 4; i++) {
    const blade = group(hub);
    blade.rotation.z = (i * Math.PI) / 2;
    box(0.4, 7, 0.1, WOOD, 0, 3.8, 0, blade);
    box(1.6, 5.5, 0.05, mat('#f4efe4'), 0.9, 4.2, 0.05, blade);
  }
  return hub;
}

// Deterministic RNG so every client sees the same scenery.
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
