// Procedural soundtrack + sound effects, all WebAudio, no sample files.
// A slow swung jazz loop in D with a Japanese-scale flavour: Rhodes-ish chords,
// a walking bass, brushed hats, and a koto-style pluck line that gets busier as
// the polyhedron gains vertices. Nothing starts until start() runs from a click.

const BPM = 88;
const BEAT = 60 / BPM;
const SWING = 0.62;          // fraction of a beat the first eighth of each pair lasts
const LOOKAHEAD = 0.2;       // seconds of music scheduled ahead of the clock
const TICK_MS = 50;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// one chord per bar: chord tones (for pad + bass) and a koto scale (for the melody)
const BARS = [
  { name: "Dm9",      root: 38, pad: [53, 57, 60, 64], scale: [62, 64, 65, 69, 70, 72, 74, 76] },
  { name: "Bbmaj7#11", root: 34, pad: [50, 57, 62, 64], scale: [62, 65, 69, 70, 74, 76, 77, 81] },
  { name: "Em7b5",    root: 40, pad: [52, 58, 62, 65], scale: [64, 65, 69, 70, 74, 76, 77, 81] },
  { name: "A7b9",     root: 33, pad: [55, 58, 61, 64], scale: [64, 67, 69, 70, 73, 76, 79, 81] },
];

let ctx = null, master = null, music = null, sfx = null, noiseBuf = null;
let muted = false, started = false, timer = 0;
let nextBeat = 0, beatIdx = 0, progress = 0, lastMel = 4;

function ensure() {
  if (ctx) return ctx;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  // a soft echo that gives everything a little room
  const delay = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
  delay.delayTime.value = BEAT * 0.75; fb.gain.value = 0.32; wet.gain.value = 0.28;
  delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
  music = ctx.createGain(); music.gain.value = 0.55;
  sfx = ctx.createGain(); sfx.gain.value = 0.9;
  music.connect(master); music.connect(delay);
  sfx.connect(master); sfx.connect(delay);
  const n = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, n, n);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(dest, type, freq, t, peak, attack, decay, detune = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq; o.detune.value = detune;
  env(g, t, peak, attack, decay);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + attack + decay + 0.05);
  return o;
}

function noise(dest, t, peak, decay, hp, lp) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
  const g = ctx.createGain(); env(g, t, peak, 0.002, decay);
  s.connect(f);
  if (lp) { const l = ctx.createBiquadFilter(); l.type = "lowpass"; l.frequency.value = lp; f.connect(l); l.connect(g); }
  else f.connect(g);
  g.connect(dest);
  s.start(t, Math.random() * 0.5); s.stop(t + decay + 0.05);
}

// plucked string: bright triangle with a fast-dying octave, like a koto
function pluck(dest, midi, t, vel = 0.3, decay = 0.9) {
  const f = mtof(midi);
  tone(dest, "triangle", f, t, vel, 0.003, decay);
  tone(dest, "sine", f * 2, t, vel * 0.4, 0.002, decay * 0.35, 4);
  tone(dest, "square", f * 3.01, t, vel * 0.05, 0.001, 0.08);
}

// electric-piano chord tone: sine with a bell-ish overtone
function keys(dest, midi, t, vel, len) {
  const f = mtof(midi);
  tone(dest, "sine", f, t, vel, 0.01, len);
  tone(dest, "sine", f * 4, t, vel * 0.18, 0.002, len * 0.2);
  tone(dest, "triangle", f * 2, t, vel * 0.2, 0.01, len * 0.6, -6);
}

function bass(dest, midi, t, vel = 0.5) {
  const f = mtof(midi);
  tone(dest, "sine", f, t, vel, 0.01, BEAT * 0.9);
  tone(dest, "triangle", f, t, vel * 0.3, 0.005, BEAT * 0.45);
}

const rnd = Math.random;

