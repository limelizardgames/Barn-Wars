// Builds the barnyard from shared/arena.js so visuals line up with collisions.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  mat, smooth, box, rbox, sphere, ball, cyl, cone, group, outline, mulberry,
} from './kit.js';
import { planks, boards, shingles, straw, stone, corrugated, grassDetail, dirt } from './textures.js';
import { ARENA_HALF, OBSTACLES, MUD_PITS, PONDS, CORN_FIELDS } from '../../../shared/arena.js';

const A = ARENA_HALF;
const WHITE = smooth('#f4efe4');
const WOOD = smooth('#8a5a33');
const WOOD_DARK = smooth('#5e3b1f');
const METAL = smooth('#9aa3a8', { metalness: 0.5, roughness: 0.45 });
const LEAF = [mat('#4f9a3a'), mat('#3f8a33'), mat('#63ad45'), mat('#579f3c')];

// Shared wind clock for grass, corn and foliage shaders.
const wind = { value: 0 };

function withRepeat(tex, x, y) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  return t;
}

function tmat(tex, x, y, opts = {}) {
  return new THREE.MeshStandardMaterial({ map: withRepeat(tex, x, y), roughness: 0.85, ...opts });
}

// Add a wind sway to a material; `amount` scales with the vertex's height.
function addWind(material, amount = 0.12, instanced = true) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${instanced ? 'vec4 wOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);' : 'vec4 wOrigin = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);'}
        float wPhase = uWind * 1.7 + wOrigin.x * 0.21 + wOrigin.z * 0.17;
        float wBend = max(0.0, position.y) * ${amount.toFixed(3)};
        transformed.x += sin(wPhase) * wBend + sin(wPhase * 2.3) * wBend * 0.3;
        transformed.z += cos(wPhase * 0.8) * wBend * 0.6;`);
  };
  material.customProgramCacheKey = () => `wind-${amount}-${instanced}`;
  return material;
}

// Height of the rolling hills outside the fence.
function hillHeight(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z)) - A - 3;
  if (d <= 0) return 0;
  return d * 0.16 * (1.1 + Math.sin(x * 0.045) * Math.cos(z * 0.038)) + Math.sin(x * 0.02 + z * 0.03) * d * 0.05;
}

export function buildEnvironment(scene, renderer = null) {
  const world = group(scene);
  const spinners = [];
  const bobbers = [];

  // --- sky, fog & light -----------------------------------------------------------
  const sky = buildSky();
  scene.add(sky);
  scene.background = new THREE.Color('#9fd4f2');
  scene.fog = new THREE.Fog('#cde6f2', 140, 420);

  if (renderer) {
    // image-based lighting from the sky for nicer shading everywhere
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(buildSky());
    const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 16), new THREE.MeshBasicMaterial({ color: '#5f8f3c' }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -5;
    envScene.add(ground);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }

  const hemi = new THREE.HemisphereLight('#e4f4ff', '#6b8f3a', 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d4', 2.6);
  sun.position.set(40, 70, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 10; sc.far = 200;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);

  // --- ground -------------------------------------------------------------------
  const size = 800;
  const groundGeo = new THREE.PlaneGeometry(size, size, 160, 160);
  groundGeo.rotateX(-Math.PI / 2);
  const colors = [];
  const pos = groundGeo.attributes.position;
  const c = new THREE.Color();
  const rnd = mulberry(21);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, hillHeight(x, z));
    const n = Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.5 + Math.sin(x * 0.031 + z * 0.027) * 0.5 + rnd() * 0.25;
    c.setHSL(0.26 + n * 0.025, 0.55, 0.34 + n * 0.05);
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
    vertexColors: true, map: grassDetail(), roughness: 1,
  }));
  ground.receiveShadow = true;
  world.add(ground);

  // painted dirt paths & yard
  const paint = buildGroundPaint();
  world.add(paint.mesh);

  // mud pits
  const mudMat = smooth('#5b3a1f', { roughness: 0.15, metalness: 0.05 });
  for (const m of MUD_PITS) {
    const rim = new THREE.Mesh(new THREE.CircleGeometry(m.r + 0.7, 32), smooth('#7b5733', { roughness: 1 }));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(m.x, 0.03, m.z);
    rim.receiveShadow = true;
    world.add(rim);
    const pit = new THREE.Mesh(new THREE.CircleGeometry(m.r, 32), mudMat);
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(m.x, 0.05, m.z);
    pit.receiveShadow = true;
    world.add(pit);
    const r2 = mulberry(Math.round(m.x * 13 + m.z));
    for (let i = 0; i < 7; i++) {
      const a = r2() * Math.PI * 2, r = r2() * m.r * 0.8;
      const blob = ball(0.25 + r2() * 0.35, mudMat, m.x + Math.cos(a) * r, 0.02, m.z + Math.sin(a) * r, world, 10);
      blob.scale.y = 0.25;
    }
  }

  for (const p of PONDS) buildPond(world, p, bobbers);
  for (const f of CORN_FIELDS) buildCorn(world, f);

  // --- obstacles from the shared arena ------------------------------------------
  for (const o of OBSTACLES) {
    const builder = PROP_BUILDERS[o.kind];
    if (builder) builder(world, o, spinners);
  }

  buildPerimeterFence(world);
  buildScenery(world);
  buildGrass(world, paint.isBare);
  buildFlowers(world, paint.isBare);
  const clouds = buildClouds(world);

  return {
    world,
    sun,
    update(dt, t) {
      wind.value = t;
      for (const s of spinners) s.rotation.z += dt * 0.7;
      for (const b of bobbers) {
        b.position.y = b.userData.baseY + Math.sin(t * 2 + b.userData.phase) * 0.05;
        b.userData.angle += dt * b.userData.speed;
        b.position.x = b.userData.cx + Math.cos(b.userData.angle) * b.userData.r;
        b.position.z = b.userData.cz + Math.sin(b.userData.angle) * b.userData.r;
        b.rotation.y = -b.userData.angle + (b.userData.speed > 0 ? Math.PI : 0);
      }
      for (const cl of clouds) {
        cl.position.x += dt * cl.userData.speed;
        if (cl.position.x > 320) cl.position.x = -320;
      }
    },
    followSun(target) {
      sun.position.set(target.x + 40, 70, target.z + 25);
      sun.target.position.set(target.x, 0, target.z);
    },
  };
}

// ---------------------------------------------------------------------------
// Sky

function buildSky() {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#3f8fd8') },
      horizon: { value: new THREE.Color('#d6eef8') },
      sunDir: { value: new THREE.Vector3(40, 70, 25).normalize() },
    },
    vertexShader: `varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.6));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.92, 0.7) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.25);
        if (vDir.y < 0.0) col = mix(horizon, vec3(0.55, 0.7, 0.45), clamp(-vDir.y * 4.0, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, material);
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------------------
// Ground paint: dirt paths and the yard, painted onto a canvas over the arena.

function buildGroundPaint() {
  const res = 1024;
  const toPx = (v) => ((v + A) / (A * 2)) * res;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = res;
  const ctx = canvas.getContext('2d');
  const rnd = mulberry(33);

  const dirtCol = (a) => `rgba(${150 + rnd() * 30},${115 + rnd() * 20},${72 + rnd() * 15},${a})`;
  // yard in front of the barn
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = dirtCol(0.18);
    ctx.beginPath();
    ctx.arc(toPx((rnd() - 0.5) * 6), toPx(-18 + (rnd() - 0.5) * 6), (15 + rnd() * 3) * (res / (A * 2)), 0, Math.PI * 2);
    ctx.fill();
  }
  // winding paths between landmarks
  const paths = [
    [[0, -26], [2, -10], [0, 4], [6, 16], [18, 24], [30, 25]],
    [[-6, -20], [-20, -14], [-30, -10], [-45, -12], [-60, -12]],
    [[-12, -30], [-30, -38], [-45, -46], [-55, -50]],
    [[8, -22], [22, -18], [30, -12], [40, -8], [58, 10]],
    [[28, -20], [38, -32], [45, -44]],
    [[0, 4], [-10, 20], [-24, 32], [-40, 40]],
    [[6, 16], [10, 40], [0, 56], [-6, 62]],
  ];
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const p of paths) {
    for (let pass = 0; pass < 6; pass++) {
      ctx.strokeStyle = dirtCol(0.2);
      ctx.lineWidth = (2.6 + rnd() * 1.4) * (res / (A * 2));
      ctx.beginPath();
      p.forEach(([x, z], i) => {
        const px = toPx(x + (rnd() - 0.5) * 0.8), pz = toPx(z + (rnd() - 0.5) * 0.8);
        if (i === 0) ctx.moveTo(px, pz); else ctx.lineTo(px, pz);
      });
      ctx.stroke();
    }
  }
  // worn patches around props
  for (const o of OBSTACLES) {
    if (!['hay', 'trough', 'well', 'crate', 'coop', 'shed', 'windmill'].includes(o.kind)) continue;
    const g = ctx.createRadialGradient(toPx(o.x), toPx(o.z), 0, toPx(o.x), toPx(o.z), (Math.max(o.w, o.d) + 2) * (res / (A * 2)));
    g.addColorStop(0, 'rgba(160,125,80,0.45)');
    g.addColorStop(1, 'rgba(160,125,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, res, res);
  }
  const data = ctx.getImageData(0, 0, res, res).data;

  // speckle the painted areas with dirt texture detail
  const detail = dirt().image;
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = 0.5;
  for (let y = 0; y < res; y += 256) for (let x = 0; x < res; x += 256) ctx.drawImage(detail, x, y);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const geo = new THREE.PlaneGeometry(A * 2, A * 2);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  mesh.position.y = 0.02;
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;

  const isBare = (x, z) => {
    const px = Math.floor(toPx(x)), pz = Math.floor(toPx(z));
    if (px < 0 || pz < 0 || px >= res || pz >= res) return false;
    return data[(pz * res + px) * 4 + 3] > 70;
  };
  return { mesh, isBare };
}

