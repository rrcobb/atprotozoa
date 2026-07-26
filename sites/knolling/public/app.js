// app.js — wires a Bluesky handle's moots to the worktop. Fetching happens in
// lib/cluster.js, object identity in lib/objects.js, rendering/layout in
// lib/worktop.js; this file is just DOM + orchestration.

import { moots, latestPost } from "./lib/cluster.js";
import { paramsForDid, hash32 } from "./lib/objects.js";
import { createWorktop } from "./lib/worktop.js";

const MAX_ITEMS = 42;
const RESUME_KEY = "knolling:last-actor";
const VOICE_KEY = "knolling:voice-on";
const W = 1000, H = 640;

const form = document.getElementById("load-form");
const input = document.getElementById("handle-input");
const statusEl = document.getElementById("status");
const stage = document.getElementById("stage");
const canvas = document.getElementById("worktop");
const metaEl = document.getElementById("meta");
const toggleBtn = document.getElementById("toggle-btn");
const shuffleBtn = document.getElementById("shuffle-btn");
const downloadBtn = document.getElementById("download-btn");
const shareBtn = document.getElementById("share-btn");
const tooltip = document.getElementById("tooltip");
const captionEl = document.getElementById("caption");
const voiceToggle = document.getElementById("voice-toggle");

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function setStatus(msg, isError) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}

let lastActor = "";
let worktop = null;

function showTooltip(item, clientX, clientY) {
  if (!item) { tooltip.hidden = true; return; }
  tooltip.hidden = false;
  tooltip.innerHTML =
    `<b>${esc(item.params.name)}</b><br>@${esc(item.handle)}`;
  const stageRect = stage.getBoundingClientRect();
  tooltip.style.left = clientX - stageRect.left + 14 + "px";
  tooltip.style.top = clientY - stageRect.top + 10 + "px";
}

// caption + voiceover — fires while an object is actively held (mid-drag).
let held = false;
let holdToken = 0;
let cachedVoices = [];

function refreshVoices() {
  if (!("speechSynthesis" in window)) return;
  cachedVoices = window.speechSynthesis.getVoices();
}
if ("speechSynthesis" in window) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", refreshVoices);
}

function pickSmoothVoice() {
  if (!cachedVoices.length) return null;
  const preferred = [/Google UK English Male/i, /Daniel/i, /^Alex$/i, /Moira/i, /Samantha/i, /Male/i];
  for (const re of preferred) {
    const v = cachedVoices.find((v) => re.test(v.name));
    if (v) return v;
  }
  return cachedVoices.find((v) => v.lang?.startsWith("en")) || cachedVoices[0];
}

function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickSmoothVoice();
  if (v) u.voice = v;
  u.pitch = 0.85;
  u.rate = 0.94;
  u.onend = () => { if (!held) captionEl.hidden = true; };
  window.speechSynthesis.speak(u);
}

async function onHold(item) {
  held = !!item;
  if (!item) {
    if (!(voiceToggle.checked && window.speechSynthesis?.speaking)) captionEl.hidden = true;
    if (worktop) {
      toggleBtn.textContent = worktop.isKnolled() ? "toss it back" : "knoll it";
      toggleBtn.dataset.knolled = worktop.isKnolled() ? "1" : "0";
    }
    return;
  }
  const myToken = ++holdToken;
  captionEl.hidden = false;
  captionEl.innerHTML = `<a class="caption-handle" href="https://bsky.app/profile/${esc(item.handle)}" target="_blank" rel="noopener">@${esc(item.handle)}</a><span class="caption-text">reaching for their latest…</span>`;
  let post;
  try {
    post = await latestPost(item.did);
  } catch {
    post = { text: "" };
  }
  if (myToken !== holdToken) return; // superseded by a newer grab
  const text = post.text || "(no recent posts)";
  captionEl.innerHTML = `<a class="caption-handle" href="https://bsky.app/profile/${esc(item.handle)}" target="_blank" rel="noopener">@${esc(item.handle)}</a><span class="caption-text">${esc(text)}</span>`;
  if (voiceToggle.checked && post.text) speak(post.text);
}

