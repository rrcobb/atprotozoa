// app.js — wires the three sliders to the purr engine and the cat
// illustration. A rAF loop reads the live slider state every frame,
// recomputes params, and pushes them into both the audio engine and the SVG
// so the sound and the visual bend together continuously, not just on
// release.

import { createPurrEngine, paramsFromControls } from "./lib/synth.js";

const sizeCtl = document.getElementById("size-ctl");
const tempCtl = document.getElementById("temp-ctl");
const moodCtl = document.getElementById("mood-ctl");
const sizeVal = document.getElementById("size-val");
const tempVal = document.getElementById("temp-val");
const moodVal = document.getElementById("mood-val");
const rateVal = document.getElementById("rate-val");
const regVal = document.getElementById("reg-val");
const moodRead = document.getElementById("mood-read");
const playBtn = document.getElementById("play-btn");
const masterVol = document.getElementById("master-vol");
const shareIntent = document.getElementById("share-intent");
const copyLinkBtn = document.getElementById("copy-link-btn");
const copyStatus = document.getElementById("copy-status");
const waveformCanvas = document.getElementById("waveform");
const wfCtx = waveformCanvas.getContext("2d");

const chestGroup = document.getElementById("chest-group");
const earL = document.getElementById("ear-l");
const earR = document.getElementById("ear-r");
const eyeL = document.getElementById("eye-l");
const eyeR = document.getElementById("eye-r");
const mouth = document.getElementById("mouth");
const tongue = document.getElementById("tongue");
const tail = document.getElementById("tail");
const catSvg = document.getElementById("cat-svg");

let ctx = null;
let engine = null;
let playing = false;
let waveBuf = null;

function state() {
  return {
    size: parseFloat(sizeCtl.value) / 100,
    temp: parseFloat(tempCtl.value) / 100,
    mood: parseFloat(moodCtl.value) / 100,
  };
}

function sizeLabel(v) {
  if (v < 0.18) return "kitten";
  if (v < 0.4) return "small";
  if (v < 0.62) return "medium";
  if (v < 0.84) return "big";
  return "maine coon";
}
function tempLabel(v) {
  if (v < 0.15) return "freezing";
  if (v < 0.35) return "chilly";
  if (v < 0.5) return "cool";
  if (v < 0.72) return "cozy";
  if (v < 0.88) return "warm";
  return "sweltering";
}
function moodLabel(v) {
  if (v < 0.15) return "furious";
  if (v < 0.32) return "grumpy";
  if (v < 0.45) return "wary";
  if (v < 0.58) return "content";
  if (v < 0.78) return "happy";
  return "ecstatic";
}

function shareURL(s) {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set("s", Math.round(s.size * 100));
  url.searchParams.set("t", Math.round(s.temp * 100));
  url.searchParams.set("m", Math.round(s.mood * 100));
  return url;
}

function updateShare(s) {
  const url = shareURL(s);
  const desc = `${sizeLabel(s.size)} cat, ${tempLabel(s.temp)} room, ${moodLabel(s.mood)} mood`;
  shareIntent.href =
    "https://bsky.app/intent/compose?text=" +
    encodeURIComponent(`purring at me right now: ${desc}. ${url.toString()}`);
}

let urlWriteTimer = null;
function scheduleURLWrite(s) {
  clearTimeout(urlWriteTimer);
  urlWriteTimer = setTimeout(() => {
    history.replaceState(null, "", shareURL(s));
  }, 250);
}

function onControlChange() {
  const s = state();
  sizeVal.textContent = `${sizeLabel(s.size)} — ${Math.round(s.size * 100)}%`;
  tempVal.textContent = `${tempLabel(s.temp)} — ${Math.round(s.temp * 100)}%`;
  moodVal.textContent = `${moodLabel(s.mood)} — ${Math.round(s.mood * 100)}%`;
  updateShare(s);
  scheduleURLWrite(s);
}
[sizeCtl, tempCtl, moodCtl].forEach((el) => el.addEventListener("input", onControlChange));

function noteName(freq) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const n = Math.round(12 * Math.log2(freq / 261.63));
  const name = names[((n % 12) + 12) % 12];
  const octave = 4 + Math.floor((n + 0) / 12);
  return `${name}${octave}`;
}