// ---------------------------------------------------------------------------
// Props

const PROP_BUILDERS = {
  barn(world, o) {
    const g = group(world, o.x, 0, o.z);
    const wallMat = tmat(planks('#b8322a', 10, 3), 4, 1.5);
    const wall = box(o.w, o.h, o.d, wallMat, 0, o.h / 2, 0, g);
    outline(wall, 0.06);
    box(o.w + 0.3, 0.8, o.d + 0.3, smooth('#6d6b64'), 0, 0.4, 0, g); // stone footing
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.45, o.h, 0.45, WHITE, sx * (o.w / 2), o.h / 2, sz * (o.d / 2), g);
    box(o.w + 0.2, 0.35, o.d + 0.2, WHITE, 0, o.h - 0.1, 0, g);
    // gable roof
    const roofH = 5.5;
    const shape = new THREE.Shape();
    shape.moveTo(-o.w / 2, 0);
    shape.lineTo(0, roofH);
    shape.lineTo(o.w / 2, 0);
    shape.lineTo(-o.w / 2, 0);
    const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: o.d, bevelEnabled: false }), wallMat);
    gable.position.set(0, o.h, -o.d / 2);
    gable.castShadow = true;
    g.add(gable);
    const slope = Math.hypot(o.w / 2 + 1.2, roofH);
    const ang = Math.atan2(roofH, o.w / 2 + 1.2);
    const roofMat = tmat(shingles('#4d535b'), 4, 3);
    for (const s of [-1, 1]) {
      const r = box(slope, 0.35, o.d + 1.2, roofMat, s * (o.w / 4 + 0.3), o.h + roofH / 2 + 0.1, 0, g);
      r.rotation.z = -s * ang;
      outline(r, 0.05);
    }
    box(0.5, 0.5, o.d + 1.3, smooth('#3d4249'), 0, o.h + roofH + 0.1, 0, g);
    // cupola with weather vane
    const cup = group(g, 0, o.h + roofH, 0);
    box(2, 2, 2, wallMat, 0, 1, 0, cup);
    const cr = cone(1.8, 1.4, smooth('#4d535b'), 0, 2.7, 0, cup, 4);
    cr.rotation.y = Math.PI / 4;
    cyl(0.05, 0.05, 1.4, METAL, 0, 4, 0, cup);
    const vane = group(cup, 0, 4.4, 0);
    box(1.1, 0.25, 0.04, smooth('#2a2a2a'), 0, 0, 0, vane);
    cone(0.18, 0.35, smooth('#2a2a2a'), 0.6, 0, 0, vane).rotation.z = -Math.PI / 2;
    // doors with the classic white X
    for (const side of [1, -1]) {
      const front = side * (o.d / 2 + 0.05);
      const dg = group(g, 0, 0, front);
      dg.rotation.y = side === 1 ? 0 : Math.PI;
      box(6.2, 6.2, 0.1, tmat(planks('#8e241d', 8, 4), 1, 1), 0, 3.1, 0, dg);
      for (const a of [1, -1]) {
        const f = box(0.4, 8.6, 0.15, WHITE, 0, 3.1, 0.06, dg);
        f.rotation.z = a * Math.atan2(6.2, 6.2);
      }
      box(6.6, 0.4, 0.16, WHITE, 0, 6.3, 0.06, dg);
      box(0.4, 6.4, 0.16, WHITE, -3.2, 3.1, 0.06, dg);
      box(0.4, 6.4, 0.16, WHITE, 3.2, 3.1, 0.06, dg);
      box(0.4, 6.2, 0.16, WHITE, 0, 3.1, 0.07, dg);
      // hay loft
      box(2.6, 2.2, 0.1, smooth('#2a180c'), 0, o.h + 1.6, 0, dg);
      box(3, 0.3, 0.2, WHITE, 0, o.h + 2.8, 0.05, dg);
      box(3, 0.3, 0.2, WHITE, 0, o.h + 0.45, 0.05, dg);
      rbox(1.6, 0.9, 0.7, 0.2, tmat(straw(), 1, 1), 0, o.h + 0.95, 0.1, dg);
      // lamp
      cyl(0.18, 0.25, 0.4, smooth('#2a2a2a'), 0, 7.1, 0.4, dg, 8);
      ball(0.15, smooth('#fff3b0', { emissive: '#ffcf5a', emissiveIntensity: 0.8 }), 0, 6.9, 0.4, dg, 10);
    }
    // side windows
    for (const s of [-1, 1]) {
      for (const z of [-3, 3]) {
        const wx = s * (o.w / 2 + 0.05);
        box(0.1, 1.6, 1.6, smooth('#2a180c'), wx, 5, z, g);
        box(0.16, 0.2, 1.9, WHITE, wx, 5.85, z, g);
        box(0.16, 0.2, 1.9, WHITE, wx, 4.15, z, g);
        box(0.16, 1.9, 0.2, WHITE, wx, 5, z - 0.85, g);
        box(0.16, 1.9, 0.2, WHITE, wx, 5, z + 0.85, g);
      }
    }
  },

  silo(world, o) {
    const g = group(world, o.x, 0, o.z);
    const r = o.w / 2;
    const body = cyl(r, r, o.h, smooth('#c7ccd0', { metalness: 0.45, roughness: 0.45, map: withRepeat(corrugated('#c7ccd0'), 6, 1) }), 0, o.h / 2, 0, g, 24);
    outline(body, 0.05);
    for (let y = 2; y < o.h; y += 3) cyl(r + 0.06, r + 0.06, 0.18, METAL, 0, y, 0, g, 24);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), smooth('#8d969c', { metalness: 0.5, roughness: 0.4 }));
    dome.position.y = o.h;
    dome.castShadow = true;
    g.add(dome);
    // ladder
    for (const s of [-0.25, 0.25]) box(0.07, o.h, 0.07, METAL, s, o.h / 2, r + 0.15, g);
    for (let y = 0.5; y < o.h; y += 0.5) box(0.5, 0.05, 0.05, METAL, 0, y, r + 0.15, g);
  },

  coop(world, o) {
    const g = group(world, o.x, 0, o.z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.2, o.h * 0.35, 0.2, WOOD_DARK, sx * (o.w / 2 - 0.3), o.h * 0.175, sz * (o.d / 2 - 0.3), g);
    const hut = box(o.w - 0.2, o.h * 0.55, o.d - 0.2, tmat(boards('#e7d2a2', 8), 2, 1), 0, o.h * 0.35 + o.h * 0.275, 0, g);
    outline(hut, 0.04);
    const roofMat = tmat(shingles('#b8322a'), 2, 1);
    for (const s of [-1, 1]) {
      const r = box(o.w / 2 + 0.7, 0.18, o.d + 0.8, roofMat, s * (o.w / 4), o.h + 0.25, 0, g);
      r.rotation.z = -s * 0.35;
    }
    box(0.8, 0.9, 0.1, smooth('#2a1a10'), 0, o.h * 0.6, o.d / 2 - 0.05, g);
    const ramp = box(0.8, 0.08, 2.2, tmat(planks('#8a5a33', 4), 1, 1), 0, o.h * 0.2, o.d / 2 + 0.9, g);
    ramp.rotation.x = 0.55;
    // chicken-wire run
    const wire = new THREE.MeshStandardMaterial({ color: '#cccccc', transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
    box(o.w, 1.2, 0.05, wire, 0, 0.6, -o.d / 2 - 1.5, g).castShadow = false;
  },

  tractor(world, o) {
    const g = group(world, o.x, 0, o.z);
    const green = smooth('#3c8d3a', { roughness: 0.4, metalness: 0.2 });
    const yellow = smooth('#f2c230', { roughness: 0.4 });
    const tyre = smooth('#222222', { roughness: 0.9 });
    outline(rbox(1.8, 1.2, 3.2, 0.2, green, 0, 1.4, 0.5, g), 0.04);
    outline(rbox(1.7, 1.7, 1.7, 0.15, green, 0, 2.05, -0.9, g), 0.04);
    box(1.55, 1.1, 1.75, smooth('#bfe6f5', { roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.55 }), 0, 2.25, -0.9, g);
    rbox(1.95, 0.15, 1.95, 0.05, green, 0, 2.95, -0.9, g);
    box(1.4, 0.8, 0.1, smooth('#666666', { metalness: 0.6 }), 0, 1.4, 2.12, g);
    cyl(0.12, 0.12, 1.3, METAL, 0.5, 2.4, 1.4, g, 10);
    for (const s of [-1, 1]) {
      const back = cyl(1.2, 1.2, 0.75, tyre, s * 1.25, 1.2, -1.3, g, 20);
      back.rotation.z = Math.PI / 2;
      outline(back, 0.04);
      const hub = cyl(0.55, 0.55, 0.77, yellow, s * 1.25, 1.2, -1.3, g, 14);
      hub.rotation.z = Math.PI / 2;
      const front = cyl(0.65, 0.65, 0.45, tyre, s * 1.0, 0.65, 1.7, g, 16);
      front.rotation.z = Math.PI / 2;
      outline(front, 0.03);
      const fhub = cyl(0.3, 0.3, 0.47, yellow, s * 1.0, 0.65, 1.7, g, 10);
      fhub.rotation.z = Math.PI / 2;
      ball(0.13, smooth('#fff6c0', { emissive: '#ffe28a', emissiveIntensity: 0.4 }), s * 0.6, 1.7, 2.12, g, 10);
    }
  },

  trough(world, o) {
    const g = group(world, o.x, 0, o.z);
    const alongX = o.w > o.d;
    outline(box(o.w, o.h, o.d, tmat(boards('#8a5a33', 5), alongX ? 2 : 1, 1), 0, o.h / 2, 0, g), 0.03);
    const water = box(o.w - 0.3, 0.05, o.d - 0.3, smooth('#4fa3d8', { roughness: 0.05, metalness: 0.2 }), 0, o.h - 0.1, 0, g);
    water.castShadow = false;
  },

  well(world, o) {
    const g = group(world, o.x, 0, o.z);
    outline(cyl(o.w / 2, o.w / 2 + 0.1, o.h, tmat(stone(), 3, 1), 0, o.h / 2, 0, g, 16), 0.04);
    cyl(o.w / 2 - 0.3, o.w / 2 - 0.3, 0.05, smooth('#1f3a5a', { roughness: 0.1 }), 0, o.h - 0.15, 0, g, 16);
    for (const s of [-1, 1]) box(0.2, 2.2, 0.2, WOOD_DARK, s * (o.w / 2 - 0.1), o.h + 1.1, 0, g);
    const roof = cone(o.w / 2 + 0.7, 1.3, tmat(shingles('#b8322a'), 2, 1), 0, o.h + 2.75, 0, g, 4);
    roof.rotation.y = Math.PI / 4;
    const crank = cyl(0.08, 0.08, o.w, WOOD, 0, o.h + 1.6, 0, g);
    crank.rotation.z = Math.PI / 2;
    cyl(0.18, 0.2, 0.3, WOOD_DARK, 0, o.h + 0.9, 0, g, 10);
  },

  hay(world, o) {
    const g = group(world, o.x, o.y, o.z);
    g.rotation.y = ((o.id * 37) % 7) * 0.015;
    const bale = rbox(o.w, o.h, o.d, 0.12, tmat(straw(o.id % 3), 1, 1), 0, o.h / 2, 0, g);
    outline(bale, 0.03);
    const twine = smooth('#8a6a3a');
    for (const s of [-0.28, 0.28]) box(0.06, o.h + 0.02, o.d + 0.02, twine, s * o.w, o.h / 2, 0, g);
  },

  crate(world, o) {
    const g = group(world, o.x, o.y, o.z);
    outline(box(o.w, o.h, o.d, tmat(boards('#a8763f', 5, o.id), 1, 1), 0, o.h / 2, 0, g), 0.025);
    const e = 0.14;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(e, o.h + 0.02, e, WOOD_DARK, sx * (o.w / 2 - e / 2), o.h / 2, sz * (o.d / 2 - e / 2), g);
    for (const sy of [0, 1]) for (const sz of [-1, 1]) box(o.w, e, e, WOOD_DARK, 0, sy * (o.h - e) + e / 2, sz * (o.d / 2 - e / 2), g);
    for (const sz of [-1, 1]) {
      const diag = box(Math.hypot(o.w, o.h) - 0.25, e, 0.05, WOOD_DARK, 0, o.h / 2, sz * (o.d / 2 + 0.01), g);
      diag.rotation.z = Math.atan2(o.h, o.w);
    }
  },

  fence(world, o) {
    const g = group(world, o.x, 0, o.z);
    const alongX = o.w > o.d;
    fenceRun(g, alongX ? o.w : o.d, alongX, o.h);
  },

  wall(world, o) {
    const g = group(world, o.x, 0, o.z);
    const alongX = o.w > o.d;
    const len = alongX ? o.w : o.d;
    const r = mulberry(o.id * 7);
    const stoneMats = [mat('#9a978d'), mat('#8a877e'), mat('#aaa79c')];
    for (let row = 0; row < 3; row++) {
      let t = -len / 2 + (row % 2) * 0.3;
      while (t < len / 2) {
        const s = 0.5 + r() * 0.5;
        const st = sphere(s * 0.55, stoneMats[Math.floor(r() * 3)], alongX ? t + s / 2 : (r() - 0.5) * 0.2, 0.25 + row * 0.32, alongX ? (r() - 0.5) * 0.2 : t + s / 2, g, 0);
        st.scale.set(alongX ? 1 : 0.8, 0.6, alongX ? 0.8 : 1);
        st.rotation.set(r(), r(), r());
        t += s;
      }
    }
  },

  rock(world, o) {
    const g = group(world, o.x, 0, o.z);
    const r = mulberry(o.id * 11);
    const m = [mat('#8f8c84'), mat('#a19e95')];
    const main = sphere(Math.max(o.w, o.d) * 0.55, m[0], 0, o.h * 0.45, 0, g, 1);
    main.scale.set(o.w / Math.max(o.w, o.d), o.h / Math.max(o.w, o.d) * 1.1, o.d / Math.max(o.w, o.d));
    main.rotation.y = r() * 3;
    outline(main, 0.04);
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2;
      const s = sphere(0.35 + r() * 0.3, m[1], Math.cos(a) * o.w * 0.55, 0.15, Math.sin(a) * o.d * 0.55, g, 0);
      s.rotation.set(r(), r(), r());
    }
    // moss
    const moss = sphere(Math.max(o.w, o.d) * 0.35, mat('#6a9a44'), 0, o.h * 0.85, 0, g, 1);
    moss.scale.set(1, 0.25, 1);
  },

  tree(world, o) {
    const orchard = o.x > 36 && o.x < 52 && o.z > 44 && o.z < 60;
    tree(world, o.x, o.z, 1 + (o.id % 3) * 0.15, o.id, orchard);
  },

  house(world, o) {
    const g = group(world, o.x, 0, o.z);
    const walls = tmat(boards('#f3ead8', 14, 8), 3, 1.5);
    outline(box(o.w, o.h, o.d, walls, 0, o.h / 2, 0, g), 0.05);
    box(o.w + 0.3, 0.6, o.d + 0.3, smooth('#77736a'), 0, 0.3, 0, g);
    const roofH = 3.6;
    const shape = new THREE.Shape();
    shape.moveTo(-o.d / 2, 0);
    shape.lineTo(0, roofH);
    shape.lineTo(o.d / 2, 0);
    shape.lineTo(-o.d / 2, 0);
    const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: o.w, bevelEnabled: false }), walls);
    gable.rotation.y = Math.PI / 2;
    gable.position.set(-o.w / 2, o.h, 0);
    gable.castShadow = true;
    g.add(gable);
    const slope = Math.hypot(o.d / 2 + 1, roofH);
    const ang = Math.atan2(roofH, o.d / 2 + 1);
    const roofMat = tmat(shingles('#3f5a7a'), 4, 2);
    for (const s of [-1, 1]) {
      const r = box(o.w + 1.2, 0.3, slope, roofMat, 0, o.h + roofH / 2 + 0.1, s * (o.d / 4 + 0.25), g);
      r.rotation.x = s * ang;
      outline(r, 0.04);
    }
    // chimney
    outline(box(1.2, 4, 1.2, tmat(stone(), 1, 2), o.w / 3, o.h + 2.5, -1, g), 0.04);
    // windows & door on the front (+z) and back
    const glass = smooth('#9fd3ec', { roughness: 0.05, metalness: 0.3, emissive: '#23445a', emissiveIntensity: 0.3 });
    for (const side of [1, -1]) {
      const zf = side * (o.d / 2 + 0.05);
      for (const x of [-3.8, -1.2, 3.8]) {
        if (side === 1 && x === -1.2) continue;
        box(1.4, 1.5, 0.1, glass, x, 3.2, zf, g);
        box(1.7, 0.2, 0.2, WHITE, x, 4.05, zf, g);
        box(1.7, 0.2, 0.25, WHITE, x, 2.35, zf, g);
        box(0.12, 1.5, 0.15, WHITE, x, 3.2, zf, g);
        for (const s of [-1, 1]) box(0.5, 1.6, 0.08, smooth('#3f5a7a'), x + s * 1.0, 3.2, zf, g);
      }
      if (side === 1) {
        box(1.4, 2.6, 0.12, smooth('#8e241d'), 0.8, 1.9, zf, g);
        ball(0.08, smooth('#e3b53b', { metalness: 0.7 }), 1.3, 1.9, zf + 0.08, g, 8);
      }
    }
    // porch
    const porch = group(g, 0, 0, o.d / 2 + 1.2);
    box(o.w * 0.6, 0.3, 2.4, tmat(planks('#8a5a33', 10), 3, 1), 0, 0.6, 0, porch);
    for (const x of [-o.w * 0.28, o.w * 0.28]) box(0.2, 3, 0.2, WHITE, x, 2, 1.0, porch);
    const pr = box(o.w * 0.64, 0.2, 2.8, roofMat, 0, 3.5, 0.1, porch);
    pr.rotation.x = 0.18;
    // rocking chair-ish bench + flower boxes
    box(1.8, 0.15, 0.5, WOOD, -1.8, 1.2, 0.2, porch);
    box(1.8, 0.6, 0.1, WOOD, -1.8, 1.5, -0.05, porch);
  },

  windmill(world, o, spinners) {
    const g = group(world, o.x, 0, o.z);
    g.rotation.y = Math.PI / 2;
    outline(cyl(1.6, o.w / 2 + 0.4, o.h, tmat(boards('#f1ece0', 16), 1, 3), 0, o.h / 2, 0, g, 8), 0.05);
    const cap = cone(2.4, 3.2, tmat(shingles('#b8322a'), 2, 2), 0, o.h + 1.5, 0, g, 8);
    outline(cap, 0.04);
    box(1.2, 1.8, 0.1, smooth('#5e3b1f'), 0, 0.9, o.w / 2 + 0.3, g);
    for (const y of [5, 9]) box(0.8, 1, 0.1, smooth('#9fd3ec', { roughness: 0.1 }), 0, y, 1.9 - (y - 5) * 0.08, g);
    const hub = group(g, 0, o.h - 0.4, 2.3);
    ball(0.55, WOOD_DARK, 0, 0, 0, hub, 12);
    const sail = smooth('#f4efe4', { side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const blade = group(hub);
      blade.rotation.z = (i * Math.PI) / 2;
      box(0.35, 7.5, 0.15, WOOD, 0, 4, 0, blade);
      box(1.7, 6, 0.04, sail, 0.95, 4.4, 0.05, blade);
      for (let k = 0; k < 5; k++) box(1.7, 0.06, 0.08, WOOD, 0.95, 1.7 + k * 1.3, 0.08, blade);
    }
    spinners.push(hub);
  },

  shed(world, o) {
    const g = group(world, o.x, 0, o.z);
    outline(box(o.w, o.h, o.d, tmat(corrugated('#9aa3a8'), 3, 1), 0, o.h / 2, 0, g), 0.04);
    const roof = box(o.w + 0.8, 0.15, o.d + 1, smooth('#b86a2a', { map: withRepeat(corrugated('#b86a2a'), 3, 1), metalness: 0.3, roughness: 0.6 }), 0, o.h + 0.3, 0, g);
    roof.rotation.x = 0.12;
    box(2.4, 2.6, 0.1, smooth('#4a4f55'), -1, 1.3, o.d / 2 + 0.05, g);
    // tools
    const tools = group(g, o.w / 2 + 0.1, 0, 0);
    const pitch = cyl(0.04, 0.04, 2, WOOD, 0, 1, 0.5, tools, 6);
    pitch.rotation.z = 0.15;
    for (const dz of [-0.12, 0, 0.12]) cyl(0.02, 0.02, 0.4, METAL, 0.16, 2.1, 0.5 + dz, tools, 4);
    const barrel = cyl(0.45, 0.45, 1.1, WOOD, 0.8, 0.55, -1.3, tools, 12);
    outline(barrel, 0.03);
    for (const y of [0.2, 0.9]) cyl(0.47, 0.47, 0.06, METAL, 0.8, y, -1.3, tools, 12);
  },
};

