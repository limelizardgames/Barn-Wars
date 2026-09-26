// Executes moves defined in shared/animals.js and resolves damage.

import { forwardVec, angleDiff } from '../shared/physics.js';
import { OBSTACLES } from '../shared/arena.js';

const DEG = Math.PI / 180;

export function useMove(room, p, slot, aimPitch) {
  const move = p.animal[slot];
  const b = p.body;
  const f = forwardVec(b.yaw);
  p.cooldowns[slot] = move.cooldown;
  p.actionCount++;
  p.lastAction = slot;
  room.event({ t: 'move', id: p.id, slot, x: b.x, y: b.y, z: b.z });

  switch (move.type) {
    case 'melee':
    case 'shout':
      coneHit(room, p, move);
      break;

    case 'projectile': {
      const count = move.count || 1;
      const spread = (move.spread || 0) * DEG;
      const pitch = clampPitch(aimPitch);
      const h = p.animal.stats.height * 0.65;
      for (let i = 0; i < count; i++) {
        const yaw = b.yaw + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0);
        const dx = Math.sin(yaw) * Math.cos(pitch);
        const dz = Math.cos(yaw) * Math.cos(pitch);
        const dy = Math.sin(pitch);
        const off = p.animal.stats.radius + 0.2;
        room.spawnProjectile({
          kind: move.projectile,
          ownerId: p.id,
          x: b.x + f.x * off,
          y: b.y + h,
          z: b.z + f.z * off,
          vx: dx * move.speed + b.vx * 0.3,
          vy: dy * move.speed,
          vz: dz * move.speed + b.vz * 0.3,
          gravity: move.gravity || 0,
          life: move.lifetime,
          radius: move.radius,
          damage: move.damage,
          knockback: move.knockback || 0,
          slow: move.slow,
          explode: move.explode,
          moveName: move.name,
        });
      }
      break;
    }

    case 'dash':
      b.dashT = move.duration;
      b.dashX = f.x;
      b.dashZ = f.z;
      b.dashSpeed = move.speed;
      p.dash = { move, hit: new Set() };
      break;

    case 'leap':
      b.vy = move.up;
      b.vx += f.x * move.forward;
      b.vz += f.z * move.forward;
      b.grounded = false;
      if (move.glide) b.glideT = move.glide;
      if (move.slam) p.slamPending = move;
      break;

    case 'buff':
      if (move.heal) heal(room, p, move.heal);
      if (move.shield) {
        b.shieldT = move.shield.duration;
        b.shieldMult = move.shield.mult;
      }
      if (move.speedBoost) {
        b.speedT = move.speedBoost.duration;
        b.speedMult = move.speedBoost.mult;
      }
      break;
  }
}

function clampPitch(p) {
  if (!Number.isFinite(p)) return 0;
  return Math.max(-1.2, Math.min(1.2, p));
}

function coneHit(room, p, move) {
  const b = p.body;
  const half = (move.arc / 2) * DEG;
  for (const t of room.fighters()) {
    if (t === p || !t.alive) continue;
    const dx = t.body.x - b.x, dz = t.body.z - b.z;
    const dist = Math.hypot(dx, dz);
    if (dist > move.range + t.animal.stats.radius) continue;
    if (Math.abs(t.body.y - b.y) > 2.5) continue;
    if (dist > 0.3 && Math.abs(angleDiff(Math.atan2(dx, dz), b.yaw)) > half) continue;
    const dir = dist > 0.01 ? { x: dx / dist, z: dz / dist } : forwardVec(b.yaw);
    damage(room, t, move.damage, p, {
      dir, knockback: move.knockback, lift: move.lift, stun: move.stun, moveName: move.name,
    });
  }
}

// Called every tick for a dashing fighter.
export function updateDash(room, p) {
  if (!p.dash) return;
  if (p.body.dashT <= 0) { p.dash = null; return; }
  const { move, hit } = p.dash;
  const b = p.body;
  for (const t of room.fighters()) {
    if (t === p || !t.alive || hit.has(t.id)) continue;
    const dx = t.body.x - b.x, dz = t.body.z - b.z;
    const reach = p.animal.stats.radius + t.animal.stats.radius + 0.4;
    if (dx * dx + dz * dz > reach * reach || Math.abs(t.body.y - b.y) > 2) continue;
    hit.add(t.id);
    const d = Math.hypot(dx, dz) || 1;
    // blend dash direction with the side offset so victims get flung aside
    const dir = normalize(b.dashX + (dx / d) * 0.6, b.dashZ + (dz / d) * 0.6);
    damage(room, t, move.damage, p, { dir, knockback: move.knockback, lift: move.lift, moveName: move.name });
  }
}

// Called when a leaping fighter lands with a pending slam.
export function landSlam(room, p) {
  const move = p.slamPending;
  p.slamPending = null;
  if (!move || !p.alive) return;
  const b = p.body;
  room.event({ t: 'slam', id: p.id, x: b.x, y: b.y, z: b.z, r: move.slam.radius });
  areaDamage(room, p, b.x, b.y, b.z, move.slam, move.name);
}

export function areaDamage(room, owner, x, y, z, spec, moveName) {
  for (const t of room.fighters()) {
    if (!t.alive || (owner && t.id === owner.id)) continue;
    const cy = t.body.y + t.animal.stats.height / 2;
    const dx = t.body.x - x, dy = cy - y, dz = t.body.z - z;
    const dist = Math.hypot(dx, dy, dz);
    const reach = spec.radius + t.animal.stats.radius;
    if (dist > reach) continue;
    const falloff = 1 - 0.5 * (dist / reach);
    const hd = Math.hypot(dx, dz);
    const dir = hd > 0.01 ? { x: dx / hd, z: dz / hd } : { x: 0, z: 0 };
    damage(room, t, spec.damage * falloff, owner, {
      dir, knockback: spec.knockback * falloff, lift: spec.lift, moveName,
    });
  }
}