function updateCat(p, t) {
  // breathing: slow, independent of the (much faster) purr rate — happier
  // cats breathe a touch faster and deeper, panting speeds it further
  const breathHz = (0.22 + p.bliss * 0.22 + p.hot * 0.35) * (1 - p.grump * 0.15);
  const breathAmp = 0.02 + p.content * 0.015 + p.bliss * 0.02 + p.hot * 0.02;
  const breath = Math.sin(2 * Math.PI * breathHz * t);
  const scaleY = 1 + breath * breathAmp;
  chestGroup.setAttribute("transform", `translate(120 182) scale(1 ${scaleY.toFixed(4)}) translate(-120 -182)`);

  // ears: pinned back and flattened when grumpy, relaxed/loose when blissed
  const earAngle = p.bliss * 8 - p.grump * 26;
  const earScaleY = 1 - p.grump * 0.35;
  earL.setAttribute("transform", `translate(78 60) rotate(${(-earAngle).toFixed(2)}) scale(1 ${earScaleY.toFixed(3)}) translate(-78 -60)`);
  earR.setAttribute("transform", `translate(162 60) rotate(${earAngle.toFixed(2)}) scale(1 ${earScaleY.toFixed(3)}) translate(-162 -60)`);

  // eyes: narrowed and sharp when grumpy, half-lidded content when blissed
  const eyeRy = 10 * (1 - p.grump * 0.45 - p.bliss * 0.55);
  eyeL.setAttribute("ry", Math.max(1.5, eyeRy).toFixed(2));
  eyeR.setAttribute("ry", Math.max(1.5, eyeRy).toFixed(2));

  // mouth: relaxed smile scaling with bliss, open pant when hot
  const smile = p.bliss * 6 - p.grump * 4;
  mouth.setAttribute(
    "d",
    `M 120 133 Q ${108 - smile * 0.3} ${143 + smile} 100 136 M 120 133 Q ${132 + smile * 0.3} ${143 + smile} 140 136`,
  );
  tongue.classList.toggle("show", p.hot > 0.35);
  if (p.hot > 0.35) {
    const pantHz = 2.2 + p.hot * 2.4;
    const wag = Math.abs(Math.sin(2 * Math.PI * pantHz * t));
    tongue.setAttribute("ry", (5 + wag * 5).toFixed(2));
    tongue.setAttribute("cy", (140 + wag * 6).toFixed(2));
  }

  // tail: slow relaxed swish when blissed, short sharp irritated flicks
  // when grumpy, mostly still when neutral
  const tailHz = p.bliss * 0.45 + p.grump * 1.3;
  const tailAmp = p.bliss * 10 + p.grump * 16;
  const tailAngle = tailAmp ? Math.sin(2 * Math.PI * tailHz * t) * tailAmp : 0;
  tail.setAttribute("transform", `rotate(${tailAngle.toFixed(2)} 195 205)`);

  // shivering: a jittery whole-cat tremor when cold
  if (p.cold > 0.05) {
    const jx = (Math.random() * 2 - 1) * p.cold * 2.4;
    const jy = (Math.random() * 2 - 1) * p.cold * 1.6;
    catSvg.style.transform = `translate(${jx.toFixed(2)}px, ${jy.toFixed(2)}px)`;
  } else {
    catSvg.style.transform = "";
  }

  rateVal.textContent = p.purrRateHz.toFixed(1) + " Hz";
  regVal.textContent = noteName(p.rumbleHz) + ` (${p.rumbleHz.toFixed(0)} Hz)`;
  moodRead.textContent =
    p.grump > 0.5 ? "growly" : p.bliss > 0.5 ? "trilling" : p.hot > 0.35 ? "panting" : p.cold > 0.35 ? "shivery" : "steady";
}

function drawWaveform() {
  const w = waveformCanvas.width;
  const h = waveformCanvas.height;
  wfCtx.clearRect(0, 0, w, h);
  if (!engine || !playing) {
    wfCtx.strokeStyle = "#372a1f";
    wfCtx.lineWidth = 1.5;
    wfCtx.beginPath();
    wfCtx.moveTo(0, h / 2);
    wfCtx.lineTo(w, h / 2);
    wfCtx.stroke();
    return;
  }
  if (!waveBuf) waveBuf = new Uint8Array(engine.analyser.fftSize);
  engine.analyser.getByteTimeDomainData(waveBuf);
  wfCtx.strokeStyle = "#e8935a";
  wfCtx.lineWidth = 1.8;
  wfCtx.beginPath();
  const step = waveBuf.length / w;
  for (let x = 0; x < w; x++) {
    const sample = waveBuf[Math.floor(x * step)] / 128 - 1;
    const y = h / 2 + sample * (h / 2 - 3);
    if (x === 0) wfCtx.moveTo(x, y);
    else wfCtx.lineTo(x, y);
  }
  wfCtx.stroke();
}

function tick(now) {
  const s = state();
  const p = paramsFromControls(s.size, s.temp, s.mood);
  updateCat(p, now / 1000);
  if (engine) engine.update(p);
  drawWaveform();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

async function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    engine = createPurrEngine(ctx);
    engine.setVolume(parseFloat(masterVol.value));
  }
  if (ctx.state === "suspended") await ctx.resume();
  return engine;
}

playBtn.addEventListener("click", async () => {
  await ensureAudio();
  if (!playing) {
    engine.start();
    playing = true;
    playBtn.textContent = "✋ stop petting";
  } else {
    engine.stop();
    playing = false;
    playBtn.textContent = "🐾 pet the cat";
  }
});

masterVol.addEventListener("input", () => {
  if (engine) engine.setVolume(parseFloat(masterVol.value));
});

copyLinkBtn.addEventListener("click", async () => {
  const url = shareURL(state()).toString();
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

// ---- boot: restore a shared cat from the URL, if present ------------------

(() => {
  const params = new URLSearchParams(location.search);
  if (params.has("s")) sizeCtl.value = Math.max(0, Math.min(100, parseFloat(params.get("s")) || 50));
  if (params.has("t")) tempCtl.value = Math.max(0, Math.min(100, parseFloat(params.get("t")) || 58));
  if (params.has("m")) moodCtl.value = Math.max(0, Math.min(100, parseFloat(params.get("m")) || 60));
  onControlChange();
})();