function ensureWorktop() {
  if (worktop) return worktop;
  worktop = createWorktop(canvas, {
    W, H,
    onHover: showTooltip,
    onHold,
  });
  return worktop;
}

function setControlsEnabled(on) {
  toggleBtn.disabled = !on;
  shuffleBtn.disabled = !on;
  downloadBtn.disabled = !on;
  shareBtn.disabled = !on;
}

async function load(actor) {
  setStatus("resolving handle…");
  setControlsEnabled(false);
  stage.hidden = true;
  tooltip.hidden = true;
  captionEl.hidden = true;
  window.speechSynthesis?.cancel();

  let cluster;
  try {
    cluster = await moots(actor, { onStep: (s) => setStatus(s) });
  } catch (e) {
    setStatus(`couldn't load that: ${e.message}`, true);
    return;
  }
  if (!cluster.pool.length) {
    setStatus("no moots or follows to put on the desk.", true);
    return;
  }

  lastActor = cluster.handle || actor;
  try { localStorage.setItem(RESUME_KEY, lastActor); } catch {}

  const pool = cluster.pool
    .slice()
    .sort((a, b) => hash32(a.did, "pick") - hash32(b.did, "pick"))
    .slice(0, MAX_ITEMS);

  const items = pool.map((p) => ({
    did: p.did,
    handle: p.handle,
    displayName: p.displayName,
    avatar: p.avatar,
    params: paramsForDid(p.did),
  }));

  const wt = ensureWorktop();
  wt.setItems(items);

  const truncated = cluster.pool.length > pool.length;
  metaEl.textContent =
    `@${cluster.handle}'s ${cluster.kind} · ${pool.length} on the desk` +
    (truncated ? ` (of ${cluster.pool.length} — hashed subsample)` : "");
  toggleBtn.textContent = "knoll it";
  toggleBtn.dataset.knolled = "0";
  setStatus("");
  stage.hidden = false;
  setControlsEnabled(true);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const actor = input.value.trim();
  if (!actor) return;
  load(actor);
});

toggleBtn.addEventListener("click", () => {
  if (!worktop) return;
  const next = !worktop.isKnolled();
  if (next) worktop.knoll(); else worktop.scatter();
  toggleBtn.textContent = next ? "toss it back" : "knoll it";
  toggleBtn.dataset.knolled = next ? "1" : "0";
});

shuffleBtn.addEventListener("click", () => {
  if (!worktop || worktop.isKnolled()) return;
  worktop.scatter();
});

downloadBtn.addEventListener("click", () => {
  if (!worktop) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${lastActor || "knolling"}-worktop.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, "image/png");
});

shareBtn.addEventListener("click", async () => {
  if (!worktop) return;
  const caption = `@${lastActor}'s moots, knolled — knolling.bisks.net`;
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], "worktop.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: caption, title: "knolling" });
        return;
      } catch {
        // fall through to the compose-intent fallback below
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${lastActor || "knolling"}-worktop.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    window.open(
      `https://bsky.app/intent/compose?text=${encodeURIComponent(caption)}`,
      "_blank",
      "noopener",
    );
  }, "image/png");
});

voiceToggle.addEventListener("change", () => {
  try { localStorage.setItem(VOICE_KEY, voiceToggle.checked ? "1" : "0"); } catch {}
  if (!voiceToggle.checked) window.speechSynthesis?.cancel();
});

(function boot() {
  try { voiceToggle.checked = localStorage.getItem(VOICE_KEY) === "1"; } catch {}
  let resumeActor = null;
  try { resumeActor = localStorage.getItem(RESUME_KEY); } catch {}
  if (resumeActor) {
    input.value = resumeActor;
    load(resumeActor);
  }
})();
