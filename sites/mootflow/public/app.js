// mootflow — sankeys a Bluesky account's post engagement (or, flipped, its
// own outward activity) by relationship: mutual / follower-only /
// following-only / stranger. Everything runs client-side against the public
// AppView + the account's own PDS; nothing is stored anywhere.
//
// Outward direction (likes/replies/reposts YOU made) is derived entirely
// from one CAR download of your own repo (lib/car.js) — the target DID is
// embedded right in each like/repost's subject.uri and each reply's
// reply.parent.uri, so no AppView fan-out is needed at all.
//
// Inward direction (who liked/replied/reposted YOUR posts) has no bulk
// equivalent — getLikes/getRepostedBy/getPostThread aren't repo-backed, so
// it's a capped, concurrency-limited fan-out over your most recent posts
// (see POST_SCAN_CAP below). That cap is a genuine browser/AppView fan-out
// safety bound, not habitual caution — see notes/40-new-site-playbook.md.

import { resolveDid, resolvePds, followGraph, classify, profilesFor, getProfile } from "./lib/identity.js";
import { fetchRepoRecordsWithKeys } from "./lib/car.js";
import { attachHandleTypeahead } from "./lib/handle-typeahead.js";

const APPVIEW = "https://public.api.bsky.app/xrpc";
const POST_SCAN_CAP = 80; // most recent posts scanned for inward engagement
const LIKES_PAGE_CAP = 3; // up to 300 likers per post
const REPOSTS_PAGE_CAP = 2; // up to 200 reposters per post
const FANOUT_CONCURRENCY = 6;

const KINDS = ["like", "reply", "repost"];
const KIND_LABEL = { like: "Likes", reply: "Replies", repost: "Reposts" };
const KIND_COLOR = { like: "k-like", reply: "k-reply", repost: "k-repost" };

const RELATIONS = ["mutual", "follower", "following", "stranger"];
const RELATION_LABEL = { mutual: "Mutuals", follower: "Followers", following: "Following", stranger: "Strangers" };
const RELATION_COLOR = { mutual: "rel-mutual", follower: "rel-follower", following: "rel-following", stranger: "rel-stranger" };

function emptyCounts() {
  const c = {};
  for (const k of KINDS) c[k] = { mutual: 0, follower: 0, following: 0, stranger: 0 };
  return c;
}

function relationTotals(counts) {
  const t = { mutual: 0, follower: 0, following: 0, stranger: 0, all: 0 };
  for (const k of KINDS) {
    for (const r of RELATIONS) {
      t[r] += counts[k][r];
      t.all += counts[k][r];
    }
  }
  return t;
}

function didFromAtUri(uri) {
  const m = /^at:\/\/([^/]+)\//.exec(uri || "");
  return m ? m[1] : null;
}

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

async function pooled(items, limit, worker) {
  let i = 0;
  const n = Math.max(1, Math.min(limit, items.length));
  async function runner() {
    while (i < items.length) {
      const idx = i++;
      try {
        await worker(items[idx], idx);
      } catch (_) {
        // best-effort — one post's fan-out failing shouldn't sink the scan
      }
    }
  }
  await Promise.all(Array.from({ length: n }, runner));
}

