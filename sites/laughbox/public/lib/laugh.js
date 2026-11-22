// Crowd laughter, built from scratch in WebAudio. No samples, no network.
//
// Real crowd laughter is not one sound repeated; it is dozens of individual
// people each doing a short run of "ha"s (breath puff + voiced vowel, ~5 per
// second, pitch sagging, getting quieter), starting at slightly different
// moments, at different pitches, in different spots in the room. That is all
// this does. Every press is freshly randomized so it never loops audibly.
//
// Everything takes a context, so the same code plays live (AudioContext) and
// renders to a file (OfflineAudioContext).

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ri = (a, b) => Math.floor(rnd(a, b + 1));

// Clip lengths are fixed per kind. Every one is under 5 s so the exported
// mono 16-bit WAVs fit Discord's soundboard limits (5 s, 512 KB).
export const KINDS = {
  chuckle: { label: "chuckle", len: 2.4, key: "1", blurb: "a few people, politely amused" },
  laugh: { label: "laugh", len: 3.2, key: "2", blurb: "the room is with you" },
  big: { label: "big laugh", len: 4.0, key: "3", blurb: "that landed" },
  roar: { label: "roar", len: 4.8, key: "4", blurb: "they will be telling people about this" },
  groan: { label: "groan", len: 2.8, key: "5", blurb: "for puns: a collective ohhh" },
  groanbig: { label: "big groan", len: 3.8, key: "6", blurb: "for puns that should be illegal" },
  applause: { label: "applause", len: 4.8, key: "7", blurb: "a hand, to wrap it up" },
};

const noiseCache = new WeakMap();
function noiseBuffer(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 3), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

// A room: exponentially decaying stereo noise.
function impulse(ctx, seconds) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      // soft onset so the room doesn't click, then a ~60 dB decay
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * Math.min(1, i / (ctx.sampleRate * 0.008));
    }
  }
  return b;
}

// dry + room + a limiter so a roar of 50 voices can't clip or hurt.
// room is 0..1; the master level is `volume` (0..1).
export function makeBus(ctx, { room = 0.35, volume = 0.9 } = {}) {
  const input = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1 - room * 0.35;
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx, 1.4);
  const wet = ctx.createGain();
  wet.gain.value = room * 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 6;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  const master = ctx.createGain();
  master.gain.value = volume;
  input.connect(dry).connect(comp);
  input.connect(conv).connect(wet).connect(comp);
  comp.connect(master).connect(ctx.destination);
  return { input, master };
}

// vowel formants [freq, Q, gain]
const VOWELS = {
  a: [[800, 7, 1], [1250, 9, 0.7], [2600, 10, 0.35]],
  e: [[560, 7, 1], [1900, 9, 0.6], [2700, 10, 0.3]],
  o: [[480, 6, 1], [820, 8, 0.55], [2500, 10, 0.15]],
  u: [[400, 6, 1], [1000, 8, 0.4], [2400, 10, 0.12]],
};

// One person. `script(env, osc, nGain, noiseFilter)` schedules their sound.
function person(ctx, dest, t0, t1, { f0, vowel, size, pan, level, breath }) {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = f0;
  const env = ctx.createGain();
  env.gain.value = 0;
  const tone = ctx.createBiquadFilter(); // sawtooth is buzzy: roll off the top
  tone.type = "lowpass";
  tone.frequency.value = 4200;
  const out = ctx.createGain();
  out.gain.value = level;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  osc.connect(env).connect(tone);
  for (const [f, q, g] of VOWELS[vowel]) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f * size;
    bp.Q.value = q;
    const gg = ctx.createGain();
    gg.gain.value = g;
    tone.connect(bp).connect(gg).connect(out);
  }
  // breath: noise shaped around the same vowel, its own envelope
  const ns = ctx.createBufferSource();
  ns.buffer = noiseBuffer(ctx);
  ns.loop = true;
  const nf = ctx.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.value = VOWELS[vowel][1][0] * size * 1.5;
  nf.Q.value = 0.8;
  const nGain = ctx.createGain();
  nGain.gain.value = 0;
  ns.connect(nf).connect(nGain).connect(out);
  out.connect(p).connect(dest);
  osc.start(t0);
  ns.start(t0, Math.random() * 2);
  osc.stop(t1);
  ns.stop(t1);
  return { osc, env, nGain, breath };
}

