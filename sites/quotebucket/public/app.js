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
const HISTORY_SCAN_MAX_PAGES = 40; // a deliberate lookup, not a poll — worth digging further
const PILE_VISIBLE_CAP = 14;

const els = {
  skyField: document.getElementById("skyField"),
  crow: document.getElementById("crow"),
  bucket: document.getElementById("bucket"),
  pile: document.getElementById("pile"),
  pileCount: document.getElementById("pileCount"),
  statCount: document.getElementById("statCount"),
  statCountLabel: document.getElementById("statCountLabel"),
  statCountdown: document.getElementById("statCountdown"),
  statCountdownLabel: document.getElementById("statCountdownLabel"),
  statLast: document.getElementById("statLast"),
  status: document.getElementById("status"),
  shareBtn: document.getElementById("shareBtn"),
  log: document.getElementById("log"),
  scene: document.getElementById("scene"),
  dayPrev: document.getElementById("dayPrev"),
  dayNext: document.getElementById("dayNext"),
  dayPicker: document.getElementById("dayPicker"),
  dayLive: document.getElementById("dayLive"),
  replayRow: document.getElementById("replayRow"),
  replayBtn: document.getElementById("replayBtn"),
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

function isoDateForPeriodStart(ps) {
  const d = new Date(ps);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function periodStartForDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
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

// ── time machine: browsing a past day instead of the live bucket ────────
let liveMode = true;
let viewedPeriodStart = periodStartMs; // only meaningful when !liveMode
let replaying = false;
const historyCache = new Map(); // periodStartMs -> {quotes, truncated}

function currentViewedPeriodStart() {
  return liveMode ? periodStartMs : viewedPeriodStart;
}

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
  if (liveMode) {
    const remain = nextTipMs - Date.now();
    els.statCountdown.textContent = fmtClock(remain);
  } else {
    els.statCountdown.textContent = "tipped";
  }
  updateShare();
}

function updateLabels() {
  els.statCountLabel.textContent = liveMode ? "sorted today" : "sorted that day";
  els.statCountdownLabel.textContent = liveMode ? "until it tips" : "that day's spill";
}

function updateShare() {
  if (liveMode) {
    const remain = fmtClock(nextTipMs - Date.now());
    const text =
      count === 0
        ? `The quotebucket crow is still waiting on @norvid-studies.bsky.social to quote something today. Tips in ${remain}. https://quotebucket.bisks.net/`
        : `The crow has sorted ${count} bisk${count === 1 ? "" : "s"} from @norvid-studies.bsky.social's quote-posts today. Bucket tips in ${remain}. https://quotebucket.bisks.net/`;
    els.shareBtn.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
  } else {
    const label = isoDateForPeriodStart(viewedPeriodStart);
    const text =
      count === 0
        ? `On ${label}, the quotebucket crow found nothing from @norvid-studies.bsky.social to sort. https://quotebucket.bisks.net/`
        : `On ${label}, the crow sorted ${count} bisk${count === 1 ? "" : "s"} from @norvid-studies.bsky.social's quote-posts before the bucket tipped. https://quotebucket.bisks.net/`;
    els.shareBtn.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
  }
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

// the visual tip alone — bisks tumbling out of the pile — with no state
// changes, so it can be replayed for a past day without touching the live
// bucket's count or clock.
async function playTipAnimation() {
  els.bucket.classList.add("tipping");
  const kids = Array.from(els.pile.children);
  kids.forEach((k, i) => {
    setTimeout(() => {
      k.style.transform = `translate(${(Math.random() - 0.5) * 120}px, ${60 + Math.random() * 40}px) rotate(${(Math.random() - 0.5) * 240}deg)`;
      k.style.opacity = "0";
    }, i * 30);
  });
  await sleep(900);
  els.bucket.classList.remove("tipping");
}

async function tip() {
  if (tipping) return;
  tipping = true;
  els.status.textContent = "the bucket tips over…";
  const dumped = count;

  await playTipAnimation();
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

// ── scan norvid's feed for quotes inside a [startMs, endMs) window ───────
// Walks pages newest-first; stops once it passes the window's start (older
// posts can't matter anymore) or the page budget runs out. Shared by the
// live "today so far" scan and the history browser below.
async function scanWindow(startMs, endMs, maxPages) {
  let cursor;
  let pages = 0;
  const found = [];
  let reachedStart = false;
  outer: while (pages < maxPages) {
    let page;
    try {
      page = await fetchFeedPage(did, cursor);
    } catch {
      break;
    }
    const items = page.feed || [];
    for (const item of items) {
      const when = new Date(item.post.indexedAt).getTime();
      if (when < startMs) {
        reachedStart = true;
        break outer;
      }
      if (when >= endMs) continue; // newer than the window we care about
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
    if (!cursor || !items.length) {
      reachedStart = true;
      break;
    }
  }
  found.reverse(); // oldest first
  return { quotes: found, truncated: !reachedStart };
}

// ── initial scan: count today's quotes without re-animating each one ─────
async function initialScan() {
  els.status.textContent = "checking what norvid's quoted today…";
  const { quotes } = await scanWindow(periodStartMs, Infinity, SCAN_MAX_PAGES);
  quotesToday = quotes;
  seenUris = new Set(quotes.map((q) => q.uri));
  count = quotes.length;
  renderPile();
  updateStats();
  if (quotes.length) {
    for (const q of quotes) prependLog(q);
    els.status.textContent = "caught up. watching for the next one…";
  } else {
    els.status.textContent = "nothing yet today. watching the sky…";
  }
}

// ── time machine: jump to a past (or back to the live) day ──────────────
function refreshNavUi() {
  const ps = currentViewedPeriodStart();
  const today0 = periodStart(Date.now());
  els.dayPicker.value = isoDateForPeriodStart(ps);
  els.dayPrev.disabled = replaying;
  els.dayNext.disabled = replaying || ps >= today0;
  els.dayPicker.disabled = replaying;
  els.dayLive.disabled = replaying || liveMode;
  els.dayLive.classList.toggle("active", liveMode);
}

function updateReplayUi() {
  els.replayRow.hidden = liveMode;
  if (!liveMode) els.replayBtn.disabled = replaying || quotesToday.length === 0;
}

async function goToDay(ps) {
  if (replaying || !did) return;
  const today0 = periodStart(Date.now());
  if (ps > today0) ps = today0;

  if (ps === today0) {
    if (!liveMode) {
      liveMode = true;
      periodStartMs = ps;
      nextTipMs = periodStartMs + 86_400_000;
      updateLabels();
      refreshNavUi();
      updateReplayUi();
      await initialScan();
    }
    return;
  }

  liveMode = false;
  viewedPeriodStart = ps;
  updateLabels();
  refreshNavUi();
  count = 0;
  quotesToday = [];
  seenUris = new Set();
  renderPile();
  clearLog("flipping back through the sky…");
  updateStats();
  updateReplayUi();
  els.status.textContent = "checking what norvid quoted that day…";

  const pe = ps + 86_400_000;
  let entry = historyCache.get(ps);
  if (!entry) {
    entry = await scanWindow(ps, pe, HISTORY_SCAN_MAX_PAGES);
    historyCache.set(ps, entry);
  }
  if (liveMode || currentViewedPeriodStart() !== ps) return; // user moved on while this was loading

  quotesToday = entry.quotes;
  seenUris = new Set(quotesToday.map((q) => q.uri));
  count = quotesToday.length;
  renderPile();
  if (quotesToday.length) {
    clearLog("");
    for (const q of quotesToday) prependLog(q);
  } else {
    clearLog("quiet day — the crow never moved.");
  }
  updateStats();
  updateReplayUi();
  els.status.textContent = entry.truncated
    ? "found some — but couldn't scroll back far enough to be sure that's everything."
    : quotesToday.length
    ? `that day's spill: ${quotesToday.length} bisk${quotesToday.length === 1 ? "" : "s"}. tap replay to watch it.`
    : "no quotes that day.";
}

async function playReplay() {
  if (replaying || liveMode || !quotesToday.length) return;
  const toPlay = quotesToday.slice();
  const dayPs = viewedPeriodStart;
  replaying = true;
  refreshNavUi();
  updateReplayUi();
  els.replayBtn.textContent = "replaying…";
  count = 0;
  renderPile();
  clearLog("");
  els.status.textContent = "watching the crow work through that day…";

  for (const q of toPlay) {
    if (liveMode || viewedPeriodStart !== dayPs) break; // user navigated away mid-replay
    await playSort(q);
    await sleep(180);
  }

  if (!liveMode && viewedPeriodStart === dayPs) {
    await sleep(500);
    els.status.textContent = "the bucket tips…";
    await playTipAnimation();
    quotesToday = toPlay;
    seenUris = new Set(toPlay.map((q) => q.uri));
    count = 0;
    renderPile();
    clearLog(toPlay.length ? "" : "quiet day — the crow never moved.");
    for (const q of toPlay) prependLog(q);
    updateStats();
    els.status.textContent = `that's the whole spill — ${toPlay.length} bisk${toPlay.length === 1 ? "" : "s"}.`;
  }

  replaying = false;
  els.replayBtn.textContent = "▶ replay the spill";
  refreshNavUi();
  updateReplayUi();
}

async function pollForNew() {
  if (!did || tipping || !liveMode) return;
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
  if (!liveMode) return;
  updateStats();
  if (ready && !tipping && Date.now() >= nextTipMs) tip();
}

function setupTimeMachine() {
  els.dayPicker.max = isoDateForPeriodStart(periodStart(Date.now()));
  els.dayPrev.addEventListener("click", () => goToDay(currentViewedPeriodStart() - 86_400_000));
  els.dayNext.addEventListener("click", () => goToDay(currentViewedPeriodStart() + 86_400_000));
  els.dayLive.addEventListener("click", () => goToDay(periodStart(Date.now())));
  els.dayPicker.addEventListener("change", () => {
    if (!els.dayPicker.value) return;
    goToDay(periodStartForDateStr(els.dayPicker.value));
  });
  els.replayBtn.addEventListener("click", playReplay);
  updateLabels();
  refreshNavUi();
  updateReplayUi();
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

setupTimeMachine();
boot();
