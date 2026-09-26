// Simple barnyard AI so a lone player always has someone to fight.

import { BTN } from '../shared/constants.js';
import { angleDiff } from '../shared/physics.js';
import { ANIMAL_IDS } from '../shared/animals.js';

export const BOT_NAMES = {
  cow: ['Sir Moo-a-lot', 'Mooshu', 'Clover', 'Beefcake'],
  chicken: ['Cluckzilla', 'Nugget', 'Eggbert', 'Henrietta'],
  pig: ['Hamlet', 'Porkchop', 'Truffles', 'Sir Oinks'],
  sheep: ['Shaun', 'Lambo', 'Woolverine', 'Baaa-bara'],
  goat: ['Kid Rock', 'Butters', 'Pepper', 'G.O.A.T.'],
  horse: ['Seabiscuit', 'Hoofhearted', 'Gallopagos', 'Mane Event'],
};

export function randomAnimal() {
  return ANIMAL_IDS[Math.floor(Math.random() * ANIMAL_IDS.length)];
}

function isRanged(move) {
  return move.type === 'projectile';
}

function moveRange(move) {
  if (move.type === 'projectile') return Math.min(28, move.speed * move.lifetime * 0.8);
  if (move.type === 'melee' || move.type === 'shout') return move.range;
  if (move.type === 'dash') return move.speed * move.duration * 0.8;
  if (move.type === 'leap' && move.slam) return 4 + move.forward * 0.6;
  return 0;
}

export class BotBrain {
  constructor() {
    this.targetId = null;
    this.retargetT = 0;
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = 0;
    this.lastPos = null;
    this.stuckT = 0;
    this.aimError = (Math.random() - 0.5) * 0.15;
    this.reaction = 0.25 + Math.random() * 0.3;
    this.wanderYaw = Math.random() * Math.PI * 2;
  }

  think(room, p, dt) {
    const b = p.body;
    const input = { mx: 0, mz: 0, yaw: b.yaw, pitch: 0, buttons: 0 };
    if (!p.alive || room.match.state !== 'playing') return input;

    // pick a target: the nearest living enemy, re-evaluated now and then
    this.retargetT -= dt;
    let target = this.targetId ? room.players.get(this.targetId) : null;
    if (!target || !target.alive || this.retargetT <= 0) {
      target = this.pickTarget(room, p);
      this.targetId = target ? target.id : null;
      this.retargetT = 2 + Math.random() * 2;
    }

    // stuck detection
    if (this.lastPos) {
      const moved = Math.hypot(b.x - this.lastPos.x, b.z - this.lastPos.z);
      this.stuckT = moved < 0.02 && b.moving ? this.stuckT + dt : Math.max(0, this.stuckT - dt);
    }
    this.lastPos = { x: b.x, z: b.z };

    if (!target) {
      // wander
      this.wanderYaw += (Math.random() - 0.5) * dt;
      input.yaw = this.wanderYaw;
      input.mz = 0.6;
      return input;
    }

    const tb = target.body;
    const dx = tb.x - b.x, dz = tb.z - b.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);

    // turn toward the target at a limited rate
    const turn = 6 * dt;
    const diff = angleDiff(want, b.yaw);
    input.yaw = b.yaw + Math.max(-turn, Math.min(turn, diff)) + this.aimError * 0.2;

    const primary = p.animal.primary;
    const ranged = isRanged(primary);
    const preferred = ranged ? 10 : 1.5;

    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafe = -this.strafe;
      this.strafeT = 1 + Math.random() * 2;
    }

    if (dist > preferred + 2) input.mz = 1;
    else if (dist < preferred - 3) input.mz = -0.6;
    input.mx = ranged || dist < 4 ? this.strafe * 0.7 : 0;

    if (this.stuckT > 0.3) {
      input.buttons |= BTN.JUMP;
      input.mx = this.strafe;
      if (this.stuckT > 1) this.stuckT = 0;
    }
    if (Math.random() < 0.004) input.buttons |= BTN.JUMP;

    // aim pitch that roughly compensates for projectile drop
    const heightDiff = (tb.y + target.animal.stats.height * 0.5) - (b.y + p.animal.stats.height * 0.65);
    input.pitch = Math.atan2(heightDiff, dist);

    const facing = Math.abs(diff) < 0.35;
    if (!facing || this.reactionT(dt)) return input;

    const slots = [['primary', BTN.PRIMARY], ['ability1', BTN.ABILITY1], ['ability2', BTN.ABILITY2]];
    for (const [slot, btn] of slots) {
      if (p.cooldowns[slot] > 0) continue;
      const move = p.animal[slot];
      if (move.type === 'projectile') {
        const g = move.gravity || 0;
        const tFlight = dist / move.speed;
        const pitch = Math.atan2(heightDiff + 0.5 * g * tFlight * tFlight, dist) + this.aimError;
        if (dist <= moveRange(move)) {
          input.pitch = pitch;
          input.buttons |= btn;
          break;
        }
      } else if (move.type === 'buff') {
        const hurt = p.hp < p.animal.stats.maxHp * 0.5;
        if ((move.heal || move.shield) && hurt && Math.random() < 0.05) { input.buttons |= btn; break; }
        if (move.speedBoost && dist > 12 && Math.random() < 0.02) { input.buttons |= btn; break; }
      } else if (move.type === 'leap' && !move.slam) {
        if (Math.random() < 0.01) { input.buttons |= btn; break; }
      } else if (dist <= moveRange(move) + target.animal.stats.radius) {
        if (slot === 'primary' || Math.random() < 0.08) { input.buttons |= btn; break; }
      }
    }
    return input;
  }

  reactionT(dt) {
    // a little hesitation so bots do not fire the instant they line up
    this.react = (this.react || 0) + dt;
    if (this.react < this.reaction) return true;
    if (Math.random() < 0.02) this.react = 0;
    return false;
  }

  pickTarget(room, p) {
    let best = null, bestScore = Infinity;
    for (const t of room.fighters()) {
      if (t === p || !t.alive) continue;
      const d = Math.hypot(t.body.x - p.body.x, t.body.z - p.body.z);
      const score = d + (t.isBot ? 8 : 0) + Math.random() * 6; // slight preference for humans
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }
}
