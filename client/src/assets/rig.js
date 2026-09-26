// Loads the sculpted animal models (client/public/models/*.glb) and gives each
// one a skeleton so the animator can move legs, head, tail and wings.
//
// The source models come with inconsistent (or no) rigs, so we build our own:
// joint positions are measured per animal (in the model's normalised space:
// length 1 along +Z, feet at y = 0) and every vertex is weighted to the bones
// by region with soft falloffs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getAnimal } from '../../../shared/animals.js';

// ---- per-animal joint layout -----------------------------------------------------
// legs: top = hip/shoulder joint, knee = y of the knee/hock, foot = [x, z] at the ground
// head: neck base + head pivot, and the region (z/y thresholds) that follows them
// tail: pivot + z threshold behind which vertices follow the tail
const quad = (x, yTop, zFront, zBack, knee, footFront = zFront, footBack = zBack) => [
  { top: [x, yTop, zFront], foot: [x, footFront], knee, front: true, side: 1 },
  { top: [-x, yTop, zFront], foot: [-x, footFront], knee, front: true, side: -1 },
  { top: [x, yTop, zBack], foot: [x, footBack], knee, front: false, side: 1 },
  { top: [-x, yTop, zBack], foot: [-x, footBack], knee, front: false, side: -1 },
];

export const RIGS = {
  cow: {
    legs: quad(0.1, 0.3, 0.1, -0.32, 0.14),
    legR: 0.075,
    neck: [0, 0.46, 0.2], head: [0, 0.52, 0.3],
    headRegion: { z: [0.17, 0.26], y: [0.28, 0.36] },
    tail: { pivot: [0, 0.53, -0.42], z: -0.4, blend: 0.03, yMin: 0.08 },
    body: [0, 0.42, -0.05],
  },
  chicken: {
    legs: [
      { top: [0.125, 0.13, 0.02], foot: [0.125, 0.05], knee: 0.06, front: true, side: 1 },
      { top: [-0.125, 0.13, 0.02], foot: [-0.125, 0.05], knee: 0.06, front: true, side: -1 },
    ],
    legR: 0.075,
    neck: [0, 0.5, 0.12], head: [0, 0.64, 0.2],
    headRegion: { z: [-0.12, -0.04], y: [0.5, 0.58] },
    tail: { pivot: [0, 0.42, -0.24], z: -0.22, blend: 0.04, yMin: 0.3 },
    wings: { pivot: [0.2, 0.48, 0.02], x: [0.18, 0.24], y: [0.16, 0.58], z: [-0.3, 0.22] },
    body: [0, 0.35, 0],
    biped: true,
  },
  pig: {
    legs: quad(0.108, 0.17, 0.12, -0.335, 0.07),
    legR: 0.07,
    neck: [0, 0.4, 0.19], head: [0, 0.44, 0.27],
    headRegion: { z: [0.17, 0.25], y: [0.18, 0.24] },
    tail: { pivot: [0, 0.45, -0.38], z: -0.37, blend: 0.02, yMin: 0.3 },
    body: [0, 0.36, -0.05],
  },
  sheep: {
    legs: quad(0.12, 0.22, 0.12, -0.29, 0.1),
    legR: 0.075,
    neck: [0, 0.58, 0.15], head: [0, 0.66, 0.25],
    headRegion: { z: [0.12, 0.22], y: [0.4, 0.48] },
    tail: null,
    body: [0, 0.5, -0.05],
  },
  goat: {
    legs: quad(0.085, 0.31, 0.142, -0.3, 0.15),
    legR: 0.065,
    neck: [0, 0.47, 0.16], head: [0, 0.6, 0.26],
    headRegion: { z: [0.14, 0.21], y: [0.3, 0.38] },
    tail: { pivot: [0, 0.5, -0.34], z: -0.34, blend: 0.03, yMin: 0.38 },
    body: [0, 0.42, -0.06],
  },
  horse: {
    legs: quad(0.084, 0.33, 0.12, -0.31, 0.16, 0.12, -0.3),
    legR: 0.065,
    neck: [0, 0.47, 0.12], head: [0, 0.7, 0.33],
    headRegion: { z: [0.07, 0.15], y: [0.38, 0.46] },
    tail: { pivot: [0, 0.535, -0.37], z: -0.34, blend: 0.03, yMin: 0.1 },
    body: [0, 0.45, -0.1],
  },
};

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Compute skin indices/weights for a geometry according to a rig layout.
// Bone order: 0 root, 1 body, 2 neck, 3 head, 4 tail, 5.. legs (upper, lower) x N, then wings (L, R)
function skinGeometry(geo, rig) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const LEG0 = 5;
  const WING0 = LEG0 + rig.legs.length * 2;
  const neck = new THREE.Vector3(...rig.neck);
  const head = new THREE.Vector3(...rig.head);
  const neckDir = head.clone().sub(neck);
  const neckLen = neckDir.length();
  neckDir.normalize();
  const v = new THREE.Vector3();
  const R = rig.legR;

  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    const w = new Map();
    let remaining = 1;

    // legs
    let best = -1, bestW = 0;
    rig.legs.forEach((leg, li) => {
      const t = Math.min(1, Math.max(0, v.y / leg.top[1]));
      const cx = leg.foot[0] + (leg.top[0] - leg.foot[0]) * t;
      const cz = leg.foot[1] + (leg.top[2] - leg.foot[1]) * t;
      const d = Math.hypot(v.x - cx, v.z - cz);
      const col = 1 - smoothstep(R * 0.7, R * 1.25, d);
      const h = 1 - smoothstep(leg.top[1] - 0.025, leg.top[1] + 0.035, v.y);
      const lw = col * h;
      if (lw > bestW) { bestW = lw; best = li; }
    });
    if (best >= 0 && bestW > 0.001) {
      const leg = rig.legs[best];
      const lower = 1 - smoothstep(leg.knee - 0.02, leg.knee + 0.02, v.y);
      w.set(LEG0 + best * 2, bestW * (1 - lower));
      w.set(LEG0 + best * 2 + 1, bestW * lower);
      remaining -= bestW;
    }

    // head & neck
    const hr = rig.headRegion;
    const hw = smoothstep(hr.z[0], hr.z[1], v.z) * smoothstep(hr.y[0], hr.y[1], v.y) * remaining;
    if (hw > 0.001) {
      const along = v.clone().sub(neck).dot(neckDir) / neckLen;
      const toHead = smoothstep(0.2, 0.9, along);
      w.set(2, hw * (1 - toHead));
      w.set(3, hw * toHead);
      remaining -= hw;
    }

    // tail
    if (rig.tail) {
      const t = rig.tail;
      const tw = smoothstep(t.z + t.blend, t.z - t.blend, v.z) * (v.y > t.yMin ? 1 : 0) * remaining;
      if (tw > 0.001) { w.set(4, tw); remaining -= tw; }
    }

    // wings
    if (rig.wings) {
      const wg = rig.wings;
      const ax = Math.abs(v.x);
      const ww = smoothstep(wg.x[0], wg.x[1], ax)
        * smoothstep(wg.y[0], wg.y[0] + 0.06, v.y) * (1 - smoothstep(wg.y[1] - 0.06, wg.y[1], v.y))
        * smoothstep(wg.z[0], wg.z[0] + 0.06, v.z) * (1 - smoothstep(wg.z[1] - 0.06, wg.z[1], v.z))
        * remaining;
      if (ww > 0.001) { w.set(WING0 + (v.x > 0 ? 0 : 1), ww); remaining -= ww; }
    }

    if (remaining > 0.001) w.set(1, (w.get(1) || 0) + remaining);

    const top = [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, e) => s + e[1], 0) || 1;
    top.forEach(([bone, weight], k) => {
      skinIndex[i * 4 + k] = bone;
      skinWeight[i * 4 + k] = weight / sum;
    });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
}