function scheduleBeat(b, t) {
  const bar = BARS[Math.floor(b / 4) % BARS.length];
  const next = BARS[(Math.floor(b / 4) + 1) % BARS.length];
  const inBar = b % 4;
  const swungOff = t + BEAT * SWING;
  const humanize = () => (rnd() - 0.5) * 0.012;

  // walking bass: root, fifth, third-ish, chromatic approach to the next root
  const walk = [bar.root, bar.root + 7, bar.root + (inBar === 2 ? 3 : 4) - (bar.name === "Em7b5" ? 1 : 0), next.root + (next.root > bar.root ? -1 : 1)];
  bass(music, walk[inBar], t + humanize(), 0.45);

  // comping: a stab on the "and" of 2 and the downbeat of 3, voiced softly
  if (inBar === 0 || inBar === 2) {
    const hits = inBar === 0 ? [[t, 0.9]] : [[swungOff, 0.7]];
    for (const [ht, len] of hits) bar.pad.forEach((m, i) => keys(music, m, ht + i * 0.012, 0.075, len * BEAT * 1.6));
  }

  // ride-ish hat on the beat, swung offbeat, brushed snare on 2 and 4
  noise(music, t, 0.05, 0.09, 7000);
  noise(music, swungOff, 0.025, 0.07, 8000);
  if (inBar === 1 || inBar === 3) noise(music, t, 0.07, 0.16, 1800, 6000);
  if (inBar === 0) tone(music, "sine", 55, t, 0.28, 0.002, 0.14, 0), noise(music, t, 0.03, 0.05, 200, 900);

  // koto line: sparse at the start, busier as you grow; steps along the bar's scale
  const density = 0.18 + 0.5 * progress;
  for (const [mt, on] of [[t, 0.55], [swungOff, 1]]) {
    if (rnd() < density * on * (inBar === 0 && mt === t ? 1.4 : 1)) {
      const step = Math.round((rnd() - 0.5) * 4);
      lastMel = Math.max(0, Math.min(bar.scale.length - 1, lastMel + (step || 1)));
      pluck(music, bar.scale[lastMel] + (rnd() < 0.1 ? 12 : 0), mt + humanize(), 0.16 + rnd() * 0.06, 1.1);
    }
  }
}

function pump() {
  if (!ctx) return;
  while (nextBeat < ctx.currentTime + LOOKAHEAD) {
    scheduleBeat(beatIdx, nextBeat);
    nextBeat += BEAT; beatIdx++;
  }
}

export function start() {
  if (!ensure()) return;
  if (ctx.state === "suspended") ctx.resume();
  if (started) return;
  started = true;
  nextBeat = ctx.currentTime + 0.1; beatIdx = 0;
  timer = setInterval(pump, TICK_MS);
}

export function setProgress(p) { progress = Math.max(0, Math.min(1, p)); }

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.03);
  return muted;
}
export const isMuted = () => muted;

// ---- sound effects (silent until start() has made the context) ----
const live = () => ctx && started && ctx.state === "running" && !muted;
const PENTA = [62, 64, 65, 69, 70];   // D E F A Bb, the Miyako-bushi-ish set

// a pickup is a koto note that climbs the scale as the polyhedron gains vertices
export function pickup(vertexCount) {
  if (!live()) return;
  const t = ctx.currentTime;
  const i = vertexCount % PENTA.length, oct = Math.floor(vertexCount / PENTA.length) % 3;
  const m = PENTA[i] + 12 * (oct + 1);
  pluck(sfx, m, t, 0.35, 0.7);
  pluck(sfx, m + 7, t + 0.05, 0.18, 0.5);
  noise(sfx, t, 0.05, 0.05, 4000);
}

// the lurch: a woody clack when a face lands, louder the harder it falls
export function land(strength) {
  if (!live()) return;
  const t = ctx.currentTime, v = Math.min(1, strength);
  tone(sfx, "sine", 150 - 60 * v, t, 0.14 + 0.2 * v, 0.002, 0.09);
  noise(sfx, t, 0.04 + 0.06 * v, 0.04, 900, 3500);
}

// rolled into something too big
export function bump() {
  if (!live()) return;
  const t = ctx.currentTime;
  tone(sfx, "sine", 90, t, 0.35, 0.002, 0.18);
  tone(sfx, "square", 180, t, 0.04, 0.001, 0.06);
  noise(sfx, t, 0.05, 0.06, 300, 1500);
}

// pyramid to sphere: a rising Hirajoshi run ending on a held Dmaj9-ish chord
export function win() {
  if (!live()) return;
  const t = ctx.currentTime + 0.05;
  [62, 64, 65, 69, 70, 74, 76, 77, 81, 82, 86].forEach((m, i) => pluck(sfx, m, t + i * 0.07, 0.3, 1.2));
  [50, 57, 62, 66, 69, 73].forEach((m, i) => keys(sfx, m, t + 0.85 + i * 0.02, 0.1, 3));
  bass(sfx, 38, t + 0.85, 0.5);
}
