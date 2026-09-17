// followtide — sankeys a Bluesky account's *current* follows, bucketed by
// the month (or, once the span gets wide, quarter/year) they followed each
// account, flowing into a single "following now" node. Starts from the
// present and reads backward: the newest cohort sits at the bright end of
// the color scale, the oldest at the muted end.
//
// Only currently-active follows show up — an app.bsky.graph.follow record
// disappears from the repo the moment it's deleted, so someone since
// unfollowed never enters the count. That's a feature here, not a gap: the
// ask was "starting from the present," and the present is exactly what a
// repo snapshot contains.
//
// One com.atproto.sync.getRepo CAR download gets every follow record (with
// its createdAt) in a single request — see lib/car.js, copied from
// sites/beefcheck (itself following sites/activitygrid's reference
// implementation) per notes/40-new-site-playbook.md's standing order to
// prefer bulk repo reads over a paginated listRecords walk.

import { resolveDid, resolvePds, getProfile, profilesFor } from "./lib/identity.js";
import { fetchRepoRecords } from "./lib/car.js";
const attachHandleTypeahead = window.attachHandleTypeahead;

const COLLECTION = "app.bsky.graph.follow";

// Fallback pagination cap for when the repo CAR is too large/malformed to
// parse in-tab (see car.js's CAR_MAX_BYTES). This walk has to collect every
// follow, not just the newest, to bucket the whole history correctly — so
// unlike a "recent activity" sample, the bound here has to stay generous:
// 400 pages (~40k follows) matches the pagination ceiling every other
// moot-family site settled on after 2026-08-28's "stop capping walks out of
// habitual caution" thread (notes/40-new-site-playbook.md).
const REPO_FALLBACK_PAGE_CAP = 400;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

async function listRecordsAll(pds, did, collection, onProgress) {
  const out = [];
  let cursor = "";
  let truncated = false;
  for (let page = 0; page < REPO_FALLBACK_PAGE_CAP; page++) {
    const u = new URL(pds.replace(/\/$/, "") + "/xrpc/com.atproto.repo.listRecords");
    u.searchParams.set("repo", did);
    u.searchParams.set("collection", collection);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    const records = d.records || [];
    for (const r of records) out.push(r.value);
    if (onProgress) onProgress(`sampling your follows... ${out.length}`);
    cursor = d.cursor;
    if (!cursor || !records.length) break;
    if (page === REPO_FALLBACK_PAGE_CAP - 1) truncated = true;
  }
  return { records: out, truncated };
}

// ---- bucketing ------------------------------------------------------------

function monthIndex(d) {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

// The number of distinct buckets a plain month-by-month split would need
// decides the granularity: an account a few years old reads fine as monthly
// bars, but an account that's followed people steadily since 2019 would
// spam 80+ skinny bars. This widens the bucket instead of dropping data —
// every follow still counts, it's just grouped coarser once the timeline
// is long enough that month-level detail stops being readable.
function chooseGranularity(spanMonths) {
  if (spanMonths <= 24) return "month";
  if (spanMonths <= 96) return "quarter";
  return "year";
}

function bucketOf(date, granularity) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  if (granularity === "year") {
    return { key: `${y}`, label: `${y}`, sortKey: y * 12 };
  }
  if (granularity === "quarter") {
    const q = Math.floor(m / 3) + 1;
    return { key: `${y}-Q${q}`, label: `Q${q} ${y}`, sortKey: y * 12 + (q - 1) * 3 };
  }
  const label = date.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  return { key: `${y}-${String(m + 1).padStart(2, "0")}`, label, sortKey: y * 12 + m };
}

function buildBuckets(follows) {
  const now = new Date();
  let earliest = now;
  for (const f of follows) if (f.date < earliest) earliest = f.date;
  const spanMonths = Math.max(1, monthIndex(now) - monthIndex(earliest) + 1);
  const granularity = chooseGranularity(spanMonths);

  const map = new Map();
  for (const f of follows) {
    const b = bucketOf(f.date, granularity);
    let entry = map.get(b.key);
    if (!entry) {
      entry = { key: b.key, label: b.label, sortKey: b.sortKey, count: 0, dids: [] };
      map.set(b.key, entry);
    }
    entry.count++;
    entry.dids.push(f.did);
  }
  const buckets = [...map.values()].sort((a, b) => a.sortKey - b.sortKey);
  return { buckets, granularity };
}

