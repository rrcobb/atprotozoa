// app.js — wires the departures board to the generative engine. Ensembles
// come from lib/tracks.js, synthesis from lib/synth.js; this file is just
// DOM + orchestration + a plain audio-only recorder (no login, no server —
// the "share" path is a local download + a Bluesky compose intent).

import { TRACKS, buildEnsemble } from "./lib/tracks.js";
import { createVoice, createMaster } from "./lib/synth.js";
import { createVisualizer, instrumentColor } from "./lib/visualizer.js";

const LAST_TRACK_KEY = "cfa:last-track";
const nonceKey = (trackKey) => `cfa:nonce:${trackKey}`;

const INSTRUMENT_LABEL = {
  pad: "PA hum",
  horn: "announcement",
  vox: "crowd murmur",
  bell: "chime",
  chime: "gate chime",
  hum: "HVAC / engine",
  drumkit: "cart wheels",
};

const boardEl = document.getElementById("board");
const playBtn = document.getElementById("play-btn");
const reseedBtn = document.getElementById("reseed-btn");
const masterVol = document.getElementById("master-vol");
const mixerEl = document.getElementById("mixer");
const nowPlayingEl = document.getElementById("now-playing");
const visCanvas = document.getElementById("vis");
const recordBtn = document.getElementById("record-btn");
const recordStatus = document.getElementById("record-status");
const shareIntent = document.getElementById("share-intent");

const visualizer = createVisualizer(visCanvas);
visualizer.start();

let ctx = null;
let master = null;
let track = TRACKS[0];
let entries = []; // [{ spec, voice, muted, soloed }]
let playing = false;

function readNonce(trackKey) {
  try {
    return localStorage.getItem(nonceKey(trackKey)) || "1";
  } catch {
    return "1";
  }
}
function writeNonce(trackKey, nonce) {
  try {
    localStorage.setItem(nonceKey(trackKey), nonce);
  } catch {}
}

function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (!master || master.__wet !== track.reverb.wet) {
    if (master) master.dispose();
    master = createMaster(ctx, track.reverb);
    master.__wet = track.reverb.wet;
    master.setVolume(parseFloat(masterVol.value));
  }
  return ctx;
}

function teardownVoices() {
  for (const e of entries) e.voice.stop();
  entries = [];
  mixerEl.innerHTML = "";
  visualizer.setTracks([]);
}

function recomputeAudibility() {
  const anySolo = entries.some((e) => e.soloed);
  for (const e of entries) e.voice.setAudible(anySolo ? e.soloed : !e.muted);
}

function voiceRow(e, i) {
  const row = document.createElement("div");
  row.className = "voice";

  const dot = document.createElement("span");
  dot.className = "vdot";
  dot.style.background = instrumentColor(e.spec.instrument);

  const meta = document.createElement("div");
  meta.className = "vmeta";
  const name = document.createElement("div");
  name.className = "vname";
  name.textContent = `V${i + 1} · ${e.spec.instrument}`;
  const tag = document.createElement("div");
  tag.className = "vtag";
  tag.textContent =
    `${INSTRUMENT_LABEL[e.spec.instrument] || e.spec.instrument} · ` +
    `${Math.round(e.spec.cycleSec)}s loop`;
  meta.appendChild(name);
  meta.appendChild(tag);

  const fader = document.createElement("input");
  fader.type = "range";
  fader.className = "fader";
  fader.min = "0";
  fader.max = "1";
  fader.step = "0.01";
  fader.value = "0.8";
  fader.addEventListener("input", () => e.voice.setVolume(parseFloat(fader.value)));

  const muteBtn = document.createElement("button");
  muteBtn.className = "chip mute";
  muteBtn.textContent = "M";
  muteBtn.title = "mute this voice";
  muteBtn.addEventListener("click", () => {
    e.muted = !e.muted;
    muteBtn.classList.toggle("active", e.muted);
    recomputeAudibility();
  });

  const soloBtn = document.createElement("button");
  soloBtn.className = "chip solo";
  soloBtn.textContent = "S";
  soloBtn.title = "solo this voice — hear just this loop";
  soloBtn.addEventListener("click", () => {
    e.soloed = !e.soloed;
    soloBtn.classList.toggle("active", e.soloed);
    recomputeAudibility();
  });

  row.appendChild(dot);
  row.appendChild(meta);
  row.appendChild(fader);
  row.appendChild(muteBtn);
  row.appendChild(soloBtn);
  return row;
}

function buildVoices(nonce) {
  teardownVoices();
  const audioCtx = ensureAudio();
  const specs = buildEnsemble(track, nonce);
  entries = specs.map((spec) => ({
    spec,
    muted: false,
    soloed: false,
    voice: createVoice(audioCtx, master, spec),
  }));
  for (const e of entries) {
    e.voice.setVolume(0.8);
    e.voice.start();
  }
  entries.forEach((e, i) => mixerEl.appendChild(voiceRow(e, i)));
  visualizer.setTracks(
    entries.map((e, i) => ({
      label: e.spec.instrument === "hum" ? "hum" : `V${i + 1}`,
      color: instrumentColor(e.spec.instrument),
      analyser: e.voice.analyser,
    })),
  );
}

