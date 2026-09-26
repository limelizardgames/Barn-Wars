// Deterministic character movement, shared so the client can predict its own
// animal with exactly the same rules the server uses.

import {
  GRAVITY, GROUND_FRICTION, AIR_FRICTION, STEP_HEIGHT, BTN,
} from './constants.js';
import { ARENA_HALF, OBSTACLES, MUD_PITS, PONDS } from './arena.js';

export function forwardVec(yaw) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

export function rightVec(yaw) {
  return { x: -Math.cos(yaw), z: Math.sin(yaw) };
}

// Fresh movement state for a spawned animal.
export function createBody(x = 0, z = 0, yaw = 0) {
  return {
    x, y: 0, z,
    vx: 0, vy: 0, vz: 0, // vx/vz are external (knockback/launch) velocity
    yaw,
    grounded: true,
    airJumps: 0,
    jumpHeld: false,
    justLanded: false,
    dashT: 0, dashX: 0, dashZ: 0, dashSpeed: 0,
    glideT: 0,
    stunT: 0,
    slowT: 0, slowMult: 1,
    speedT: 0, speedMult: 1,
    shieldT: 0, shieldMult: 1,
    moving: false,
  };
}

// Fields copied between server snapshots and client predictions.
export const BODY_FIELDS = [
  'x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'grounded', 'airJumps', 'jumpHeld',
  'dashT', 'dashX', 'dashZ', 'dashSpeed', 'glideT', 'stunT', 'slowT', 'slowMult',
  'speedT', 'speedMult', 'shieldT', 'shieldMult',
];

export function copyBody(dst, src) {
  for (const k of BODY_FIELDS) if (src[k] !== undefined) dst[k] = src[k];
  return dst;
}

export function inPond(x, z) {
  for (const m of PONDS) {
    const dx = x - m.x, dz = z - m.z;
    if (dx * dx + dz * dz < m.r * m.r) return true;
  }
  return false;
}

export function inMud(x, z) {
  for (const m of MUD_PITS) {
    const dx = x - m.x, dz = z - m.z;
    if (dx * dx + dz * dz < m.r * m.r) return true;
  }
  return false;
}

function circleOverlapsBox(x, z, r, o) {
  const hw = o.w / 2, hd = o.d / 2;
  const cx = Math.max(o.x - hw, Math.min(x, o.x + hw));
  const cz = Math.max(o.z - hd, Math.min(z, o.z + hd));
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

// Highest surface under the animal that it could be standing on.
export function groundHeightAt(x, z, y, radius) {
  let g = 0;
  const footR = radius * 0.6;
  for (const o of OBSTACLES) {
    const top = o.y + o.h;
    if (top > g && top <= y + STEP_HEIGHT && circleOverlapsBox(x, z, footR, o)) g = top;
  }
  return g;
}

// Push the body out of any obstacle it is intersecting horizontally.
export function resolveObstacles(b, radius, height) {
  for (const o of OBSTACLES) {
    const top = o.y + o.h;
    if (b.y >= top - STEP_HEIGHT) continue; // standing on / above it
    if (b.y + height <= o.y) continue; // passing underneath
    const hw = o.w / 2, hd = o.d / 2;
    const cx = Math.max(o.x - hw, Math.min(b.x, o.x + hw));
    const cz = Math.max(o.z - hd, Math.min(b.z, o.z + hd));
    let dx = b.x - cx, dz = b.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      b.x = cx + (dx / d) * radius;
      b.z = cz + (dz / d) * radius;
    } else {
      // centre is inside the box: push out along the shallowest axis
      const px = hw + radius - Math.abs(b.x - o.x);
      const pz = hd + radius - Math.abs(b.z - o.z);
      if (px < pz) b.x += Math.sign(b.x - o.x || 1) * px;
      else b.z += Math.sign(b.z - o.z || 1) * pz;
    }
  }
}

// Advance one animal by dt seconds given an input frame.
// input: { mx, mz, yaw, buttons } where mx/mz are strafe/forward in [-1, 1].
export function stepBody(b, input, dt, animal) {
  const { stats, power } = animal;
  b.justLanded = false;

  // timers
  b.stunT = Math.max(0, b.stunT - dt);
  b.slowT = Math.max(0, b.slowT - dt);
  b.speedT = Math.max(0, b.speedT - dt);
  b.shieldT = Math.max(0, b.shieldT - dt);
  if (b.slowT === 0) b.slowMult = 1;
  if (b.speedT === 0) b.speedMult = 1;
  if (b.shieldT === 0) b.shieldMult = 1;

  const stunned = b.stunT > 0;
  if (input && Number.isFinite(input.yaw) && !stunned) b.yaw = input.yaw;

  // horizontal intent
  let wx = 0, wz = 0;
  if (b.dashT > 0) {
    wx = b.dashX * b.dashSpeed;
    wz = b.dashZ * b.dashSpeed;
    b.dashT = Math.max(0, b.dashT - dt);
  } else if (!stunned && input) {
    let mx = clamp(input.mx || 0, -1, 1);
    let mz = clamp(input.mz || 0, -1, 1);
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const f = forwardVec(b.yaw), r = rightVec(b.yaw);
    let speed = stats.speed * b.slowMult * b.speedMult;
    if (b.grounded && inMud(b.x, b.z)) speed *= animal.id === 'pig' ? 1.25 : 0.65;
    else if (b.grounded && inPond(b.x, b.z)) speed *= 0.7;
    wx = (f.x * mz + r.x * mx) * speed;
    wz = (f.z * mz + r.z * mx) * speed;
  }
  b.moving = Math.abs(wx) + Math.abs(wz) > 0.1;

  // jumping (edge triggered)
  const jumpDown = !!(input && (input.buttons & BTN.JUMP));
  if (jumpDown && !b.jumpHeld && !stunned) {
    if (b.grounded) {
      b.vy = stats.jump;
      b.grounded = false;
    } else if (b.airJumps < (power.airJumps || 0)) {
      b.vy = stats.jump * 0.9;
      b.airJumps++;
    }
  }
  b.jumpHeld = jumpDown;

  // gravity (+ glide)
  b.vy += GRAVITY * dt;
  if (b.glideT > 0) {
    b.glideT = Math.max(0, b.glideT - dt);
    if (b.vy < -3) b.vy = -3;
  }

  // integrate
  b.x += (wx + b.vx) * dt;
  b.z += (wz + b.vz) * dt;
  b.y += b.vy * dt;

  // external velocity decays
  const fr = Math.exp(-(b.grounded ? GROUND_FRICTION : AIR_FRICTION) * dt);
  b.vx *= fr;
  b.vz *= fr;
  if (Math.abs(b.vx) < 0.01) b.vx = 0;
  if (Math.abs(b.vz) < 0.01) b.vz = 0;

  // world collision
  resolveObstacles(b, stats.radius, stats.height);
  const lim = ARENA_HALF - stats.radius;
  b.x = clamp(b.x, -lim, lim);
  b.z = clamp(b.z, -lim, lim);

  const g = groundHeightAt(b.x, b.z, b.y, stats.radius);
  if (b.y <= g) {
    if (!b.grounded) b.justLanded = true;
    b.y = g;
    if (b.vy < 0) b.vy = 0;
    b.grounded = true;
    b.airJumps = 0;
    b.glideT = 0;
  } else {
    b.grounded = false;
  }
  return b;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Smallest signed difference between two angles.
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
