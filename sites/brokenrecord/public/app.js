import { fetchRepoRecordsWithKeys } from "./lib/car.js";
import { resolvePds } from "./lib/identity.js";
import { buildIndex, clusterAt } from "./lib/similarity.js";

const API = "https://public.api.bsky.app/xrpc/";
// Cap on how many posts get run through the full pairwise comparison —
// keeps the in-tab analysis fast even for an account with tens of thousands
// of posts. The most recent MAX_POSTS are kept (recency, not sampling), and
// the summary line says so if the cap was hit.
const MAX_POSTS = 6000;
const DEFAULT_THRESHOLD = 55;

const els = {
  form: document.getElementById("f"),
  h: document.getElementById("h"),
  go: document.getElementById("go"),
  status: document.getElementById("status"),
  sensitivity: document.getElementById("sensitivity"),
  threshold: document.getElementById("threshold"),
  thresholdVal: document.getElementById("thresholdVal"),
  summary: document.getElementById("summary"),
  results: document.getElementById("results"),
};

if (window.attachHandleTypeahead) window.attachHandleTypeahead(els.h);

let lastIndex = null; // { posts, pairs, skippedEmpty, totalRaw, truncated }
let lastProfile = null; // { did, handle, displayName, avatar }
let lastCapped = false;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function cleanHandle(raw) {
  let h = (raw || "").trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^\/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.className = "status" + (isErr ? " err" : "");
}

async function xrpc(method, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""));
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

async function resolveOne(rawHandle) {
  const handle = cleanHandle(rawHandle);
  if (!handle) throw new Error("empty handle");
  const did = handle.startsWith("did:") ? handle : (await xrpc("com.atproto.identity.resolveHandle", { handle })).did;
  const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
  return { did, handle: profile.handle || handle, displayName: profile.displayName || "", avatar: profile.avatar || "" };
}

// Fallback when the full CAR download fails (huge repo, PDS hiccup): one
// page of getAuthorFeed, same shape sites/ceemilarity and sites/didscope use
// for their lighter previews. Not the whole history, but keeps the tool
// useful instead of a dead end.
async function fetchPostsFallback(did) {
  const data = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "100" });
  const out = [];
  for (const item of data.feed || []) {
    if (item.reason) continue;
    const post = item.post;
    if (!post || !post.record || post.author?.did !== did) continue;
    out.push({ uri: post.uri, text: post.record.text || "", createdAt: post.record.createdAt || post.indexedAt });
  }
  return out;
}

async function fetchAllPosts(did, onProgress) {
  const pds = await resolvePds(did);
  if (!pds) throw new Error("no PDS found for this account");
  const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.feed.post", onProgress);
  return records.map(({ uri, value }) => ({ uri, text: value.text || "", createdAt: value.createdAt || "" }));
}

function postUrl(uri, handle) {
  const m = /^at:\/\/[^/]+\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  return m ? `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${m[1]}` : "#";
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch (_) {
    return "";
  }
}

// Shows *why* two posts matched, not just the score: bolds words in a post's
// text that also appear (case-insensitively) in `sharedSet` — the other
// side's content-word set from similarity.js's buildIndex. Walks the same
// word regex tokenize() uses in similarity.js so highlighted spans line up
// with what actually fed the TF-IDF/bigram signals, not just any substring.
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}']*/gu;
function highlightShared(rawText, sharedSet) {
  if (!sharedSet || !sharedSet.size) return esc(rawText);
  let out = "";
  let last = 0;
  let m;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(rawText))) {
    out += esc(rawText.slice(last, m.index));
    const word = m[0];
    out += sharedSet.has(word.toLowerCase()) ? `<mark>${esc(word)}</mark>` : esc(word);
    last = m.index + word.length;
  }
  out += esc(rawText.slice(last));
  return out;
}

