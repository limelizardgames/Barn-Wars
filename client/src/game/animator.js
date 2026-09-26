// Procedural animation for every fighter. Works on both the sculpted skinned
// models (bones) and the fallback primitive models (groups) through the same
// rig contract: { body, neck?, head, tail?, legs[], wings[], biped, scale }.
//
// The animator owns a `pose` group that sits between the yaw group and the
// model, used for whole-body lean, hop, squash & stretch and rearing.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => t * t * (3 - 2 * t);
// 0 → 1 → 0 bump over [a, b]
const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
// smooth ramp from 0 at a to 1 at b
const ramp = (t, a, b) => ease(clamp((t - a) / (b - a), 0, 1));

// Which signature animation each move plays.
const ACTIONS = {
  cow: { primary: 'headbutt', ability1: 'charge', ability2: 'happy' },
  chicken: { primary: 'peck', ability1: 'lob', ability2: 'flutter' },
  pig: { primary: 'toss', ability1: 'flop', ability2: 'happy' },
  sheep: { primary: 'puff', ability1: 'shout', ability2: 'fluff' },
  goat: { primary: 'headbutt', ability1: 'pounce', ability2: 'toss' },
  horse: { primary: 'rear', ability1: 'prance', ability2: 'buck' },
};
const DURATIONS = {
  headbutt: 0.5, charge: 0.7, happy: 0.9, peck: 0.28, lob: 0.55, flutter: 0.6, toss: 0.45,
  flop: 1.4, puff: 0.4, shout: 0.9, fluff: 0.7, pounce: 1.2, rear: 0.65, prance: 0.8, buck: 0.55,
};

function part(obj) {
  if (!obj) return null;
  return { obj, p: obj.position.clone(), r: obj.rotation.clone(), s: obj.scale.clone() };
}

export class Animator {
  constructor(model, animalId, def) {
    this.animalId = animalId;
    this.def = def;
    this.model = model;
    const rig = model.rig;
    this.rig = rig;
    this.unit = 1 / (rig.scale || 1); // world metres -> rig-local units
    this.body = part(rig.body);
    this.neck = part(rig.neck);
    this.head = part(rig.head);
    this.tail = part(rig.tail);
    this.legs = rig.legs.map((l, i) => {
      if (l.upper) return { upper: part(l.upper), lower: part(l.lower), front: l.front, side: l.side };
      // primitive model: legs are single pivots ordered FR, FL, BR, BL (or R, L for bipeds)
      return { upper: part(l), lower: null, front: rig.biped || i < 2, side: i % 2 === 0 ? 1 : -1 };
    });
    this.wings = (rig.wings || []).map((w, i) => ({ ...part(w), side: w.userData.side || (i === 0 ? -1 : 1) }));
    this.materials = model.materials || collectMaterials(model.root);
    this.legLen = def.stats.height * (rig.biped ? 0.3 : 0.42);

    this.phase = 0;
    this.speed = 0;
    this.lastPos = null;
    this.lastYaw = null;
    this.yawRate = 0;
    this.lean = 0;
    this.squash = 0;
    this.squashV = 0;
    this.grounded = true;
    this.action = null;
    this.hurtT = 0;
    this.hurtSide = 1;
    this.spawnT = 0;
    this.idleT = 0;
    this.grazeT = 0;
    this.lookYaw = 0;
    this.lookTarget = 0;
    this.lookTimer = 1;
    this.airActionT = 0;
  }

  trigger(slot) {
    const type = ACTIONS[this.animalId]?.[slot];
    if (!type) return;
    this.action = { type, t: 0, dur: DURATIONS[type] || 0.5 };
    if (type === 'flop' || type === 'pounce' || type === 'flutter') this.airActionT = 2.5;
  }

  hurt() {
    this.hurtT = 0.3;
    this.hurtSide = Math.random() < 0.5 ? -1 : 1;
  }

  spawn() {
    this.spawnT = 0.45;
  }

