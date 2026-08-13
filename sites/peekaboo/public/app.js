"use strict";

// peekaboo — a picture hides behind a 5x5 grid. Each covered square is a real
// post from one of the signed-in user's moots (mutual follows) that they
// haven't liked yet. Tapping a square fires a genuine app.bsky.feed.like
// straight to the user's own PDS (see lib/like.js); on success the square
// fades away for good. Reveal progress (how many of the 25 squares have
// lifted) is tracked per-DID in localStorage — there's no server component,
// so "for good" means "in this browser."

import { login, completeLoginIfCallback, getSession, clearSession } from "./lib/oauth.js";
import { likePost } from "./lib/like.js";

const GRID = 5;
const TOTAL = GRID * GRID;
const APPVIEW = "https://public.api.bsky.app";
const SITE_URL = "https://peekaboo.bisks.net/";
const FALLBACK_AVATAR =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#3c2d5a"/><circle cx="50" cy="38" r="20" fill="#b7a6d9"/><ellipse cx="50" cy="92" rx="34" ry="30" fill="#b7a6d9"/></svg>',
  );

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let session = null;
let tiles = []; // 25 tile elements, DOM order == grid position (row-major)
let revealOrder = []; // permutation of 0..24 — which position lifts on the Nth like
let revealedCount = 0;
let busy = new Set(); // positions currently mid-write

// ---------- tiny deterministic PRNG (per-DID reveal order) ----------

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(seedStr, n) {
  const rand = mulberry32(hashStr(seedStr));
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- localStorage progress ----------

function revealedKey(did) {
  return `peekaboo:revealed:${did}`;
}
function getRevealedCount(did) {
  const n = parseInt(localStorage.getItem(revealedKey(did)) || "0", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), TOTAL) : 0;
}
function setRevealedCount(did, n) {
  localStorage.setItem(revealedKey(did), String(Math.min(Math.max(n, 0), TOTAL)));
}

// ---------- AppView reads (public, no auth) ----------

