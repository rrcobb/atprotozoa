// app.js — wires the VAD triangle to the drone engine. Dragging the dot
// updates `current` and the URL/share text; a rAF loop reads `current`
// every frame and pushes it into each voice's update(), so the sound bends
// continuously while the point moves, not just when it's released.

import { createTriangle } from "./lib/triangle.js";
import { createMaster, createVoice, paramsFromVAD, ENSEMBLE } from "./lib/synth.js";

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
  if (voices.length) {
    const p = paramsFromVAD(current.v, current.a, current.d);
    for (const v of voices) v.update(p);
    master.setWet(p.wet);
  }
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
