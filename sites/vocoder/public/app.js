// app.js — wires the mic, the keyboard, and the retro control panel to the
// vocoder engine in lib/vocoder.js. All state lives here; the engine module
// stays reusable/testable on its own.

import { createVocoder, createCarrierVoice } from "./lib/vocoder.js";
import { KEY_SEMITONES, KEY_ROWS, noteName, freqFromSemitones } from "./lib/keyboard.js";

const BASE_ROOT_FREQ = 130.813; // C3 — a carrier fundamental that sits near vocal register
const MIN_ROOT_SEMIS = -24;
const MAX_ROOT_SEMIS = 24;

const els = {
  power: document.getElementById("power-btn"),
  status: document.getElementById("status"),
  alert: document.getElementById("alert"),
  scope: document.getElementById("scope"),
  meters: document.getElementById("band-meters"),
  needle: document.getElementById("vu-needle"),
  rootReadout: document.getElementById("root-readout"),
  chordReadout: document.getElementById("chord-readout"),
  rootUp: document.getElementById("root-up"),
  rootDown: document.getElementById("root-down"),
  octaveUp: document.getElementById("octave-up"),
  octaveDown: document.getElementById("octave-down"),
  micGain: document.getElementById("mic-gain"),
  masterVol: document.getElementById("master-vol"),
  waveform: document.getElementById("waveform"),
  keyRows: document.getElementById("key-rows"),
  shareLink: document.getElementById("share-link"),
};

let ctx = null;
let vocoder = null;
let masterGain = null;
let micGainNode = null;
let micAnalyser = null;
let micBuf = null;
let scopeAnalyser = null;
let scopeBuf = null;
let micStream = null;
let running = false;

let rootSemis = 0;
let waveform = "sawtooth";
const activeVoices = new Map(); // physical key -> voice handle
const keycapEls = new Map();

function rootFreq() {
  return freqFromSemitones(BASE_ROOT_FREQ, rootSemis);
}

function setStatus(text) {
  els.status.textContent = text;
}

function showAlert(text) {
  els.alert.textContent = text;
  els.alert.hidden = false;
}

function clearAlert() {
  els.alert.hidden = true;
}

// ---- audio graph ----------------------------------------------------------

function ensureGraph() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  vocoder = createVocoder(ctx);

  masterGain = ctx.createGain();
  masterGain.gain.value = parseFloat(els.masterVol.value);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 18;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;

  vocoder.outputBus.connect(masterGain);
  masterGain.connect(comp);
  comp.connect(ctx.destination);

  scopeAnalyser = ctx.createAnalyser();
  scopeAnalyser.fftSize = 1024;
  scopeBuf = new Uint8Array(scopeAnalyser.fftSize);
  comp.connect(scopeAnalyser);

  buildMeters();
}

async function startMic() {
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const micSource = ctx.createMediaStreamSource(micStream);
  micGainNode = ctx.createGain();
  micGainNode.gain.value = parseFloat(els.micGain.value);
  micAnalyser = ctx.createAnalyser();
  micAnalyser.fftSize = 512;
  micAnalyser.smoothingTimeConstant = 0.75;
  micBuf = new Uint8Array(micAnalyser.fftSize);

  micSource.connect(micGainNode);
  micGainNode.connect(vocoder.modInput);
  micGainNode.connect(micAnalyser);
}

function stopMic() {
  if (micStream) {
    for (const track of micStream.getTracks()) track.stop();
    micStream = null;
  }
}

els.power.addEventListener("click", async () => {
  if (running) {
    running = false;
    stopMic();
    if (ctx) await ctx.suspend();
    els.power.textContent = "⚡ POWER ON";
    els.power.classList.remove("on");
    setStatus("STANDBY");
    return;
  }
  try {
    ensureGraph();
    await ctx.resume();
    setStatus("REQUESTING MIC…");
    await startMic();
    running = true;
    els.power.textContent = "⏻ POWER OFF";
    els.power.classList.add("on");
    setStatus("ONLINE — SPEAK INTO THE MIC AND PLAY THE KEYBOARD");
    clearAlert();
  } catch (err) {
    setStatus("STANDBY");
    showAlert(
      err && err.name === "NotAllowedError"
        ? "MIC ACCESS DENIED — allow microphone access and try again."
        : "COULD NOT START MIC: " + (err && err.message ? err.message : err),
    );
  }
});

// ---- keyboard: two-row musical typing layout, arrows set the root ---------

function keyLabelFreq(key) {
  return freqFromSemitones(rootFreq(), KEY_SEMITONES[key]);
}

function noteOn(key) {
  if (!running || !ctx) return;
  if (activeVoices.has(key)) return;
  const freq = keyLabelFreq(key);
  const voice = createCarrierVoice(ctx, vocoder.carrierBus, freq, waveform);
  activeVoices.set(key, voice);
  const cap = keycapEls.get(key);
  if (cap) cap.classList.add("active");
  updateChordReadout();
}

function noteOff(key) {
  const voice = activeVoices.get(key);
  if (!voice) return;
  voice.release();
  activeVoices.delete(key);
  const cap = keycapEls.get(key);
  if (cap) cap.classList.remove("active");
  updateChordReadout();
}