function renderBoard() {
  boardEl.innerHTML = "";
  TRACKS.forEach((t) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "flight" + (t.key === track.key ? " active" : "");
    const status = t.key === track.key ? (playing ? "BOARDING" : "READY") : "SCHEDULED";
    row.innerHTML =
      `<span class="fno">${t.title.split(" — ")[0]}</span>` +
      `<span class="fdest">${t.title.split(" — ")[1]}</span>` +
      `<span class="fblurb">${t.blurb}</span>` +
      `<span class="fstatus ${status === "BOARDING" ? "live" : ""}">${status}</span>`;
    row.addEventListener("click", () => selectTrack(t));
    boardEl.appendChild(row);
  });
}

async function selectTrack(t) {
  const wasPlaying = playing;
  if (ctx) await ctx.suspend();
  playing = false;
  playBtn.textContent = "▶ play";
  track = t;
  try {
    localStorage.setItem(LAST_TRACK_KEY, t.key);
  } catch {}
  buildVoices(readNonce(t.key));
  nowPlayingEl.textContent = t.blurb;
  renderBoard();
  updateShare();
  if (wasPlaying) {
    await ctx.resume();
    playing = true;
    playBtn.textContent = "⏸ pause";
    renderBoard();
  }
}

reseedBtn.addEventListener("click", () => {
  const n = String(Date.now() % 100000);
  writeNonce(track.key, n);
  buildVoices(n);
});

playBtn.addEventListener("click", async () => {
  ensureAudio();
  if (!entries.length) buildVoices(readNonce(track.key));
  if (!playing) {
    await ctx.resume();
    playing = true;
    playBtn.textContent = "⏸ pause";
  } else {
    await ctx.suspend();
    playing = false;
    playBtn.textContent = "▶ play";
  }
  renderBoard();
});

masterVol.addEventListener("input", () => {
  if (master) master.setVolume(parseFloat(masterVol.value));
});

// ---- record a clip: plain audio-only download, no login, no server -------

function pickAudioMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  for (const c of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(c)) return c;
  }
  return "";
}

recordBtn.addEventListener("click", async () => {
  ensureAudio();
  if (!entries.length) buildVoices(readNonce(track.key));
  if (!window.MediaRecorder) {
    recordStatus.textContent = "this browser can't record audio";
    return;
  }
  const wasPlaying = playing;
  if (!playing) {
    await ctx.resume();
    playing = true;
    playBtn.textContent = "⏸ pause";
    renderBoard();
  }
  recordBtn.disabled = true;
  const seconds = 30;
  let secondsLeft = seconds;
  recordStatus.textContent = `recording ${secondsLeft}s…`;
  const tick = setInterval(() => {
    secondsLeft -= 1;
    if (secondsLeft > 0) recordStatus.textContent = `recording ${secondsLeft}s…`;
  }, 1000);

  const tap = master.tapForRecording();
  const mimeType = pickAudioMime();
  const chunks = [];
  try {
    const rec = new MediaRecorder(tap.stream, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    const done = new Promise((resolve, reject) => {
      rec.onstop = resolve;
      rec.onerror = (e) => reject(e.error || new Error("recorder error"));
    });
    rec.start();
    setTimeout(() => rec.state !== "inactive" && rec.stop(), seconds * 1000);
    await done;
    const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
    const url = URL.createObjectURL(blob);
    const ext = (mimeType || "").includes("ogg") ? "ogg" : "webm";
    const a = document.createElement("a");
    a.href = url;
    a.download = `code-for-airports-${track.key}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    recordStatus.textContent = "✓ downloaded — it'll keep drifting differently every time you record it again";
  } catch (e) {
    recordStatus.textContent = `couldn't record: ${e.message}`;
  } finally {
    clearInterval(tick);
    tap.stop();
    recordBtn.disabled = false;
    if (!wasPlaying) {
      await ctx.suspend();
      playing = false;
      playBtn.textContent = "▶ play";
      renderBoard();
    }
  }
});

// ---- share -----------------------------------------------------------

function updateShare() {
  const url = "https://code-for-airports.bisks.net/";
  const text = `“${track.title}” — code for airports, a generative ambient piece in the vein of Eno's Music for Airports, built to never repeat the same way twice. ${url}`;
  shareIntent.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
}

// ---- boot --------------------------------------------------------------

(() => {
  let startKey = TRACKS[0].key;
  try {
    const saved = localStorage.getItem(LAST_TRACK_KEY);
    if (saved && TRACKS.some((t) => t.key === saved)) startKey = saved;
  } catch {}
  track = TRACKS.find((t) => t.key === startKey) || TRACKS[0];
  nowPlayingEl.textContent = track.blurb;
  renderBoard();
  updateShare();
})();
