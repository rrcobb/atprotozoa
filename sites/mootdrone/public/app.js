// app.js — wires a Bluesky handle's network to the mixing board. Fetches
// happen in lib/cluster.js, synthesis happens in lib/synth.js; this file just
// does DOM + orchestration.

import { moots, getProfiles, postingActivity } from "./lib/cluster.js";
import { createVoice, createMaster } from "./lib/synth.js";
import { createVisualizer, instrumentColor } from "./lib/visualizer.js";
import { canRecord, recordClip } from "./lib/recorder.js";
import { login, completeLoginIfCallback, getSession, clearSession } from "./lib/oauth.js";
import { uploadVideo, firePostWithVideo } from "./lib/videopost.js";

const MAX_TRACKS = 8;
const RESUME_KEY = "mootdrone:last-actor";

const form = document.getElementById("load-form");
const input = document.getElementById("handle-input");
const statusEl = document.getElementById("status");
const board = document.getElementById("board");
const tracksEl = document.getElementById("tracks");
const boardMeta = document.getElementById("board-meta");
const playBtn = document.getElementById("play-btn");
const masterVol = document.getElementById("master-vol");
const shareBtn = document.getElementById("share-btn");
const whoEl = document.getElementById("who");
const visCanvas = document.getElementById("vis");

const visualizer = createVisualizer(visCanvas);
visualizer.start();

let ctx = null;
let master = null;
let voices = []; // [{ did, handle, muted, soloed, voice }]
let playing = false;
let session = null;
let lastActor = "";

function setStatus(msg, isError) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

function renderWho() {
  if (!session) {
    whoEl.innerHTML = "";
    return;
  }
  whoEl.innerHTML = `signed in as @${esc(session.handle)} · <a id="sign-out">sign out</a>`;
  document.getElementById("sign-out").onclick = async () => {
    await clearSession();
    session = null;
    renderWho();
  };
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
  visualizer.setTracks([]);
  shareBtn.disabled = true;
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
  visualizer.setTracks(
    entries.map((e) => ({
      label: e.handle,
      color: instrumentColor(e.voice.instrument),
      analyser: e.voice.analyser,
    })),
  );

  boardMeta.textContent = `${cluster.kind} · ${picked.length} of ${cluster.counts.pool} on the board`;
  board.hidden = false;
  playBtn.disabled = false;
  shareBtn.disabled = !canRecord();
  if (!canRecord()) shareBtn.title = "this browser can't record canvas+audio";
  setStatus("");

  lastActor = actor;
  try {
    localStorage.setItem(RESUME_KEY, actor);
  } catch {}
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

// ---- share as video: record a clip of the board, then post it -------------

function openSignInModal() {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `
    <div class="modal">
      <h3>sign in to post</h3>
      <p class="status">sharing posts on your behalf, so mootdrone needs you
        signed in with Bluesky OAuth first. this will leave the page — your
        board reloads automatically when you're back.</p>
      <div class="bar">
        <input id="signin-handle" type="text" placeholder="your handle.bsky.social" autocomplete="off" />
      </div>
      <p class="err" id="signin-err"></p>
      <div class="actions">
        <button class="ghost" id="signin-cancel">cancel</button>
        <button id="signin-go">sign in with bluesky</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.querySelector("#signin-cancel").onclick = close;
  bg.onclick = (e) => {
    if (e.target === bg) close();
  };
  bg.querySelector("#signin-go").onclick = async () => {
    const h = bg.querySelector("#signin-handle").value.trim();
    if (!h) return;
    try {
      if (lastActor) localStorage.setItem(RESUME_KEY, lastActor);
      await login(h); // navigates away
    } catch (e) {
      bg.querySelector("#signin-err").textContent = e.message;
    }
  };
}

function openShareModal(blob) {
  const videoUrl = URL.createObjectURL(blob);
  const defaultCaption = lastActor
    ? `@${lastActor}'s network as a drone board — mootdrone.bisks.net`
    : `a drone board, mixed live — mootdrone.bisks.net`;

  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `
    <div class="modal">
      <h3>post this clip?</h3>
      <video src="${videoUrl}" controls autoplay loop muted playsinline></video>
      <textarea id="caption" maxlength="300">${esc(defaultCaption)}</textarea>
      <p class="status" id="share-status"></p>
      <div class="actions">
        <button class="ghost" id="share-cancel">cancel</button>
        <button id="share-confirm">post to bluesky</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  const close = () => {
    URL.revokeObjectURL(videoUrl);
    bg.remove();
  };
  bg.querySelector("#share-cancel").onclick = close;
  bg.onclick = (e) => {
    if (e.target === bg) close();
  };

  bg.querySelector("#share-confirm").onclick = async () => {
    const btn = bg.querySelector("#share-confirm");
    const status = bg.querySelector("#share-status");
    btn.disabled = true;
    btn.textContent = "posting…";
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const videoBlob = await uploadVideo(session, bytes, "mootdrone.webm", (s) => {
        status.textContent = s;
      });
      status.textContent = "creating post…";
      const text = bg.querySelector("#caption").value.slice(0, 300);
      const res = await firePostWithVideo(session, { text, videoBlob, alt: text });
      const url = `https://bsky.app/profile/${session.did}/post/${res.uri.split("/").pop()}`;
      status.innerHTML = `posted → <a href="${url}" target="_blank">see it →</a>`;
      btn.textContent = "posted!";
    } catch (e) {
      status.innerHTML = `<span class="err">${esc(e.message)}</span>`;
      btn.disabled = false;
      btn.textContent = "post to bluesky";
    }
  };
}

shareBtn.addEventListener("click", async () => {
  if (!voices.length || !ctx) return;
  if (!session) {
    openSignInModal();
    return;
  }
  const restoreLabel = shareBtn.textContent;
  shareBtn.disabled = true;
  try {
    if (!playing) {
      await ctx.resume();
      playing = true;
      playBtn.textContent = "⏸ pause";
    }
    shareBtn.textContent = "recording 14s…";
    const tap = master.tapForRecording();
    let blob;
    try {
      blob = await recordClip({ canvas: visCanvas, audioStream: tap.stream, seconds: 14 });
    } finally {
      tap.stop();
    }
    openShareModal(blob);
  } catch (e) {
    setStatus(`couldn't record a clip: ${e.message}`, true);
  } finally {
    shareBtn.textContent = restoreLabel;
    shareBtn.disabled = false;
  }
});

// ---- boot: resume an OAuth callback / prior session, restore last board ---

(async () => {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    setStatus(e.message, true);
  }
  renderWho();

  let resumeActor = null;
  try {
    resumeActor = localStorage.getItem(RESUME_KEY);
  } catch {}
  if (resumeActor) {
    input.value = resumeActor;
    loadNetwork(resumeActor);
  }
})();
