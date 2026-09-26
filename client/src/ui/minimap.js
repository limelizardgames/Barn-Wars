// Heading-up circular minimap. The static farm layout is painted once;
// fighters are drawn on top every frame.
import { ARENA_HALF, OBSTACLES, MUD_PITS, PONDS, CORN_FIELDS } from '../../../shared/arena.js';
import { ANIMAL_COLORS } from '../assets/animals.js';

const A = ARENA_HALF;
const MAP_RES = 512; // pixels for the whole arena in the cached layer

const KIND_COLORS = {
  barn: '#b8322a', silo: '#b9c0c5', coop: '#e7d2a2', tractor: '#3c8d3a', trough: '#4fa3d8',
  well: '#9a9a92', hay: '#e9c25a', crate: '#a8763f', fence: '#6e4a2a', tree: '#2f6e2a',
  house: '#f3ead8', windmill: '#f1ece0', shed: '#9aa3a8', wall: '#9a978d', rock: '#8f8c84',
};

// world -> layer pixel. +x points left and +z points up, matching the default camera.
const U = (x) => ((A - x) / (A * 2)) * MAP_RES;
const V = (z) => ((A - z) / (A * 2)) * MAP_RES;

function paintLayer() {
  const c = document.createElement('canvas');
  c.width = c.height = MAP_RES;
  const ctx = c.getContext('2d');
  const s = MAP_RES / (A * 2);
  ctx.fillStyle = '#5f9a3f';
  ctx.fillRect(0, 0, MAP_RES, MAP_RES);
  // subtle grid for a sense of scale
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let g = -A; g <= A; g += 15) {
    ctx.beginPath(); ctx.moveTo(U(g), 0); ctx.lineTo(U(g), MAP_RES); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, V(g)); ctx.lineTo(MAP_RES, V(g)); ctx.stroke();
  }
  ctx.fillStyle = '#b08a5a';
  ctx.beginPath(); ctx.arc(U(0), V(-18), 16 * s, 0, Math.PI * 2); ctx.fill();
  for (const f of CORN_FIELDS) {
    ctx.fillStyle = '#c8b650';
    ctx.fillRect(U(f.x + f.w / 2), V(f.z + f.d / 2), f.w * s, f.d * s);
    ctx.strokeStyle = 'rgba(90,120,40,0.6)';
    for (let x = 0; x < f.w; x += 1.5) {
      ctx.beginPath(); ctx.moveTo(U(f.x + f.w / 2 - x), V(f.z + f.d / 2)); ctx.lineTo(U(f.x + f.w / 2 - x), V(f.z - f.d / 2)); ctx.stroke();
    }
  }
  for (const p of PONDS) {
    ctx.fillStyle = '#4aa3d0';
    ctx.beginPath(); ctx.arc(U(p.x), V(p.z), p.r * s, 0, Math.PI * 2); ctx.fill();
  }
  for (const m of MUD_PITS) {
    ctx.fillStyle = '#6b4526';
    ctx.beginPath(); ctx.arc(U(m.x), V(m.z), m.r * s, 0, Math.PI * 2); ctx.fill();
  }
  const sorted = [...OBSTACLES].sort((a, b) => a.y + a.h - (b.y + b.h));
  for (const o of sorted) {
    ctx.fillStyle = KIND_COLORS[o.kind] || '#777';
    if (o.kind === 'tree') {
      ctx.beginPath(); ctx.arc(U(o.x), V(o.z), 2.2 * s, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    const x = U(o.x + o.w / 2), y = V(o.z + o.d / 2);
    ctx.fillRect(x, y, Math.max(1.5, o.w * s), Math.max(1.5, o.d * s));
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, Math.max(1.5, o.w * s), Math.max(1.5, o.d * s));
  }
  ctx.strokeStyle = '#5e3b1f';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, MAP_RES - 3, MAP_RES - 3);
  return c;
}

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layer = paintLayer();
    this.zoomed = true;
    this.size = 0;
  }

  toggleZoom() {
    this.zoomed = !this.zoomed;
  }

  // me: { x, z, yaw } for the local fighter; players: snapshot players; localId
  draw(me, yaw, players, localId) {
    const cv = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const css = cv.clientWidth;
    if (!css) return;
    if (this.size !== css * dpr) {
      this.size = css * dpr;
      cv.width = cv.height = this.size;
    }
    const ctx = this.ctx;
    const S = this.size, R = S / 2;
    const viewRadius = this.zoomed ? 45 : A * 1.45; // world units shown from centre to edge
    const k = R / viewRadius; // screen px per world unit
    const layerScale = k / (MAP_RES / (A * 2));
    const cx = me ? me.x : 0, cz = me ? me.z : 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 2 * dpr, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#3f6b2c';
    ctx.fillRect(0, 0, S, S);

    // heading-up: rotate the world so the camera's forward points up
    ctx.translate(R, R);
    ctx.rotate(yaw);
    ctx.scale(layerScale, layerScale);
    ctx.translate(-U(cx), -V(cz));
    ctx.drawImage(this.layer, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // fighters
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const toScreen = (x, z) => {
      const du = (cx - x) * k, dv = (cz - z) * k; // layer axes: +u = -x, +v = -z
      return [R + du * cos - dv * sin, R + du * sin + dv * cos];
    };
    for (const p of players) {
      if (!p.alive || p.id === localId) continue;
      let [sx, sy] = toScreen(p.x, p.z);
      const dx = sx - R, dy = sy - R;
      const d = Math.hypot(dx, dy);
      const edge = R - 8 * dpr;
      const outside = d > edge;
      if (outside) { sx = R + (dx / d) * edge; sy = R + (dy / d) * edge; }
      ctx.globalAlpha = outside ? 0.55 : 1;
      ctx.beginPath();
      ctx.arc(sx, sy, (outside ? 3.5 : 5) * dpr, 0, Math.PI * 2);
      ctx.fillStyle = ANIMAL_COLORS[p.animal] || '#fff';
      ctx.fill();
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = '#d6281e';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // view cone + self arrow (always centred, always pointing up)
    if (me) {
      const cone = ctx.createRadialGradient(R, R, 0, R, R, R * 0.6);
      cone.addColorStop(0, 'rgba(255,240,180,0.35)');
      cone.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.arc(R, R, R * 0.6, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6);
      ctx.closePath();
      ctx.fill();
      const a = 8 * dpr;
      ctx.beginPath();
      ctx.moveTo(R, R - a * 1.2);
      ctx.lineTo(R + a * 0.8, R + a * 0.8);
      ctx.lineTo(R, R + a * 0.3);
      ctx.lineTo(R - a * 0.8, R + a * 0.8);
      ctx.closePath();
      ctx.fillStyle = '#ffe14a';
      ctx.fill();
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = '#2a1a10';
      ctx.stroke();
    }
    ctx.restore();

    // rim
    ctx.beginPath();
    ctx.arc(R, R, R - 2 * dpr, 0, Math.PI * 2);
    ctx.lineWidth = 4 * dpr;
    ctx.strokeStyle = '#f2c14e';
    ctx.stroke();
  }
}
