import {
  TICK_DT, SNAPSHOT_RATE, TICK_RATE, RESPAWN_TIME, SPAWN_PROTECTION, MATCH_DURATION,
  SCORE_LIMIT, INTERMISSION, MIN_FIGHTERS, MAX_PLAYERS_PER_ROOM, BTN, KILL_Y, NAME_MAX,
} from '../shared/constants.js';
import { getAnimal, ANIMALS, MOVE_SLOTS } from '../shared/animals.js';
import { SPAWN_POINTS } from '../shared/arena.js';
import { createBody, stepBody, BODY_FIELDS } from '../shared/physics.js';
import { useMove, updateDash, landSlam, stepProjectile } from './combat.js';
import { BotBrain, BOT_NAMES, randomAnimal } from './bot.js';

const MAX_QUEUED_INPUTS = 12;
const MAX_INPUTS_PER_TICK = 3;
const INPUT_STARVE_TICKS = 8; // step idle players after this many ticks without input

let botCounter = 0;

export function sanitizeName(name) {
  const clean = String(name || '').replace(/[^\w \-'.!?]/g, '').trim().slice(0, NAME_MAX);
  return clean || `Farmhand${Math.floor(Math.random() * 900 + 100)}`;
}

export class Room {
  constructor(name, io, { withBots = true } = {}) {
    this.name = name;
    this.io = io;
    this.withBots = withBots;
    this.players = new Map();
    this.projectiles = [];
    this.nextProjectileId = 1;
    this.events = [];
    this.time = 0;
    this.snapshotAcc = 0;
    this.match = { state: 'playing', timeLeft: MATCH_DURATION, winner: null, number: 1 };
    this.interval = null;
  }

  start() {
    if (this.interval) return;
    let last = performance.now();
    let acc = 0;
    this.interval = setInterval(() => {
      const now = performance.now();
      acc += Math.min(0.25, (now - last) / 1000);
      last = now;
      while (acc >= TICK_DT) {
        this.tick(TICK_DT);
        acc -= TICK_DT;
      }
    }, 1000 / TICK_RATE / 2);
  }

  stop() {
    clearInterval(this.interval);
    this.interval = null;
  }

  humanCount() {
    let n = 0;
    for (const p of this.players.values()) if (!p.isBot) n++;
    return n;
  }

  isFull() {
    return this.humanCount() >= MAX_PLAYERS_PER_ROOM;
  }

  *fighters() {
    yield* this.players.values();
  }

  event(e) {
    this.events.push(e);
  }

  // ---- membership ---------------------------------------------------------

  addPlayer(id, { name, animal, isBot = false, socket = null }) {
    const p = {
      id,
      name: sanitizeName(name),
      animalId: ANIMALS[animal] ? animal : 'cow',
      animal: null,
      pendingAnimal: null,
      isBot,
      socket,
      brain: isBot ? new BotBrain() : null,
      body: createBody(),
      hp: 0,
      alive: false,
      respawnT: 0,
      spawnProtT: 0,
      cooldowns: { primary: 0, ability1: 0, ability2: 0 },
      kills: 0,
      deaths: 0,
      streak: 0,
      lastHurtT: -99,
      lastAttacker: null,
      inputs: [],
      lastInput: null,
      starveTicks: 0,
      lastSeq: 0,
      actionCount: 0,
      lastAction: null,
      dash: null,
      slamPending: null,
    };
    p.animal = getAnimal(p.animalId);
    this.players.set(id, p);
    this.spawn(p);
    this.event({ t: 'join', id, name: p.name });
    if (!isBot) this.balanceBots();
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.projectiles = this.projectiles.filter((pr) => pr.ownerId !== id || pr.explode);
    this.event({ t: 'leave', id, name: p.name });
    if (!p.isBot) this.balanceBots();
  }

  balanceBots() {
    if (!this.withBots) return;
    const humans = this.humanCount();
    const bots = [...this.players.values()].filter((p) => p.isBot);
    const wanted = humans === 0 ? 0 : Math.max(0, MIN_FIGHTERS - humans);
    for (let i = bots.length; i < wanted; i++) {
      const used = new Set([...this.players.values()].map((p) => p.name));
      const animal = randomAnimal();
      const name = BOT_NAMES[animal].find((n) => !used.has(n)) || `Bot ${botCounter + 1}`;
      this.addPlayer(`bot-${++botCounter}`, { name, animal, isBot: true });
    }
    for (let i = wanted; i < bots.length; i++) this.removePlayer(bots[i].id);
  }

  changeAnimal(id, animal) {
    const p = this.players.get(id);
    if (!p || !ANIMALS[animal]) return;
    if (!p.alive || p.spawnProtT > 0) {
      p.animalId = animal;
      p.animal = getAnimal(animal);
      if (p.alive) this.spawn(p, { x: p.body.x, z: p.body.z });
    } else {
      p.pendingAnimal = animal; // takes effect on respawn
    }
  }

  queueInput(id, input) {
    const p = this.players.get(id);
    if (!p || p.isBot || !input) return;
    const seq = input.seq | 0;
    if (seq <= p.lastSeq) return;
    if (p.inputs.length >= MAX_QUEUED_INPUTS) p.inputs.shift();
    p.inputs.push({
      seq,
      mx: +input.mx || 0,
      mz: +input.mz || 0,
      yaw: Number.isFinite(+input.yaw) ? +input.yaw : 0,
      pitch: Number.isFinite(+input.pitch) ? +input.pitch : 0,
      buttons: input.buttons | 0,
    });
  }

  // ---- lifecycle ------------------------------------------------------------

  pickSpawn() {
    // choose the spawn point furthest from living fighters (with a bit of randomness)
    let best = SPAWN_POINTS[0], bestScore = -Infinity;
    for (const sp of SPAWN_POINTS) {
      let nearest = Infinity;
      for (const o of this.players.values()) {
        if (!o.alive) continue;
        nearest = Math.min(nearest, Math.hypot(o.body.x - sp[0], o.body.z - sp[1]));
      }
      const score = Math.min(nearest, 40) + Math.random() * 10;
      if (score > bestScore) { bestScore = score; best = sp; }
    }
    return { x: best[0], z: best[1] };
  }

  spawn(p, at = null) {
    if (p.pendingAnimal) {
      p.animalId = p.pendingAnimal;
      p.animal = getAnimal(p.animalId);
      p.pendingAnimal = null;
    }
    const pos = at || this.pickSpawn();
    const yaw = Math.atan2(-pos.x, -pos.z); // face the middle of the farm
    p.body = createBody(pos.x, pos.z, yaw);
    p.hp = p.animal.stats.maxHp;
    p.alive = true;
    p.respawnT = 0;
    p.spawnProtT = SPAWN_PROTECTION;
    p.cooldowns = { primary: 0, ability1: 0, ability2: 0 };
    p.dash = null;
    p.slamPending = null;
    p.lastAttacker = null;
    p.lastHurtT = -99;
    if (p.brain) p.brain = new BotBrain();
    this.event({ t: 'spawn', id: p.id, x: pos.x, z: pos.z });
  }

  kill(victim, attacker, moveName) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    victim.respawnT = RESPAWN_TIME;
    victim.deaths++;
    victim.streak = 0;
    victim.dash = null;
    victim.slamPending = null;

    // credit a recent attacker for environmental / self kills
    let killer = attacker && attacker !== victim ? attacker : null;
    if (!killer && victim.lastAttacker && this.time - victim.lastAttacker.t < 5) {
      killer = this.players.get(victim.lastAttacker.id) || null;
      moveName = moveName || victim.lastAttacker.moveName;
    }
    if (killer) {
      killer.kills++;
      killer.streak++;
    }
    this.event({
      t: 'kill',
      victim: victim.id,
      killer: killer ? killer.id : null,
      move: moveName || null,
      streak: killer ? killer.streak : 0,
      x: victim.body.x, y: victim.body.y, z: victim.body.z,
    });
    if (killer && killer.kills >= SCORE_LIMIT) this.endMatch();
  }

  endMatch() {
    if (this.match.state !== 'playing') return;
    const ranked = [...this.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const w = ranked[0];
    this.match.state = 'intermission';
    this.match.timeLeft = INTERMISSION;
    this.match.winner = w ? { id: w.id, name: w.name, animal: w.animalId, kills: w.kills } : null;
    this.event({ t: 'matchEnd', winner: this.match.winner });
  }

  startMatch() {
    this.match = { state: 'playing', timeLeft: MATCH_DURATION, winner: null, number: this.match.number + 1 };
    this.projectiles = [];
    for (const p of this.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.streak = 0;
      this.spawn(p);
    }
    this.event({ t: 'matchStart', number: this.match.number });
  }

  // ---- simulation -------------------------------------------------------

  tick(dt) {
    this.time += dt;

    // match clock
    this.match.timeLeft -= dt;
    if (this.match.timeLeft <= 0) {
      if (this.match.state === 'playing') this.endMatch();
      else this.startMatch();
    }

    for (const p of this.players.values()) this.tickPlayer(p, dt);

    this.projectiles = this.projectiles.filter((pr) => stepProjectile(this, pr, dt));

    this.snapshotAcc += dt;
    if (this.snapshotAcc >= 1 / SNAPSHOT_RATE) {
      this.snapshotAcc -= 1 / SNAPSHOT_RATE;
      this.broadcast();
    }
  }

  tickPlayer(p, dt) {
    for (const s of MOVE_SLOTS) p.cooldowns[s] = Math.max(0, p.cooldowns[s] - dt);

    if (!p.alive) {
      p.respawnT -= dt;
      p.inputs.length = 0;
      if (p.respawnT <= 0 && this.match.state === 'playing') this.spawn(p);
      return;
    }
    p.spawnProtT = Math.max(0, p.spawnProtT - dt);

    // passive regen (Pig)
    const regen = p.animal.power.regen;
    if (regen && this.time - p.lastHurtT > regen.delay && p.hp < p.animal.stats.maxHp) {
      p.hp = Math.min(p.animal.stats.maxHp, p.hp + regen.rate * dt);
    }

    if (p.isBot) {
      this.applyInput(p, p.brain.think(this, p, dt), dt);
    } else if (p.inputs.length) {
      p.starveTicks = 0;
      const n = Math.min(p.inputs.length, MAX_INPUTS_PER_TICK);
      for (let i = 0; i < n; i++) {
        const input = p.inputs.shift();
        this.applyInput(p, input, dt);
        p.lastSeq = input.seq;
        if (!p.alive) break;
      }
    } else if (++p.starveTicks > INPUT_STARVE_TICKS) {
      // client has gone quiet (tab hidden, lag spike): keep physics running
      const idle = p.lastInput ? { ...p.lastInput, mx: 0, mz: 0, buttons: 0 } : null;
      this.applyInput(p, idle, dt);
    }
  }

  applyInput(p, input, dt) {
    if (input) p.lastInput = input;
    const b = p.body;
    const canAct = input && b.stunT <= 0 && this.match.state === 'playing';
    if (canAct) {
      if (Number.isFinite(input.yaw)) b.yaw = input.yaw;
      const btn = input.buttons;
      if (btn & BTN.PRIMARY && p.cooldowns.primary <= 0) this.act(p, 'primary', input.pitch);
      if (btn & BTN.ABILITY1 && p.cooldowns.ability1 <= 0) this.act(p, 'ability1', input.pitch);
      if (btn & BTN.ABILITY2 && p.cooldowns.ability2 <= 0) this.act(p, 'ability2', input.pitch);
    }
    stepBody(b, input, dt, p.animal);
    updateDash(this, p);
    if (b.justLanded && p.slamPending) landSlam(this, p);
    if (b.y < KILL_Y) this.kill(p, null, null);
  }

  act(p, slot, pitch) {
    // attacking ends spawn protection early
    p.spawnProtT = 0;
    useMove(this, p, slot, pitch);
  }

  spawnProjectile(pr) {
    pr.id = this.nextProjectileId++;
    this.projectiles.push(pr);
  }

  // ---- networking ------------------------------------------------------

  serializePlayer(p) {
    const out = {
      id: p.id,
      name: p.name,
      animal: p.animalId,
      bot: p.isBot ? 1 : 0,
      hp: Math.ceil(p.hp),
      alive: p.alive ? 1 : 0,
      respawnT: p.alive ? 0 : +p.respawnT.toFixed(1),
      prot: p.spawnProtT > 0 ? 1 : 0,
      kills: p.kills,
      deaths: p.deaths,
      streak: p.streak,
      seq: p.lastSeq,
      act: p.actionCount,
      actSlot: p.lastAction,
      cd: [r2(p.cooldowns.primary), r2(p.cooldowns.ability1), r2(p.cooldowns.ability2)],
      moving: p.body.moving ? 1 : 0,
    };
    for (const k of BODY_FIELDS) {
      const v = p.body[k];
      out[k] = typeof v === 'number' ? r3(v) : v;
    }
    return out;
  }

  snapshot() {
    return {
      t: r3(this.time),
      match: {
        state: this.match.state,
        timeLeft: Math.max(0, Math.ceil(this.match.timeLeft)),
        winner: this.match.winner,
        number: this.match.number,
      },
      players: [...this.players.values()].map((p) => this.serializePlayer(p)),
      projectiles: this.projectiles.map((pr) => ({
        id: pr.id, kind: pr.kind, x: r3(pr.x), y: r3(pr.y), z: r3(pr.z),
        vx: r3(pr.vx), vy: r3(pr.vy), vz: r3(pr.vz), g: pr.gravity,
      })),
      events: this.events.map(roundEvent),
    };
  }

  broadcast() {
    const snap = this.snapshot();
    this.events = [];
    if (this.io) this.io.to(this.name).emit('snapshot', snap);
    return snap;
  }
}

function r2(v) { return Math.round(v * 100) / 100; }
function r3(v) { return Math.round(v * 1000) / 1000; }

function roundEvent(e) {
  const out = {};
  for (const k in e) out[k] = typeof e[k] === 'number' ? r2(e[k]) : e[k];
  return out;
}