function intersectSets(a, b) {
  const out = new Set();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

function unionSets(a, b) {
  const out = new Set(a);
  for (const x of b) out.add(x);
  return out;
}

function postCardHtml(post, handle, matchScore, sharedSet) {
  return `
    <a class="post-card" href="${postUrl(post.uri, handle)}" target="_blank" rel="noopener">
      <div class="post-text">${highlightShared(post.text, sharedSet)}</div>
      <div class="post-meta">
        <span>${esc(fmtDate(post.createdAt))}</span>
        ${matchScore != null ? `<span class="other-score">${matchScore}% vs the pair</span>` : "<span></span>"}
      </div>
    </a>`;
}

function clusterHtml(cluster, rank, handle) {
  const [a, b] = cluster.pair;
  const sharedAB = intersectSets(a.contentSet, b.contentSet);
  const pairUnion = unionSets(a.contentSet, b.contentSet);
  const othersHtml = cluster.others.length
    ? `<div class="others-label">also echoed in this cluster${cluster.size > 2 + cluster.others.length ? ` (top ${cluster.others.length} of ${cluster.size - 2} more)` : ""}</div>${cluster.others.map((o) => postCardHtml(o.post, handle, o.score, intersectSets(o.post.contentSet, pairUnion))).join("")}`
    : "";
  return `
    <div class="cluster">
      <div class="cluster-head">
        <span class="cluster-rank">cluster #${rank}</span>
        <span class="cluster-score">${cluster.strongestScore}% match</span>
        <span class="cluster-size">${cluster.size} posts in this group</span>
      </div>
      <div class="pair-wrap">
        ${postCardHtml(a, handle, null, sharedAB)}
        <div class="vs-line">↕ strongest pair in this cluster — shared words highlighted</div>
        ${postCardHtml(b, handle, null, sharedAB)}
      </div>
      ${othersHtml}
    </div>`;
}

function renderClusters(clusters, handle) {
  if (!clusters.length) {
    els.results.innerHTML = `<div class="empty">no echoes at this sensitivity — try lowering the slider, or @${esc(handle)} just doesn't repeat themselves much.</div>`;
    els.results.classList.add("show");
    return;
  }
  els.results.innerHTML = clusters.map((c, i) => clusterHtml(c, i + 1, handle)).join("") + shareSectionHtml();
  els.results.classList.add("show");
  wireShare(clusters[0], handle);
}

function shareSectionHtml() {
  return `
    <div class="cluster share">
      <canvas id="shareCanvas" width="1200" height="630"></canvas>
      <div class="share-actions">
        <button class="shareNative" type="button" style="display:none;border:none;">📤 share card</button>
        <a class="shareBluesky" target="_blank" rel="noopener">🦋 share the top echo</a>
        <button class="shareDownload" type="button">⬇ download card</button>
      </div>
    </div>`;
}

function shareUrlFor(handle) {
  return "https://brokenrecord.bisks.net/s/" + encodeURIComponent(handle);
}

function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function buildShareText(handle, topCluster) {
  const url = shareUrlFor(handle);
  const headline = `checked @${handle} on brokenrecord: strongest self-echo scores ${topCluster.strongestScore}% across ${topCluster.size} posts.`;
  let text = `${headline}\n\n${url}`;
  if (text.length > 300) text = `${headline}\n${url}`;
  if (text.length > 300) text = text.slice(0, 296) + "…";
  return text;
}

function loadImg(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function buildShareCard(canvas, handle, avatar, topCluster) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "ui-monospace, monospace";
  const av = await loadImg(avatar);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0a0908";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.1, -H * 0.1, 0, W * 0.1, -H * 0.1, W * 0.5);
  glow.addColorStop(0, "#3a1608");
  glow.addColorStop(1, "rgba(10,9,8,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ff5c3d";
  ctx.font = `800 46px ${mono}`;
  ctx.fillText("brokenrecord", 56, 84);

  if (av) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(96, 150, 34, 0, Math.PI * 2);
    ctx.closePath();
    ctx.strokeStyle = "#ffd23f";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.clip();
    ctx.drawImage(av, 62, 116, 68, 68);
    ctx.restore();
  }
  ctx.fillStyle = "#f5efe6";
  ctx.font = `700 24px ${mono}`;
  ctx.fillText("@" + handle, 148, 158);
  ctx.fillStyle = "#a89a86";
  ctx.font = `400 16px ${mono}`;
  ctx.fillText(`${topCluster.size} posts in the strongest echo cluster`, 148, 184);

  const cardX = 56, cardY = 230, cardW = W - 112, cardH = H - 300;
  ctx.fillStyle = "#17130f";
  ctx.strokeStyle = "#332a1f";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 18);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd23f";
  ctx.font = `800 90px ${mono}`;
  ctx.fillText(`${topCluster.strongestScore}%`, cardX + cardW / 2, cardY + 110);
  ctx.fillStyle = "#a89a86";
  ctx.font = `700 18px ${mono}`;
  ctx.fillText("SELF-ECHO MATCH", cardX + cardW / 2, cardY + 148);

  ctx.textAlign = "left";
  ctx.font = `400 18px ${mono}`;
  ctx.fillStyle = "#f5efe6";
  const wrapAndDraw = (text, x, y, maxChars, lineH, maxLines) => {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (line && test.length > maxChars) { lines.push(line); line = w; } else line = test;
      if (lines.length >= maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
    return lines.length;
  };
  const [a, b] = topCluster.pair;
  ctx.fillStyle = "#ffd23f";
  ctx.font = `700 14px ${mono}`;
  ctx.fillText(`"`, cardX + 40, cardY + 190);
  ctx.fillStyle = "#f5efe6";
  ctx.font = `400 19px ${mono}`;
  wrapAndDraw(a.text, cardX + 40, cardY + 210, 46, 26, 2);
  ctx.fillStyle = "#a89a86";
  ctx.font = `400 15px ${mono}`;
  ctx.fillText("↕", cardX + cardW / 2 - 6, cardY + 275);
  ctx.fillStyle = "#f5efe6";
  ctx.font = `400 19px ${mono}`;
  wrapAndDraw(b.text, cardX + 40, cardY + 305, 46, 26, 2);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ff5c3d";
  ctx.font = `700 20px ${mono}`;
  ctx.fillText("brokenrecord.bisks.net", 56, H - 40);
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}

function wireShare(topCluster, handle) {
  const canvas = document.getElementById("shareCanvas");
  const shareBluesky = document.querySelector(".shareBluesky");
  const shareDownload = document.querySelector(".shareDownload");
  const shareNative = document.querySelector(".shareNative");
  if (!canvas) return;

  const shareText = buildShareText(handle, topCluster);
  shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

  buildShareCard(canvas, handle, lastProfile && lastProfile.avatar, topCluster);

  shareDownload.addEventListener("click", () => {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `brokenrecord-${handle}.png`.replace(/[^a-z0-9.-]/gi, "_");
      link.click();
      URL.revokeObjectURL(link.href);
    }, "image/png");
  });

  if (canShareFiles()) {
    shareNative.style.display = "";
    shareNative.addEventListener("click", () => {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "brokenrecord.png", { type: "image/png" });
        try { await navigator.share({ files: [file], text: shareText, title: "brokenrecord" }); } catch (_) {}
      }, "image/png");
    });
  }
}

