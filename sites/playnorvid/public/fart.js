// Physical-model fart. Wrong answers play this.
//
// Model: a gas reservoir at pressure p(t) (fast rise, exponential bleed-off)
// pushes through a collapsible sphincter. The sphincter is a relaxation
// oscillator, not a resonator: it flaps open when pressure wins and slaps shut
// when flow drops, so each cycle is a short asymmetric flow pulse (quick
// opening, slower closing) followed by a closed phase. Pitch follows
// sqrt(pressure) (Bernoulli), wanders (jitter / shimmer), and as pressure
// falls the oscillator drops octaves (period doubling), drops cycles, and
// finally sputters. Turbulence noise rides on the open phase. The source then
// runs through the cavity (a couple of lowpassed resonances that glide with
// pressure) and a sprinkle of wet bubble chirps in the tail.
//
// Tuned against real recordings: "Different kind of real farts" (ylearkisto,
// Wikimedia Commons, CC BY 3.0, 48 kHz, 4m50s, 71 usable events). Measured:
// event length median 0.37 s (p10 0.18, p90 1.1); f0 30-190 Hz with octave
// hops like 150->74->33 and unvoiced gaps; spectral centroid ~300-2000 Hz,
// median ~1 kHz. The PRESETS below sit inside those ranges.

export const PRESETS = {
  // dur s, tau = pressure decay s, fLo/fHi = pitch at p=0/p=1 (Hz)
  classic:  { dur: 0.55, tau: 0.30, fLo: 28, fHi: 150, jitter: 0.10, shimmer: 0.25, oq: 0.45, noise: 0.35, subProb: 0.10, dropProb: 0.04, form: [[180, 3.0, 1.0], [520, 4.0, 0.6], [1100, 5.0, 0.35]], wet: 0.25 },
  squeaker: { dur: 0.30, tau: 0.16, fLo: 70,  fHi: 190, jitter: 0.06, shimmer: 0.15, oq: 0.30, noise: 0.45, subProb: 0.04, dropProb: 0.02, form: [[320, 4.0, 1.0], [900, 5.0, 0.7], [1700, 6.0, 0.4]], wet: 0.05 },
  rumbler:  { dur: 0.95, tau: 0.55, fLo: 26,  fHi: 105, jitter: 0.14, shimmer: 0.30, oq: 0.55, noise: 0.30, subProb: 0.16, dropProb: 0.05, form: [[130, 2.5, 1.0], [380, 3.5, 0.5], [800, 4.0, 0.25]], wet: 0.30 },
  sputter:  { dur: 0.70, tau: 0.28, fLo: 30,  fHi: 170, jitter: 0.18, shimmer: 0.40, oq: 0.40, noise: 0.50, subProb: 0.22, dropProb: 0.22, form: [[220, 3.0, 1.0], [640, 4.0, 0.6], [1300, 5.0, 0.4]], wet: 0.45 },
};

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// RBJ band-pass (constant 0 dB peak); retunable so the cavity can glide.
function bandpass(sr, fc, q) {
  let b0 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = (f) => {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    b0 = al / a0; b2 = -al / a0; a1 = (-2 * Math.cos(w)) / a0; a2 = (1 - al) / a0;
  };
  set(fc);
  return {
    set,
    run(x) { const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; },
  };
}

