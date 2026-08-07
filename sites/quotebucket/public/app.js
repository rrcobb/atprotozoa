// quotebucket — a crow sorts @norvid-studies.bsky.social's quote-posts into
// a bucket, which tips over every 24 hours. Everything here reads Bluesky's
// public, anonymous AppView (api.bsky.app, CORS *) client-side, same as
// sites/biskshow's lib/pool.js.
//
// The "day" is a fixed UTC midnight-to-midnight window (periodStart /
// nextTip below), computed the same way from the clock alone — no shared
// server state needed for every visitor to agree on the same bucket count
// and the same countdown.

const PUB = "https://api.bsky.app/xrpc";
const ACTOR = "norvid-studies.bsky.social";
const POLL_MS = 25_000;
const SCAN_PAGE_LIMIT = 100;
const SCAN_MAX_PAGES = 10; // ~1000 posts of lookback — plenty for one day
const PILE_VISIBLE_CAP = 14;

const els = {
  skyField: document.getElementById("skyField"),
  crow: document.getElementById("crow"),
  bucket: document.getElementById("bucket"),
  pile: document.getElementById("pile"),
  pileCount: document.getElementById("pileCount"),
  statCount: document.getElementById("statCount"),
  statCountdown: document.getElementById("statCountdown"),
  statLast: document.getElementById("statLast"),
  status: document.getElementById("status"),
  shareBtn: document.getElementById("shareBtn"),
  log: document.getElementById("log"),
  scene: document.getElementById("scene"),
};

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

async function resolveDid(handle) {
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  return d.did;
}

async function fetchFeedPage(did, cursor) {
  const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
  u.searchParams.set("actor", did);
  u.searchParams.set("limit", String(SCAN_PAGE_LIMIT));
  if (cursor) u.searchParams.set("cursor", cursor);
  return jget(u.toString());
}

// A "quote" is a post authored by norvid (not a repost of someone else's
// post) whose raw record embeds another record — app.bsky.embed.record for
// a bare quote, app.bsky.embed.recordWithMedia for a quote plus image/video.
function isQuote(item, did) {
  if (item.reason) return false; // a repost surfaced in their feed, not authored by them
  if (!item.post || item.post.author?.did !== did) return false;
  const embed = item.post.record && item.post.record.embed;
  if (!embed || !embed.$type) return false;
  return embed.$type === "app.bsky.embed.record" || embed.$type === "app.bsky.embed.recordWithMedia";
}