// A run of "ha"s from one person.
function laughVoice(ctx, dest, t, nHa, amp) {
  const female = Math.random() < 0.5;
  const f0 = female ? rnd(230, 380) : rnd(120, 210);
  const size = (female ? 1.12 : 1.0) * rnd(0.92, 1.08);
  const vowel = Math.random() < 0.75 ? "a" : pick(["e", "o"]);
  const gap = rnd(0.15, 0.22); // seconds between ha's
  const end = t + nHa * gap + 0.5;
  const v = person(ctx, dest, t - 0.05, end, {
    f0, vowel, size, pan: rnd(-0.85, 0.85), level: amp, breath: rnd(0.3, 0.7),
  });
  let ti = t;
  for (let i = 0; i < nHa; i++) {
    const k = i / Math.max(1, nHa - 1);
    const a = 1 - k * 0.55 + rnd(-0.08, 0.08); // each ha a little weaker
    const last = i === nHa - 1 && Math.random() < 0.5; // trailing wheezy "haaa"
    const ring = last ? 0.16 : 0.055;
    // pitch sags across the run and wobbles ha to ha
    const f = f0 * (1 - 0.18 * k) * rnd(0.96, 1.04);
    v.osc.frequency.setValueAtTime(f * 1.04, ti);
    v.osc.frequency.exponentialRampToValueAtTime(f * 0.93, ti + 0.09);
    v.env.gain.setValueAtTime(0, ti);
    v.env.gain.linearRampToValueAtTime(a, ti + 0.03);
    v.env.gain.setTargetAtTime(0, ti + 0.05, ring);
    // the "h": a puff of air just before the voice
    v.nGain.gain.setValueAtTime(0, ti - 0.02);
    v.nGain.gain.linearRampToValueAtTime(a * v.breath, ti + 0.01);
    v.nGain.gain.setTargetAtTime(0, ti + 0.02, 0.03);
    ti += gap * rnd(0.88, 1.12) * (1 - 0.15 * k); // runs accelerate a touch
  }
}

// A sharp inhaled-squeal shriek: high, fast, a few bobbing syllables.
function shriek(ctx, dest, t, amp) {
  const f0 = rnd(520, 760);
  const end = t + 1.1;
  const v = person(ctx, dest, t - 0.05, end, {
    f0, vowel: "e", size: 1.2, pan: rnd(-0.7, 0.7), level: amp, breath: 0.2,
  });
  const n = ri(3, 5);
  let ti = t;
  for (let i = 0; i < n; i++) {
    v.osc.frequency.setValueAtTime(f0 * rnd(0.9, 1.1), ti);
    v.osc.frequency.linearRampToValueAtTime(f0 * rnd(1.1, 1.3), ti + 0.07);
    v.env.gain.setValueAtTime(0, ti);
    v.env.gain.linearRampToValueAtTime(0.8 - i * 0.1, ti + 0.02);
    v.env.gain.setTargetAtTime(0, ti + 0.08, 0.06);
    ti += rnd(0.12, 0.17);
  }
}

// One person's "ohhhh": long, vowel-y, pitch falling, a slow wobble.
function groanVoice(ctx, dest, t, dur, amp, deep) {
  const f0 = (deep ? rnd(95, 150) : rnd(110, 230)) * (Math.random() < 0.3 ? 1.6 : 1);
  const vowel = pick(["o", "o", "o", "u"]);
  const end = t + dur + 0.4;
  const v = person(ctx, dest, t - 0.05, end, {
    f0, vowel, size: rnd(0.92, 1.1), pan: rnd(-0.8, 0.8), level: amp, breath: 0.15,
  });
  // slight rise ("ooOH") then a long fall
  v.osc.frequency.setValueAtTime(f0 * 0.95, t);
  v.osc.frequency.linearRampToValueAtTime(f0 * 1.06, t + dur * 0.22);
  v.osc.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + dur);
  // vibrato
  const lfo = ctx.createOscillator();
  const lg = ctx.createGain();
  lfo.frequency.value = rnd(4.5, 6.5);
  lg.gain.value = f0 * 0.012;
  lfo.connect(lg).connect(v.osc.frequency);
  lfo.start(t);
  lfo.stop(end);
  v.env.gain.setValueAtTime(0, t);
  v.env.gain.linearRampToValueAtTime(1, t + dur * 0.3);
  v.env.gain.setTargetAtTime(0, t + dur * 0.55, dur * 0.22);
  v.nGain.gain.setValueAtTime(0, t);
  v.nGain.gain.linearRampToValueAtTime(0.25, t + dur * 0.3);
  v.nGain.gain.setTargetAtTime(0, t + dur * 0.55, dur * 0.2);
}