  // Main per-frame update. `pose` is the group between yaw and model.
  update(dt, s, time, pose, worldPos) {
    // ---- estimate motion from what is rendered ----
    if (this.lastPos) {
      const d = Math.hypot(worldPos.x - this.lastPos.x, worldPos.z - this.lastPos.z);
      const inst = dt > 0 ? d / dt : 0;
      this.speed += (Math.min(inst, 40) - this.speed) * Math.min(1, dt * 10);
    }
    this.lastPos = { x: worldPos.x, z: worldPos.z };
    if (this.lastYaw !== null && dt > 0) {
      let dy = s.yaw - this.lastYaw;
      while (dy > Math.PI) dy -= TAU;
      while (dy < -Math.PI) dy += TAU;
      this.yawRate += (dy / dt - this.yawRate) * Math.min(1, dt * 8);
    }
    this.lastYaw = s.yaw;

    const stats = this.def.stats;
    const grounded = !!s.grounded;
    const moving = grounded && this.speed > 0.6;
    const k = clamp(this.speed / stats.speed, 0, 1.8);
    const gallop = s.dashT > 0 || s.speedT > 0 || k > 1.25;
    const biped = this.rig.biped;

    // landing / takeoff squash & stretch
    if (grounded && !this.grounded) this.squashV -= 2.2 + Math.min(3, Math.abs(this.prevVy || 0) * 0.12);
    if (!grounded && this.grounded && (s.vy || 0) > 0) this.squashV += 1.6;
    this.grounded = grounded;
    this.prevVy = s.vy;
    this.squashV += (-this.squash * 180 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    this.squash = clamp(this.squash, -0.35, 0.3);

    // gait phase
    const stride = Math.max(0.35, this.legLen * (gallop ? 3.2 : 2.6));
    const freq = clamp(this.speed / stride, 0.8, biped ? 6 : 4.2);
    if (moving) this.phase += dt * freq * TAU;
    const amp = moving ? clamp(this.speed / (stats.speed * 0.5), 0, 1) * (gallop ? 0.75 : 0.55) : 0;

    // idle behaviours
    this.idleT = moving || !grounded ? 0 : this.idleT + dt;
    this.lookTimer -= dt;
    if (this.lookTimer <= 0) {
      this.lookTimer = 1.5 + Math.random() * 3;
      this.lookTarget = this.idleT > 1 ? (Math.random() - 0.5) * 1.1 : 0;
      if (this.idleT > 4 && Math.random() < 0.35) this.grazeT = biped ? 0.5 : 2.2;
    }
    this.lookYaw += (this.lookTarget - this.lookYaw) * Math.min(1, dt * 3);
    this.grazeT = Math.max(0, this.grazeT - dt);
    if (!grounded || moving) this.grazeT = 0;

    // ---- defaults ----
    let poseRx = 0, poseRz = 0, poseY = 0, poseZ = 0;
    let bodyRx = 0, bodyRz = 0, bodyY = 0;
    let headRx = 0, headRy = this.lookYaw, headRz = 0, headZ = 0;
    let neckRx = 0;
    let tailRx = 0, tailRy = 0;
    let wingFlap = 0, wingSpread = 0;
    let scaleBump = 0;
    const legRx = this.legs.map(() => 0);
    const legRz = this.legs.map(() => 0);
    const kneeRx = this.legs.map(() => 0);

    // ---- locomotion ----
    if (grounded) {
      this.legs.forEach((leg, i) => {
        let off;
        if (biped) off = leg.side > 0 ? 0 : Math.PI;
        else if (gallop) off = (leg.front ? 0 : Math.PI) + (leg.side > 0 ? 0 : 0.45);
        else off = (leg.front === (leg.side > 0)) ? 0 : Math.PI; // trot: diagonal pairs
        const ph = this.phase + off;
        legRx[i] = -Math.sin(ph) * amp;
        kneeRx[i] = Math.max(0, Math.cos(ph)) * amp * (leg.front ? 0.85 : 0.55);
      });
      const stepBob = Math.abs(Math.sin(this.phase)) * amp;
      bodyY += stepBob * 0.05;
      if (gallop) {
        bodyRx += Math.sin(this.phase) * 0.07 * amp;
        headRx += Math.sin(this.phase + 1) * 0.12 * amp;
      } else {
        headRx += Math.sin(this.phase * 2) * 0.05 * amp;
      }
      if (biped) {
        poseRz += Math.sin(this.phase) * 0.13 * amp; // waddle
        headZ += Math.sin(this.phase * 2) * 0.06 * amp; // chicken head bob
      }
      tailRx -= amp * 0.5;
      tailRy += Math.sin(this.phase) * 0.25 * amp;
    } else {
      // tuck the legs in the air; nose follows vertical velocity
      this.legs.forEach((leg, i) => {
        legRx[i] = leg.front ? -0.55 : 0.45;
        kneeRx[i] = leg.front ? 0.75 : -0.2;
      });
      if (biped) this.legs.forEach((leg, i) => { legRx[i] = 0.4; kneeRx[i] = 0.8; });
      poseRx += clamp(-(s.vy || 0) * 0.022, -0.35, 0.4);
      wingFlap = s.glideT > 0 ? 0.45 : 1;
      wingSpread = s.glideT > 0 ? 1 : 0.4;
      tailRx -= 0.4;
    }

    // idle life: breathing, tail swish, grazing / pecking
    if (grounded && !moving) {
      bodyY += Math.sin(time * 2.2) * 0.012;
      tailRy += Math.sin(time * 2.7) * 0.35;
      if (this.grazeT > 0) {
        const g = biped ? bump(this.grazeT, 0, 0.5) : ramp(this.grazeT, 0, 0.4) * ramp(2.2 - this.grazeT, 0, 0.4);
        headRx += g * (biped ? 0.9 : 0.8);
        neckRx += g * (biped ? 0.4 : 0.6);
        if (!biped) headRx += Math.sin(time * 9) * 0.05 * g; // chewing
      }
    }

    // turning lean
    this.lean += (clamp(-this.yawRate * this.speed * 0.012, -0.3, 0.3) - this.lean) * Math.min(1, dt * 6);
    poseRz += this.lean;

    // dashing: head down, ears back, full gallop
    if (s.dashT > 0) {
      headRx += 0.35;
      neckRx += 0.2;
      poseRx += 0.08;
    }

    // ---- signature actions ----
    const a = this.action;
    if (a) {
      a.t += dt;
      const t = a.t / a.dur;
      if (t >= 1) this.action = null;
      switch (a.type) {
        case 'headbutt': {
          const wind = bump(t, 0, 0.45), hit = bump(t, 0.35, 0.8);
          headRx += -0.45 * wind + 0.65 * hit;
          neckRx += -0.2 * wind + 0.3 * hit;
          poseRx += -0.1 * wind + 0.18 * hit;
          poseZ += -0.15 * wind + 0.45 * hit;
          this.legs.forEach((leg, i) => { if (!leg.front) legRx[i] += 0.35 * hit; });
          break;
        }
        case 'charge':
          headRx += 0.5 * bump(t, 0, 1);
          bodyY -= 0.05 * bump(t, 0, 0.3);
          break;
        case 'happy': {
          poseY += Math.abs(Math.sin(t * Math.PI * 3)) * 0.35 * (1 - t);
          headRx -= 0.35 * bump(t, 0, 1);
          tailRy += Math.sin(time * 25) * 0.6 * bump(t, 0, 1);
          scaleBump += 0.05 * bump(t, 0, 0.3);
          break;
        }
        case 'peck': {
          const p = bump(t, 0.15, 0.9);
          headRx += 0.9 * p;
          neckRx += 0.5 * p;
          headZ += 0.08 * p;
          wingFlap = Math.max(wingFlap, 0.5 * bump(t, 0, 1));
          wingSpread = Math.max(wingSpread, 0.3);
          break;
        }
        case 'lob': {
          const wind = bump(t, 0, 0.5), throwIt = bump(t, 0.4, 1);
          poseRx += -0.3 * wind + 0.25 * throwIt;
          headRx += -0.4 * wind + 0.5 * throwIt;
          wingFlap = Math.max(wingFlap, bump(t, 0.2, 1));
          wingSpread = Math.max(wingSpread, 0.9 * bump(t, 0.1, 1));
          break;
        }
        case 'flutter':
          wingFlap = 1;
          wingSpread = 1;
          break;
        case 'toss': {
          const scoop = bump(t, 0, 0.5), flick = bump(t, 0.4, 1);
          headRx += 0.55 * scoop - 0.6 * flick;
          neckRx += 0.3 * scoop - 0.2 * flick;
          poseRx += 0.08 * scoop - 0.1 * flick;
          break;
        }
        case 'puff': {
          scaleBump += 0.14 * bump(t, 0, 0.6);
          poseRz += Math.sin(t * 40) * 0.08 * (1 - t);
          headRx -= 0.2 * bump(t, 0, 0.5);
          break;
        }
        case 'shout': {
          const b = bump(t, 0.05, 0.95);
          headRx -= 0.7 * b;
          neckRx -= 0.35 * b;
          poseRx -= 0.12 * b;
          headRz += Math.sin(time * 45) * 0.08 * b;
          scaleBump += 0.08 * b;
          break;
        }
        case 'fluff':
          scaleBump += 0.22 * bump(t, 0, 1);
          poseRz += Math.sin(t * 30) * 0.06 * (1 - t);
          break;
        case 'rear': {
          // rear up on the hind legs, paw the air, then stomp down
          const up = ramp(t, 0, 0.35) * (1 - ramp(t, 0.6, 0.8));
          poseRx -= 0.7 * up;
          poseZ -= 0.35 * up;
          poseY += 0.15 * up;
          this.legs.forEach((leg, i) => {
            if (leg.front) {
              legRx[i] = -0.8 * up + Math.sin(time * 22 + leg.side) * 0.5 * up;
              kneeRx[i] = 1.2 * up;
            } else legRx[i] = 0.35 * up;
          });
          headRx -= 0.3 * up;
          break;
        }
        case 'prance':
          poseRx -= 0.35 * bump(t, 0, 0.5);
          headRx -= 0.4 * bump(t, 0, 0.7);
          tailRx -= 0.8 * bump(t, 0, 1);
          break;
        case 'buck': {
          const kick = bump(t, 0.15, 0.85);
          poseRx += 0.35 * kick;
          headRx += 0.35 * kick;
          this.legs.forEach((leg, i) => {
            if (!leg.front) { legRx[i] = 1.1 * kick; kneeRx[i] = 0; }
          });
          tailRx -= 0.8 * kick;
          break;
        }
        default:
          break;
      }
    }

    // airborne specials after a leap move
    this.airActionT = grounded ? 0 : Math.max(0, this.airActionT - dt);
    if (!grounded && this.airActionT > 0) {
      if (this.animalId === 'pig') {
        // belly flop: spread-eagle, belly down as it falls
        const fall = clamp(-(s.vy || 0) / 12, 0, 1);
        poseRx += 0.5 * fall;
        this.legs.forEach((leg, i) => { legRx[i] = leg.front ? -1.1 : 1.1; legRz[i] = leg.side * 0.5; kneeRx[i] = 0; });
        headRx -= 0.3;
      } else if (this.animalId === 'goat') {
        // mountain leap: fully stretched
        this.legs.forEach((leg, i) => { legRx[i] = leg.front ? -1.0 : 0.9; kneeRx[i] = leg.front ? 0.2 : 0; });
        headRx -= 0.2;
      } else if (this.animalId === 'chicken') {
        wingFlap = 1;
        wingSpread = 1;
      }
    }

    // stunned: dizzy wobble
    if (s.stunT > 0) {
      headRz += Math.sin(time * 7) * 0.3;
      headRx += Math.cos(time * 7) * 0.15;
      poseRz += Math.sin(time * 3.5) * 0.08;
    }

    // hurt flinch + flash
    if (this.hurtT > 0) {
      this.hurtT = Math.max(0, this.hurtT - dt);
      const h = this.hurtT / 0.3;
      poseRz += this.hurtSide * 0.22 * h;
      poseRx -= 0.12 * h;
      headRx -= 0.3 * h;
      scaleBump -= 0.05 * h;
    }
    this.setFlash(this.hurtT > 0 ? this.hurtT / 0.3 : 0, s.shieldT > 0);

    // spawn pop
    let spawnScale = 1;
    if (this.spawnT > 0) {
      this.spawnT = Math.max(0, this.spawnT - dt);
      const t = 1 - this.spawnT / 0.45;
      spawnScale = t < 0.6 ? 0.2 + 0.95 * ease(t / 0.6) : 1.15 - 0.15 * ease((t - 0.6) / 0.4);
    }

    // ---- apply ----
    const u = this.unit;
    pose.rotation.set(poseRx, 0, poseRz);
    pose.position.set(0, poseY, poseZ);
    const sq = this.squash;
    const sb = 1 + scaleBump;
    pose.scale.set(spawnScale * sb * (1 - sq * 0.5), spawnScale * sb * (1 + sq), spawnScale * sb * (1 - sq * 0.5));

    apply(this.body, bodyRx, 0, bodyRz, 0, bodyY * u, 0);
    if (this.neck && this.neck.obj !== this.head?.obj) apply(this.neck, neckRx, headRy * 0.4, 0);
    else headRx += neckRx;
    const headYaw = this.neck ? headRy * 0.6 : headRy;
    if (this.head) apply(this.head, headRx, headYaw, headRz, 0, 0, headZ * u);
    if (this.tail) apply(this.tail, tailRx, tailRy, 0);
    this.legs.forEach((leg, i) => {
      apply(leg.upper, legRx[i], 0, legRz[i]);
      if (leg.lower) apply(leg.lower, kneeRx[i], 0, 0);
    });
    for (const w of this.wings) {
      const flap = wingFlap ? Math.sin(time * 28) * 0.7 * wingFlap : 0;
      const open = wingSpread * 1.0 + Math.abs(flap);
      // wings hinge along the body: rotate about Z (outward), sign by side
      w.obj.rotation.set(w.r.x, w.r.y, w.r.z + w.side * open);
    }
  }

  // Death: flop onto the side with stiff cartoon legs.
  updateDead(dt, deadT, pose) {
    const t = clamp(deadT / 0.4, 0, 1);
    const bounce = t < 1 ? ease(t) : 1 + Math.sin((deadT - 0.4) * 18) * 0.06 * Math.max(0, 1 - (deadT - 0.4) * 3);
    pose.rotation.set(0, 0, (Math.PI / 2) * bounce);
    pose.position.set(0, 0, 0);
    const shrink = deadT > 0.8 ? Math.max(0.01, 1 - (deadT - 0.8) * 4) : 1;
    pose.scale.setScalar(shrink);
    this.legs.forEach((leg) => {
      apply(leg.upper, leg.front ? -0.3 : 0.3, 0, leg.side * 0.25);
      if (leg.lower) apply(leg.lower, 0, 0, 0);
    });
    if (this.head) apply(this.head, -0.3, 0, 0);
    this.setFlash(0, false);
    this.action = null;
  }

  setFlash(k, shield) {
    for (const m of this.materials) {
      if (!m.emissive) continue;
      if (k > 0) m.emissive.setRGB(0.55 * k, 0.12 * k, 0.08 * k);
      else if (shield) m.emissive.setRGB(0.12, 0.18, 0.25);
      else m.emissive.setRGB(0, 0, 0);
    }
  }
}

function apply(p, rx, ry, rz, px = 0, py = 0, pz = 0) {
  if (!p) return;
  p.obj.rotation.set(p.r.x + rx, p.r.y + ry, p.r.z + rz);
  p.obj.position.set(p.p.x + px, p.p.y + py, p.p.z + pz);
}

function collectMaterials(root) {
  // primitive models share cached materials, so clone the ones we flash
  const out = [];
  const seen = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline || !o.material || !o.material.emissive) return;
    if (!seen.has(o.material)) {
      const c = o.material.clone();
      seen.set(o.material, c);
      out.push(c);
    }
    o.material = seen.get(o.material);
  });
  return out;
}