// ---- color ----------------------------------------------------------------

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function tideColor(t, oldHex, newHex) {
  const a = hexToRgb(oldHex);
  const b = hexToRgb(newHex);
  return `rgb(${lerp(a[0], b[0], t)}, ${lerp(a[1], b[1], t)}, ${lerp(a[2], b[2], t)})`;
}

// ---- sankey data + rendering -----------------------------------------------

function buildSankeyData(buckets) {
  const nodes = [];
  const links = [];
  const n = buckets.length;
  buckets.forEach((b, i) => {
    const t = n > 1 ? i / (n - 1) : 1;
    nodes.push({ id: b.key, label: b.label, order: i, value: b.count, dids: b.dids, colorT: t });
    links.push({ source: b.key, target: "sink", value: b.count, colorT: t });
  });
  const total = buckets.reduce((a, b) => a + b.count, 0);
  nodes.push({ id: "sink", label: "following now", order: n, value: total, isSink: true });
  return { nodes, links };
}

const vizRoot = document.querySelector(".viz-root");
function colorVar(key) {
  return getComputedStyle(vizRoot).getPropertyValue("--" + key).trim();
}
function fmt(v) {
  return v.toLocaleString();
}

const tooltip = document.getElementById("tooltip");
function showTip(html, evt) {
  tooltip.innerHTML = html;
  tooltip.classList.add("show");
  moveTip(evt);
}
function moveTip(evt) {
  const pad = 14;
  tooltip.style.left = Math.min(evt.clientX + pad, window.innerWidth - 260) + "px";
  tooltip.style.top = Math.min(evt.clientY + pad, window.innerHeight - 80) + "px";
}
function hideTip() {
  tooltip.classList.remove("show");
}

function renderSankey(nodeDefs, linkDefs, onBucketClick) {
  const svg = d3.select("#sankey");
  svg.selectAll("*").remove();

  if (!linkDefs.length) {
    svg
      .append("text")
      .attr("x", 430)
      .attr("y", 300)
      .attr("text-anchor", "middle")
      .attr("fill", colorVar("text-muted"))
      .attr("font-size", "14px")
      .text("no current follows found here.");
    return;
  }

  const oldHex = colorVar("tide-old") || "#8aa0c9";
  const newHex = colorVar("tide-new") || "#0f9e8e";
  const nodeColor = (d) => (d.isSink ? colorVar("root-fill") : tideColor(d.colorT, oldHex, newHex));
  const linkColor = (d) => tideColor(d.colorT, oldHex, newHex);

  const W = 860, H = Math.max(420, 30 * nodeDefs.length);
  svg.attr("viewBox", `0 0 ${W} ${H}`);
  const margin = { top: 20, right: 170, bottom: 10, left: 100 };
  const sankeyLayout = d3
    .sankey()
    .nodeId((d) => d.id)
    .nodeWidth(14)
    .nodePadding(H > 900 ? 3 : 8)
    .nodeSort((a, b) => a.order - b.order)
    .nodeAlign(d3.sankeyLeft)
    .extent([[margin.left, margin.top], [W - margin.right, H - margin.bottom]]);

  const graph = sankeyLayout({
    nodes: nodeDefs.map((d) => Object.assign({}, d)),
    links: linkDefs.map((d) => Object.assign({}, d)),
  });
  const maxDepth = d3.max(graph.nodes, (d) => d.depth);
  const linkGen = d3.sankeyLinkHorizontal();

  const linkSel = svg
    .append("g")
    .attr("fill", "none")
    .selectAll("path")
    .data(graph.links)
    .join("path")
    .attr("class", "link")
    .attr("d", linkGen)
    .attr("stroke", linkColor)
    .attr("stroke-opacity", 0.45)
    .attr("stroke-width", (d) => Math.max(1, d.width))
    .on("mousemove", function (evt, d) {
      showTip(`<div class="t-title">${d.source.label} → ${d.target.label}</div><div class="t-sub">${fmt(d.value)}</div>`, evt);
      linkSel.classed("dim", (o) => o !== d);
    })
    .on("mouseleave", function () {
      hideTip();
      linkSel.classed("dim", false);
    });

  svg
    .append("g")
    .selectAll("rect")
    .data(graph.nodes)
    .join("rect")
    .attr("class", "node")
    .attr("x", (d) => d.x0)
    .attr("y", (d) => d.y0)
    .attr("height", (d) => Math.max(1, d.y1 - d.y0))
    .attr("width", (d) => d.x1 - d.x0)
    .attr("fill", nodeColor)
    .on("mousemove", function (evt, d) {
      showTip(`<div class="t-title">${d.label}</div><div class="t-sub">${fmt(d.value)}</div>`, evt);
      linkSel.classed("dim", (o) => o.source !== d && o.target !== d);
    })
    .on("mouseleave", function () {
      hideTip();
      linkSel.classed("dim", false);
    })
    .on("click", function (evt, d) {
      if (!d.isSink && onBucketClick) onBucketClick(d);
    });

  function labelX(d) {
    if (d.depth === maxDepth) return d.x1 + 10;
    return d.x0 - 8;
  }
  function labelAnchor(d) {
    return d.depth === maxDepth ? "start" : "end";
  }

  svg
    .append("g")
    .selectAll("text.node-label")
    .data(graph.nodes)
    .join("text")
    .attr("class", "node-label")
    .attr("x", labelX)
    .attr("y", (d) => (d.y0 + d.y1) / 2 - 3)
    .attr("text-anchor", labelAnchor)
    .text((d) => d.label);

  svg
    .append("g")
    .selectAll("text.node-value")
    .data(graph.nodes)
    .join("text")
    .attr("class", "node-value")
    .attr("x", labelX)
    .attr("y", (d) => (d.y0 + d.y1) / 2 + 11)
    .attr("text-anchor", labelAnchor)
    .text((d) => fmt(d.value));
}

