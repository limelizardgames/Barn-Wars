// Helpers for building stylised props out of primitives: rounded shapes,
// cartoon outlines and procedurally painted canvas textures.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const matCache = new Map();

// Faceted "low-poly" material (used for rocks, foliage, props).
export function mat(color, opts = {}) {
  const key = `f|${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color, flatShading: true, roughness: 0.85, metalness: 0, ...opts,
    }));
  }
  return matCache.get(key);
}

// Smooth-shaded material (used for creatures and painted surfaces).
export function smooth(color, opts = {}) {
  const key = `s|${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color, roughness: 0.72, metalness: 0, ...opts,
    }));
  }
  return matCache.get(key);
}

// ---- outlines (inverted hull) ---------------------------------------------------

const outlineMats = new Map();
function outlineMaterial(thickness) {
  const key = thickness.toFixed(3);
  if (!outlineMats.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color: '#2a1a10', side: THREE.BackSide });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\ntransformed += normalize(normal) * ${thickness.toFixed(4)};`,
      );
    };
    m.customProgramCacheKey = () => `outline-${key}`;
    outlineMats.set(key, m);
  }
  return outlineMats.get(key);
}

// Give a mesh a cartoon ink line.
export function outline(mesh, thickness = 0.025) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness));
  o.castShadow = false;
  o.receiveShadow = false;
  o.userData.isOutline = true;
  mesh.add(o);
  return mesh;
}

// ---- primitives ------------------------------------------------------------------

function place(mesh, x = 0, y = 0, z = 0, parent) {
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (parent) parent.add(mesh);
  return mesh;
}

export function box(w, h, d, material, x, y, z, parent) {
  return place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material), x, y, z, parent);
}

export function rbox(w, h, d, r, material, x, y, z, parent, seg = 3) {
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  return place(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, rr), material), x, y, z, parent);
}

// Low-poly faceted sphere.
export function sphere(r, material, x, y, z, parent, detail = 1) {
  return place(new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), material), x, y, z, parent);
}

// Smooth UV sphere.
export function ball(r, material, x, y, z, parent, seg = 18) {
  return place(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7))), material), x, y, z, parent);
}

export function capsule(r, len, material, x, y, z, parent) {
  return place(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), material), x, y, z, parent);
}

export function cyl(rt, rb, h, material, x, y, z, parent, seg = 8) {
  return place(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material), x, y, z, parent);
}

export function cone(r, h, material, x, y, z, parent, seg = 6) {
  return place(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), material), x, y, z, parent);
}

export function torus(r, tube, material, x, y, z, parent, arc = Math.PI * 2, seg = 12) {
  return place(new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, seg, arc), material), x, y, z, parent);
}

// A tube following a smooth curve through the given [x, y, z] points.
export function tube(points, radius, material, parent, { taper = false, seg = 20 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, seg, radius, 8, false);
  if (taper) {
    // shrink the radius towards the end of the curve
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.floor(i / 9) / seg;
      const c = curve.getPointAt(Math.min(1, t));
      v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(1 - t * 0.85).add(c);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
  }
  return place(new THREE.Mesh(geo, material), 0, 0, 0, parent);
}

export function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}

// A leg that pivots at its top so it can swing when walking.
// `sock` optionally paints the lower part a different colour (horse socks, dark hooves).
export function leg(parent, x, topY, z, length, radius, material, { hoof = null, sock = null, ink = true } = {}) {
  const pivot = group(parent, x, topY, z);
  const upper = capsule(radius, Math.max(0.01, length - radius * 2), material, 0, -length / 2, 0, pivot);
  if (ink) outline(upper, 0.02);
  if (sock) cyl(radius * 1.03, radius * 1.05, length * 0.3, sock, 0, -length * 0.8, 0, pivot, 12);
  if (hoof) {
    const h = cyl(radius * 1.02, radius * 1.15, length * 0.14, hoof, 0, -length + length * 0.07, 0, pivot, 12);
    if (ink) outline(h, 0.015);
  }
  return pivot;
}

// ---- canvas textures -----------------------------------------------------------------

export function canvasTexture(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

// Deterministic RNG so every client paints/places things identically.
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