function fenceRun(g, len, alongX, h = 1.2) {
  const posts = Math.max(2, Math.round(len / 2.5) + 1);
  const postMat = smooth('#6e4a2a');
  const railMat = tmat(planks('#8a5a33', 2, 7), 1, 1);
  for (let i = 0; i < posts; i++) {
    const t = -len / 2 + (len * i) / (posts - 1);
    box(0.28, h + 0.25, 0.28, postMat, alongX ? t : 0, (h + 0.25) / 2, alongX ? 0 : t, g);
    cone(0.2, 0.2, postMat, alongX ? t : 0, h + 0.35, alongX ? 0 : t, g, 4).rotation.y = Math.PI / 4;
  }
  for (const y of [h * 0.42, h * 0.88]) {
    box(alongX ? len : 0.1, 0.2, alongX ? 0.1 : len, railMat, 0, y, 0, g);
  }
}

function tree(world, x, z, s = 1, seed = 1, fruit = false) {
  const r = mulberry(seed * 97 + 3);
  const g = group(world, x, 0, z);
  g.rotation.y = r() * Math.PI * 2;
  const bark = smooth('#6b4526', { roughness: 0.95 });
  const trunk = cyl(0.3 * s, 0.55 * s, 4.2 * s, bark, 0, 2.1 * s, 0, g, 8);
  outline(trunk, 0.04);
  for (let i = 0; i < 3; i++) {
    const root = cone(0.25 * s, 0.9 * s, bark, Math.cos(i * 2.1) * 0.45 * s, 0.25 * s, Math.sin(i * 2.1) * 0.45 * s, g, 5);
    root.rotation.set(Math.sin(i * 2.1) * 0.9, 0, -Math.cos(i * 2.1) * 0.9);
  }
  const branch = cyl(0.12 * s, 0.18 * s, 1.6 * s, bark, 0.5 * s, 3.6 * s, 0, g, 6);
  branch.rotation.z = -0.8;
  const blobs = 5 + Math.floor(r() * 3);
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + r();
    const rad = (i === 0 ? 0 : 1.3 + r() * 0.6) * s;
    const size = (i === 0 ? 2.4 : 1.4 + r() * 0.8) * s;
    const leaf = sphere(size, LEAF[Math.floor(r() * LEAF.length)], Math.cos(a) * rad, (5.2 + (i === 0 ? 0.6 : r() * 1.4 - 0.4)) * s, Math.sin(a) * rad, g, 1);
    leaf.rotation.set(r(), r(), r());
    if (i === 0) outline(leaf, 0.06);
  }
  if (fruit) {
    const apple = smooth('#d8322a', { roughness: 0.4 });
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2, rr = (1.4 + r() * 1.2) * s;
      ball(0.16, apple, Math.cos(a) * rr, (4.2 + r() * 2.4) * s, Math.sin(a) * rr, g, 8);
    }
  }
  return g;
}

