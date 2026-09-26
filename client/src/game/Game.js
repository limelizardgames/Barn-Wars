// The in-match client: rendering, prediction, interpolation and event effects.
import * as THREE from 'three';
import { TICK_DT, INTERP_DELAY_MS } from '../../../shared/constants.js';
import { getAnimal } from '../../../shared/animals.js';
import { OBSTACLES } from '../../../shared/arena.js';
import { createBody, copyBody, stepBody, forwardVec } from '../../../shared/physics.js';
import { buildEnvironment } from '../assets/environment.js';
import { buildProjectile, SPLAT_COLORS } from '../assets/projectiles.js';
import { PlayerView } from './PlayerView.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { Minimap } from '../ui/minimap.js';
import { sfx, toggleMute } from './audio.js';

const HIT_COLORS = {
  cow: ['#f4f1ea', '#1d1a18'],
  chicken: ['#ffffff', '#f5f5f5', '#e0302a'],
  pig: ['#f7a8b8', '#e27d93'],
  sheep: ['#ffffff', '#eeeeee'],
  goat: ['#c9b79c', '#8d7a60'],
  horse: ['#8b5a2b', '#2e1d12'],
};

const STREAK_NAMES = { 2: 'Double Bonk!', 3: 'Triple Bonk!', 4: 'Barnstormer!', 5: 'Rampage!', 7: 'Unstoppable Udder Chaos!', 10: 'FARM LEGEND!' };

export class Game {
  constructor({ canvas, socket, welcome, hud, onLeave, onSwapRequest }) {
    this.canvas = canvas;
    this.socket = socket;
    this.localId = welcome.id;
    this.roomName = welcome.room;
    this.hud = hud;
    this.onLeave = onLeave;
    this.onSwapRequest = onSwapRequest;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1500);
    this.env = buildEnvironment(this.scene, this.renderer);
    this.minimap = new Minimap(document.getElementById('minimap'));
    this.effects = new Effects(this.scene);
    this.input = new Input(canvas);
    this.input.enabled = true;

    this.views = new Map();
    this.projViews = new Map();
    this.snapshots = [];
    this.latest = null;
    this.latestRecv = 0;
    this.timeOffset = null;
    this.ping = 0;

    // local prediction state
    this.me = null; // latest authoritative self from server
    this.body = null;
    this.prevBody = null;
    this.pending = [];
    this.seq = 0;
    this.acc = 0;
    this.err = new THREE.Vector3();
    this.shake = 0;
    this.camDist = 6;
    this.wasAlive = false;
    this.deathInfo = null;
    this.lastFrame = performance.now();
    this.time = 0;
    this.scoreHeld = false;
    this.chatting = false;
    this.running = true;

    this.bindSocket();
    this.bindKeys();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();

    this.input.onLockChange = (locked) => {
      this.hud.pause.classList.toggle('hidden', locked || this.chatting || !this.me?.alive);
      if (locked) this.hud.swapPanel.classList.add('hidden');
    };
    this.input.requestLock();
    this.hud.pause.classList.add('hidden');

    this.pingTimer = setInterval(() => {
      const t0 = performance.now();
      this.socket.emit('pingCheck', () => { this.ping = Math.round(performance.now() - t0); });
    }, 2000);

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---- setup -----------------------------------------------------------------

  bindSocket() {
    this.onSnapshot = (snap) => this.receiveSnapshot(snap);
    this.onChat = (msg) => this.hud.chat(msg.name, msg.text);
    this.onDisconnect = () => {
      this.hud.announce('Disconnected from the farm', 4000);
      setTimeout(() => this.leave(), 1500);
    };
    this.socket.on('snapshot', this.onSnapshot);
    this.socket.on('chat', this.onChat);
    this.socket.on('disconnect', this.onDisconnect);
  }