function updateSummary(handle) {
  if (!lastIndex) return;
  const t = Number(els.threshold.value);
  const clusters = clusterAt(lastIndex, t);
  const capNote = lastCapped ? ` (most recent ${MAX_POSTS} of ${lastIndex.totalRaw} posts analyzed)` : "";
  const truncNote = lastIndex.truncated ? " — vocabulary was broad enough that some low-confidence matches were dropped for speed" : "";
  els.summary.textContent = clusters.length
    ? `analyzed ${lastIndex.posts.length} posts${capNote} — found ${clusters.length} echo cluster${clusters.length === 1 ? "" : "s"} at ${t}% sensitivity${truncNote}.`
    : `analyzed ${lastIndex.posts.length} posts${capNote} — nothing matched at ${t}% sensitivity${truncNote}.`;
  renderClusters(clusters, handle);
}

els.threshold.addEventListener("input", () => {
  els.thresholdVal.textContent = els.threshold.value + "%";
  if (lastIndex) updateSummary(lastProfile.handle);
});

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = els.h.value;
  const handle = cleanHandle(raw);
  if (!handle) { setStatus("enter a handle.", true); return; }

  els.go.disabled = true;
  els.results.classList.remove("show");
  els.results.innerHTML = "";
  els.sensitivity.classList.remove("show");
  els.summary.textContent = "";
  lastIndex = null;
  lastCapped = false;
  setStatus("resolving handle...");

  try {
    const profile = await resolveOne(raw);
    lastProfile = profile;

    let posts;
    try {
      setStatus(`downloading @${profile.handle}'s full repo...`);
      posts = await fetchAllPosts(profile.did, (msg) => setStatus(msg));
    } catch (err) {
      setStatus(`couldn't download the full repo (${err.message || err}) — falling back to a recent sample...`);
      posts = await fetchPostsFallback(profile.did);
    }

    if (posts.length > MAX_POSTS) {
      posts = posts
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, MAX_POSTS);
      lastCapped = true;
    }

    if (posts.length < 2) {
      setStatus(`@${profile.handle} doesn't have enough posts to compare.`, true);
      els.go.disabled = false;
      return;
    }

    lastIndex = await buildIndex(posts, (msg) => setStatus(msg));

    els.threshold.value = String(DEFAULT_THRESHOLD);
    els.thresholdVal.textContent = DEFAULT_THRESHOLD + "%";
    els.sensitivity.classList.add("show");
    setStatus("");
    updateSummary(profile.handle);
  } catch (err) {
    setStatus(`couldn't do that: ${err.message || err}`, true);
  } finally {
    els.go.disabled = false;
  }
});

// Deep-link support: brokenrecord.bisks.net/?h=some.handle auto-runs.
const params = new URLSearchParams(location.search);
const prefill = params.get("h");
if (prefill) {
  els.h.value = prefill;
  els.form.dispatchEvent(new Event("submit", { cancelable: true }));
}