// Returns a Float32Array of mono samples in [-1, 1]. Deterministic per seed.
export function synthFart(sr, preset, seed) {
  const P = typeof preset === "string" ? PRESETS[preset] : preset;
  const rand = mulberry32(seed >>> 0);
  const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rand(); return (s - 2) * 1.7; };
  const n = Math.floor(sr * P.dur);
  const out = new Float32Array(n);
  // cavity resonances: gains per formant, centre freq glides with pressure
  const res = P.form.map(([f, q, g], k) => ({ f, g: g * (1 + 2.5 * k), bp: bandpass(sr, f, q) }));
  const gainJ = 1 + 0.15 * gauss();

  let phase = 0, div = 1, perAmp = 1, perF = 1, open = true, flutter = 0;
  let lastU = 0, lp = 0, lpN = 0, dc = 0;
  const bubbles = [];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const p = Math.min(1, t / 0.012) * Math.exp(-t / P.tau); // reservoir pressure
    flutter += (gauss() * 0.02 - flutter * 0.002);               // slow pitch wander
    const f = (P.fLo + (P.fHi - P.fLo) * Math.sqrt(p)) / div * perF * (1 + flutter);
    phase += f / sr;
    if (phase >= 1) {
      phase -= 1;
      // new cycle: roll jitter, shimmer, and the chaotic events
      perF = 1 + P.jitter * gauss();
      perAmp = Math.max(0.2, 1 + P.shimmer * gauss());
      const weak = 1 - p; // low pressure -> more unstable
      if (rand() < P.subProb * (0.3 + 1.7 * weak)) div = div >= 4 ? 2 : div * 2;
      else if (div > 1 && rand() < 0.25) div /= 2;
      open = rand() >= P.dropProb * (0.3 + 2.5 * weak);
    }
    // asymmetric flow pulse: fast open, slow close, then closed
    let pulse = 0;
    if (open && phase < P.oq) pulse = Math.pow(Math.sin(Math.PI * Math.pow(phase / P.oq, 0.6)), 2);
    const u = pulse * perAmp * p;
    // radiated sound ~ flow plus its derivative (the slap on closing)
    const du = (u - lastU) * (sr / Math.max(f, 20)) * 0.16;
    lastU = u;
    // turbulence: loud while the valve is open, a hiss of leakage otherwise
    const turb = gauss() * p * (0.12 + 0.88 * pulse) * P.noise;
    lpN += 0.5 * (turb - lpN);
    let src = u + du + lpN;

    // cavity
    let y = 0;
    for (const r of res) {
      if (i % 64 === 0) r.bp.set(r.f * (0.8 + 0.3 * p)); // cavity compresses as pressure falls
      y += r.g * r.bp.run(src) * (0.6 + 0.4 * p);
    }
    lp += 0.25 * (src - lp); // plenty of direct low end too
    y += 0.4 * lp;

    // wet bubbles in the tail
    if (p < 0.5 && rand() < P.wet * 0.004 * (1 - p)) bubbles.push({ t0: t, f: 260 + rand() * 500, a: 0.15 + rand() * 0.25 });
    for (let b = bubbles.length - 1; b >= 0; b--) {
      const bb = bubbles[b], tt = t - bb.t0;
      if (tt > 0.03) { bubbles.splice(b, 1); continue; }
      y += bb.a * p * Math.sin(2 * Math.PI * (bb.f * tt + 6000 * tt * tt)) * Math.exp(-tt * 140);
    }
    dc += 0.001 * (y - dc);
    out[i] = y - dc;
  }
  // soft clip, normalise, fade the last 10 ms
  let pk = 0;
  for (let i = 0; i < n; i++) { out[i] = Math.tanh(out[i] * 2.2 * gainJ); pk = Math.max(pk, Math.abs(out[i])); }
  const fade = Math.floor(sr * 0.01), k = pk > 0 ? 0.85 / pk : 0;
  for (let i = 0; i < n; i++) out[i] *= k * (i > n - fade ? (n - i) / fade : 1);
  return out;
}

const NAMES = Object.keys(PRESETS);
let ac;
// Plays a fresh random fart (random preset + seed each time).
export function playFart() {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    const name = NAMES[Math.floor(Math.random() * NAMES.length)];
    const data = synthFart(ac.sampleRate, name, (Math.random() * 2 ** 32) >>> 0);
    const buf = ac.createBuffer(1, data.length, ac.sampleRate);
    buf.copyToChannel(data, 0);
    const s = ac.createBufferSource(), g = ac.createGain();
    g.gain.value = 0.7;
    s.buffer = buf; s.connect(g); g.connect(ac.destination); s.start();
  } catch (e) { /* no audio, no problem */ }
}
if (typeof window !== "undefined") window.playFart = playFart;
