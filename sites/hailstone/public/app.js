// hailstone — a sound synthesis engine with no Web Audio API anywhere.
//
// Every note is rendered offline, sample by sample, into a Float32Array:
// a plain sine phase accumulator (Math.sin) mixed against a "hailstone"
// signal driven by a generalized Collatz walk (n -> n/d, or m*n+a), hashed
// into amplitudes with a 32-bit integer mix. The result is hand-encoded into
// a 16-bit PCM WAV and played through an ordinary <audio> element — the same
// mechanism a page uses to play an mp3, nothing from the Web Audio API.

const SAMPLE_RATE = 44100;
const HAIL_CAP = 1 << 24; // keeps the generalized walk bounded and integer-safe

// ---- the hailstone walk -----------------------------------------------

// 32-bit integer hash (Murmur-style finalizer), repurposed as a wavetable:
// turns an arbitrary integer from the walk into a well-spread value in
// [-1, 1] instead of a raw magnitude that could be huge or tiny.
function hash32(x) {
  x = x | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return x >>> 0;
}
function hashToUnit(n) {
  return (hash32(n) / 4294967295) * 2 - 1;
}

// Generalized hailstone step: n -> n/d when d divides n, else n -> m*n + a.
// Folded back under HAIL_CAP so the walk stays a bounded, deterministic
// integer sequence even for (m, a, d) that wouldn't provably converge.
function hailstoneStep(n, m, a, d, cap) {
  let next = n % d === 0 ? n / d : n * m + a;
  if (next <= 0) next = 1;
  if (next > cap) next = (next % cap) || 1;
  return next;
}

// Each key seeds its own walk from a hash of its note index + the seed-offset
// knob, so neighboring keys can land on unrelated trajectories.
function seedForNote(noteIndex, seedOffset) {
  const h = hash32((noteIndex + 1) * 2654435761 + seedOffset);
  const seed = h % HAIL_CAP;
  return seed <= 0 ? 1 : seed;
}

function noteFreq(semitoneIndex) {
  return 261.6255653005986 * Math.pow(2, semitoneIndex / 12); // C4 base
}

// ---- rendering a single note -------------------------------------------

function renderNote({ freq, seed, m, a, d, grain, smooth, chaos, decaySec, sampleRate, ampScale = 1 }) {
  const totalSamples = Math.max(1, Math.round(decaySec * sampleRate));
  const holdSamples = Math.max(1, Math.round(sampleRate / (freq * grain)));
  const buf = new Float32Array(totalSamples);

  let n = seed;
  let prevVal = hashToUnit(n);
  let curVal = prevVal;
  let holdCounter = 0;
  let phase = 0;
  const phaseInc = (2 * Math.PI * freq) / sampleRate;
  const attackSamples = Math.max(1, Math.round(sampleRate * 0.003));

  for (let i = 0; i < totalSamples; i++) {
    const t = holdCounter / holdSamples;
    const hailSample = curVal * (1 - smooth) + (prevVal + (curVal - prevVal) * t) * smooth;
    const sineSample = Math.sin(phase);
    phase = (phase + phaseInc) % (2 * Math.PI);

    const mixed = hailSample * chaos + sineSample * (1 - chaos);
    const attackEnv = Math.min(1, i / attackSamples);
    const decayEnv = Math.pow(1 - i / totalSamples, 1.6);
    buf[i] = mixed * attackEnv * decayEnv * ampScale;

    holdCounter++;
    if (holdCounter >= holdSamples) {
      holdCounter = 0;
      n = hailstoneStep(n, m, a, d, HAIL_CAP);
      prevVal = curVal;
      curVal = hashToUnit(n);
    }
  }
  return buf;
}

function renderCascade(noteIndices, spacingSec, params) {
  const sr = SAMPLE_RATE;
  const totalLen = Math.round((spacingSec * (noteIndices.length - 1) + params.decay) * sr) + 1;
  const out = new Float32Array(Math.max(1, totalLen));
  noteIndices.forEach((idx, i) => {
    const noteBuf = renderNote({
      freq: noteFreq(idx),
      seed: seedForNote(idx, params.seed),
      m: params.m,
      a: params.a,
      d: params.d,
      grain: params.grain,
      smooth: params.smooth,
      chaos: params.chaos,
      decaySec: params.decay,
      sampleRate: sr,
      ampScale: 0.85,
    });
    const start = Math.round(i * spacingSec * sr);
    for (let s = 0; s < noteBuf.length && start + s < out.length; s++) {
      out[start + s] += noteBuf[s];
    }
  });
  for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i]); // soft-clip overlap
  return out;
}

// ---- WAV encoding (hand-rolled, no library) -----------------------------

