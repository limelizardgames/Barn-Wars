// Projectile models, keyed by the `projectile` field in shared/animals.js.
import * as THREE from 'three';
import { mat, sphere, cyl, torus, group } from './kit.js';

const BUILDERS = {
  egg() {
    const g = new THREE.Group();
    const e = sphere(0.22, mat('#fbf6ea'), 0, 0, 0, g);
    e.scale.set(0.85, 1.15, 0.85);
    return g;
  },
  bomb() {
    const g = new THREE.Group();
    const e = sphere(0.36, mat('#d9452b'), 0, 0, 0, g);
    e.scale.set(0.85, 1.15, 0.85);
    cyl(0.03, 0.03, 0.25, mat('#333333'), 0, 0.45, 0, g);
    sphere(0.08, mat('#ffcf3a', { emissive: '#ff9a00', emissiveIntensity: 2 }), 0, 0.6, 0, g, 0);
    return g;
  },
  mud() {
    const g = new THREE.Group();
    const m = mat('#6b4526', { roughness: 0.3 });
    sphere(0.32, m, 0, 0, 0, g, 0);
    sphere(0.18, m, 0.2, 0.1, -0.1, g, 0);
    sphere(0.15, m, -0.15, -0.12, 0.1, g, 0);
    return g;
  },
  wool() {
    const g = new THREE.Group();
    const m = mat('#f5f3ee');
    sphere(0.3, m, 0, 0, 0, g, 0);
    sphere(0.22, m, 0.2, 0.1, 0, g, 0);
    sphere(0.22, m, -0.18, 0.08, 0.1, g, 0);
    return g;
  },
  can() {
    const g = new THREE.Group();
    const c = cyl(0.18, 0.18, 0.42, mat('#b9c2c8', { metalness: 0.7, roughness: 0.3 }), 0, 0, 0, g, 10);
    c.rotation.z = Math.PI / 2;
    const label = cyl(0.185, 0.185, 0.22, mat('#d9452b'), 0, 0, 0, g, 10);
    label.rotation.z = Math.PI / 2;
    return g;
  },
  horseshoe() {
    const g = new THREE.Group();
    const t = torus(0.28, 0.07, mat('#8c9398', { metalness: 0.8, roughness: 0.3 }), 0, 0, 0, g, Math.PI * 1.4, 10);
    t.rotation.set(Math.PI / 2, 0, -Math.PI * 0.2);
    return g;
  },
};

export function buildProjectile(kind) {
  const g = (BUILDERS[kind] || BUILDERS.egg)();
  const spinner = group();
  spinner.add(g);
  spinner.userData.spin = kind === 'wool' ? 2 : kind === 'mud' ? 4 : 10;
  return spinner;
}

export const SPLAT_COLORS = {
  egg: ['#fff7d6', '#ffd23a'],
  bomb: ['#ffb02e', '#ff5a1f', '#444444'],
  mud: ['#6b4526', '#4a2e18'],
  wool: ['#ffffff', '#eeeeee'],
  can: ['#c7cfd4', '#d9452b'],
  horseshoe: ['#c7cfd4', '#ffdd55'],
};