function renderTable(buckets, granularity) {
  const tableWrap = document.getElementById("table-wrap");
  const total = buckets.reduce((a, b) => a + b.count, 0);
  const rows = buckets
    .slice()
    .reverse()
    .map((b) => `<tr><td>${b.label}</td><td class="num">${fmt(b.count)}</td><td class="num">${Math.round((b.count / total) * 100)}%</td></tr>`)
    .join("");
  tableWrap.innerHTML =
    `<table class="flows"><caption>follows by ${granularity}, newest first</caption>` +
    `<thead><tr><th></th><th class="num">Follows</th><th class="num">Share</th></tr></thead><tbody>${rows}</tbody>` +
    `<tfoot><tr><td>Following now</td><td class="num">${fmt(total)}</td><td class="num">100%</td></tr></tfoot></table>`;
}

// ---- app state + wiring -----------------------------------------------------

const els = {
  form: document.getElementById("lookup-form"),
  input: document.getElementById("handle-input"),
  go: document.getElementById("go-btn"),
  status: document.getElementById("status"),
  results: document.getElementById("results"),
  themeToggle: document.getElementById("theme-toggle"),
  viewToggle: document.getElementById("view-toggle"),
  stats: document.getElementById("stats"),
  caption: document.getElementById("caption"),
  chartWrap: document.getElementById("chart-wrap"),
  tableWrap: document.getElementById("table-wrap"),
  bucketDetail: document.getElementById("bucket-detail"),
  bucketDetailTitle: document.getElementById("bucket-detail-title"),
  bucketDetailChips: document.getElementById("bucket-detail-chips"),
  shareBluesky: document.getElementById("share-bluesky"),
  shareDownload: document.getElementById("share-download"),
  shareNative: document.getElementById("share-native"),
  shareCanvas: document.getElementById("share-canvas"),
};

attachHandleTypeahead(els.input);

let state = null; // { did, profile, buckets, granularity, total, truncated }
let lastShareText = "";

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

function shareUrlFor(handle) {
  return "https://followtide.bisks.net/?h=" + encodeURIComponent(handle);
}

const BUCKET_DETAIL_CAP = 60; // chips shown per bucket — a display limit, not a data one; every follow is still counted