function encodeWavBlob(samples, sampleRate) {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);
  let offset = 44;
  for (let i = 0; i < numSamples; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

// ---- voice management (plain <audio> elements, no mixing graph) --------

const MAX_VOICES = 16; // caps concurrently-open Audio elements/object URLs so
// mashing the keyboard can't leak memory or file handles — not a habitual
// safety margin, it's roughly the point where more overlapping plucks stop
// being audibly distinguishable anyway.
let voices = [];

function playBuffer(buf, volume) {
  const blob = encodeWavBlob(buf, SAMPLE_RATE);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.volume = volume;
  const entry = { audio, url };
  const cleanup = () => {
    URL.revokeObjectURL(entry.url);
    voices = voices.filter((v) => v !== entry);
  };
  audio.addEventListener("ended", cleanup);
  audio.addEventListener("error", cleanup);
  voices.push(entry);
  if (voices.length > MAX_VOICES) {
    const old = voices.shift();
    try {
      old.audio.pause();
    } catch (e) {}
    URL.revokeObjectURL(old.url);
  }
  audio.play().catch(() => {});
  return buf;
}

// ---- keyboard layout -----------------------------------------------------

const KEYS = [
  { char: "a", name: "C4", semitone: 0, black: false },
  { char: "w", name: "C#4", semitone: 1, black: true },
  { char: "s", name: "D4", semitone: 2, black: false },
  { char: "e", name: "D#4", semitone: 3, black: true },
  { char: "d", name: "E4", semitone: 4, black: false },
  { char: "f", name: "F4", semitone: 5, black: false },
  { char: "t", name: "F#4", semitone: 6, black: true },
  { char: "g", name: "G4", semitone: 7, black: false },
  { char: "y", name: "G#4", semitone: 8, black: true },
  { char: "h", name: "A4", semitone: 9, black: false },
  { char: "u", name: "A#4", semitone: 10, black: true },
  { char: "j", name: "B4", semitone: 11, black: false },
  { char: "k", name: "C5", semitone: 12, black: false },
  { char: "o", name: "C#5", semitone: 13, black: true },
  { char: "l", name: "D5", semitone: 14, black: false },
  { char: "p", name: "D#5", semitone: 15, black: true },
  { char: ";", name: "E5", semitone: 16, black: false },
];

// ---- UI wiring ------------------------------------------------------------

const CTRL_DEFAULTS = { m: 3, a: 1, d: 2, grain: 8, smooth: 0.35, chaos: 0.65, decay: 1.1, seed: 0, vol: 0.8 };
const ctrlIds = { m: "c-m", a: "c-a", d: "c-d", grain: "c-grain", smooth: "c-smooth", chaos: "c-chaos", decay: "c-decay", seed: "c-seed", vol: "c-vol" };

function readParamsFromUrl() {
  const p = new URLSearchParams(location.search);
  const out = { ...CTRL_DEFAULTS };
  for (const k of Object.keys(CTRL_DEFAULTS)) {
    if (p.has(k)) {
      const v = parseFloat(p.get(k));
      if (!Number.isNaN(v)) out[k] = v;
    }
  }
  return out;
}

function currentParams() {
  const out = {};
  for (const k of Object.keys(CTRL_DEFAULTS)) {
    out[k] = parseFloat(document.getElementById(ctrlIds[k]).value);
  }
  return out;
}

function applyParamsToControls(p) {
  for (const k of Object.keys(CTRL_DEFAULTS)) {
    document.getElementById(ctrlIds[k]).value = p[k];
  }
  refreshReadouts();
}

function refreshReadouts() {
  const p = currentParams();
  document.getElementById("v-m").textContent = p.m;
  document.getElementById("v-a").textContent = p.a;
  document.getElementById("v-d").textContent = p.d;
  document.getElementById("v-grain").textContent = p.grain;
  document.getElementById("v-chaos").textContent = p.chaos.toFixed(2);
  document.getElementById("v-smooth").textContent = p.smooth.toFixed(2);
  document.getElementById("v-decay").textContent = p.decay.toFixed(2) + "s";
  document.getElementById("v-seed").textContent = p.seed;
  document.getElementById("v-vol").textContent = Math.round(p.vol * 100) + "%";
}

function buildShareUrl() {
  const p = currentParams();
  const u = new URL(location.href);
  u.search = "";
  for (const k of Object.keys(p)) u.searchParams.set(k, p[k]);
  return u.toString();
}

// ---- waveform scope --------------------------------------------------

const scopeCanvas = document.getElementById("scope");
const scopeCtx = scopeCanvas.getContext("2d");
function drawWaveform(buf, label) {
  const w = scopeCanvas.width;
  const h = scopeCanvas.height;
  scopeCtx.clearRect(0, 0, w, h);
  scopeCtx.fillStyle = "#060b12";
  scopeCtx.fillRect(0, 0, w, h);
  scopeCtx.strokeStyle = "#223448";
  scopeCtx.beginPath();
  scopeCtx.moveTo(0, h / 2);
  scopeCtx.lineTo(w, h / 2);
  scopeCtx.stroke();

  const step = Math.max(1, Math.floor(buf.length / w));
  scopeCtx.strokeStyle = "#7fd4ff";
  scopeCtx.lineWidth = 1;
  scopeCtx.beginPath();
  for (let x = 0; x < w; x++) {
    const start = x * step;
    let min = 1, max = -1;
    for (let i = start; i < start + step && i < buf.length; i++) {
      const v = buf[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min > max) { min = 0; max = 0; }
    const y1 = h / 2 - max * (h / 2 - 2);
    const y2 = h / 2 - min * (h / 2 - 2);
    scopeCtx.moveTo(x, y1);
    scopeCtx.lineTo(x, y2);
  }
  scopeCtx.stroke();
  if (label) document.getElementById("scopeLabel").textContent = label;
}

// ---- piano rendering + input ------------------------------------------

const pianoEl = document.getElementById("piano");
const WHITE_W = 44;
const BLACK_W = 28;

function buildPiano() {
  let whiteCount = 0;
  const elByChar = {};
  KEYS.forEach((k) => {
    const el = document.createElement("div");
    el.className = "key " + (k.black ? "black" : "white");
    el.dataset.semitone = k.semitone;
    el.innerHTML = `<span class="k">${k.char}</span>`;
    if (k.black) {
      el.style.left = whiteCount * WHITE_W - BLACK_W / 2 + "px";
      el.style.width = BLACK_W + "px";
    } else {
      el.style.left = whiteCount * WHITE_W + "px";
      el.style.width = WHITE_W - 2 + "px";
      whiteCount++;
    }
    pianoEl.appendChild(el);
    elByChar[k.char] = el;
  });
  pianoEl.style.width = whiteCount * WHITE_W + "px";
  return elByChar;
}

const keyEls = buildPiano();

function playKey(semitoneIndex, el) {
  const p = currentParams();
  const buf = renderNote({
    freq: noteFreq(semitoneIndex),
    seed: seedForNote(semitoneIndex, p.seed),
    m: p.m, a: p.a, d: p.d, grain: p.grain, smooth: p.smooth, chaos: p.chaos,
    decaySec: p.decay, sampleRate: SAMPLE_RATE,
  });
  playBuffer(buf, p.vol);
  const keyInfo = KEYS.find((k) => k.semitone === semitoneIndex);
  drawWaveform(buf, `${keyInfo ? keyInfo.name : semitoneIndex} · seed ${seedForNote(semitoneIndex, p.seed)}`);
  if (el) {
    el.classList.add("active");
    setTimeout(() => el.classList.remove("active"), 140);
  }
}

const heldKeys = new Set();
KEYS.forEach((k) => {
  const el = keyEls[k.char];
  const trigger = () => playKey(k.semitone, el);
  el.addEventListener("mousedown", trigger);
  el.addEventListener("touchstart", (e) => { e.preventDefault(); trigger(); }, { passive: false });
});

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const key = KEYS.find((k) => k.char === e.key.toLowerCase());
  if (!key) return;
  if (heldKeys.has(key.char)) return;
  heldKeys.add(key.char);
  playKey(key.semitone, keyEls[key.char]);
});
window.addEventListener("keyup", (e) => {
  heldKeys.delete(e.key.toLowerCase());
});

