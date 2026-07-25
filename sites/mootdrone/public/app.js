// app.js — wires a Bluesky handle's network to the mixing board. Fetches
// happen in lib/cluster.js, synthesis happens in lib/synth.js; this file just
// does DOM + orchestration.

import { moots, getProfiles, postingActivity } from "./lib/cluster.js";
import { createVoice, createMaster } from "./lib/synth.js";

const MAX_TRACKS = 8;

const form = document.getElementById("load-form");
const input = document.getElementById("handle-input");
const statusEl = document.getElementById("status");
const board = document.getElementById("board");
const tracksEl = document.getElementById("tracks");
const boardMeta = document.getElementById("board-meta");
const playBtn = document.getElementById("play-btn");
const masterVol = document.getElementById("master-vol");

let ctx = null;
let master = null;
let voices = []; // [{ did, handle, muted, soloed, voice }]
let playing = false;

function setStatus(msg, isError) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}

function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = createMaster(ctx);
    master.setVolume(parseFloat(masterVol.value));
  }
  return ctx;
}

function recomputeAudibility() {
  const anySolo = voices.some((v) => v.soloed);
  for (const v of voices) {
    v.voice.setAudible(anySolo ? v.soloed : !v.muted);
  }
}

function teardownVoices() {
  for (const v of voices) v.voice.stop();
  voices = [];
  tracksEl.innerHTML = "";
}

function trackRow(entry) {
  const row = document.createElement("div");
  row.className = "track";

  const avatar = document.createElement(entry.avatar ? "img" : "div");
  avatar.className = "avatar";
  if (entry.avatar) {
    avatar.src = entry.avatar;
    avatar.alt = "";
    avatar.loading = "lazy";
  } else {
    avatar.textContent = (entry.displayName || entry.handle || "?")[0].toUpperCase();
  }

  const meta = document.createElement("div");
  meta.className = "meta";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = entry.displayName || entry.handle;
  const tag = document.createElement("div");
  tag.className = "tag";
  const pct = Math.round(entry.activity * 100);
  tag.innerHTML =
    `@${entry.handle} · <span class="inst">${entry.voice.instrument}</span>` +
    ` · <span class="lfodot" style="--dur:${(1 / entry.voice.lfo.rateHz).toFixed(2)}s"></span>` +
    ` lfo · ${pct}% posting`;
  meta.appendChild(name);
  meta.appendChild(tag);

  const fader = document.createElement("input");
  fader.type = "range";
  fader.className = "fader";
  fader.min = "0";
  fader.max = "1";
  fader.step = "0.01";
  fader.value = "0.8";
  fader.addEventListener("input", () => entry.voice.setVolume(parseFloat(fader.value)));

  const muteBtn = document.createElement("button");
  muteBtn.className = "chip mute";
  muteBtn.textContent = "M";
  muteBtn.title = "mute";
  muteBtn.addEventListener("click", () => {
    entry.muted = !entry.muted;
    muteBtn.classList.toggle("active", entry.muted);
    recomputeAudibility();
  });

  const soloBtn = document.createElement("button");
  soloBtn.className = "chip solo";
  soloBtn.textContent = "S";
  soloBtn.title = "solo";
  soloBtn.addEventListener("click", () => {
    entry.soloed = !entry.soloed;
    soloBtn.classList.toggle("active", entry.soloed);
    recomputeAudibility();
  });

  const loopBtn = document.createElement("button");
  loopBtn.className = "chip loop active";
  loopBtn.textContent = "loop";
  loopBtn.title = "loop this voice's cycle";
  loopBtn.addEventListener("click", () => {
    entry.looping = !entry.looping;
    loopBtn.classList.toggle("active", entry.looping);
    entry.voice.setLoop(entry.looping);
  });

  row.appendChild(avatar);
  row.appendChild(meta);
  row.appendChild(fader);
  row.appendChild(muteBtn);
  row.appendChild(soloBtn);
  row.appendChild(loopBtn);
  return row;
}

async function loadNetwork(actor) {
  teardownVoices();
  board.hidden = true;
  playBtn.disabled = true;
  playBtn.textContent = "▶ start";
  playing = false;
  if (ctx) ctx.suspend();

  setStatus("resolving handle…");
  const audioCtx = ensureAudio();

  let cluster;
  try {
    cluster = await moots(actor, { onStep: (s) => setStatus(s) });
  } catch (e) {
    setStatus(`couldn't load that: ${e.message}`, true);
    return;
  }

  if (!cluster.pool.length) {
    setStatus("no moots or follows to build a board from.", true);
    return;
  }

  const picked = cluster.pool.slice(0, MAX_TRACKS);
  setStatus("reading bios…");
  const profiles = await getProfiles(picked.map((p) => p.did));
  const profileByDid = new Map(profiles.map((p) => [p.did, p]));

  setStatus("checking posting activity…");
  const activities = await Promise.all(picked.map((p) => postingActivity(p.did)));

  const entries = picked.map((p, i) => {
    const full = profileByDid.get(p.did) || {};
    const bio = full.description || "";
    const voice = createVoice(audioCtx, master, {
      did: p.did,
      handle: p.handle,
      bio,
      activity: activities[i],
    });
    voice.setVolume(0.8);
    voice.start();
    return {
      did: p.did,
      handle: p.handle,
      displayName: full.displayName || p.displayName || p.handle,
      avatar: full.avatar || p.avatar || "",
      activity: activities[i],
      muted: false,
      soloed: false,
      looping: true,
      voice,
    };
  });

  voices = entries;
  for (const entry of entries) tracksEl.appendChild(trackRow(entry));

  boardMeta.textContent = `${cluster.kind} · ${picked.length} of ${cluster.counts.pool} on the board`;
  board.hidden = false;
  playBtn.disabled = false;
  setStatus("");
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const actor = input.value.trim();
  if (!actor) return;
  loadNetwork(actor);
});

playBtn.addEventListener("click", async () => {
  if (!ctx) return;
  if (!playing) {
    await ctx.resume();
    playing = true;
    playBtn.textContent = "⏸ pause";
  } else {
    await ctx.suspend();
    playing = false;
    playBtn.textContent = "▶ start";
  }
});

masterVol.addEventListener("input", () => {
  if (master) master.setVolume(parseFloat(masterVol.value));
});
