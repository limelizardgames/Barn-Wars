// All sound is synthesised with WebAudio, so there are no audio files to ship.

let ctx = null;
let master = null;
let muted = false;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.35;
  return muted;
}

function ready() {
  if (!ctx || muted) return false;
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

function tone({ type = 'sine', from = 440, to = from, dur = 0.2, vol = 0.5, delay = 0, vibrato = 0, vibratoRate = 6, pan = 0 }) {
  if (!(vol > 0.001)) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  if (vibrato) {
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = vibratoRate;
    lg.gain.value = vibrato;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = osc.connect(g);
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node = node.connect(p);
  }
  node.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.3, vol = 0.5, filter = 1200, q = 1, type = 'lowpass', delay = 0, sweepTo = null, pan = 0 }) {
  if (!(vol > 0.001)) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(filter, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = src.connect(f).connect(g);
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    node = node.connect(p);
  }
  node.connect(master);
  src.start(t0);
}

const CALLS = {
  cow: (v, pan) => tone({ type: 'sawtooth', from: 150, to: 105, dur: 0.9, vol: 0.25 * v, vibrato: 4, vibratoRate: 5, pan }),
  chicken: (v, pan) => {
    for (let i = 0; i < 3; i++) tone({ type: 'square', from: 900 + i * 80, to: 600, dur: 0.07, vol: 0.12 * v, delay: i * 0.09, pan });
  },
  pig: (v, pan) => {
    tone({ type: 'sawtooth', from: 260, to: 180, dur: 0.18, vol: 0.2 * v, vibrato: 30, vibratoRate: 40, pan });
    tone({ type: 'sawtooth', from: 240, to: 160, dur: 0.2, vol: 0.2 * v, vibrato: 30, vibratoRate: 40, delay: 0.22, pan });
  },
  sheep: (v, pan) => tone({ type: 'sawtooth', from: 420, to: 380, dur: 0.7, vol: 0.18 * v, vibrato: 25, vibratoRate: 11, pan }),
  goat: (v, pan) => tone({ type: 'square', from: 520, to: 430, dur: 0.5, vol: 0.12 * v, vibrato: 40, vibratoRate: 14, pan }),
  horse: (v, pan) => tone({ type: 'sawtooth', from: 900, to: 300, dur: 0.8, vol: 0.14 * v, vibrato: 60, vibratoRate: 18, pan }),
};

export const sfx = {
  call(animal, vol = 1, pan = 0) { if (ready()) (CALLS[animal] || CALLS.cow)(vol, pan); },
  throw(vol = 1, pan = 0) { if (ready()) noise({ dur: 0.15, vol: 0.25 * vol, filter: 900, type: 'bandpass', sweepTo: 2500, pan }); },
  swing(vol = 1, pan = 0) { if (ready()) noise({ dur: 0.18, vol: 0.3 * vol, filter: 500, type: 'bandpass', sweepTo: 1500, q: 2, pan }); },
  hit(vol = 1, pan = 0) {
    if (!ready()) return;
    tone({ type: 'triangle', from: 180, to: 60, dur: 0.15, vol: 0.5 * vol, pan });
    noise({ dur: 0.08, vol: 0.3 * vol, filter: 2000, pan });
  },
  hitConfirm() { if (ready()) tone({ type: 'square', from: 1300, to: 1100, dur: 0.06, vol: 0.08 }); },
  hurt() { if (ready()) tone({ type: 'sawtooth', from: 300, to: 120, dur: 0.2, vol: 0.2 }); },
  boom(vol = 1, pan = 0) {
    if (!ready()) return;
    noise({ dur: 0.7, vol: 0.8 * vol, filter: 900, sweepTo: 80, pan });
    tone({ type: 'sine', from: 120, to: 35, dur: 0.6, vol: 0.6 * vol, pan });
  },
  slam(vol = 1, pan = 0) {
    if (!ready()) return;
    tone({ type: 'sine', from: 90, to: 40, dur: 0.4, vol: 0.7 * vol, pan });
    noise({ dur: 0.35, vol: 0.4 * vol, filter: 400, pan });
  },
  splat(vol = 1, pan = 0) { if (ready()) noise({ dur: 0.12, vol: 0.2 * vol, filter: 700, pan }); },
  jump() { if (ready()) tone({ type: 'sine', from: 300, to: 600, dur: 0.12, vol: 0.12 }); },
  heal(vol = 1) { if (ready()) [0, 0.08, 0.16].forEach((d, i) => tone({ type: 'triangle', from: 600 + i * 200, dur: 0.15, vol: 0.12 * vol, delay: d })); },
  buff(vol = 1) { if (ready()) tone({ type: 'triangle', from: 300, to: 900, dur: 0.35, vol: 0.15 * vol }); },
  kill() { if (ready()) [0, 0.1].forEach((d, i) => tone({ type: 'square', from: 700 + i * 350, dur: 0.12, vol: 0.12, delay: d })); },
  death() { if (ready()) tone({ type: 'sawtooth', from: 400, to: 60, dur: 0.8, vol: 0.2 }); },
  ui() { if (ready()) tone({ type: 'triangle', from: 800, to: 1000, dur: 0.06, vol: 0.1 }); },
  fanfare() {
    if (!ready()) return;
    [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'square', from: f, dur: 0.25, vol: 0.1, delay: i * 0.14 }));
  },
};