function updateChordReadout() {
  if (!activeVoices.size) {
    els.chordReadout.textContent = "—";
    return;
  }
  const names = [...activeVoices.keys()].map((key) => noteName(rootSemis + KEY_SEMITONES[key] - 12));
  els.chordReadout.textContent = names.join(" ");
}

function setRoot(semis) {
  rootSemis = Math.max(MIN_ROOT_SEMIS, Math.min(MAX_ROOT_SEMIS, semis));
  els.rootReadout.textContent = noteName(rootSemis - 12);
}

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  const key = e.key.toLowerCase();
  if (key === "arrowup") {
    e.preventDefault();
    setRoot(rootSemis + 12);
    return;
  }
  if (key === "arrowdown") {
    e.preventDefault();
    setRoot(rootSemis - 12);
    return;
  }
  if (key === "arrowleft") {
    e.preventDefault();
    setRoot(rootSemis - 1);
    return;
  }
  if (key === "arrowright") {
    e.preventDefault();
    setRoot(rootSemis + 1);
    return;
  }
  if (!(key in KEY_SEMITONES)) return;
  noteOn(key);
});

window.addEventListener("keyup", (e) => {
  const key = e.key.toLowerCase();
  if (key in KEY_SEMITONES) noteOff(key);
});

// keys/notes are only real once the AudioContext exists; the tab losing
// focus mid-note (alt-tab, cmd-tab) never fires keyup, so silence everything
// rather than leave a stuck drone.
window.addEventListener("blur", () => {
  for (const key of [...activeVoices.keys()]) noteOff(key);
});

els.rootUp.addEventListener("click", () => setRoot(rootSemis + 1));
els.rootDown.addEventListener("click", () => setRoot(rootSemis - 1));
els.octaveUp.addEventListener("click", () => setRoot(rootSemis + 12));
els.octaveDown.addEventListener("click", () => setRoot(rootSemis - 12));

els.micGain.addEventListener("input", () => {
  if (micGainNode) micGainNode.gain.linearRampToValueAtTime(parseFloat(els.micGain.value), ctx.currentTime + 0.05);
});
els.masterVol.addEventListener("input", () => {
  if (masterGain) masterGain.gain.linearRampToValueAtTime(parseFloat(els.masterVol.value), ctx.currentTime + 0.05);
});
els.waveform.addEventListener("change", () => {
  waveform = els.waveform.value;
});

// ---- on-screen keyboard (touch/click fallback + visual reference) --------

(function buildKeyRows() {
  KEY_ROWS.forEach((row, i) => {
    const rowEl = document.createElement("div");
    rowEl.className = "key-row" + (i === 0 ? " key-row-upper" : "");
    row.forEach((key) => {
      const cap = document.createElement("button");
      cap.type = "button";
      cap.className = "keycap";
      cap.textContent = key.toUpperCase();
      cap.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        noteOn(key);
      });
      cap.addEventListener("pointerup", () => noteOff(key));
      cap.addEventListener("pointerleave", () => noteOff(key));
      cap.addEventListener("pointercancel", () => noteOff(key));
      rowEl.appendChild(cap);
      keycapEls.set(key, cap);
    });
    els.keyRows.appendChild(rowEl);
  });
})();

setRoot(0);
updateChordReadout();

// ---- band meters + oscilloscope, driven every animation frame ------------

function buildMeters() {
  els.meters.innerHTML = "";
  vocoder.bands.forEach((band) => {
    const col = document.createElement("div");
    col.className = "meter" + (band.unvoiced ? " meter-noise" : "");
    const bar = document.createElement("div");
    bar.className = "meter-bar";
    col.appendChild(bar);
    band._bar = bar;
    els.meters.appendChild(col);
  });
}

function drawScope() {
  const canvas = els.scope;
  const g = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  g.clearRect(0, 0, w, h);
  if (!scopeAnalyser) {
    g.strokeStyle = "#0f0";
    g.globalAlpha = 0.35;
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();
    return;
  }
  scopeAnalyser.getByteTimeDomainData(scopeBuf);
  g.lineWidth = 2;
  g.strokeStyle = "#3dff6e";
  g.shadowColor = "#3dff6e";
  g.shadowBlur = 6;
  g.beginPath();
  const step = w / scopeBuf.length;
  for (let i = 0; i < scopeBuf.length; i++) {
    const v = scopeBuf[i] / 128 - 1;
    const y = h / 2 + v * (h / 2 - 4);
    const x = i * step;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

function tick() {
  drawScope();
  if (vocoder) {
    for (const band of vocoder.bands) {
      const lvl = Math.min(1, vocoder.bandLevel(band) * 2.2);
      if (band._bar) band._bar.style.height = (lvl * 100).toFixed(1) + "%";
    }
  }
  if (micAnalyser) {
    micAnalyser.getByteTimeDomainData(micBuf);
    let sumSq = 0;
    for (let i = 0; i < micBuf.length; i++) {
      const s = (micBuf[i] - 128) / 128;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / micBuf.length);
    const deg = -55 + Math.min(1, rms * 4.5) * 110;
    els.needle.style.transform = `rotate(${deg}deg)`;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---- share -----------------------------------------------------------------

els.shareLink.href =
  "https://bsky.app/intent/compose?text=" +
  encodeURIComponent(
    "made my computer talk like a 1950s robot with vocoder.bisks.net — mic in, keyboard for the notes, fully polyphonic. https://vocoder.bisks.net/",
  );