export function damage(room, target, amount, attacker, opts = {}) {
  if (!target.alive || target.spawnProtT > 0 || room.match.state !== 'playing') return;
  const b = target.body;
  const power = target.animal.power;
  let dmg = amount * (power.damageTakenMult || 1) * b.shieldMult;
  dmg = Math.max(1, Math.round(dmg));
  target.hp -= dmg;
  target.lastHurtT = room.time;
  if (attacker && attacker !== target) target.lastAttacker = { id: attacker.id, moveName: opts.moveName, t: room.time };

  if (attacker && attacker.alive && attacker !== target && attacker.animal.power.lifesteal) {
    heal(room, attacker, dmg * attacker.animal.power.lifesteal, true);
  }

  const kbMult = (attacker ? attacker.animal.power.knockbackDealtMult || 1 : 1)
    * (power.knockbackTakenMult || 1);
  if (opts.dir && opts.knockback) {
    b.vx += opts.dir.x * opts.knockback * kbMult;
    b.vz += opts.dir.z * opts.knockback * kbMult;
  }
  if (opts.lift) {
    b.vy = Math.max(b.vy, opts.lift * Math.sqrt(kbMult));
    b.grounded = false;
  }
  if (opts.stun) b.stunT = Math.max(b.stunT, opts.stun);
  if (opts.slow) {
    b.slowT = opts.slow.duration;
    b.slowMult = Math.min(b.slowMult, opts.slow.mult);
  }
  if (b.stunT > 0) b.dashT = 0;

  room.event({
    t: 'hit', id: target.id, by: attacker ? attacker.id : null, dmg,
    x: b.x, y: b.y + target.animal.stats.height * 0.7, z: b.z,
  });

  if (target.hp <= 0) room.kill(target, attacker, opts.moveName);
}

export function heal(room, p, amount, quiet = false) {
  const before = p.hp;
  p.hp = Math.min(p.animal.stats.maxHp, p.hp + amount);
  const gained = Math.round(p.hp - before);
  if (!quiet && gained > 0) {
    room.event({ t: 'heal', id: p.id, amt: gained, x: p.body.x, y: p.body.y + p.animal.stats.height, z: p.body.z });
  }
}

// ---- projectiles --------------------------------------------------------

export function stepProjectile(room, pr, dt) {
  pr.vy -= pr.gravity * dt;
  pr.x += pr.vx * dt;
  pr.y += pr.vy * dt;
  pr.z += pr.vz * dt;
  pr.life -= dt;

  // fighters
  for (const t of room.fighters()) {
    if (!t.alive || t.id === pr.ownerId) continue;
    const s = t.animal.stats;
    const dx = pr.x - t.body.x, dz = pr.z - t.body.z;
    const r = s.radius + pr.radius;
    if (dx * dx + dz * dz > r * r) continue;
    if (pr.y < t.body.y - pr.radius || pr.y > t.body.y + s.height + pr.radius) continue;
    const owner = room.players.get(pr.ownerId) || null;
    if (pr.explode) return explode(room, pr, owner);
    const sp = Math.hypot(pr.vx, pr.vz) || 1;
    damage(room, t, pr.damage, owner, {
      dir: { x: pr.vx / sp, z: pr.vz / sp }, knockback: pr.knockback, lift: pr.knockback * 0.3,
      slow: pr.slow, moveName: pr.moveName,
    });
    room.event({ t: 'splat', kind: pr.kind, x: pr.x, y: pr.y, z: pr.z });
    return false;
  }

  // world
  let hitWorld = pr.y <= pr.radius * 0.5;
  if (!hitWorld) {
    for (const o of OBSTACLES) {
      if (pr.y > o.y + o.h || pr.y < o.y) continue;
      if (Math.abs(pr.x - o.x) < o.w / 2 + pr.radius * 0.5 && Math.abs(pr.z - o.z) < o.d / 2 + pr.radius * 0.5) {
        hitWorld = true;
        break;
      }
    }
  }
  if (hitWorld) {
    if (pr.explode) return explode(room, pr, room.players.get(pr.ownerId) || null);
    room.event({ t: 'splat', kind: pr.kind, x: pr.x, y: Math.max(0.1, pr.y), z: pr.z });
    return false;
  }
  if (pr.life <= 0) {
    if (pr.explode) return explode(room, pr, room.players.get(pr.ownerId) || null);
    return false;
  }
  return true;
}

function explode(room, pr, owner) {
  room.event({ t: 'boom', kind: pr.kind, x: pr.x, y: Math.max(0.2, pr.y), z: pr.z, r: pr.explode.radius });
  areaDamage(room, owner, pr.x, pr.y, pr.z, pr.explode, pr.moveName);
  // the thrower is not immune to their own blast, but takes reduced damage
  if (owner && owner.alive) {
    const d = Math.hypot(owner.body.x - pr.x, owner.body.y + 1 - pr.y, owner.body.z - pr.z);
    if (d < pr.explode.radius * 0.6) {
      const dir = normalize(owner.body.x - pr.x, owner.body.z - pr.z);
      damage(room, owner, pr.explode.damage * 0.25, null, { dir, knockback: pr.explode.knockback, lift: pr.explode.lift, moveName: pr.moveName });
    }
  }
  return false;
}

function normalize(x, z) {
  const d = Math.hypot(x, z);
  return d > 1e-6 ? { x: x / d, z: z / d } : { x: 0, z: 0 };
}