function pine(world, x, y, z, s) {
  const g = group(world, x, y, z);
  cyl(0.25 * s, 0.35 * s, 2 * s, smooth('#5e3b1f'), 0, 1 * s, 0, g, 6);
  const m = [mat('#2f6e3a'), mat('#3a7d42')];
  for (let i = 0; i < 3; i++) cone((2.4 - i * 0.6) * s, 2.6 * s, m[i % 2], 0, (2.4 + i * 1.5) * s, 0, g, 7);
  return g;
}

function buildPerimeterFence(world) {
  const L = A * 2;
  fenceRun(group(world, 0, 0, A), L, true);
  fenceRun(group(world, 0, 0, -A), L, true);
  fenceRun(group(world, A, 0, 0), L, false);
  fenceRun(group(world, -A, 0, 0), L, false);
}

function buildScenery(world) {
  const rng = mulberry(7);
  // woods on the hills outside the fence
  for (let i = 0; i < 140; i++) {
    const a = rng() * Math.PI * 2;
    const r = A + 12 + rng() * 110;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.max(Math.abs(x), Math.abs(z)) < A + 8) continue;
    const y = hillHeight(x, z) - 0.3;
    if (rng() < 0.45) pine(world, x, y, z, 1 + rng() * 0.8);
    else tree(world, x, z, 0.9 + rng() * 0.8, i + 100).position.y = y;
  }
  // distant mountains
  const mm = [mat('#7d9aa8'), mat('#8aa6b3')];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rng() * 0.2;
    const r = 330 + rng() * 60;
    const h = 60 + rng() * 70;
    const m = cone(60 + rng() * 40, h, mm[i % 2], Math.cos(a) * r, h / 2 - 5, Math.sin(a) * r, world, 6);
    m.castShadow = false;
    m.receiveShadow = false;
    const cap = cone(18, h * 0.25, mat('#f4f6f8'), Math.cos(a) * r, h - 5 - h * 0.12, Math.sin(a) * r, world, 6);
    cap.castShadow = false;
  }
  // bushes along the inside of the fence
  const bushMat = [mat('#4a8f35'), mat('#5aa040')];
  for (let i = 0; i < 40; i++) {
    const side = Math.floor(rng() * 4);
    const t = (rng() - 0.5) * A * 1.8;
    const off = A - 1.5;
    const x = side === 0 ? t : side === 1 ? t : side === 2 ? off : -off;
    const z = side === 0 ? off : side === 1 ? -off : t;
    const b = sphere(0.9 + rng() * 0.6, bushMat[i % 2], x, 0.5, z, world, 1);
    b.scale.y = 0.75;
  }
}