async function xrpc(method, params) {
  const url = new URL(`${APPVIEW}/xrpc/${method}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) {
    const err = new Error(`${method} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const MUTUALS_PAGE_CAP = 20; // 20 * 100 = up to 2000 follows/followers per side

async function collectActorDids(method, actor) {
  const dids = new Set();
  let cursor;
  for (let i = 0; i < MUTUALS_PAGE_CAP; i++) {
    const data = await xrpc(method, { actor, limit: 100, cursor });
    const field = method === "app.bsky.graph.getFollows" ? "follows" : "followers";
    for (const a of data[field] || []) dids.add(a.did);
    if (!data.cursor || !(data[field] || []).length) break;
    cursor = data.cursor;
  }
  return dids;
}

async function getMutualDids(did) {
  const [follows, followers] = await Promise.all([
    collectActorDids("app.bsky.graph.getFollows", did),
    collectActorDids("app.bsky.graph.getFollowers", did),
  ]);
  return [...follows].filter((d) => followers.has(d) && d !== did);
}

// Every like the user has ever made is public repo data on their own PDS —
// no OAuth needed to read it, just a plain listRecords call. Used to filter
// candidate posts down to ones genuinely not liked yet.
const LIKES_PAGE_CAP = 40; // 40 * 100 = up to 4000 likes

async function fetchLikedUriSet(pdsUrl, did) {
  const liked = new Set();
  let cursor;
  const base = pdsUrl.replace(/\/$/, "");
  for (let i = 0; i < LIKES_PAGE_CAP; i++) {
    const url = new URL(`${base}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set("repo", did);
    url.searchParams.set("collection", "app.bsky.feed.like");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url.toString(), { headers: { accept: "application/json" } });
    if (!res.ok) break;
    const data = await res.json();
    for (const rec of data.records || []) {
      const uri = rec.value?.subject?.uri;
      if (uri) liked.add(uri);
    }
    if (!data.cursor || !(data.records || []).length) break;
    cursor = data.cursor;
  }
  return liked;
}

// Walk a shuffled list of moots, pulling their recent original posts (no
// replies, no reposts) and keeping ones not already liked, until `needed`
// distinct candidates are found or the moot pool runs dry. Capped at 2 posts
// per author so the board reflects a spread of people, not one prolific moot.
const MAX_MUTUALS_SCANNED = 160;
const AUTHOR_FETCH_CONCURRENCY = 6;
const MAX_PER_AUTHOR = 2;

async function gatherCandidates(mutualDids, likedSet, needed, selfDid) {
  const pool = shuffleInPlace([...mutualDids]).slice(0, MAX_MUTUALS_SCANNED);
  const candidates = [];
  const seenUris = new Set();
  let cursor = 0;

  async function scanOne(did) {
    try {
      const data = await xrpc("app.bsky.feed.getAuthorFeed", {
        actor: did,
        limit: 15,
        filter: "posts_no_replies",
      });
      let taken = 0;
      for (const item of data.feed || []) {
        if (candidates.length >= needed || taken >= MAX_PER_AUTHOR) break;
        const post = item.post;
        if (!post || item.reason) continue; // skip reposts
        if (post.author?.did === selfDid) continue;
        if (post.record?.reply) continue;
        if (seenUris.has(post.uri) || likedSet.has(post.uri)) continue;
        seenUris.add(post.uri);
        candidates.push({
          uri: post.uri,
          cid: post.cid,
          author: post.author,
          text: post.record?.text || "",
        });
        taken++;
      }
    } catch {
      // one moot's feed being unreachable shouldn't sink the whole board
    }
  }

  while (cursor < pool.length && candidates.length < needed) {
    const batch = pool.slice(cursor, cursor + AUTHOR_FETCH_CONCURRENCY);
    cursor += AUTHOR_FETCH_CONCURRENCY;
    await Promise.all(batch.map(scanOne));
  }
  return candidates;
}

// ---------- grid rendering ----------

function renderSkeleton() {
  const grid = $("coverGrid");
  grid.innerHTML = "";
  tiles = [];
  for (let i = 0; i < TOTAL; i++) {
    const el = document.createElement("div");
    el.className = "tile locked";
    el.dataset.idx = String(i);
    el.innerHTML = `<div class="tile-inner"><span class="heart">🔒</span></div>`;
    grid.appendChild(el);
    tiles.push(el);
  }
}

function markRevealedInstant(pos) {
  tiles[pos].className = "tile revealed";
  tiles[pos].innerHTML = "";
}
function markEmptyTile(pos) {
  const el = tiles[pos];
  el.className = "tile locked empty";
  el.innerHTML = `<div class="tile-inner"><span class="heart">💤</span></div>`;
  el.title = "no fresh moot post to show here yet — check back later";
}

function mountPendingTile(pos, candidate) {
  const el = tiles[pos];
  el.className = "tile pending";
  el.title = `like @${candidate.author?.handle || "?"}'s post to reveal this square`;
  const avatar = candidate.author?.avatar || FALLBACK_AVATAR;
  el.innerHTML = `
    <div class="tile-inner">
      <img class="avatar" src="${esc(avatar)}" alt="" loading="lazy">
      <span class="handle">@${esc(candidate.author?.handle || "?")}</span>
      <span class="heart">🤍</span>
    </div>`;
  el.addEventListener("click", () => handleTileClick(pos, candidate, el));
}

function updateProgress() {
  $("progress").textContent = `${revealedCount} / ${TOTAL} revealed`;
  $("shareBtn").style.display = revealedCount > 0 ? "inline-block" : "none";
}

function showDoneBanner() {
  if ($("doneBanner")) return;
  const banner = document.createElement("div");
  banner.id = "doneBanner";
  banner.className = "done-banner";
  banner.textContent = "🎉 the whole picture is revealed — every square, genuinely liked.";
  $("stage").insertAdjacentElement("afterend", banner);
}

async function handleTileClick(pos, candidate, el) {
  if (busy.has(pos) || !session) return;
  busy.add(pos);
  el.classList.add("busy");
  const inner = el.querySelector(".tile-inner");
  const heart = el.querySelector(".heart");
  if (heart) heart.outerHTML = '<span class="spinner"></span>';

  try {
    await likePost(session, { uri: candidate.uri, cid: candidate.cid });
    revealedCount = Math.min(revealedCount + 1, TOTAL);
    setRevealedCount(session.did, revealedCount);
    el.classList.remove("busy", "pending");
    el.classList.add("revealed");
    setTimeout(() => {
      el.innerHTML = "";
    }, 650);
    updateProgress();
    setStatus(`revealed a square — liked @${candidate.author?.handle || "?"}'s post for real.`, "ok");
    if (revealedCount >= TOTAL) showDoneBanner();
  } catch (e) {
    busy.delete(pos);
    el.classList.remove("busy");
    el.classList.add("pending");
    if (inner) inner.innerHTML = `<img class="avatar" src="${esc(candidate.author?.avatar || FALLBACK_AVATAR)}" alt="" loading="lazy"><span class="handle">@${esc(candidate.author?.handle || "?")}</span><span class="heart">🤍</span>`;
    setStatus(e.message || "couldn't like that post — try again", "err");
    return;
  }
  busy.delete(pos);
}

function setStatus(msg, kind) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

// ---------- board bootstrapping ----------

async function loadBoard() {
  const did = session.did;
  revealOrder = seededShuffle(did, TOTAL);
  revealedCount = getRevealedCount(did);

  for (let i = 0; i < revealedCount; i++) markRevealedInstant(revealOrder[i]);
  updateProgress();

  if (revealedCount >= TOTAL) {
    showDoneBanner();
    return;
  }

  const remaining = TOTAL - revealedCount;
  const pendingPositions = revealOrder.slice(revealedCount, revealedCount + remaining);

  setStatus("finding your moots…");
  let mutuals;
  try {
    mutuals = await getMutualDids(did);
  } catch (e) {
    setStatus("couldn't read your follow graph right now — try reloading.", "err");
    return;
  }
  if (!mutuals.length) {
    setStatus("no moots yet — you need someone who follows you and you follow back. come back once you've got some.", "");
    pendingPositions.forEach(markEmptyTile);
    return;
  }

  setStatus("checking what you've already liked…");
  let likedSet;
  try {
    likedSet = await fetchLikedUriSet(session.pdsUrl, did);
  } catch {
    likedSet = new Set();
  }

  setStatus("lining up squares…");
  const candidates = await gatherCandidates(mutuals, likedSet, remaining, did);

  pendingPositions.forEach((pos, i) => {
    if (i < candidates.length) mountPendingTile(pos, candidates[i]);
    else markEmptyTile(pos);
  });

  setStatus(
    candidates.length
      ? `${candidates.length} square${candidates.length === 1 ? "" : "s"} ready — tap one to like it and reveal.`
      : "couldn't find any fresh moot posts right now — everyone's either liked-up or quiet. check back later.",
    candidates.length ? "" : "",
  );
}

// ---------- auth ----------

function renderAuth() {
  const who = $("who");
  const signinRow = $("signinRow");
  if (session) {
    who.innerHTML = `peeking in as <span class="h">@${esc(session.handle)}</span> · <a id="signoutLink">not you? sign out</a>`;
    signinRow.style.display = "none";
    $("signoutLink").onclick = async () => {
      await clearSession();
      session = null;
      renderAuth();
      renderSkeleton();
      updateProgress();
      $("doneBanner")?.remove();
      setStatus("");
    };
  } else {
    who.textContent = "not signed in yet.";
    signinRow.style.display = "flex";
  }
}

if (window.attachHandleTypeahead) window.attachHandleTypeahead($("handle"));

$("signinBtn").addEventListener("click", async () => {
  const h = $("handle").value.trim().replace(/^@/, "");
  if (!h) return;
  $("signinBtn").disabled = true;
  try {
    await login(h);
  } catch (e) {
    setStatus(e.message || String(e), "err");
    $("signinBtn").disabled = false;
  }
});
$("handle").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("signinBtn").click();
});

// ---------- share ----------

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

function buildShareText() {
  return revealedCount >= TOTAL
    ? `I revealed the whole hidden picture on peekaboo 🫣✨ (liked every moot's post along the way) — try it: ${SITE_URL}`
    : `I've revealed ${revealedCount}/${TOTAL} squares on peekaboo by liking moots' posts I hadn't gotten to yet 🫣 ${SITE_URL}`;
}

async function buildShareCanvas() {
  const size = 900;
  const captionH = 90;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size + captionH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#191225";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const photoImg = $("photoImg");
  try {
    ctx.drawImage(photoImg, 0, 0, size, size);
  } catch {
    // hidden.svg didn't rasterize (unlikely) — still ship the caption card
  }

  const cell = size / GRID;
  const revealedSet = new Set(revealOrder.slice(0, revealedCount));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let pos = 0; pos < TOTAL; pos++) {
    if (revealedSet.has(pos)) continue;
    const row = Math.floor(pos / GRID);
    const col = pos % GRID;
    const x = col * cell;
    const y = row * cell;
    ctx.fillStyle = "rgba(24, 16, 38, 0.93)";
    ctx.fillRect(x, y, cell, cell);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.font = `${Math.round(cell * 0.32)}px sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText("🔒", x + cell / 2, y + cell / 2);
  }

  ctx.fillStyle = "#241a37";
  ctx.fillRect(0, size, size, captionH);
  ctx.textAlign = "left";
  ctx.font = "700 34px sans-serif";
  ctx.fillStyle = "#ffce54";
  ctx.fillText(`🫣 peekaboo — ${revealedCount}/${TOTAL} revealed`, 28, size + captionH / 2);

  return canvas;
}

$("shareBtn").addEventListener("click", async () => {
  const shareText = buildShareText();
  try {
    const canvas = await buildShareCanvas();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob && canShareFiles()) {
      const file = new File([blob], "peekaboo.png", { type: "image/png" });
      await navigator.share({ files: [file], text: shareText, title: "peekaboo" });
      return;
    }
    if (blob) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "peekaboo.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  } catch {
    // canvas/share failed — the compose link below still carries the URL
  }
  window.open(`https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`, "_blank", "noopener");
});

// ---------- boot ----------

(async () => {
  renderSkeleton();
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    setStatus(e.message || String(e), "err");
  }
  renderAuth();
  if (session) {
    await loadBoard();
  }
})();