async function getLikers(uri) {
  const out = [];
  let cursor = "";
  for (let page = 0; page < LIKES_PAGE_CAP; page++) {
    const u = new URL(APPVIEW + "/app.bsky.feed.getLikes");
    u.searchParams.set("uri", uri);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const l of d.likes || []) if (l.actor && l.actor.did) out.push(l.actor.did);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

async function getReposters(uri) {
  const out = [];
  let cursor = "";
  for (let page = 0; page < REPOSTS_PAGE_CAP; page++) {
    const u = new URL(APPVIEW + "/app.bsky.feed.getRepostedBy");
    u.searchParams.set("uri", uri);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const a of d.repostedBy || []) if (a.did) out.push(a.did);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

// Direct (depth-1) replies only — who actually replied to this exact post,
// not the whole downstream thread.
async function getDirectRepliers(uri) {
  const u = new URL(APPVIEW + "/app.bsky.feed.getPostThread");
  u.searchParams.set("uri", uri);
  u.searchParams.set("depth", "1");
  u.searchParams.set("parentHeight", "0");
  let d;
  try {
    d = await jget(u.toString());
  } catch {
    return [];
  }
  const thread = d.thread;
  if (!thread || !Array.isArray(thread.replies)) return [];
  const out = [];
  for (const r of thread.replies) {
    const author = r.post && r.post.author;
    if (author && author.did) out.push(author.did);
  }
  return out;
}

function makeBumper(did, graph, counts, engagerCounts) {
  return function bump(kind, actorDid) {
    if (!actorDid || actorDid === did) return;
    const rel = classify(actorDid, graph);
    counts[kind][rel]++;
    engagerCounts.set(actorDid, (engagerCounts.get(actorDid) || 0) + 1);
  };
}

async function buildOutward(records, did, graph) {
  const counts = emptyCounts();
  const engagerCounts = new Map();
  const bump = makeBumper(did, graph, counts, engagerCounts);
  for (const rec of records) {
    const v = rec.value;
    if (v.$type === "app.bsky.feed.like" && v.subject) {
      bump("like", didFromAtUri(v.subject.uri));
    } else if (v.$type === "app.bsky.feed.repost" && v.subject) {
      bump("repost", didFromAtUri(v.subject.uri));
    } else if (v.$type === "app.bsky.feed.post" && v.reply && v.reply.parent) {
      bump("reply", didFromAtUri(v.reply.parent.uri));
    }
  }
  return { counts, engagerCounts };
}

async function buildInward(did, allPosts, graph, onProgress) {
  const scan = allPosts.slice(0, POST_SCAN_CAP);
  const counts = emptyCounts();
  const engagerCounts = new Map();
  const bump = makeBumper(did, graph, counts, engagerCounts);
  let done = 0;
  await pooled(scan, FANOUT_CONCURRENCY, async (post) => {
    const uri = post.uri;
    const [likers, reposters, repliers] = await Promise.all([
      getLikers(uri),
      getReposters(uri),
      getDirectRepliers(uri),
    ]);
    for (const a of likers) bump("like", a);
    for (const a of reposters) bump("repost", a);
    for (const a of repliers) bump("reply", a);
    done++;
    if (onProgress) onProgress(done, scan.length);
  });
  return { counts, engagerCounts, scanned: scan.length, total: allPosts.length };
}

// ---- sankey data + rendering -------------------------------------------

function buildSankeyData(counts, rootLabel) {
  const nodes = [{ id: "root", label: rootLabel, color: "root-fill" }];
  const links = [];
  for (const kind of KINDS) {
    const total = RELATIONS.reduce((a, r) => a + counts[kind][r], 0);
    if (!total) continue;
    nodes.push({ id: kind, label: KIND_LABEL[kind], color: KIND_COLOR[kind] });
    links.push({ source: "root", target: kind, value: total, color: KIND_COLOR[kind] });
  }
  const usedRelations = new Set();
  for (const kind of KINDS) for (const rel of RELATIONS) if (counts[kind][rel] > 0) usedRelations.add(rel);
  for (const rel of RELATIONS) {
    if (!usedRelations.has(rel)) continue;
    nodes.push({ id: rel, label: RELATION_LABEL[rel], color: RELATION_COLOR[rel] });
  }
  for (const kind of KINDS) {
    for (const rel of RELATIONS) {
      const v = counts[kind][rel];
      if (v > 0) links.push({ source: kind, target: rel, value: v, color: RELATION_COLOR[rel] });
    }
  }
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

let lastGraph = null;

function renderSankey(nodeDefs, linkDefs) {
  const svg = d3.select("#sankey");
  svg.selectAll("*").remove();
  lastGraph = null;

  if (!linkDefs.length) {
    svg
      .append("text")
      .attr("x", 430)
      .attr("y", 240)
      .attr("text-anchor", "middle")
      .attr("fill", colorVar("text-muted"))
      .attr("font-size", "14px")
      .text("no interactions found here — yet.");
    return null;
  }

  const W = 860, H = 480;
  const margin = { top: 30, right: 170, bottom: 10, left: 170 };
  const sankeyLayout = d3
    .sankey()
    .nodeId((d) => d.id)
    .nodeWidth(16)
    .nodePadding(16)
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
    .attr("stroke", (d) => colorVar(d.color))
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
    .attr("fill", (d) => colorVar(d.color))
    .on("mousemove", function (evt, d) {
      showTip(`<div class="t-title">${d.label}</div><div class="t-sub">${fmt(d.value)}</div>`, evt);
      linkSel.classed("dim", (o) => o.source !== d && o.target !== d);
    })
    .on("mouseleave", function () {
      hideTip();
      linkSel.classed("dim", false);
    });

  function labelX(d) {
    if (d.depth === 0) return d.x0 - 10;
    if (d.depth === maxDepth) return d.x1 + 10;
    return (d.x0 + d.x1) / 2;
  }
  function labelAnchor(d) {
    if (d.depth === 0) return "end";
    if (d.depth === maxDepth) return "start";
    return "middle";
  }

  svg
    .append("g")
    .selectAll("text.node-label")
    .data(graph.nodes)
    .join("text")
    .attr("class", "node-label")
    .attr("x", labelX)
    .attr("y", (d) => (d.depth === 0 || d.depth === maxDepth ? (d.y0 + d.y1) / 2 - 4 : d.y0 - 16))
    .attr("text-anchor", labelAnchor)
    .text((d) => d.label);

  svg
    .append("g")
    .selectAll("text.node-value")
    .data(graph.nodes)
    .join("text")
    .attr("class", "node-value")
    .attr("x", labelX)
    .attr("y", (d) => (d.depth === 0 || d.depth === maxDepth ? (d.y0 + d.y1) / 2 + 11 : d.y0 - 4))
    .attr("text-anchor", labelAnchor)
    .text((d) => fmt(d.value));

  lastGraph = graph;
  return graph;
}

function renderLegend(nodeDefs) {
  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  const seen = new Set();
  for (const n of nodeDefs) {
    if (n.id === "root" || seen.has(n.color)) continue;
    seen.add(n.color);
    const item = document.createElement("span");
    item.className = "item";
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = colorVar(n.color);
    const label = document.createElement("span");
    label.textContent = n.label;
    item.appendChild(sw);
    item.appendChild(label);
    legend.appendChild(item);
  }
}

function renderTable(counts, kindNoun) {
  const usedKinds = KINDS.filter((k) => RELATIONS.some((r) => counts[k][r] > 0));
  const usedRelations = RELATIONS.filter((r) => KINDS.some((k) => counts[k][r] > 0));
  const tableWrap = document.getElementById("table-wrap");
  if (!usedKinds.length) {
    tableWrap.innerHTML = "";
    return;
  }
  let head = "<th></th>" + usedRelations.map((r) => `<th class="num">${RELATION_LABEL[r]}</th>`).join("") + '<th class="num">Total</th>';
  let body = usedKinds
    .map((k) => {
      const rowTotal = usedRelations.reduce((a, r) => a + counts[k][r], 0);
      const cells = usedRelations.map((r) => `<td class="num">${fmt(counts[k][r])}</td>`).join("");
      return `<tr><td>${KIND_LABEL[k]}</td>${cells}<td class="num">${fmt(rowTotal)}</td></tr>`;
    })
    .join("");
  const colTotals = usedRelations.map((r) => usedKinds.reduce((a, k) => a + counts[k][r], 0));
  const grand = colTotals.reduce((a, b) => a + b, 0);
  const footCells = colTotals.map((v) => `<td class="num">${fmt(v)}</td>`).join("");
  tableWrap.innerHTML =
    `<table class="flows"><caption>${kindNoun}, by relationship</caption>` +
    `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>` +
    `<tfoot><tr><td>Total</td>${footCells}<td class="num">${fmt(grand)}</td></tr></tfoot></table>`;
}

// ---- app state + wiring -------------------------------------------------

const els = {
  form: document.getElementById("lookup-form"),
  input: document.getElementById("handle-input"),
  go: document.getElementById("go-btn"),
  status: document.getElementById("status"),
  results: document.getElementById("results"),
  directionToggle: document.getElementById("direction-toggle"),
  themeToggle: document.getElementById("theme-toggle"),
  viewToggle: document.getElementById("view-toggle"),
  stats: document.getElementById("stats"),
  caption: document.getElementById("caption"),
  chartWrap: document.getElementById("chart-wrap"),
  tableWrap: document.getElementById("table-wrap"),
  legend: document.getElementById("legend"),
  engagers: document.getElementById("engagers"),
  engagersTitle: document.getElementById("engagers-title"),
  engagersList: document.getElementById("engagers-list"),
  shareBluesky: document.getElementById("share-bluesky"),
  shareDownload: document.getElementById("share-download"),
  shareNative: document.getElementById("share-native"),
  shareCanvas: document.getElementById("share-canvas"),
};

attachHandleTypeahead(els.input);

let state = null; // { did, profile, graph, inward, outward, direction }
let lastShareText = "";

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

function shareUrlFor(handle) {
  return "https://mootflow.bisks.net/?h=" + encodeURIComponent(handle);
}

function currentSlice() {
  return state.direction === "inward" ? state.inward : state.outward;
}

function render() {
  const slice = currentSlice();
  const rootLabel = state.direction === "inward" ? "Your posts" : "Your activity";
  const { nodes, links } = buildSankeyData(slice.counts, rootLabel);
  renderSankey(nodes, links);
  renderLegend(nodes);
  renderTable(slice.counts, state.direction === "inward" ? "Engagement received" : "Engagement given");

  const totals = relationTotals(slice.counts);
  const g = state.graph;
  const statBits = [
    `<span><b>${fmt(g.followCount)}</b> follows</span>`,
    `<span><b>${fmt(g.followerCount)}</b> followers</span>`,
    `<span><b>${fmt(totals.mutual)}</b> mutual interactions</span>`,
  ];
  if (state.direction === "inward") {
    statBits.push(`<span>scanned <b>${fmt(state.inward.scanned)}</b> of <b>${fmt(state.inward.total)}</b> posts</span>`);
  }
  els.stats.innerHTML = statBits.join("");

  els.caption.textContent =
    state.direction === "inward"
      ? `Based on your ${fmt(state.inward.scanned)} most recent posts` +
        (state.inward.scanned < state.inward.total
          ? ` (of ${fmt(state.inward.total)} total — mootflow caps the scan so it doesn't sit there forever on very active accounts).`
          : ` — your entire post history.`) +
        ` Ribbon color = the relationship of whoever liked, replied, or reposted, from your own follow graph.`
      : `Derived from your entire repo — every like, reply, and repost you've ever made, no sampling. Ribbon color = the relationship of whoever you engaged with.`;

  renderEngagers(slice.engagerCounts);

  lastShareText = buildShareText();
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
  buildShareCard();
}

async function renderEngagers(engagerCounts) {
  const top = [...engagerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!top.length) {
    els.engagers.style.display = "none";
    return;
  }
  els.engagers.style.display = "";
  els.engagersTitle.textContent = state.direction === "inward" ? "who engages with you most" : "who you engage with most";
  els.engagersList.innerHTML = top
    .map(([did]) => `<li data-did="${did}">did:...${did.slice(-8)} <span class="rel-tag">…</span></li>`)
    .join("");

  const profiles = await profilesFor(top.map(([did]) => did));
  els.engagersList.innerHTML = top
    .map(([did, count]) => {
      const p = profiles.get(did);
      const rel = classify(did, state.graph);
      const name = p ? "@" + p.handle : "did:..." + did.slice(-8);
      const bg = colorVar(RELATION_COLOR[rel]);
      return `<li>${escapeHtml(name)} — ${fmt(count)} <span class="rel-tag" style="background:${bg}">${RELATION_LABEL[rel]}</span></li>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function buildShareText() {
  const slice = currentSlice();
  const totals = relationTotals(slice.counts);
  const handle = state.profile.handle;
  if (!totals.all) {
    return `mootflow: @${handle} — not enough ${state.direction === "inward" ? "engagement" : "activity"} yet to sankey. ${shareUrlFor(handle)}`;
  }
  const strangerPct = Math.round((totals.stranger / totals.all) * 100);
  const mutualPct = Math.round((totals.mutual / totals.all) * 100);
  const verb = state.direction === "inward" ? "engaging with my posts" : "of my own likes/replies/reposts";
  return `mootflow: ${strangerPct}% of the people ${verb} are total strangers, only ${mutualPct}% are mutuals. ${shareUrlFor(handle)}`;
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
  const slice = currentSlice();
  const totals = relationTotals(slice.counts);
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "system-ui, -apple-system, sans-serif";
  const avatar = await loadImg(state.profile.avatar);

  const bg = colorVar("page") || "#0d0d0d";
  const surface = colorVar("surface-1") || "#1a1a19";
  const ink = colorVar("text-primary") || "#fff";
  const dim = colorVar("text-secondary") || "#c3c2b7";
  const accent = colorVar("accent") || "#5b9bf0";

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = `800 52px ${mono}`;
  ctx.fillText("mootflow", 60, 96);

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
  ctx.fillText(state.direction === "inward" ? "who's engaging with these posts" : "where this account's activity lands", textX, 178);

  const cardX = 60, cardY = 224, cardW = W - 120, cardH = H - 280;
  ctx.fillStyle = surface;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 16);
  ctx.fill();

  const barX = cardX + 220, barMaxW = cardW - 280;
  const max = Math.max(1, ...RELATIONS.map((r) => totals[r]));
  RELATIONS.forEach((r, i) => {
    const ry = cardY + 56 + i * 74;
    ctx.fillStyle = ink;
    ctx.font = `700 20px ${mono}`;
    ctx.textAlign = "left";
    ctx.fillText(RELATION_LABEL[r], cardX + 32, ry);
    const w = totals.all ? Math.round((totals[r] / max) * barMaxW) : 0;
    ctx.fillStyle = colorVar(RELATION_COLOR[r]);
    ctx.beginPath();
    ctx.roundRect(barX, ry - 20, Math.max(4, w), 22, 6);
    ctx.fill();
    ctx.fillStyle = dim;
    ctx.font = `600 18px ${mono}`;
    ctx.textAlign = "left";
    const pct = totals.all ? Math.round((totals[r] / totals.all) * 100) : 0;
    ctx.fillText(`${fmt(totals[r])} (${pct}%)`, barX + Math.max(4, w) + 14, ry - 3);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = `700 20px ${mono}`;
  ctx.fillText("mootflow.bisks.net", 60, H - 40);
}

els.shareDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const who = (state.profile.handle || "card").replace(/[^a-z0-9.-]/gi, "_");
    a.download = "mootflow-" + who + ".png";
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
      const file = new File([blob], "mootflow-" + who + ".png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "mootflow" });
      } catch (_) {
        // cancelled — no-op
      }
    }, "image/png");
  });
}

// ---- run ------------------------------------------------------------------

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

    setStatus("mapping your follow graph...");
    const graph = await followGraph(did, { onStep: setStatus });

    setStatus("finding your PDS...");
    const pds = await resolvePds(did);
    if (!pds) throw new Error("couldn't find a PDS for that account");

    setStatus("downloading your repo (posts, likes, reposts)...");
    const { records } = await fetchRepoRecordsWithKeys(
      pds,
      did,
      ["app.bsky.feed.post", "app.bsky.feed.like", "app.bsky.feed.repost"],
      setStatus,
    );

    const myPosts = records.filter((r) => r.value.$type === "app.bsky.feed.post").reverse();

    setStatus("tallying your outward activity...");
    const outward = await buildOutward(records, did, graph);

    setStatus(`scanning your posts for engagement... 0/${Math.min(myPosts.length, POST_SCAN_CAP)}`);
    const inward = await buildInward(did, myPosts, graph, (done, total) => {
      setStatus(`scanning your posts for engagement... ${done}/${total}`);
    });

    state = { did, profile, graph, inward, outward, direction: "inward" };
    els.directionToggle.textContent = "↙ inward: who engages with you";
    els.directionToggle.setAttribute("aria-pressed", "false");
    render();

    setStatus("");
    els.results.classList.add("show");
  } catch (err) {
    console.error(err);
    setStatus("couldn't build that flow: " + (err && err.message ? err.message : err), true);
  } finally {
    els.go.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  run(els.input.value);
});

els.directionToggle.addEventListener("click", () => {
  if (!state) return;
  state.direction = state.direction === "inward" ? "outward" : "inward";
  els.directionToggle.textContent =
    state.direction === "inward" ? "↙ inward: who engages with you" : "↗ outward: where your activity goes";
  els.directionToggle.setAttribute("aria-pressed", String(state.direction === "outward"));
  render();
});

els.viewToggle.addEventListener("click", () => {
  const showTable = !els.tableWrap.classList.contains("show");
  els.tableWrap.classList.toggle("show", showTable);
  els.chartWrap.classList.toggle("hide", showTable);
  els.legend.style.display = showTable ? "none" : "";
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
applyTheme(localStorage.getItem("mootflow-theme"));
els.themeToggle.addEventListener("click", () => {
  const order = [null, "light", "dark"];
  const cur = localStorage.getItem("mootflow-theme");
  const next = order[(order.indexOf(cur) + 1) % order.length];
  if (next) localStorage.setItem("mootflow-theme", next);
  else localStorage.removeItem("mootflow-theme");
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