function postUrl(item, handle) {
  const rkey = (item.post.uri || "").split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function periodStart(t) {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ── state ──────────────────────────────────────────────────────────────
let did = null;
let handle = ACTOR;
let periodStartMs = periodStart(Date.now());
let nextTipMs = periodStartMs + 86_400_000;
let count = 0;
let seenUris = new Set();
let quotesToday = []; // {uri, text, indexedAt} newest last
let tipping = false;
let ready = false;

// ── ambient floating bisks (decorative, not tied 1:1 to the count) ──────
const FLOAT_COUNT = 7;
function spawnFloatingField() {
  els.skyField.innerHTML = "";
  const w = els.scene.clientWidth || 600;
  for (let i = 0; i < FLOAT_COUNT; i++) {
    const b = document.createElement("div");
    b.className = "bisk floating";
    b.style.left = `${20 + Math.random() * (w - 60)}px`;
    b.style.top = `${20 + Math.random() * 120}px`;
    b.style.animationDuration = `${5 + Math.random() * 3}s`;
    b.style.animationDelay = `${-Math.random() * 6}s`;
    els.skyField.appendChild(b);
  }
}

function randomFloater() {
  const kids = els.skyField.querySelectorAll(".bisk.floating");
  if (!kids.length) return null;
  return kids[Math.floor(Math.random() * kids.length)];
}

// ── pile inside the bucket ───────────────────────────────────────────────
function renderPile() {
  els.pile.innerHTML = "";
  const visible = Math.min(count, PILE_VISIBLE_CAP);
  for (let i = 0; i < visible; i++) {
    const b = document.createElement("div");
    b.className = "bisk";
    b.style.position = "absolute";
    const row = Math.floor(i / 5);
    const col = i % 5;
    b.style.left = `${col * 10}px`;
    b.style.bottom = `${row * 8}px`;
    els.pile.appendChild(b);
  }
  els.pileCount.textContent = count > PILE_VISIBLE_CAP ? `+${count - PILE_VISIBLE_CAP} more` : "";
}

function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function updateStats() {
  els.statCount.textContent = String(count);
  const remain = nextTipMs - Date.now();
  els.statCountdown.textContent = fmtClock(remain);
  updateShare();
}

function updateShare() {
  const remain = fmtClock(nextTipMs - Date.now());
  const text =
    count === 0
      ? `The quotebucket crow is still waiting on @norvid-studies.bsky.social to quote something today. Tips in ${remain}. https://quotebucket.bisks.net/`
      : `The crow has sorted ${count} bisk${count === 1 ? "" : "s"} from @norvid-studies.bsky.social's quote-posts today. Bucket tips in ${remain}. https://quotebucket.bisks.net/`;
  els.shareBtn.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
}

function prependLog(item) {
  const empty = els.log.querySelector(".empty");
  if (empty) empty.remove();
  const li = document.createElement("li");
  const t = new Date(item.indexedAt);
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mm = String(t.getUTCMinutes()).padStart(2, "0");
  const text = (item.text || "(no caption)").replace(/\s+/g, " ").trim();
  const snippet = text.length > 90 ? text.slice(0, 89).trimEnd() + "…" : text;
  li.innerHTML = `<span class="t">${hh}:${mm}z</span> <a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(snippet)}</a>`;
  els.log.insertBefore(li, els.log.firstChild);
  while (els.log.children.length > 8) els.log.removeChild(els.log.lastChild);
}

function clearLog(message) {
  els.log.innerHTML = `<li class="empty">${esc(message)}</li>`;
}

// ── crow + bisk animation ────────────────────────────────────────────────
function sceneRect() {
  return els.scene.getBoundingClientRect();
}

async function playSort(item) {
  const floater = randomFloater();
  const sr = sceneRect();
  const bucketRect = els.bucket.getBoundingClientRect();
  const bucketX = bucketRect.left - sr.left + bucketRect.width / 2 - 15;
  const bucketY = bucketRect.top - sr.top + 10;

  els.status.textContent = "the crow spots one…";

  // crow hops up into the sky (a fixed CSS keyframe arc, not pixel-matched
  // to the bisk it's "grabbing" — just a flourish)
  els.crow.classList.add("hop");
  await sleep(560);

  // the picked floater (or a fresh bisk) flies down into the bucket
  let flying;
  if (floater) {
    flying = floater;
    flying.classList.remove("floating");
  } else {
    flying = document.createElement("div");
    flying.className = "bisk";
    const w = els.scene.clientWidth || 600;
    flying.style.left = `${20 + Math.random() * (w - 60)}px`;
    flying.style.top = `${20 + Math.random() * 120}px`;
    els.skyField.appendChild(flying);
  }
  flying.classList.add("flying");
  flying.style.left = `${bucketX}px`;
  flying.style.top = `${bucketY}px`;
  flying.style.transform = "scale(0.4)";
  flying.style.opacity = "0";

  // crow returns to its perch
  await sleep(560);
  els.crow.classList.remove("hop");
  flying.remove();

  // replace the floater so the ambient field stays populated
  if (floater) {
    const b = document.createElement("div");
    b.className = "bisk floating";
    const w = els.scene.clientWidth || 600;
    b.style.left = `${20 + Math.random() * (w - 60)}px`;
    b.style.top = `${20 + Math.random() * 120}px`;
    b.style.animationDuration = `${5 + Math.random() * 3}s`;
    els.skyField.appendChild(b);
  }

  count += 1;
  renderPile();
  updateStats();
  prependLog(item);
  els.status.textContent = "sorted. back to watching the sky…";
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function tip() {
  if (tipping) return;
  tipping = true;
  els.status.textContent = "the bucket tips over…";
  els.bucket.classList.add("tipping");
  const dumped = count;

  // pile bisks tumble out
  const kids = Array.from(els.pile.children);
  kids.forEach((k, i) => {
    setTimeout(() => {
      k.style.transform = `translate(${(Math.random() - 0.5) * 120}px, ${60 + Math.random() * 40}px) rotate(${(Math.random() - 0.5) * 240}deg)`;
      k.style.opacity = "0";
    }, i * 30);
  });

  await sleep(900);
  els.bucket.classList.remove("tipping");
  count = 0;
  quotesToday = [];
  seenUris.clear();
  renderPile();
  clearLog("nothing sorted yet — first quote of the new day fills this in.");
  els.statLast.textContent = `${dumped} bisk${dumped === 1 ? "" : "s"}`;

  periodStartMs = nextTipMs;
  nextTipMs = periodStartMs + 86_400_000;
  updateStats();
  els.status.textContent = "bucket's empty. watching the sky…";
  tipping = false;
}

// ── initial scan: count today's quotes without re-animating each one ─────
async function initialScan() {
  els.status.textContent = "checking what norvid's quoted today…";
  let cursor;
  let pages = 0;
  const found = [];
  outer: while (pages < SCAN_MAX_PAGES) {
    let page;
    try {
      page = await fetchFeedPage(did, cursor);
    } catch {
      break;
    }
    const items = page.feed || [];
    for (const item of items) {
      const when = new Date(item.post.indexedAt).getTime();
      if (when < periodStartMs) break outer;
      if (isQuote(item, did)) {
        found.push({
          uri: item.post.uri,
          indexedAt: item.post.indexedAt,
          text: item.post.record.text,
          url: postUrl(item, handle),
        });
      }
    }
    cursor = page.cursor;
    pages += 1;
    if (!cursor || !items.length) break;
  }

  found.reverse(); // oldest first
  for (const q of found) {
    seenUris.add(q.uri);
    quotesToday.push(q);
  }
  count = found.length;
  renderPile();
  updateStats();
  if (found.length) {
    for (const q of found) prependLog(q);
    els.status.textContent = "caught up. watching for the next one…";
  } else {
    els.status.textContent = "nothing yet today. watching the sky…";
  }
}

async function pollForNew() {
  if (!did || tipping) return;
  let page;
  try {
    page = await fetchFeedPage(did);
  } catch {
    return;
  }
  const items = (page.feed || []).filter((item) => {
    const when = new Date(item.post.indexedAt).getTime();
    return when >= periodStartMs && isQuote(item, did) && !seenUris.has(item.post.uri);
  });
  if (!items.length) return;

  items.sort((a, b) => new Date(a.post.indexedAt) - new Date(b.post.indexedAt));
  for (const item of items) {
    if (seenUris.has(item.post.uri)) continue;
    seenUris.add(item.post.uri);
    const q = { uri: item.post.uri, indexedAt: item.post.indexedAt, text: item.post.record.text, url: postUrl(item, handle) };
    quotesToday.push(q);
    await playSort(q);
    await sleep(300);
  }
}

function tickClock() {
  updateStats();
  if (ready && !tipping && Date.now() >= nextTipMs) tip();
}

async function boot() {
  spawnFloatingField();
  window.addEventListener("resize", spawnFloatingField);
  try {
    did = await resolveDid(ACTOR);
  } catch {
    els.status.textContent = "couldn't reach the AppView — retrying…";
    setTimeout(boot, 8000);
    return;
  }
  await initialScan();
  ready = true;
  setInterval(tickClock, 1000);
  setInterval(pollForNew, POLL_MS);
  pollForNew();
}

boot();