// ---- loading & instancing ------------------------------------------------------------

const templates = new Map(); // id -> { geometry, texture, rig, height }
let loadPromise = null;

export function preloadAnimalModels() {
  if (loadPromise) return loadPromise;
  const loader = new GLTFLoader();
  loadPromise = Promise.all(Object.keys(RIGS).map((id) => new Promise((resolve) => {
    loader.load(`/models/${id}.glb`, (gltf) => {
      let mesh = null;
      gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
      if (!mesh) { resolve(); return; }
      const geometry = mesh.geometry;
      geometry.computeBoundingBox();
      skinGeometry(geometry, RIGS[id]);
      const texture = mesh.material.map;
      if (texture) texture.anisotropy = 4;
      templates.set(id, { geometry, texture, rig: RIGS[id], height: geometry.boundingBox.max.y });
      resolve();
    }, undefined, () => resolve()); // missing model: the procedural fallback stays in use
  })));
  return loadPromise;
}

export function hasSculptedModel(id) {
  return templates.has(id);
}

const OUTLINE = new Map();
function outlineMaterial(thickness) {
  const key = thickness.toFixed(4);
  if (!OUTLINE.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color: '#2a1a10', side: THREE.BackSide });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\ntransformed += normalize(normal) * ${key};`,
      );
    };
    m.customProgramCacheKey = () => `rig-outline-${key}`;
    OUTLINE.set(key, m);
  }
  return OUTLINE.get(key);
}

// Build a posable instance: { root, rig } using the same rig contract as the
// procedural models (body, neck, head, tail, legs[], wings[]) plus rest poses.
export function buildSculptedAnimal(id) {
  const t = templates.get(id);
  if (!t) return null;
  const def = getAnimal(id);
  const scale = def.stats.height / t.height;
  const rig = t.rig;

  const root = new THREE.Group();
  const model = new THREE.Group();
  model.scale.setScalar(scale);
  root.add(model);

  const mk = (name, parent, at, parentAt) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(at[0] - parentAt[0], at[1] - parentAt[1], at[2] - parentAt[2]);
    if (parent) parent.add(b);
    return b;
  };
  const O = [0, 0, 0];
  const bRoot = mk('root', null, O, O);
  const bBody = mk('body', bRoot, rig.body, O);
  const bNeck = mk('neck', bBody, rig.neck, rig.body);
  const bHead = mk('head', bNeck, rig.head, rig.neck);
  const bTail = mk('tail', bBody, rig.tail ? rig.tail.pivot : [0, rig.body[1], -0.5], rig.body);
  const bones = [bRoot, bBody, bNeck, bHead, bTail];
  const legs = rig.legs.map((l, i) => {
    const upper = mk(`leg${i}`, bBody, l.top, rig.body);
    const kneeAt = [l.top[0], l.knee, l.foot[1] + (l.top[2] - l.foot[1]) * (l.knee / l.top[1])];
    const lower = mk(`leg${i}lower`, upper, kneeAt, l.top);
    bones.push(upper, lower);
    return { upper, lower, front: l.front, side: l.side };
  });
  const wings = [];
  if (rig.wings) {
    const p = rig.wings.pivot;
    for (const s of [1, -1]) {
      const w = mk(s > 0 ? 'wingL' : 'wingR', bBody, [p[0] * s, p[1], p[2]], rig.body);
      w.userData.side = s;
      bones.push(w);
      wings.push(w);
    }
  }

  const material = new THREE.MeshStandardMaterial({ map: t.texture, roughness: 0.75, metalness: 0 });
  const mesh = new THREE.SkinnedMesh(t.geometry, material);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.add(bRoot);
  model.add(mesh);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);

  const ink = new THREE.SkinnedMesh(t.geometry, outlineMaterial(0.022 / scale));
  ink.frustumCulled = false;
  ink.bind(skeleton, mesh.bindMatrix);
  model.add(ink);

  for (const b of bones) b.userData.rest = { p: b.position.clone(), q: b.quaternion.clone() };

  return {
    root,
    materials: [material],
    rig: {
      skinned: true,
      model,
      body: bBody,
      neck: bNeck,
      head: bHead,
      tail: rig.tail ? bTail : null,
      legs,
      wings,
      biped: !!rig.biped,
      bodyY: bBody.position.y,
      headZ: bHead.position.z,
      scale,
    },
  };
}
