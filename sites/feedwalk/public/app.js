// app.js — UI/data glue for feedwalk.bisks.net. Resolves a handle, pulls
// their follows + recent posts from the public AppView (see lib/follows.js —
// no OAuth login needed, same reasoning as skyclone's logged-out mode), then
// hands the resulting pool of real posts to gallery-scene.js to walk
// through. This file owns no 3D code; see gallery-scene.js for that.

import { whoTheyFollow, getRecentPosts, postUrl } from "./lib/follows.js";

const FOLLOW_CAP = 50;
const POSTS_PER_ACCOUNT = 4;
const CONCURRENCY = 6;

const form = document.getElementById("load-form");
const input = document.getElementById("handle-input");
if (window.attachHandleTypeahead) window.attachHandleTypeahead(input);
const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const gameEl = document.getElementById("game");
const canvas = document.getElementById("board");
const lockHint = document.getElementById("lock-hint");
const hudWho = document.getElementById("hud-who");
const hudCount = document.getElementById("hud-count");
const hudLap = document.getElementById("hud-lap");
const caption = document.getElementById("caption");
const capName = document.getElementById("cap-name");
const capText = document.getElementById("cap-text");
const capMeta = document.getElementById("cap-meta");
const openBtn = document.getElementById("open-btn");
const shareBtn = document.getElementById("share-btn");
const startOverlay = document.getElementById("start-overlay");
const startCopy = document.getElementById("start-copy");
const startBtn = document.getElementById("start-btn");
const changeBtn = document.getElementById("change-btn");

function setStatus(msg, isError) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// small concurrency-limited map — no need for a library for six workers.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

let scene = null;
let currentHandle = "";
let poolSize = 0;

function initSceneOnce() {
  if (scene) return scene;
  scene = window.Feedwalk.init(canvas, { seed: Math.floor(Math.random() * 2 ** 31) });
  if (scene.noWebgl) {
    document.body.classList.add("no-webgl");
    return scene;
  }
  scene.onTarget = (post) => {
    if (!post) {
      caption.classList.remove("show");
      return;
    }
    caption.classList.add("show");
    capName.textContent = `${post.displayName} · @${post.handle}`;
    capText.textContent = post.text || (post.images.length ? "(image post)" : "");
    capMeta.textContent = `♥ ${post.likeCount} · ⟲ ${post.repostCount}`;
    openBtn.href = postUrl(post.uri, post.handle);
    const shareText = `wandering @${currentHandle}'s feedwalk gallery — just found a post from @${post.handle}: "${(post.text || "").slice(0, 120)}" ${postUrl(post.uri, post.handle)}`;
    shareBtn.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
  };
  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === canvas;
    lockHint.classList.toggle("show", gameEl && !gameEl.hidden && !locked);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) scene.stop();
    else if (gameEl && !gameEl.hidden) scene.start();
  });
  return scene;
}

async function loadGallery(actor) {
  loadBtn.disabled = true;
  gameEl.hidden = true;
  setStatus("resolving handle…");
  let net;
  try {
    net = await whoTheyFollow(actor, { onStep: setStatus });
  } catch (e) {
    setStatus(`couldn't load that: ${e.message}`, true);
    loadBtn.disabled = false;
    return;
  }
  if (!net.follows.length) {
    setStatus("that account doesn't follow anyone to build a gallery from.", true);
    loadBtn.disabled = false;
    return;
  }

  const chosen = shuffle(net.follows).slice(0, FOLLOW_CAP);
  setStatus(`hanging posts from ${chosen.length} accounts you follow…`);

  const lists = await mapLimit(chosen, CONCURRENCY, (p) => getRecentPosts(p, POSTS_PER_ACCOUNT));
  const pool = lists.flat();

  if (!pool.length) {
    setStatus("none of those accounts had a text or image post to hang — try a different handle.", true);
    loadBtn.disabled = false;
    return;
  }

  currentHandle = net.handle;
  poolSize = pool.length;

  const sc = initSceneOnce();
  if (sc.noWebgl) {
    setStatus("your browser can't do WebGL — feedwalk needs it to render the gallery.", true);
    loadBtn.disabled = false;
    return;
  }
  sc.loadPool(pool);
  sc.reset();

  hudWho.textContent = `@${net.handle}`;
  hudCount.textContent = `${pool.length} exhibits · ${chosen.length} accounts`;
  startCopy.textContent = `@${net.handle} follows ${net.counts.follows} accounts. ${pool.length} of their recent posts are hanging in the gallery — walk until you've seen them all, and it'll start again from the top.`;

  setStatus("");
  loadBtn.disabled = false;
  gameEl.hidden = false;
  startOverlay.classList.remove("hidden");
  sc.setInputEnabled(false);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const actor = input.value.trim();
  if (!actor) return;
  loadGallery(actor);
});

startBtn.addEventListener("click", () => {
  startOverlay.classList.add("hidden");
  scene.setInputEnabled(true);
  scene.start();
  requestAnimationFrame(() => {
    if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
      lockHint.classList.add("show");
    }
  });
});

changeBtn.addEventListener("click", () => {
  if (scene) {
    scene.stop();
    scene.setInputEnabled(false);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
  }
  gameEl.hidden = true;
  input.focus();
});

// HUD lap ticker — cheap poll, not worth a callback plumbed through the scene.
setInterval(() => {
  if (!scene || !scene.ready || gameEl.hidden) return;
  const p = scene.progress();
  hudLap.textContent = p.lap > 1 ? `lap ${p.lap}` : "";
}, 500);

// ---- touch d-pad ------------------------------------------------------
for (const [id, k] of [
  ["t-fwd", "forward"], ["t-back", "back"], ["t-left", "left"], ["t-right", "right"],
]) {
  const btn = document.getElementById(id);
  btn.addEventListener("pointerdown", (e) => { e.preventDefault(); if (scene) scene.setKey(k, true); });
  btn.addEventListener("pointerup", (e) => { e.preventDefault(); if (scene) scene.setKey(k, false); });
  btn.addEventListener("pointerleave", () => { if (scene) scene.setKey(k, false); });
}

if (input.value.trim()) loadGallery(input.value.trim());