// Applause is a pile of claps: short noise bursts whose rate swells, holds,
// and thins. Synthesized straight into a buffer: cheap, and it varies per press.
function applauseBuffer(ctx, len, crowd) {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(2, Math.floor(sr * len), sr);
  const claps = Math.floor(len * 70 * crowd);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < claps; i++) {
      // clap times: a quick swell in, a long thinning tail
      const u = Math.random();
      const at = (u < 0.2 ? 0.05 + u * 1.2 : 0.3 + Math.pow((u - 0.2) / 0.8, 0.7) * (len - 0.7)) * sr;
      const burst = Math.floor(sr * rnd(0.012, 0.03));
      const gain = rnd(0.2, 1) * (1 - (at / sr / len) * 0.7);
      const tone = rnd(0.35, 0.8); // how bright this clap is (one-pole lowpass amount)
      let lp = 0;
      for (let j = 0; j < burst; j++) {
        const x = Math.random() * 2 - 1;
        lp += (x - lp) * tone;
        const idx = Math.floor(at) + j;
        if (idx < d.length) d[idx] += (x - lp * 0.5) * gain * Math.exp(-j / (burst * 0.28)) * 0.22;
      }
    }
  }
  return buf;
}

// Schedule one laugh/groan/applause on `bus` starting at `t`. `crowd` scales
// the number of people (1 = normal). Returns the clip length in seconds.
export function render(ctx, bus, kind, t = 0, crowd = 1) {
  const dest = bus.input;
  const n = (x) => Math.max(1, Math.round(x * crowd));
  // per-voice level falls as people are added so the sum stays roughly level
  const lvl = (people) => 0.9 / Math.sqrt(people);

  if (kind === "applause") {
    const src = ctx.createBufferSource();
    src.buffer = applauseBuffer(ctx, KINDS.applause.len - 0.4, crowd);
    const g = ctx.createGain();
    g.gain.value = 1.6;
    src.connect(g).connect(dest);
    src.start(t);
    return KINDS.applause.len;
  }

  if (kind === "groan" || kind === "groanbig") {
    const big = kind === "groanbig";
    const people = n(big ? 16 : 8);
    for (let i = 0; i < people; i++) {
      const dur = rnd(0.9, big ? 2.1 : 1.4);
      groanVoice(ctx, dest, t + rnd(0, big ? 0.55 : 0.35), dur, lvl(people) * 1.2, big);
    }
    if (big) { // one person who "boo"s the pun on the way out
      groanVoice(ctx, dest, t + 0.35, 1.9, 0.35, true);
    }
    return KINDS[kind].len;
  }

  // laughs: [people, spread, ha range, shrieks]
  const cfg = {
    chuckle: [5, 0.45, [2, 4], 0],
    laugh: [14, 0.7, [3, 6], 0],
    big: [28, 1.0, [4, 8], 2],
    roar: [46, 1.3, [5, 10], 6],
  }[kind];
  const [base, spread, [hMin, hMax], shrieks] = cfg;
  const people = n(base);
  for (let i = 0; i < people; i++) {
    // onsets bunch early: a few people go first and the room catches on
    const start = t + Math.pow(Math.random(), 1.6) * spread;
    laughVoice(ctx, dest, start, ri(hMin, hMax), lvl(people));
  }
  for (let i = 0; i < n(shrieks); i++) shriek(ctx, dest, t + rnd(0.1, spread + 0.6), 0.1);
  return KINDS[kind].len;
}

// ---- WAV export -----------------------------------------------------------

export async function renderToWav(kind, { crowd = 1, room = 0.35 } = {}) {
  const sr = 44100;
  const len = KINDS[kind].len;
  const ctx = new OfflineAudioContext(1, Math.ceil(sr * len), sr);
  const bus = makeBus(ctx, { room, volume: 1 });
  render(ctx, bus, kind, 0.05, crowd);
  const rendered = await ctx.startRendering();
  return encodeWav(rendered.getChannelData(0), sr);
}

// 16-bit mono PCM, peak-normalized to about -1 dBFS, with a short fade-out
// so the clip never ends on a click.
export function encodeWav(samples, sr) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const k = peak > 0 ? 0.89 / peak : 1;
  const fade = Math.floor(sr * 0.08);
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const tail = samples.length - i;
    const f = tail < fade ? tail / fade : 1;
    const s = Math.max(-1, Math.min(1, samples[i] * k * f));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}