async function showBucketDetail(node) {
  els.bucketDetail.classList.add("show");
  els.bucketDetailTitle.textContent = `who you followed in ${node.label} (${fmt(node.value)})`;
  els.bucketDetailChips.innerHTML = `<span class="more">resolving handles…</span>`;
  const shown = node.dids.slice(0, BUCKET_DETAIL_CAP);
  const profiles = await profilesFor(shown);
  const chips = shown
    .map((did) => {
      const p = profiles.get(did);
      const label = p ? "@" + p.handle : "did:..." + did.slice(-8);
      return `<a class="chip" href="https://bsky.app/profile/${did}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
    })
    .join("");
  const remainder = node.dids.length - shown.length;
  els.bucketDetailChips.innerHTML = chips + (remainder > 0 ? `<span class="more">+${fmt(remainder)} more</span>` : "");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function render() {
  const { nodes, links } = buildSankeyData(state.buckets);
  renderSankey(nodes, links, showBucketDetail);
  renderTable(state.buckets, state.granularity);

  const oldest = state.buckets[0];
  const newest = state.buckets[state.buckets.length - 1];
  const statBits = [
    `<span><b>${fmt(state.total)}</b> current follows${state.truncated ? "+" : ""}</span>`,
    `<span>oldest cohort: <b>${escapeHtml(oldest.label)}</b></span>`,
    `<span>newest cohort: <b>${escapeHtml(newest.label)}</b></span>`,
  ];
  if (state.truncated) {
    statBits.push(`<span title="your repo was too big to download in one shot, so this is based on a paginated sample of your follows rather than every single one">sampled, not exhaustive</span>`);
  }
  els.stats.innerHTML = statBits.join("");

  const granNoun = state.granularity === "month" ? "month" : state.granularity === "quarter" ? "quarter" : "year";
  els.caption.textContent =
    `Every app.bsky.graph.follow record currently in @${state.profile.handle}'s repo, bucketed by ${granNoun} followed — ` +
    `accounts since unfollowed don't appear, since only the current record set survives in the repo. ` +
    `Click a band to see who's in it. Bucket width widens automatically (month → quarter → year) once the timeline gets long enough that month-by-month bars would stop being readable.`;

  els.bucketDetail.classList.remove("show");

  lastShareText = buildShareText();
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
  buildShareCard();
}

function buildShareText() {
  const newest = state.buckets[state.buckets.length - 1];
  const pct = state.total ? Math.round((newest.count / state.total) * 100) : 0;
  const handle = state.profile.handle;
  return `followtide: @${handle} follows ${fmt(state.total)} accounts, oldest cohort from ${state.buckets[0].label} — ${fmt(newest.count)} of them (${pct}%) are from ${newest.label} alone. ${shareUrlFor(handle)}`;
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

async function buildShareCard() {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "system-ui, -apple-system, sans-serif";
  const avatar = await loadImg(state.profile.avatar);

  const bg = colorVar("page") || "#0d0d0d";
  const surface = colorVar("surface-1") || "#1a1a19";
  const ink = colorVar("text-primary") || "#fff";
  const dim = colorVar("text-secondary") || "#c3c2b7";
  const accent = colorVar("accent") || "#1fd6c0";
  const oldHex = colorVar("tide-old") || "#5b6f99";
  const newHex = colorVar("tide-new") || "#1fd6c0";

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = `800 52px ${mono}`;
  ctx.fillText("followtide", 60, 96);

  const who = "@" + state.profile.handle;
  ctx.fillStyle = ink;
  ctx.font = `700 28px ${mono}`;
  let textX = 60;
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(86, 146, 26, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 60, 120, 52, 52);
    ctx.restore();
    textX = 128;
  }
  ctx.fillText(who, textX, 154);
  ctx.fillStyle = dim;
  ctx.font = `400 16px ${mono}`;
  ctx.fillText(`${fmt(state.total)} follows, since ${state.buckets[0].label}`, textX, 178);

  const cardX = 60, cardY = 224, cardW = W - 120, cardH = H - 280;
  ctx.fillStyle = surface;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 16);
  ctx.fill();

  const recent = state.buckets.slice(-6);
  const n = recent.length;
  const barX = cardX + 200, barMaxW = cardW - 260;
  const max = Math.max(1, ...recent.map((b) => b.count));
  recent.forEach((b, i) => {
    const t = state.buckets.length > 1 ? (state.buckets.length - n + i) / (state.buckets.length - 1) : 1;
    const ry = cardY + 56 + i * ((cardH - 90) / Math.max(1, n - 1 || 1));
    ctx.fillStyle = ink;
    ctx.font = `700 18px ${mono}`;
    ctx.textAlign = "left";
    ctx.fillText(b.label, cardX + 32, ry);
    const w = Math.round((b.count / max) * barMaxW);
    ctx.fillStyle = tideColor(t, oldHex, newHex);
    ctx.beginPath();
    ctx.roundRect(barX, ry - 20, Math.max(4, w), 22, 6);
    ctx.fill();
    ctx.fillStyle = dim;
    ctx.font = `600 16px ${mono}`;
    ctx.fillText(fmt(b.count), barX + Math.max(4, w) + 14, ry - 3);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = `700 20px ${mono}`;
  ctx.fillText("followtide.bisks.net", 60, H - 40);
}

els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const who = (state.profile.handle || "card").replace(/[^a-z0-9.-]/gi, "_");
    a.download = "followtide-" + who + ".png";
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}
if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const who = (state.profile.handle || "card").replace(/[^a-z0-9.-]/gi, "_");
      const file = new File([blob], "followtide-" + who + ".png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "followtide" });
      } catch (_) {
        // cancelled — no-op
      }
    }, "image/png");
  });
}