// ---- demo cascade + randomize -----------------------------------------

document.getElementById("demoBtn").addEventListener("click", () => {
  const p = currentParams();
  const range = KEYS.length;
  const steps = 6 + Math.floor(Math.random() * 5);
  const notes = [];
  let cur = Math.floor(Math.random() * range);
  for (let i = 0; i < steps; i++) {
    notes.push(cur);
    cur = Math.max(0, Math.min(range - 1, cur + (Math.floor(Math.random() * 7) - 3)));
  }
  const buf = renderCascade(notes, 0.22, p);
  playBuffer(buf, p.vol);
  drawWaveform(buf, `cascade over ${notes.length} notes`);
});

document.getElementById("randomBtn").addEventListener("click", () => {
  const rand = (lo, hi, step = 1) => {
    const n = Math.round((lo + Math.random() * (hi - lo)) / step) * step;
    return Math.max(lo, Math.min(hi, n));
  };
  applyParamsToControls({
    m: rand(2, 9),
    a: rand(0, 9),
    d: rand(2, 9),
    grain: rand(3, 24),
    smooth: rand(0, 1, 0.01),
    chaos: rand(0.3, 1, 0.01),
    decay: rand(0.4, 2.2, 0.01),
    seed: rand(-999, 999),
    vol: CTRL_DEFAULTS.vol,
  });
  document.getElementById("demoBtn").click();
});

// ---- share ---------------------------------------------------------------

document.getElementById("shareBtn").addEventListener("click", async () => {
  const url = buildShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    document.getElementById("copyStatus").textContent = "copied!";
  } catch (e) {
    document.getElementById("copyStatus").textContent = url;
  }
  setTimeout(() => (document.getElementById("copyStatus").textContent = ""), 2500);
});

function updateShareBluesky() {
  const url = buildShareUrl();
  const p = currentParams();
  const text = `built a patch on hailstone — a synth with no Web Audio API, just live Collatz sequences hashed into sound (m=${p.m} a=${p.a} d=${p.d} chaos=${p.chaos.toFixed(2)}). ${url}`;
  document.getElementById("shareBluesky").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text.slice(0, 300));
}

// ---- init ------------------------------------------------------------

Object.values(ctrlIds).forEach((id) => {
  document.getElementById(id).addEventListener("input", () => {
    refreshReadouts();
    updateShareBluesky();
  });
});

applyParamsToControls(readParamsFromUrl());
updateShareBluesky();
