// app.js — wires the VAD triangle to the drone engine. Dragging the dot
// updates `current` and the URL/share text; a rAF loop reads `current`
// every frame and pushes it into each voice's update(), so the sound bends
// continuously while the point moves, not just when it's released.

import { createTriangle } from "./lib/triangle.js";
import { createMaster, createVoice, paramsFromVAD, ENSEMBLE, degreeFreq } from "./lib/synth.js";

const svg = document.getElementById("triangle");
const dot = document.getElementById("dot");
const vValEl = document.getElementById("v-val");
const aValEl = document.getElementById("a-val");
const dValEl = document.getElementById("d-val");
const playBtn = document.getElementById("play-btn");
const centerBtn = document.getElementById("center-btn");
const masterVol = document.getElementById("master-vol");
const shareIntent = document.getElementById("share-intent");
const copyLinkBtn = document.getElementById("copy-link-btn");
const copyStatus = document.getElementById("copy-status");

let ctx = null;
let master = null;
let voices = [];
let playing = false;
let current = { v: 1 / 3, a: 1 / 3, d: 1 / 3 };

function moodURL(w) {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set("v", w.v.toFixed(2));
  url.searchParams.set("a", w.a.toFixed(2));
  url.searchParams.set("d", w.d.toFixed(2));
  return url;
}

function updateShare(w) {
  const url = moodURL(w);
  shareIntent.href =
    "https://bsky.app/intent/compose?text=" +
    encodeURIComponent(
      `a mood in vadrone — valence ${Math.round(w.v * 100)}%, arousal ${Math.round(w.a * 100)}%, dominance ${Math.round(w.d * 100)}%. ${url.toString()}`,
    );
}

let urlWriteTimer = null;
function scheduleURLWrite(w) {
  clearTimeout(urlWriteTimer);
  urlWriteTimer = setTimeout(() => {
    history.replaceState(null, "", moodURL(w));
  }, 250);
}

function onVADChange(w) {
  current = w;
  vValEl.textContent = Math.round(w.v * 100) + "%";
  aValEl.textContent = Math.round(w.a * 100) + "%";
  dValEl.textContent = Math.round(w.d * 100) + "%";
  updateShare(w);
  scheduleURLWrite(w);
}

const tri = createTriangle(svg, dot, onVADChange);

// ---- ensemble polygon + readout table --------------------------------
// One vertex per ENSEMBLE voice, laid out on a regular polygon. The table
// below shows each voice's live pitch/frequency, and the vertex dots pulse
// with that voice's actual output amplitude once it's playing.

const POLY_CX = 130;
const POLY_CY = 130;
const POLY_R = 74;
const POLY_LABEL_R = POLY_R + 24;

const polySvg = document.getElementById("poly");
const polyOutline = document.getElementById("poly-outline");
const ensembleTbody = document.querySelector("#ensemble-table tbody");
const voiceDots = [];
const voiceCells = [];

function noteName(freq) {
  const names = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
  const n = Math.round(12 * Math.log2(freq / 440));
  const name = names[((n % 12) + 12) % 12];
  const octave = 4 + Math.floor((n + 9) / 12);
  return `${name}${octave}`;
}

(function buildEnsembleViz() {
  const n = ENSEMBLE.length;
  const pts = [];
  ENSEMBLE.forEach((spec, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = POLY_CX + POLY_R * Math.cos(angle);
    const y = POLY_CY + POLY_R * Math.sin(angle);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("class", `poly-vertex ${spec.role}`);
    dot.setAttribute("cx", x.toFixed(1));
    dot.setAttribute("cy", y.toFixed(1));
    dot.setAttribute("r", 7);
    polySvg.appendChild(dot);
    voiceDots.push(dot);

    const lx = POLY_CX + POLY_LABEL_R * Math.cos(angle);
    const ly = POLY_CY + POLY_LABEL_R * Math.sin(angle) + 3;
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("class", "poly-label");
    label.setAttribute("x", lx.toFixed(1));
    label.setAttribute("y", ly.toFixed(1));
    label.textContent = spec.label;
    polySvg.appendChild(label);

    const row = document.createElement("tr");
    row.innerHTML = `<td>${spec.label}</td><td>${spec.role}</td><td class="pitch"></td><td class="freq"></td>`;
    ensembleTbody.appendChild(row);
    voiceCells.push({ pitch: row.querySelector(".pitch"), freq: row.querySelector(".freq") });
  });
  polyOutline.setAttribute("points", pts.join(" "));
})();

const pulseBufs = [];
function updateEnsembleViz(p) {
  ENSEMBLE.forEach((spec, i) => {
    const f =
      spec.role === "hum"
        ? p.humHz
        : degreeFreq(p.rootFreq * Math.pow(2, spec.octave), spec.degreeIdx, p.tension);
    voiceCells[i].pitch.textContent = noteName(f);
    voiceCells[i].freq.textContent = f.toFixed(1) + " Hz";
  });

  if (!voices.length) {
    voiceDots.forEach((dot) => dot.setAttribute("r", 7));
    return;
  }
  voices.forEach((v, i) => {
    let buf = pulseBufs[i];
    if (!buf) buf = pulseBufs[i] = new Uint8Array(v.analyser.fftSize);
    v.analyser.getByteTimeDomainData(buf);
    let sumSq = 0;
    for (let j = 0; j < buf.length; j++) {
      const s = (buf[j] - 128) / 128;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / buf.length);
    voiceDots[i].setAttribute("r", (7 + Math.min(10, rms * 40)).toFixed(1));
  });
}

function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = createMaster(ctx);
    master.setVolume(parseFloat(masterVol.value));
    voices = ENSEMBLE.map((spec) => createVoice(ctx, master, spec));
    for (const v of voices) v.start();
  }
  return ctx;
}

function tick() {
  const p = paramsFromVAD(current.v, current.a, current.d);
  if (voices.length) {
    for (const v of voices) v.update(p);
    master.setWet(p.wet);
  }
  updateEnsembleViz(p);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

playBtn.addEventListener("click", async () => {
  ensureAudio();
  if (!playing) {
    await ctx.resume();
    playing = true;
    playBtn.textContent = "⏸ pause";
  } else {
    await ctx.suspend();
    playing = false;
    playBtn.textContent = "▶ play";
  }
});

centerBtn.addEventListener("click", () => {
  tri.set({ v: 1 / 3, a: 1 / 3, d: 1 / 3 });
});

masterVol.addEventListener("input", () => {
  if (master) master.setVolume(parseFloat(masterVol.value));
});

copyLinkBtn.addEventListener("click", async () => {
  const url = moodURL(current).toString();
  try {
    await navigator.clipboard.writeText(url);
    copyStatus.textContent = "copied!";
  } catch {
    copyStatus.textContent = url;
  }
  setTimeout(() => {
    copyStatus.textContent = "";
  }, 2500);
});

// ---- boot: restore a shared mood from the URL, if present -----------------

(() => {
  const params = new URLSearchParams(location.search);
  let initial = { v: 1 / 3, a: 1 / 3, d: 1 / 3 };
  if (params.has("v") && params.has("a") && params.has("d")) {
    let v = parseFloat(params.get("v"));
    let a = parseFloat(params.get("a"));
    let d = parseFloat(params.get("d"));
    if ([v, a, d].every(Number.isFinite)) {
      v = Math.max(0, v);
      a = Math.max(0, a);
      d = Math.max(0, d);
      const sum = v + a + d || 1;
      initial = { v: v / sum, a: a / sum, d: d / sum };
    }
  }
  tri.set(initial);
})();