// ---- run --------------------------------------------------------------------

async function run(rawHandle) {
  const handle = (rawHandle || "").trim();
  if (!handle) {
    setStatus("enter a handle first.", true);
    return;
  }
  els.go.disabled = true;
  els.results.classList.remove("show");
  setStatus("resolving " + handle + " ...");

  try {
    const did = await resolveDid(handle);
    const profile = await getProfile(did);

    setStatus("finding your PDS...");
    const pds = await resolvePds(did);
    if (!pds) throw new Error("couldn't find a PDS for that account");

    setStatus("downloading your repo (follows)...");
    let rawRecords, truncated;
    try {
      const { records } = await fetchRepoRecords(pds, did, COLLECTION, setStatus);
      rawRecords = records;
      truncated = false;
    } catch (err) {
      console.error("repo CAR download failed, paginating follows instead:", err);
      setStatus("your repo is too big to download in one shot — paginating your follows instead...");
      const { records, truncated: t } = await listRecordsAll(pds, did, COLLECTION, setStatus);
      rawRecords = records;
      truncated = t;
    }

    const follows = [];
    for (const r of rawRecords) {
      if (!r || r.$type !== COLLECTION || !r.subject || !r.createdAt) continue;
      const date = new Date(r.createdAt);
      if (isNaN(date.getTime())) continue;
      follows.push({ did: r.subject, date });
    }
    if (!follows.length) throw new Error("no current follows found");

    setStatus("bucketing by when you followed...");
    const { buckets, granularity } = buildBuckets(follows);

    state = { did, profile, buckets, granularity, total: follows.length, truncated };
    render();

    setStatus("");
    els.results.classList.add("show");
  } catch (err) {
    console.error(err);
    setStatus("couldn't build that tide: " + (err && err.message ? err.message : err), true);
  } finally {
    els.go.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  run(els.input.value);
});

els.viewToggle.addEventListener("click", () => {
  const showTable = !els.tableWrap.classList.contains("show");
  els.tableWrap.classList.toggle("show", showTable);
  els.chartWrap.classList.toggle("hide", showTable);
  els.viewToggle.setAttribute("aria-pressed", String(showTable));
  els.viewToggle.textContent = showTable ? "view as chart" : "view as table";
});

function applyTheme(t) {
  if (t === "light" || t === "dark") {
    document.documentElement.setAttribute("data-theme", t);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  els.themeToggle.textContent = "🌗 theme: " + (t || "auto");
  if (state) render();
}
applyTheme(localStorage.getItem("followtide-theme"));
els.themeToggle.addEventListener("click", () => {
  const order = [null, "light", "dark"];
  const cur = localStorage.getItem("followtide-theme");
  const next = order[(order.indexOf(cur) + 1) % order.length];
  if (next) localStorage.setItem("followtide-theme", next);
  else localStorage.removeItem("followtide-theme");
  applyTheme(next);
});

document.addEventListener("mousemove", (e) => {
  if (tooltip.classList.contains("show")) moveTip(e);
});

// auto-run from a shared ?h=handle link
const params = new URLSearchParams(location.search);
const initial = params.get("h");
if (initial) {
  els.input.value = initial;
  run(initial);
}