function buildPond(world, p, bobbers) {
  const sand = new THREE.Mesh(new THREE.CircleGeometry(p.r + 1.6, 40), smooth('#cdb88a', { roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(p.x, 0.03, p.z);
  sand.receiveShadow = true;
  world.add(sand);
  const deep = new THREE.Mesh(new THREE.CircleGeometry(p.r, 40), smooth('#2e5f73'));
  deep.rotation.x = -Math.PI / 2;
  deep.position.set(p.x, 0.04, p.z);
  world.add(deep);
  const waterMat = new THREE.MeshStandardMaterial({
    color: '#4aa3d0', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.78,
  });
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.z += sin(position.x * 1.3 + uWind * 1.5) * 0.04 + cos(position.y * 1.1 + uWind * 1.2) * 0.04;`);
  };
  const water = new THREE.Mesh(new THREE.RingGeometry(0.01, p.r - 0.2, 48, 12), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(p.x, 0.22, p.z);
  world.add(water);

  const r = mulberry(55);
  // lily pads
  const pad = smooth('#4f9a3a', { side: THREE.DoubleSide });
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2, d = r() * (p.r - 1.5);
    const lp = new THREE.Mesh(new THREE.CircleGeometry(0.45 + r() * 0.3, 12, 0.3, Math.PI * 1.8), pad);
    lp.rotation.x = -Math.PI / 2;
    lp.rotation.z = r() * 6;
    lp.position.set(p.x + Math.cos(a) * d, 0.25, p.z + Math.sin(a) * d);
    world.add(lp);
    if (i % 3 === 0) ball(0.12, smooth('#ffb6d0'), lp.position.x, 0.32, lp.position.z, world, 8);
  }
  // cattails around the edge
  const reed = smooth('#6d8f3a');
  const cat = smooth('#6b4526');
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2;
    const d = p.r - 0.3 + r() * 1.2;
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
    const h = 1 + r() * 0.8;
    const stem = cyl(0.025, 0.035, h, reed, x, h / 2, z, world, 4);
    stem.rotation.set((r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2);
    if (r() < 0.6) cyl(0.07, 0.07, 0.3, cat, x, h - 0.1, z, world, 6);
  }
  // ducks paddling in circles
  for (let i = 0; i < 3; i++) {
    const duck = group(world);
    const body = ball(0.3, smooth(i === 0 ? '#ffffff' : '#8a6a4a'), 0, 0, 0, duck, 14);
    body.scale.set(0.8, 0.6, 1.2);
    outline(body, 0.02);
    const head = ball(0.17, smooth(i === 0 ? '#ffffff' : '#2f6b3a'), 0, 0.28, 0.28, duck, 12);
    outline(head, 0.015);
    const beak = cone(0.07, 0.18, smooth('#f5a524'), 0, 0.26, 0.47, duck, 8);
    beak.rotation.x = Math.PI / 2;
    beak.scale.set(1.3, 1, 0.5);
    for (const s of [-1, 1]) ball(0.035, smooth('#1d1a18'), s * 0.1, 0.33, 0.39, duck, 6);
    duck.userData = { cx: p.x, cz: p.z, r: 2 + i * 2.2, angle: i * 2, speed: (i % 2 ? 1 : -1) * (0.25 + i * 0.05), baseY: 0.3, phase: i };
    bobbers.push(duck);
  }
}

function buildCorn(world, f) {
  // one merged stalk geometry, instanced across the field
  const parts = [];
  const stalk = new THREE.CylinderGeometry(0.04, 0.06, 2.6, 5);
  stalk.translate(0, 1.3, 0);
  parts.push(colorize(stalk, '#6f9a3a'));
  for (let i = 0; i < 4; i++) {
    const leaf = new THREE.PlaneGeometry(0.16, 1.1);
    leaf.translate(0, 0.55, 0);
    leaf.rotateZ(0.9);
    leaf.rotateY(i * 1.6);
    leaf.translate(0, 0.5 + i * 0.45, 0);
    parts.push(colorize(leaf, i % 2 ? '#7cae43' : '#5f8f35'));
  }
  const cob = new THREE.CylinderGeometry(0.07, 0.05, 0.4, 6);
  cob.rotateZ(0.3);
  cob.translate(0.1, 1.6, 0);
  parts.push(colorize(cob, '#f2c94c'));
  const tassel = new THREE.ConeGeometry(0.1, 0.4, 5);
  tassel.translate(0, 2.75, 0);
  parts.push(colorize(tassel, '#d8b75a'));
  const geo = mergeGeometries(parts);
  const material = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }), 0.06);

  const spacing = 1.1;
  const nx = Math.floor(f.w / spacing), nz = Math.floor(f.d / spacing);
  const inst = new THREE.InstancedMesh(geo, material, nx * nz);
  const r = mulberry(77);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let k = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = f.x - f.w / 2 + (i + 0.5) * spacing + (r() - 0.5) * 0.4;
      const z = f.z - f.d / 2 + (j + 0.5) * spacing + (r() - 0.5) * 0.4;
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.1, r() * Math.PI * 2, (r() - 0.5) * 0.1));
      const s = 0.85 + r() * 0.35;
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
      inst.setMatrixAt(k++, m);
    }
  }
  inst.castShadow = true;
  inst.receiveShadow = true;
  world.add(inst);
  // tilled soil under the corn
  const soil = new THREE.Mesh(new THREE.PlaneGeometry(f.w + 1, f.d + 1), tmat(dirt(), 3, 3, { color: '#9a7a50' }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.set(f.x, 0.035, f.z);
  soil.receiveShadow = true;
  world.add(soil);
}

function colorize(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = g.attributes.position.getY(i);
    const k = 0.75 + Math.min(1, Math.max(0, y / 2.6)) * 0.35;
    arr[i * 3] = c.r * k; arr[i * 3 + 1] = c.g * k; arr[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

function blocked(x, z, isBare) {
  if (isBare(x, z)) return true;
  for (const p of PONDS) if (Math.hypot(x - p.x, z - p.z) < p.r + 1.8) return true;
  for (const m of MUD_PITS) if (Math.hypot(x - m.x, z - m.z) < m.r + 0.8) return true;
  for (const f of CORN_FIELDS) if (Math.abs(x - f.x) < f.w / 2 + 0.5 && Math.abs(z - f.z) < f.d / 2 + 0.5) return true;
  for (const o of OBSTACLES) {
    if (o.y > 0) continue;
    if (Math.abs(x - o.x) < o.w / 2 + 0.2 && Math.abs(z - o.z) < o.d / 2 + 0.2) return true;
  }
  return false;
}

function buildGrass(world, isBare) {
  // a tapered, slightly curved blade with a dark root and light tip
  const blade = new THREE.BufferGeometry();
  const verts = [-0.05, 0, 0, 0.05, 0, 0, -0.035, 0.22, 0.02, 0.035, 0.22, 0.02, 0, 0.45, 0.07];
  const cols = [];
  const base = new THREE.Color('#3f7a2c'), tip = new THREE.Color('#9ccf5a');
  for (let i = 0; i < verts.length; i += 3) {
    const c = base.clone().lerp(tip, verts[i + 1] / 0.45);
    cols.push(c.r, c.g, c.b);
  }
  blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  blade.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  blade.computeVertexNormals();
  const material = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }), 0.35);

  const count = 30000;
  const inst = new THREE.InstancedMesh(blade, material, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const rng = mulberry(3);
  const tint = new THREE.Color();
  let placed = 0, tries = 0;
  while (placed < count && tries < count * 4) {
    tries++;
    // clumps: pick a centre then scatter a few blades around it
    const cx = (rng() - 0.5) * A * 2, cz = (rng() - 0.5) * A * 2;
    for (let k = 0; k < 6 && placed < count; k++) {
      const x = cx + (rng() - 0.5) * 1.2, z = cz + (rng() - 0.5) * 1.2;
      if (Math.abs(x) > A - 0.5 || Math.abs(z) > A - 0.5 || blocked(x, z, isBare)) continue;
      e.set((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5);
      q.setFromEuler(e);
      const s = 0.6 + rng() * 0.7;
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (0.7 + rng() * 0.6), s));
      inst.setMatrixAt(placed, m);
      tint.setHSL(0.25 + rng() * 0.05, 0.5, 0.9 + rng() * 0.2);
      inst.setColorAt(placed, tint);
      placed++;
    }
  }
  inst.count = placed;
  inst.receiveShadow = true;
  world.add(inst);
  return inst;
}

function buildFlowers(world, isBare) {
  const stem = new THREE.CylinderGeometry(0.012, 0.012, 0.28, 4);
  stem.translate(0, 0.14, 0);
  const head = new THREE.IcosahedronGeometry(0.07, 0);
  head.translate(0, 0.3, 0);
  const stemMesh = new THREE.InstancedMesh(stem, smooth('#4f8a35'), 900);
  const headMesh = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }), 900);
  const colors = ['#ffffff', '#ffd93b', '#ff6fa8', '#b58cff', '#ff8a3d', '#7cc7ff'].map((c) => new THREE.Color(c));
  const rng = mulberry(19);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let patch = 0; patch < 90 && n < 900; patch++) {
    const cx = (rng() - 0.5) * A * 1.9, cz = (rng() - 0.5) * A * 1.9;
    const col = colors[Math.floor(rng() * colors.length)];
    for (let k = 0; k < 10 && n < 900; k++) {
      const x = cx + (rng() - 0.5) * 3, z = cz + (rng() - 0.5) * 3;
      if (blocked(x, z, isBare)) continue;
      const s = 0.8 + rng() * 0.6;
      m.makeScale(s, s, s).setPosition(x, 0, z);
      stemMesh.setMatrixAt(n, m);
      headMesh.setMatrixAt(n, m);
      headMesh.setColorAt(n, col);
      n++;
    }
  }
  stemMesh.count = headMesh.count = n;
  world.add(stemMesh, headMesh);
}

function buildClouds(world) {
  const cloudMat = smooth('#ffffff', { roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.15 });
  const rng = mulberry(11);
  const clouds = [];
  for (let i = 0; i < 18; i++) {
    const g = group(world, (rng() - 0.5) * 640, 60 + rng() * 35, (rng() - 0.5) * 480);
    const n = 4 + Math.floor(rng() * 4);
    for (let j = 0; j < n; j++) {
      const s = ball(4 + rng() * 4, cloudMat, j * 4.5 - n * 2.2, rng() * 2, (rng() - 0.5) * 4, g, 12);
      s.scale.y = 0.7;
      s.castShadow = false;
    }
    g.userData.speed = 1.5 + rng() * 2.5;
    clouds.push(g);
  }
  return clouds;
}

