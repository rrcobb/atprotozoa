import { moots } from "./lib/cluster.js";
import { fetchPosts, extractFeatures, compare, MIN_POSTS } from "./lib/twin.js";

const els = {
  form: document.getElementById("searchForm"),
  input: document.getElementById("handleInput"),
  genBtn: document.getElementById("genBtn"),
  status: document.getElementById("status"),
  results: document.getElementById("results"),
  clusterMeta: document.getElementById("clusterMeta"),
  twinWho: document.getElementById("twinWho"),
  twinScore: document.getElementById("twinScore"),
  twinAxes: document.getElementById("twinAxes"),
  twinNote: document.getElementById("twinNote"),
  antiWho: document.getElementById("antiWho"),
  antiScore: document.getElementById("antiScore"),
  antiAxes: document.getElementById("antiAxes"),
  antiNote: document.getElementById("antiNote"),
  leaderboard: document.getElementById("leaderboard"),
  graphicWrap: document.getElementById("graphicWrap"),
  canvas: document.getElementById("graphic"),
  shareRow: document.getElementById("shareRow"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareDownload: document.getElementById("shareDownload"),
  shareNative: document.getElementById("shareNative"),
};

const MONO = "ui-monospace, monospace";
const POOL_CAP = 16; // bounds how many mutuals' feeds get fetched
const CONCURRENCY = 4;
const AXIS_LABELS = { vocabulary: "words", hashtags: "tags", style: "style", rhythm: "rhythm" };
const TINTS = ["#1a5fd0", "#1f8a4c", "#d81e6a", "#e0a400", "#8e44ad", "#c0392b", "#0f9b9b", "#e2711d"];

let lastResult = null;
let lastShareText = "";

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

function short(h) {
  return "@" + String(h || "").replace(/\.bsky\.social$/, "");
}
function initials(p) {
  return (p.displayName || p.handle || "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
}
function tintFor(did) {
  let h = 0;
  for (const c of did || "x") h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return TINTS[h % TINTS.length];
}
function avEl(p, size) {
  const d = document.createElement("div");
  d.className = "av";
  d.style.width = d.style.height = size + "px";
  d.style.fontSize = Math.round(size * 0.36) + "px";
  if (p.avatar) d.style.backgroundImage = `url("${p.avatar}")`;
  else { d.style.background = tintFor(p.did); d.textContent = initials(p); }
  return d;
}

async function runPool(items, worker, limit) {
  const out = new Array(items.length);
  let idx = 0;
  async function lane() {
    while (idx < items.length) {
      const i = idx++;
      try { out[i] = await worker(items[i], i); } catch { out[i] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}

function axisRow(container, key, value) {
  const row = document.createElement("div");
  row.className = "axisrow" + (value === null ? " na" : "");
  const lbl = document.createElement("div"); lbl.className = "lbl"; lbl.textContent = AXIS_LABELS[key] || key;
  const bar = document.createElement("div"); bar.className = "axisbar";
  const fill = document.createElement("div"); fill.style.width = (value === null ? 0 : Math.round(value * 100)) + "%";
  bar.appendChild(fill);
  const val = document.createElement("div"); val.className = "val";
  val.textContent = value === null ? "n/a" : Math.round(value * 100) + "%";
  row.append(lbl, bar, val);
  container.appendChild(row);
}

function chips(container, label, words) {
  if (!words.length) return;
  const note = document.createElement("div");
  note.innerHTML = `<b>${label}</b>`;
  const row = document.createElement("div"); row.className = "chips";
  for (const w of words) {
    const c = document.createElement("span"); c.className = "chip"; c.textContent = w;
    row.appendChild(c);
  }
  note.appendChild(row);
  container.appendChild(note);
}

function twinVerdict(score) {
  if (score >= 70) return "basically the same account, different account.";
  if (score >= 50) return "eerily aligned, for two separate people.";
  if (score >= 30) return "compatible, in the way most of your cluster is compatible.";
  return "your closest match — and it's still not that close.";
}
function antiVerdict(score) {
  if (score <= 15) return "different species of poster.";
  if (score <= 30) return "barely overlapping timelines.";
  return "your most-opposite match — relatively speaking, since everyone here follows each other.";
}

function renderMatch(kind, entry, selfFeat) {
  const who = els[kind + "Who"], scoreEl = els[kind + "Score"], axesEl = els[kind + "Axes"], noteEl = els[kind + "Note"];
  who.innerHTML = "";
  who.appendChild(avEl(entry.profile, 44));
  const t = document.createElement("div"); t.className = "whotext";
  const dn = document.createElement("div"); dn.className = "dn"; dn.textContent = entry.profile.displayName || entry.profile.handle;
  const hn = document.createElement("div"); hn.className = "hn"; hn.textContent = short(entry.profile.handle);
  t.append(dn, hn); who.appendChild(t);

  scoreEl.textContent = entry.match.score + "%";
  axesEl.innerHTML = "";
  for (const a of entry.match.axes) axisRow(axesEl, a.key, a.value);

  noteEl.innerHTML = "";
  if (kind === "twin") {
    const p = document.createElement("p"); p.style.margin = "0 0 4px"; p.textContent = twinVerdict(entry.match.score);
    noteEl.appendChild(p);
    chips(noteEl, "you both say", entry.match.sharedWords);
    chips(noteEl, "shared hashtags", entry.match.sharedTags.map((t) => "#" + t));
  } else {
    const p = document.createElement("p"); p.style.margin = "0 0 4px"; p.textContent = antiVerdict(entry.match.score);
    noteEl.appendChild(p);
    const styleLine = document.createElement("div");
    styleLine.style.marginBottom = "6px";
    styleLine.innerHTML =
      `<b>style</b>: you avg ${Math.round(selfFeat.avgLength)} chars/post vs their ${Math.round(entry.feat.avgLength)} · ` +
      `${Math.round(selfFeat.replyRatio * 100)}% replies vs ${Math.round(entry.feat.replyRatio * 100)}%`;
    noteEl.appendChild(styleLine);
    chips(noteEl, "only you say", entry.match.onlyYou);
    chips(noteEl, "only they say", entry.match.onlyThem);
  }
}

function renderLeaderboard(scored, skipped) {
  els.leaderboard.innerHTML = "";
  scored.forEach((entry, i) => {
    const row = document.createElement("div"); row.className = "lbrow";
    const rank = document.createElement("div"); rank.className = "rank"; rank.textContent = "#" + (i + 1);
    const av = avEl(entry.profile, 22); av.className = "avmini";
    if (entry.profile.avatar) av.style.backgroundImage = `url("${entry.profile.avatar}")`;
    else av.style.background = tintFor(entry.profile.did);
    av.textContent = entry.profile.avatar ? "" : initials(entry.profile);
    const h = document.createElement("div"); h.className = "h"; h.textContent = entry.profile.displayName || short(entry.profile.handle);
    const sc = document.createElement("div"); sc.className = "sc"; sc.textContent = entry.match.score + "%";
    row.append(rank, av, h, sc);
    els.leaderboard.appendChild(row);
  });
  for (const p of skipped) {
    const row = document.createElement("div"); row.className = "lbrow skip";
    const rank = document.createElement("div"); rank.className = "rank"; rank.textContent = "—";
    const av = avEl(p, 22); av.className = "avmini";
    const h = document.createElement("div"); h.className = "h"; h.textContent = (p.displayName || short(p.handle)) + " (too few posts to score)";
    const sc = document.createElement("div"); sc.className = "sc"; sc.textContent = "—";
    row.append(rank, av, h, sc);
    els.leaderboard.appendChild(row);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawResultPanel(ctx, { x, y, w, h, kicker, score, handle, note, positive }) {
  const glow = positive ? "#6ef2c9" : "#ff6b6b";
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, positive ? "#0a2420" : "#3a0a0a");
  g.addColorStop(1, positive ? "#0a1620" : "#1a0505");
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, 18);
  ctx.fill();
  ctx.strokeStyle = positive ? "#1a3a36" : "#5a1a1a";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = glow;
  ctx.font = `700 20px ${MONO}`;
  ctx.fillText(kicker, x + 32, y + 52);

  ctx.fillStyle = "#f2e9ff";
  ctx.font = `800 30px ${MONO}`;
  ctx.fillText(handle, x + 32, y + 92);

  ctx.textAlign = "right";
  ctx.fillStyle = glow;
  ctx.font = `800 56px ${MONO}`;
  ctx.fillText(score + "%", x + w - 32, y + 90);

  ctx.textAlign = "left";
  ctx.fillStyle = "#a996c4";
  ctx.font = `400 16px ${MONO}`;
  ctx.fillText(note, x + 32, y + 128);
}

function drawGraphic(canvas, r) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(W * 0.2, 0, 0, W * 0.2, 0, W * 0.9);
  bg.addColorStop(0, "#1a0f26");
  bg.addColorStop(1, "#0b0710");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f2e9ff";
  ctx.font = `800 40px ${MONO}`;
  ctx.fillText(`${short(r.selfHandle)}'s SimCluster`, W / 2, 76);
  ctx.fillStyle = "#a996c4";
  ctx.font = `400 18px ${MONO}`;
  ctx.fillText("twin & anti-twin, scored by ADVANCED ALGORITHMS", W / 2, 108);

  const panelX = 60, panelW = W - 120;
  drawResultPanel(ctx, {
    x: panelX, y: 160, w: panelW, h: 160, kicker: "🧬 TWIN",
    score: r.twin.match.score, handle: short(r.twin.profile.handle),
    note: "your closest match on vocabulary, style & rhythm", positive: true,
  });
  drawResultPanel(ctx, {
    x: panelX, y: 350, w: panelW, h: 160, kicker: "🪞 ANTI-TWIN",
    score: r.anti.match.score, handle: short(r.anti.profile.handle),
    note: "your most opposite match in the same cluster", positive: false,
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "#a996c4";
  ctx.font = `400 15px ${MONO}`;
  ctx.fillText(`${r.scoredCount} mutuals scored, out of ${r.poolSize} in the pool`, W / 2, 570);
  ctx.fillStyle = "#6ef2c9";
  ctx.font = `700 20px ${MONO}`;
  ctx.fillText("simcluster-twin.bisks.net", W / 2, 605);
}

function buildShareText(handle, r) {
  const url = `https://simcluster-twin.bisks.net/?h=${encodeURIComponent(handle)}`;
  return `my SimCluster twin is ${short(r.twin.profile.handle)} (${r.twin.match.score}% match) and my anti-twin is ${short(r.anti.profile.handle)} (${r.anti.match.score}% match) — found by ADVANCED ALGORITHMS. ${url}`;
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

async function generate(rawHandle) {
  const handle = (rawHandle || "").trim().replace(/^@/, "");
  if (!handle) { setStatus("enter a handle first.", true); return; }

  els.genBtn.disabled = true;
  els.results.classList.remove("show");
  els.graphicWrap.classList.remove("show");
  els.shareRow.style.display = "none";
  setStatus(`resolving @${handle}...`);

  try {
    const res = await moots(handle, { onStep: (s) => setStatus(s) });
    if (res.pool.length < 2) {
      setStatus(`@${short(res.handle)} only has ${res.pool.length} mutual(s) — need at least 2 to crown a twin and an anti-twin.`, true);
      return;
    }
    const pool = res.pool.slice(0, POOL_CAP);

    setStatus(`reading @${short(res.handle)}'s own posts...`);
    const selfPosts = await fetchPosts(res.did, { pages: 2 });
    const selfFeat = extractFeatures(selfPosts);
    if (selfFeat.postCount < MIN_POSTS) {
      setStatus(`@${short(res.handle)} doesn't have enough posts of their own to build a profile from.`, true);
      return;
    }

    let done = 0;
    const perMember = await runPool(pool, async (p) => {
      const posts = await fetchPosts(p.did, { pages: 1 });
      done++;
      setStatus(`scoring @${short(res.handle)}'s SimCluster (${done}/${pool.length})...`);
      const feat = extractFeatures(posts);
      return { profile: p, feat };
    }, CONCURRENCY);

    const scored = [];
    const skipped = [];
    for (const entry of perMember) {
      if (!entry) continue;
      if (entry.feat.postCount < MIN_POSTS) { skipped.push(entry.profile); continue; }
      const match = compare(selfFeat, entry.feat);
      scored.push({ profile: entry.profile, feat: entry.feat, match });
    }
    scored.sort((a, b) => b.match.score - a.match.score);

    if (scored.length < 2) {
      setStatus(`only ${scored.length} mutual(s) had enough posts to score — try a handle with a chattier cluster.`, true);
      return;
    }

    const twin = scored[0];
    const anti = scored[scored.length - 1];
    const result = { selfHandle: res.handle, twin, anti, scoredCount: scored.length, poolSize: pool.length };
    lastResult = result;

    els.clusterMeta.innerHTML =
      `<b>@${short(res.handle)}'s SimCluster</b> — ${res.counts.pool} in the pool (${res.kind}), ` +
      `${scored.length} scored, ${skipped.length} skipped for too few posts.`;

    renderMatch("twin", twin, selfFeat);
    renderMatch("anti", anti, selfFeat);
    renderLeaderboard(scored, skipped);

    drawGraphic(els.canvas, result);
    els.graphicWrap.classList.add("show");
    lastShareText = buildShareText(res.handle, result);
    els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
    els.shareRow.style.display = "flex";

    els.results.classList.add("show");
    setStatus("");
  } catch (err) {
    setStatus("couldn't build that one: " + (err && err.message ? err.message : "try again") + ".", true);
  } finally {
    els.genBtn.disabled = false;
  }
}

els.shareDownload.addEventListener("click", () => {
  els.canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `simcluster-twin-${(lastResult?.selfHandle || "cluster").replace(/[^a-z0-9.-]/gi, "_")}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "simcluster-twin.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "simcluster: twin & anti-twin" });
      } catch {
        // cancelled or unsupported — no-op
      }
    }, "image/png");
  });
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  generate(els.input.value);
});

const sharedHandle = new URLSearchParams(location.search).get("h");
if (sharedHandle) {
  els.input.value = sharedHandle;
  generate(sharedHandle);
} else {
  els.input.value = "norvid-studies.bsky.social";
  generate("norvid-studies.bsky.social");
}
