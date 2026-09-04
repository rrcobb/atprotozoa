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
  sourceChassis: document.getElementById("source-chassis"),
  sourceMicBtn: document.getElementById("source-mic"),
  sourceFileBtn: document.getElementById("source-file"),
  filePicker: document.getElementById("file-picker"),
  modFile: document.getElementById("mod-file"),
  fileName: document.getElementById("file-name"),
};

let ctx = null;
let vocoder = null;
let masterGain = null;
let modGainNode = null; // feeds vocoder.modInput, regardless of source
let modAnalyser = null;
let modBuf = null;
let scopeAnalyser = null;
let scopeBuf = null;
let micStream = null;
let fileBuffer = null; // decoded AudioBuffer, once a file's been loaded
let fileSourceNode = null;
let modSourceType = "mic"; // "mic" | "file"
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

// The modulator can be the mic or a decoded file; either way it lands on
// the same gain node (for the gain slider + VU meter) before hitting
// vocoder.modInput, so the rest of the graph doesn't care which it is.
function connectModulator(sourceNode) {
  modGainNode = ctx.createGain();
  modGainNode.gain.value = parseFloat(els.micGain.value);
  modAnalyser = ctx.createAnalyser();
  modAnalyser.fftSize = 512;
  modAnalyser.smoothingTimeConstant = 0.75;
  modBuf = new Uint8Array(modAnalyser.fftSize);

  sourceNode.connect(modGainNode);
  modGainNode.connect(vocoder.modInput);
  modGainNode.connect(modAnalyser);
}

async function startMic() {
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  connectModulator(ctx.createMediaStreamSource(micStream));
}

function startFilePlayback() {
  fileSourceNode = ctx.createBufferSource();
  fileSourceNode.buffer = fileBuffer;
  fileSourceNode.loop = true;
  connectModulator(fileSourceNode);
  fileSourceNode.start();
}

function stopMic() {
  if (micStream) {
    for (const track of micStream.getTracks()) track.stop();
    micStream = null;
  }
}

function stopFilePlayback() {
  if (fileSourceNode) {
    try {
      fileSourceNode.stop();
    } catch {}
    fileSourceNode.disconnect();
    fileSourceNode = null;
  }
}

function stopModulator() {
  stopMic();
  stopFilePlayback();
  if (modGainNode) modGainNode.disconnect();
  if (modAnalyser) modAnalyser.disconnect();
  modGainNode = null;
  modAnalyser = null;
  modBuf = null;
}

async function startSelectedSource() {
  if (modSourceType === "mic") {
    setStatus("REQUESTING MIC…");
    await startMic();
    setStatus("ONLINE — SPEAK INTO THE MIC AND PLAY THE KEYBOARD");
  } else {
    setStatus("PLAYING FILE…");
    startFilePlayback();
    setStatus("ONLINE — FILE LOOPING, PLAY THE KEYBOARD");
  }
}

els.power.addEventListener("click", async () => {
  if (running) {
    running = false;
    stopModulator();
    if (ctx) await ctx.suspend();
    els.power.textContent = "⚡ POWER ON";
    els.power.classList.remove("on");
    setStatus("STANDBY");
    return;
  }
  if (modSourceType === "file" && !fileBuffer) {
    showAlert("LOAD A WAV/MP3 FILE FIRST, OR SWITCH THE SOURCE TO MIC.");
    return;
  }
  try {
    ensureGraph();
    await ctx.resume();
    await startSelectedSource();
    running = true;
    els.power.textContent = "⏻ POWER OFF";
    els.power.classList.add("on");
    clearAlert();
  } catch (err) {
    setStatus("STANDBY");
    showAlert(
      err && err.name === "NotAllowedError"
        ? "MIC ACCESS DENIED — allow microphone access and try again."
        : "COULD NOT START: " + (err && err.message ? err.message : err),
    );
  }
});

// ---- modulator source: mic vs. a dropped-in/browsed audio file -----------

function setSource(type) {
  if (modSourceType === type) return;
  modSourceType = type;
  els.sourceMicBtn.classList.toggle("active", type === "mic");
  els.sourceFileBtn.classList.toggle("active", type === "file");
  els.filePicker.hidden = type !== "file";
  if (!running) return;
  stopModulator();
  if (type === "file" && !fileBuffer) {
    running = false;
    els.power.textContent = "⚡ POWER ON";
    els.power.classList.remove("on");
    setStatus("STANDBY");
    showAlert("LOAD A WAV/MP3 FILE FIRST, OR SWITCH THE SOURCE BACK TO MIC.");
    return;
  }
  startSelectedSource().catch((err) => {
    running = false;
    els.power.textContent = "⚡ POWER ON";
    els.power.classList.remove("on");
    setStatus("STANDBY");
    showAlert(
      err && err.name === "NotAllowedError"
        ? "MIC ACCESS DENIED — allow microphone access and try again."
        : "COULD NOT START: " + (err && err.message ? err.message : err),
    );
  });
}

els.sourceMicBtn.addEventListener("click", () => setSource("mic"));
els.sourceFileBtn.addEventListener("click", () => setSource("file"));

async function loadFile(file) {
  if (!file) return;
  els.fileName.textContent = "decoding " + file.name + "…";
  try {
    ensureGraph(); // decodeAudioData needs a context, even a suspended one
    const arrayBuffer = await file.arrayBuffer();
    fileBuffer = await ctx.decodeAudioData(arrayBuffer);
    els.fileName.textContent = file.name + " (" + fileBuffer.duration.toFixed(1) + "s)";
    clearAlert();
    if (running && modSourceType === "file") {
      stopModulator();
      await startSelectedSource();
    }
  } catch (err) {
    fileBuffer = null;
    els.fileName.textContent = "no file loaded";
    showAlert("COULD NOT DECODE FILE: " + (err && err.message ? err.message : err));
  }
}

els.modFile.addEventListener("change", () => loadFile(els.modFile.files && els.modFile.files[0]));

// dropping a file anywhere on the source panel loads it and switches to it,
// even if mic was still selected
["dragenter", "dragover"].forEach((evt) =>
  els.sourceChassis.addEventListener(evt, (e) => {
    e.preventDefault();
    els.sourceChassis.classList.add("drag-over");
  }),
);
["dragleave", "drop"].forEach((evt) =>
  els.sourceChassis.addEventListener(evt, () => els.sourceChassis.classList.remove("drag-over")),
);
els.sourceChassis.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  setSource("file");
  loadFile(file);
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
  if (modGainNode) modGainNode.gain.linearRampToValueAtTime(parseFloat(els.micGain.value), ctx.currentTime + 0.05);
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
  if (modAnalyser) {
    modAnalyser.getByteTimeDomainData(modBuf);
    let sumSq = 0;
    for (let i = 0; i < modBuf.length; i++) {
      const s = (modBuf[i] - 128) / 128;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / modBuf.length);
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
