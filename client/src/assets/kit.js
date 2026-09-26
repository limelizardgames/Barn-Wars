// Tiny helpers for building low-poly props out of primitives.
import * as THREE from 'three';

const matCache = new Map();

export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.85,
      metalness: 0,
      ...opts,
    }));
  }
  return matCache.get(key);
}

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

export function sphere(r, material, x, y, z, parent, detail = 1) {
  return place(new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), material), x, y, z, parent);
}

export function cyl(rt, rb, h, material, x, y, z, parent, seg = 8) {
  return place(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material), x, y, z, parent);
}

export function cone(r, h, material, x, y, z, parent, seg = 6) {
  return place(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), material), x, y, z, parent);
}

export function torus(r, tube, material, x, y, z, parent, arc = Math.PI * 2, seg = 12) {
  return place(new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, seg, arc), material), x, y, z, parent);
}

export function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
}

// A leg that pivots at its top so it can swing when walking.
export function leg(parent, x, topY, z, length, radius, material, hoofMat = null) {
  const pivot = group(parent, x, topY, z);
  cyl(radius, radius * 0.85, length, material, 0, -length / 2, 0, pivot, 6);
  if (hoofMat) cyl(radius * 0.95, radius * 1.05, length * 0.18, hoofMat, 0, -length + length * 0.09, 0, pivot, 6);
  return pivot;
}
