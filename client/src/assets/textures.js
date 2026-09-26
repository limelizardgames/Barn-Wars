// Procedurally painted textures (no image files needed).
import { canvasTexture, mulberry } from './kit.js';

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

// Vertical wooden planks with grain (barn walls, doors, fences).
export function planks(color, count = 8, seed = 1) {
  return cached(`planks${color}${count}${seed}`, () => canvasTexture(256, 256, (ctx, w, h) => {
    const rnd = mulberry(seed);
    const pw = w / count;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = shade(color, (rnd() - 0.5) * 24);
      ctx.fillRect(i * pw, 0, pw, h);
      for (let g = 0; g < 14; g++) {
        ctx.strokeStyle = `rgba(0,0,0,${0.04 + rnd() * 0.07})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const x = i * pw + rnd() * pw;
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + rnd() * 4 - 2, h * 0.3, x + rnd() * 4 - 2, h * 0.7, x, h);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(i * pw, 0, 2, h);
      if (rnd() < 0.5) {
        ctx.fillStyle = 'rgba(40,20,10,0.35)';
        ctx.beginPath();
        ctx.ellipse(i * pw + pw / 2, rnd() * h, 3, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, { repeat: [1, 1] }));
}

// Horizontal boards (farmhouse clapboard, crates).
export function boards(color, count = 10, seed = 2) {
  return cached(`boards${color}${count}${seed}`, () => canvasTexture(256, 256, (ctx, w, h) => {
    const rnd = mulberry(seed);
    const bh = h / count;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = shade(color, (rnd() - 0.5) * 16);
      ctx.fillRect(0, i * bh, w, bh);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, i * bh + bh - 3, w, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, i * bh, w, 2);
    }
  }, { repeat: [1, 1] }));
}

export function shingles(color, seed = 3) {
  return cached(`shingles${color}${seed}`, () => canvasTexture(256, 256, (ctx, w, h) => {
    const rnd = mulberry(seed);
    const rows = 10, cols = 8;
    const rh = h / rows, cw = w / cols;
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c < cols; c++) {
        const x = c * cw + (r % 2) * cw * 0.5;
        ctx.fillStyle = shade(color, (rnd() - 0.5) * 30);
        ctx.fillRect(x + 1, r * rh, cw - 2, rh);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + 1, r * rh + rh - 3, cw - 2, 3);
      }
    }
  }, { repeat: [3, 3] }));
}

export function straw(seed = 4) {
  return cached(`straw${seed}`, () => canvasTexture(256, 256, (ctx, w, h) => {
    const rnd = mulberry(seed);
    ctx.fillStyle = '#e2b94f';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const c = rnd();
      ctx.strokeStyle = c < 0.33 ? 'rgba(255,230,140,0.7)' : c < 0.66 ? 'rgba(170,120,40,0.55)' : 'rgba(240,205,110,0.8)';
      ctx.lineWidth = 1 + rnd() * 1.5;
      const x = rnd() * w, y = rnd() * h, len = 8 + rnd() * 18, a = (rnd() - 0.5) * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
  }));
}

export function stone(seed = 5) {
  return cached(`stone${seed}`, () => canvasTexture(256, 256, (ctx, w, h) => {
    const rnd = mulberry(seed);
    ctx.fillStyle = '#6d6b64';
    ctx.fillRect(0, 0, w, h);
    const rows = 6;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * 30;
      while (x < w) {
        const sw = 30 + rnd() * 40;
        ctx.fillStyle = shade('#a6a298', (rnd() - 0.5) * 40);
        ctx.beginPath();
        ctx.roundRect(x + 2, r * rh + 2, sw - 4, rh - 4, 8);
        ctx.fill();
        x += sw;
      }
    }
  }, { repeat: [1, 1] }));
}

export function corrugated(color) {
  return cached(`corr${color}`, () => canvasTexture(128, 128, (ctx, w, h) => {
    for (let x = 0; x < w; x++) {
      const k = Math.sin((x / w) * Math.PI * 16);
      ctx.fillStyle = shade(color, k * 22);
      ctx.fillRect(x, 0, 1, h);
    }
    const rnd = mulberry(9);
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(140,70,20,${rnd() * 0.25})`;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 2 + rnd() * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repeat: [1, 1] }));
}

// Near-white speckle multiplied over the vertex-coloured ground.
export function grassDetail() {
  return cached('grassDetail', () => canvasTexture(256, 256, (ctx, w, h) => {
    const rnd = mulberry(10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      const v = 190 + Math.floor(rnd() * 60);
      ctx.fillStyle = `rgba(${v - 20},${v},${v - 40},0.5)`;
      ctx.fillRect(rnd() * w, rnd() * h, 2, 3 + rnd() * 4);
    }
  }, { repeat: [90, 90] }));
}

export function dirt() {
  return cached('dirt', () => canvasTexture(256, 256, (ctx, w, h) => {
    const rnd = mulberry(11);
    ctx.fillStyle = '#b08a5a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(120,85,50,0.35)' : 'rgba(210,180,130,0.35)';
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 1 + rnd() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repeat: [4, 4] }));
}

export { shade };