  bindKeys() {
    this.input.onKey = (code, down, e) => {
      if (code === 'Tab') {
        this.scoreHeld = down;
      } else if (code === 'Enter' && down) {
        this.openChat();
        e.preventDefault();
      } else if (code === 'KeyN' && down) {
        this.minimap.toggleZoom();
      } else if (code === 'KeyM' && down) {
        this.hud.announce('Sound toggled', 700);
        toggleMute();
      }
    };
    this.hud.chatInput.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.hud.chatInput.value.trim();
        if (text) this.socket.emit('chat', text);
        this.closeChat();
      } else if (e.key === 'Escape') {
        this.closeChat();
      }
    };
  }

  openChat() {
    this.chatting = true;
    this.hud.chatInput.classList.remove('hidden');
    this.hud.chatInput.value = '';
    this.input.releaseLock();
    this.hud.pause.classList.add('hidden');
    setTimeout(() => this.hud.chatInput.focus(), 0);
  }

  closeChat() {
    this.chatting = false;
    this.hud.chatInput.blur();
    this.hud.chatInput.classList.add('hidden');
    this.input.requestLock();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  leave() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.pingTimer);
    this.socket.off('snapshot', this.onSnapshot);
    this.socket.off('chat', this.onChat);
    this.socket.off('disconnect', this.onDisconnect);
    this.socket.disconnect();
    this.input.enabled = false;
    this.input.releaseLock();
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    if (this.onLeave) this.onLeave();
  }

  // ---- networking -------------------------------------------------------------

  receiveSnapshot(snap) {
    const now = performance.now() / 1000;
    const sample = snap.t - now;
    if (this.timeOffset === null || Math.abs(sample - this.timeOffset) > 1) this.timeOffset = sample;
    else this.timeOffset += (sample - this.timeOffset) * 0.05;

    snap.byId = new Map(snap.players.map((p) => [p.id, p]));
    this.snapshots.push(snap);
    while (this.snapshots.length > 40) this.snapshots.shift();
    this.latest = snap;
    this.latestRecv = now;

    const me = snap.byId.get(this.localId);
    if (me) this.reconcile(me);

    for (const e of snap.events) this.handleEvent(e, snap);

    // remove views for players that left
    for (const [id, v] of this.views) {
      if (!snap.byId.has(id)) { v.dispose(); this.views.delete(id); }
    }
  }

  reconcile(me) {
    const prevMe = this.me;
    this.me = me;
    const def = getAnimal(me.animal);
    const reset = !this.body || !me.alive || !prevMe || !prevMe.alive || prevMe.animal !== me.animal;
    if (reset) {
      this.body = copyBody(createBody(), me);
      this.prevBody = copyBody(createBody(), me);
      this.pending = [];
      this.err.set(0, 0, 0);
      if (me.alive && (!prevMe || !prevMe.alive)) {
        // fresh spawn: point the camera the way the animal is facing
        this.input.yaw = me.yaw;
        this.input.pitch = -0.15;
      }
      return;
    }
    const before = new THREE.Vector3(this.body.x, this.body.y, this.body.z);
    this.pending = this.pending.filter((i) => i.seq > me.seq);
    copyBody(this.body, me);
    for (const input of this.pending) stepBody(this.body, input, TICK_DT, def);
    const after = new THREE.Vector3(this.body.x, this.body.y, this.body.z);
    this.err.add(before.sub(after));
    if (this.err.length() > 4) this.err.set(0, 0, 0);
  }

  // ---- simulation --------------------------------------------------------------

  fixedStep() {
    const input = this.input.sample();
    if (this.chatting || !this.input.locked) { input.mx = 0; input.mz = 0; input.buttons = 0; }
    input.seq = ++this.seq;
    input.pitch = this.aimPitch();
    this.socket.emit('input', input);
    if (!this.body || !this.me || !this.me.alive) return;
    this.pending.push(input);
    if (this.pending.length > 90) this.pending.shift();
    copyBody(this.prevBody, this.body);
    const wasGrounded = this.body.grounded;
    stepBody(this.body, input, TICK_DT, getAnimal(this.me.animal));
    if (wasGrounded && !this.body.grounded && this.body.vy > 0) sfx.jump();
    else if (!wasGrounded && this.body.vy > 0 && this.prevBody.vy < this.body.vy - 1) sfx.jump();
  }

  // Pitch from the animal's muzzle to whatever is under the crosshair.
  aimPitch() {
    if (!this.body || !this.me) return 0;
    const def = getAnimal(this.me.animal);
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const minT = this.camDist * 0.9;
    let t = this.raycast(origin, dir, minT, 120, true);
    if (t === null) t = 120;
    const target = origin.addScaledVector(dir, t);
    const f = forwardVec(this.body.yaw);
    const off = def.stats.radius + 0.2;
    const mx = this.body.x + f.x * off, mz = this.body.z + f.z * off;
    const my = this.body.y + def.stats.height * 0.65;
    const horiz = Math.hypot(target.x - mx, target.z - mz);
    return Math.atan2(target.y - my, Math.max(0.5, horiz));
  }

  // Ray vs ground, obstacle boxes and (optionally) other fighters.
  raycast(o, d, minT, maxT, includePlayers) {
    let best = null;
    if (d.y < -1e-4) {
      const t = -o.y / d.y;
      if (t > minT && t < maxT) best = t;
    }
    const test = (minX, minY, minZ, maxX, maxY, maxZ) => {
      let t0 = -Infinity, t1 = Infinity;
      for (const [oo, dd, lo, hi] of [[o.x, d.x, minX, maxX], [o.y, d.y, minY, maxY], [o.z, d.z, minZ, maxZ]]) {
        if (Math.abs(dd) < 1e-8) {
          if (oo < lo || oo > hi) return;
        } else {
          let a = (lo - oo) / dd, b = (hi - oo) / dd;
          if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a);
          t1 = Math.min(t1, b);
          if (t0 > t1) return;
        }
      }
      if (t0 > minT && t0 < maxT && (best === null || t0 < best)) best = t0;
    };
    for (const ob of OBSTACLES) {
      test(ob.x - ob.w / 2, ob.y, ob.z - ob.d / 2, ob.x + ob.w / 2, ob.y + ob.h, ob.z + ob.d / 2);
    }
    if (includePlayers) {
      for (const v of this.views.values()) {
        if (v.isLocal || !v.group.visible) continue;
        const r = v.def.stats.radius, h = v.def.stats.height;
        const p = v.group.position;
        test(p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r);
      }
    }
    return best;
  }

  // Interpolated view of the world at renderT.
  sampleSnapshots(renderT) {
    const snaps = this.snapshots;
    if (!snaps.length) return null;
    let a = snaps[0], b = snaps[snaps.length - 1];
    if (renderT >= b.t) return { a: b, b, k: 0 };
    for (let i = snaps.length - 1; i > 0; i--) {
      if (snaps[i - 1].t <= renderT) { a = snaps[i - 1]; b = snaps[i]; break; }
    }
    const k = b.t > a.t ? Math.min(1, Math.max(0, (renderT - a.t) / (b.t - a.t))) : 1;
    return { a, b, k };
  }

  // ---- frame ---------------------------------------------------------------------

  loop() {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const frameNow = performance.now();
    const dt = Math.min(0.1, (frameNow - this.lastFrame) / 1000);
    this.lastFrame = frameNow;
    this.time += dt;

    this.acc += dt;
    let steps = 0;
    while (this.acc >= TICK_DT && steps < 5) {
      this.fixedStep();
      this.acc -= TICK_DT;
      steps++;
    }
    if (steps === 5) this.acc = 0;

    this.err.multiplyScalar(Math.exp(-dt * 10));

    const now = performance.now() / 1000;
    const renderT = now + (this.timeOffset || 0) - INTERP_DELAY_MS / 1000;
    const s = this.sampleSnapshots(renderT);
    if (s) this.renderPlayers(s, dt);
    this.renderProjectiles(now, dt);

    this.effects.update(dt);
    this.env.update(dt, this.time);
    this.updateCamera(dt);
    this.updateHud(dt, now);

    this.renderer.render(this.scene, this.camera);
  }

  renderPlayers({ a, b, k }, dt) {
    for (const pb of b.players) {
      const isLocal = pb.id === this.localId;
      let view = this.views.get(pb.id);
      if (!view) {
        view = new PlayerView(this.scene, pb, isLocal);
        this.views.set(pb.id, view);
      }
      let state;
      if (isLocal && this.body && this.me && this.me.alive) {
        const alpha = this.acc / TICK_DT;
        const lerp = (x, y) => x + (y - x) * alpha;
        state = {
          ...this.me,
          ...this.body,
          x: lerp(this.prevBody.x, this.body.x) + this.err.x,
          y: lerp(this.prevBody.y, this.body.y) + this.err.y,
          z: lerp(this.prevBody.z, this.body.z) + this.err.z,
          yaw: this.input.yaw,
          act: this.me.act,
        };
      } else if (isLocal && this.me) {
        state = this.me;
      } else {
        const pa = a.byId.get(pb.id);
        if (pa && pa.alive && pb.alive) {
          state = {
            ...pb,
            x: pa.x + (pb.x - pa.x) * k,
            y: pa.y + (pb.y - pa.y) * k,
            z: pa.z + (pb.z - pa.z) * k,
            yaw: lerpAngle(pa.yaw, pb.yaw, k),
          };
        } else {
          state = pb;
        }
      }
      view.update(dt, state, this.time);
      if (state.alive && state.grounded && state.moving && Math.random() < dt * 4) {
        this.effects.dust(state.x, state.y, state.z, 1);
      }
      if (state.alive && state.dashT > 0 && Math.random() < dt * 30) this.effects.dust(state.x, state.y, state.z, 2);
      if (state.alive && state.speedT > 0 && Math.random() < dt * 20) {
        this.effects.burst(state.x, state.y + 0.3, state.z, { count: 1, colors: ['#ffe14a'], speed: 0.5, up: 0.5, size: 0.12, life: 0.5, gravity: 0 });
      }
    }
  }

  renderProjectiles(now, dt) {
    const snap = this.latest;
    const seen = new Set();
    if (snap) {
      // extrapolate from the latest snapshot so projectiles feel responsive
      const age = Math.min(0.25, now - this.latestRecv);
      for (const p of snap.projectiles) {
        seen.add(p.id);
        let v = this.projViews.get(p.id);
        if (!v) {
          v = buildProjectile(p.kind);
          this.scene.add(v);
          this.projViews.set(p.id, v);
        }
        v.position.set(p.x + p.vx * age, p.y + p.vy * age - 0.5 * p.g * age * age, p.z + p.vz * age);
        v.rotation.x += dt * v.userData.spin;
        v.rotation.y += dt * v.userData.spin * 0.5;
        if (p.kind === 'bomb' && Math.random() < dt * 30) {
          this.effects.burst(v.position.x, v.position.y + 0.5, v.position.z, { count: 1, colors: ['#ffcf3a', '#ff7a1a'], speed: 1, up: 1, size: 0.1, life: 0.3, gravity: 0 });
        }
      }
    }
    for (const [id, v] of this.projViews) {
      if (!seen.has(id)) { this.scene.remove(v); this.projViews.delete(id); }
    }
  }

  updateCamera(dt) {
    const view = this.views.get(this.localId);
    const def = this.me ? getAnimal(this.me.animal) : getAnimal('cow');
    const yaw = this.input.yaw, pitch = this.input.pitch;
    let target;
    if (view && this.me && this.me.alive) {
      target = view.group.position.clone();
    } else if (this.me) {
      // dead: orbit slowly around where we fell
      target = new THREE.Vector3(this.me.x, this.me.y, this.me.z);
      this.input.yaw += dt * 0.3;
    } else {
      target = new THREE.Vector3(0, 0, 0);
    }
    target.y += def.stats.height + 1.1;
    const dist = 5 + def.stats.height * 1.6;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    // keep the camera out of walls
    const back = dir.clone().negate();
    const hit = this.raycast(target, back, 0.2, dist, false);
    const d = hit !== null ? Math.max(1.2, hit - 0.4) : dist;
    this.camDist = d;
    const pos = target.clone().addScaledVector(back, d);
    pos.y = Math.max(0.4, pos.y);
    if (this.shake > 0) {
      pos.x += (Math.random() - 0.5) * this.shake;
      pos.y += (Math.random() - 0.5) * this.shake;
      pos.z += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(target.clone().addScaledVector(dir, 10));
    this.env.followSun(target);
  }

  updateHud(dt, now) {
    const hud = this.hud;
    const snap = this.latest;
    if (snap && this.me) {
      const me = this.me;
      hud.setAnimal(me.animal, me.name);
      const age = now - this.latestRecv;
      const cds = me.cd.map((c) => Math.max(0, c - age));
      const live = this.body && me.alive ? { ...me, ...this.body } : me;
      hud.updatePlayer(live, cds);
      hud.updateMatch(snap.match, snap.players.length, this.roomName, this.ping);
      hud.showScoreboard(this.scoreHeld || snap.match.state === 'intermission', snap.players, this.localId, snap.match);

      if (!me.alive) {
        const info = this.deathInfo || {};
        hud.showDeath(snap.match.state === 'playing', info.title || 'Bonked!', info.sub || '', me.respawnT - age);
        hud.pause.classList.add('hidden');
      } else {
        hud.showDeath(false);
      }
    }
    hud.updateNumbers(dt, this.camera, window.innerWidth, window.innerHeight);
    if (snap) {
      const selfView = this.views.get(this.localId);
      const me = selfView && this.me?.alive ? selfView.group.position : this.me;
      this.minimap.draw(me, this.input.yaw, this.renderedPlayers(snap), this.localId);
    }
  }

  // Positions of everyone as currently drawn (interpolated), for the minimap.
  renderedPlayers(snap) {
    return snap.players.map((p) => {
      const v = this.views.get(p.id);
      return v && v.group.visible ? { ...p, x: v.group.position.x, z: v.group.position.z } : p;
    });
  }

  // ---- events -----------------------------------------------------------------------

  spatial(x, z) {
    const c = this.camera.position;
    const dx = x - c.x, dz = z - c.z;
    const dist = Math.hypot(dx, dz);
    const vol = Math.max(0, 1 - dist / 70);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const pan = dist > 0.5 ? Math.max(-1, Math.min(1, (dx * right.x + dz * right.z) / dist)) : 0;
    return [vol, pan * 0.7];
  }

  playerName(snap, id) {
    const p = snap.byId.get(id);
    return p ? p.name : 'Someone';
  }

  handleEvent(e, snap) {
    const [vol, pan] = e.x !== undefined ? this.spatial(e.x, e.z) : [1, 0];
    const mine = e.id === this.localId;
    switch (e.t) {
      case 'move': {
        const p = snap.byId.get(e.id);
        if (!p) break;
        const move = getAnimal(p.animal)[e.slot];
        if (move.type === 'melee') sfx.swing(vol, pan);
        else if (move.type === 'projectile') sfx.throw(vol, pan);
        else if (move.type === 'dash') { sfx.call(p.animal, vol, pan); this.effects.dust(e.x, e.y, e.z, 12); }
        else if (move.type === 'leap') { sfx.jump(); this.effects.dust(e.x, e.y, e.z, 10); }
        else if (move.type === 'shout') {
          sfx.call(p.animal, vol * 1.3, pan);
          this.effects.ring(e.x, e.y + 1, e.z, move.range, '#fff2c4', 0.4);
        } else if (move.type === 'buff') {
          const col = move.heal ? ['#7dff6a', '#ffffff'] : move.shield ? ['#9fd6ff', '#ffffff'] : ['#ffe14a', '#ffffff'];
          this.effects.rise(e.x, e.y + 1, e.z, col, 14);
          if (move.heal) sfx.heal(vol); else sfx.buff(vol);
        }
        if (e.slot !== 'primary' && Math.random() < 0.4 && move.type !== 'shout' && move.type !== 'dash') sfx.call(p.animal, vol * 0.7, pan);
        break;
      }
      case 'hit': {
        const target = snap.byId.get(e.id);
        const colors = HIT_COLORS[target?.animal] || ['#ffffff'];
        this.effects.burst(e.x, e.y, e.z, { count: 10, colors, speed: 5, up: 4, size: 0.14, life: 0.6 });
        sfx.hit(vol, pan);
        const pos = new THREE.Vector3(e.x, e.y + 0.4, e.z);
        if (e.by === this.localId && !mine) {
          this.hud.hitmark();
          sfx.hitConfirm();
          this.hud.damageNumber(pos, `${e.dmg}`, 'mine');
        } else if (mine) {
          this.hud.hurt(e.dmg);
          sfx.hurt();
          this.shake = Math.min(0.6, this.shake + e.dmg / 60);
        } else if (vol > 0.4) {
          this.hud.damageNumber(pos, `${e.dmg}`);
        }
        break;
      }
      case 'heal':
        this.effects.rise(e.x, e.y, e.z, ['#7dff6a'], 6);
        if (mine) this.hud.damageNumber(new THREE.Vector3(e.x, e.y, e.z), `+${e.amt}`, 'heal');
        break;
      case 'splat':
        this.effects.burst(e.x, e.y, e.z, { count: 8, colors: SPLAT_COLORS[e.kind] || ['#ffffff'], speed: 3, up: 3, size: 0.12, life: 0.5 });
        sfx.splat(vol, pan);
        break;
      case 'boom':
        this.effects.explosion(e.x, e.y, e.z, e.r);
        sfx.boom(vol, pan);
        this.shake = Math.min(0.9, this.shake + vol * 0.6);
        break;
      case 'slam':
        this.effects.ring(e.x, e.y, e.z, e.r, '#fff2c4', 0.45);
        this.effects.dust(e.x, e.y, e.z, 25);
        sfx.slam(vol, pan);
        this.shake = Math.min(0.9, this.shake + vol * 0.5);
        break;
      case 'kill': {
        const victim = snap.byId.get(e.victim);
        const killer = e.killer ? snap.byId.get(e.killer) : null;
        if (!victim) break;
        const colors = HIT_COLORS[victim.animal] || ['#ffffff'];
        this.effects.burst(e.x, e.y + 1, e.z, { count: 40, colors: [...colors, '#ffffff'], speed: 8, up: 8, size: 0.2, life: 1.2 });
        this.effects.flash(e.x, e.y + 1, e.z, 2.2, '#ffffff', 0.3);
        sfx.call(victim.animal, vol, pan);
        const involvesMe = e.victim === this.localId || e.killer === this.localId;
        this.hud.killfeedAdd(killer, victim, e.move, involvesMe);
        if (e.killer === this.localId && e.victim !== this.localId) {
          sfx.kill();
          this.hud.announce(STREAK_NAMES[e.streak] || `Bonked ${victim.name}!`, 1400);
        }
        if (e.victim === this.localId) {
          sfx.death();
          this.shake = 0.8;
          this.deathInfo = killer
            ? { title: 'Bonked!', sub: `${killer.name} the ${getAnimal(killer.animal).name} got you with ${e.move || 'a mighty blow'}.` }
            : { title: 'Oops!', sub: 'You bonked yourself.' };
        }
        break;
      }
      case 'spawn':
        this.effects.burst(e.x, 0.5, e.z, { count: 16, colors: ['#ffffff', '#fff2c4'], speed: 3, up: 3, size: 0.2, life: 0.7 });
        if (mine) this.hud.swapPanel.classList.add('hidden');
        break;
      case 'join':
        if (e.id !== this.localId) this.hud.chat('', `${e.name} wandered into the barnyard.`, true);
        break;
      case 'leave':
        this.hud.chat('', `${e.name} left the farm.`, true);
        break;
      case 'matchEnd':
        sfx.fanfare();
        this.hud.announce(e.winner ? `${e.winner.name} wins the match!` : 'Match over!', 4000);
        break;
      case 'matchStart':
        this.hud.announce('FIGHT!', 1500);
        this.deathInfo = null;
        break;
    }
  }
}

function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
