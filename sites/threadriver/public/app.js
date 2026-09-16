// threadriver — paste a Bluesky post, climb to the root of its thread, and
// draw the whole reply tree as one big sankey diagram. Everything runs
// client-side against the public AppView; the only server-side bit is the
// /s/<did>/<rkey> share route (src/index.ts), which just personalizes the
// OG meta tags for a link someone actually shares.

import { resolvePostUri, fetchThread, buildGraph, didOf, rkeyOf } from "./lib/atproto.js";

const NODE_WIDTH = 10;
const NODE_PADDING = 3;
const MARGIN = 28;
// Real browser/canvas-size ceiling, not habitual caution — canvas rasters
// this big already cost real memory, and most engines get unreliable well
// past this. See notes/40-new-site-playbook.md's standing order on caps:
// this one can say why it's the number it is.
const CANVAS_MAX = 8000;
const LEVEL_GAP = 150;
const MIN_SIZE = 560;

const vizRoot = document.querySelector(".viz-root");
function colorVar(key) {
  return getComputedStyle(vizRoot).getPropertyValue("--" + key).trim();
}
function fmt(v) {
  return (v || 0).toLocaleString();
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function truncate(s, max) {
  s = s || "";
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

function depthColor(depth, maxDepth) {
  const t = maxDepth > 0 ? depth / maxDepth : 0;
  const hue = 205 - t * 175; // river-blue at the root, warming toward the leaves
  return `hsl(${hue}, 68%, 56%)`;
}
const STUB_COLOR = { deleted: "#7a7a76", blocked: "#c0435a" };

const els = {
  form: document.getElementById("lookup-form"),
  input: document.getElementById("post-input"),
  go: document.getElementById("go-btn"),
  status: document.getElementById("status"),
  results: document.getElementById("results"),
  weightToggle: document.getElementById("weight-toggle"),
  themeToggle: document.getElementById("theme-toggle"),
  zoomSlider: document.getElementById("zoom-slider"),
  zoomFit: document.getElementById("zoom-fit"),
  zoomLabel: document.getElementById("zoom-label"),
  stats: document.getElementById("stats"),
  canvasWrap: document.getElementById("canvas-wrap"),
  canvas: document.getElementById("sankey"),
  caption: document.getElementById("caption"),
  legendGradient: document.getElementById("legend-gradient"),
  shareBluesky: document.getElementById("share-bluesky"),
  shareDownload: document.getElementById("share-download"),
  shareCardDownload: document.getElementById("share-card-download"),
  shareNative: document.getElementById("share-native"),
  shareCanvas: document.getElementById("share-canvas"),
};

const tooltip = document.getElementById("tooltip");
function showTip(html, evt) {
  tooltip.innerHTML = html;
  tooltip.classList.add("show");
  moveTip(evt);
}
function moveTip(evt) {
  const pad = 16;
  tooltip.style.left = Math.min(evt.clientX + pad, window.innerWidth - 300) + "px";
  tooltip.style.top = Math.min(evt.clientY + pad, window.innerHeight - 120) + "px";
}
function hideTip() {
  tooltip.classList.remove("show");
}

let state = null; // { data (buildGraph output), profileHandle, weightMode, graph, zoom }

function setStatus(msg, isErr) {
  els.status.textContent = msg || "";
  els.status.classList.toggle("err", !!isErr);
}

// ---- layout + render ------------------------------------------------------

function computeExtent(nodes) {
  const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
  const countByDepth = new Map();
  for (const n of nodes) countByDepth.set(n.depth, (countByDepth.get(n.depth) || 0) + 1);
  const maxCount = Math.max(1, ...countByDepth.values());
  const width = Math.min(CANVAS_MAX, Math.max(MIN_SIZE, (maxDepth + 1) * LEVEL_GAP));
  const height = Math.min(CANVAS_MAX, Math.max(MIN_SIZE, maxCount * 15));
  return { width, height, maxDepth };
}

function layout(data, weightMode) {
  const { width, height, maxDepth } = computeExtent(data.nodes);
  const sankeyLayout = d3
    .sankey()
    .nodeId((d) => d.id)
    .nodeWidth(NODE_WIDTH)
    .nodePadding(NODE_PADDING)
    .nodeAlign(d3.sankeyLeft)
    .extent([[MARGIN, MARGIN], [width - MARGIN, height - MARGIN]])
    .iterations(6);

  const graph = sankeyLayout({
    nodes: data.nodes.map((d) => Object.assign({}, d)),
    links: data.links.map((l) => Object.assign({}, l, { value: Math.max(1, weightMode === "engagement" ? l.engagement : l.posts) })),
  });
  return { graph, width, height, maxDepth };
}

// Columns share an x0/x1 per depth (nodeAlign left), so hit-testing can
// narrow to a column first, then binary-search that column's nodes by y —
// O(log n) per pointer move instead of O(n) even on a many-thousand-node tree.
function buildIndex(graph) {
  const columns = new Map();
  for (const n of graph.nodes) {
    if (!columns.has(n.depth)) columns.set(n.depth, []);
    columns.get(n.depth).push(n);
  }
  for (const arr of columns.values()) arr.sort((a, b) => a.y0 - b.y0);
  const incoming = new Map();
  const outgoing = new Map();
  for (const l of graph.links) {
    if (!outgoing.has(l.source.id)) outgoing.set(l.source.id, []);
    outgoing.get(l.source.id).push(l);
    incoming.set(l.target.id, l);
  }
  return { columns, incoming, outgoing };
}

function nodeAt(index, x, y) {
  for (const arr of index.columns.values()) {
    const first = arr[0];
    if (x < first.x0 || x > first.x1) continue;
    let lo = 0, hi = arr.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const n = arr[mid];
      if (y < n.y0) hi = mid - 1;
      else if (y > n.y1) lo = mid + 1;
      else return n;
    }
    return null;
  }
  return null;
}

function draw(canvas, graph, maxDepth, highlightId, index) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const linkGen = d3.sankeyLinkHorizontal();
  const hiLinks = new Set();
  if (highlightId) {
    const inc = index.incoming.get(highlightId);
    if (inc) hiLinks.add(inc);
    for (const l of index.outgoing.get(highlightId) || []) hiLinks.add(l);
  }

  for (const l of graph.links) {
    const hi = hiLinks.has(l);
    const tgt = l.target;
    ctx.strokeStyle = tgt.stub ? STUB_COLOR[tgt.stub] : depthColor(tgt.depth, maxDepth);
    ctx.globalAlpha = highlightId ? (hi ? 0.85 : 0.08) : 0.42;
    ctx.lineWidth = Math.max(1, l.width);
    ctx.stroke(new Path2D(linkGen(l)));
  }

  let connected = null;
  if (highlightId) {
    connected = new Set([highlightId]);
    const inc = index.incoming.get(highlightId);
    if (inc) connected.add(inc.source.id);
    for (const l of index.outgoing.get(highlightId) || []) connected.add(l.target.id);
  }

  ctx.globalAlpha = 1;
  for (const n of graph.nodes) {
    const isRoot = !index.incoming.has(n.id);
    ctx.fillStyle = n.stub ? STUB_COLOR[n.stub] : depthColor(n.depth, maxDepth);
    ctx.globalAlpha = connected && !connected.has(n.id) ? 0.25 : 1;
    ctx.fillRect(n.x0, n.y0, Math.max(1, n.x1 - n.x0), Math.max(1, n.y1 - n.y0));
    ctx.globalAlpha = 1;
    if (isRoot && !n.stub) {
      ctx.strokeStyle = colorVar("text-primary") || "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(n.x0 - 1, n.y0 - 1, n.x1 - n.x0 + 2, n.y1 - n.y0 + 2);
    }
  }
}

function tooltipHtml(n) {
  if (n.stub === "deleted") return `<div class="t-title">🗑 deleted or removed</div><div class="t-sub">this branch's replies aren't visible anymore</div>`;
  if (n.stub === "blocked") return `<div class="t-title">🚫 blocked</div><div class="t-sub">a block hides what came after this</div>`;
  const who = n.author ? `@${n.author.handle}` : "unknown";
  const text = truncate(n.text, 180);
  return (
    `<div class="t-title">${escapeHtml(who)}</div>` +
    (text ? `<div class="t-text">${escapeHtml(text)}</div>` : "") +
    `<div class="t-sub">❤ ${fmt(n.likeCount)} · 🔁 ${fmt(n.repostCount)} · 💬 ${fmt(n.replyCount)}` +
    (n.value != null ? ` · ${fmt(Math.round(n.value))} ${state.weightMode} downstream` : "") +
    `</div>`
  );
}

function render() {
  const { graph, width, height, maxDepth } = layout(state.data, state.weightMode);
  state.graph = graph;
  state.index = buildIndex(graph);
  state.maxDepth = maxDepth;

  els.canvas.width = width;
  els.canvas.height = height;
  applyZoom();
  draw(els.canvas, graph, maxDepth, null, state.index);

  els.stats.innerHTML = [
    `<span><b>${fmt(state.data.totalPosts)}</b> posts</span>`,
    `<span><b>${fmt(state.data.totalEngagement)}</b> likes+reposts+replies</span>`,
    `<span><b>${fmt(state.data.maxDepth)}</b> replies deep</span>`,
  ].join("");

  const rootAuthor = state.data.nodes.find((n) => n.id === state.data.rootId)?.author;
  els.caption.textContent =
    (rootAuthor ? `Rooted at @${rootAuthor.handle}'s post. ` : "") +
    (state.data.ancestorCount ? `You pasted a reply — walked ${state.data.ancestorCount} post${state.data.ancestorCount === 1 ? "" : "s"} back up to the root first. ` : "") +
    `Flow width = ${state.weightMode === "engagement" ? "likes+reposts+replies" : "post count"} carried by that branch. Deeper replies shade warmer. Click a node to open the real post; hover for the text.`;

  buildShareCard();
}

function applyZoom() {
  const z = state.zoom || 1;
  els.canvas.style.width = Math.round(els.canvas.width * z) + "px";
  els.canvas.style.height = Math.round(els.canvas.height * z) + "px";
  els.zoomLabel.textContent = Math.round(z * 100) + "%";
}

function fitZoom() {
  const avail = els.canvasWrap.clientWidth - 4;
  const z = Math.min(1, Math.max(0.08, avail / els.canvas.width));
  state.zoom = Math.round(z * 100) / 100;
  els.zoomSlider.value = state.zoom;
  applyZoom();
}

// ---- pointer interaction ---------------------------------------------------

let hovered = null;
function canvasPoint(evt) {
  const rect = els.canvas.getBoundingClientRect();
  const sx = els.canvas.width / rect.width;
  const sy = els.canvas.height / rect.height;
  return { x: (evt.clientX - rect.left) * sx, y: (evt.clientY - rect.top) * sy };
}

let rafPending = false;
els.canvas.addEventListener("mousemove", (evt) => {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    if (!state || !state.graph) return;
    const { x, y } = canvasPoint(evt);
    const n = nodeAt(state.index, x, y);
    if (n !== hovered) {
      hovered = n;
      draw(els.canvas, state.graph, state.maxDepth, n ? n.id : null, state.index);
    }
    if (n) showTip(tooltipHtml(n), evt);
    else hideTip();
  });
});
els.canvas.addEventListener("mouseleave", () => {
  hovered = null;
  hideTip();
  if (state && state.graph) draw(els.canvas, state.graph, state.maxDepth, null, state.index);
});
els.canvas.addEventListener("click", (evt) => {
  const { x, y } = canvasPoint(evt);
  const n = nodeAt(state.index, x, y);
  if (n && n.url) window.open(n.url, "_blank", "noopener");
});

els.zoomSlider.addEventListener("input", () => {
  state.zoom = parseFloat(els.zoomSlider.value);
  applyZoom();
});
els.zoomFit.addEventListener("click", fitZoom);

els.weightToggle.addEventListener("click", () => {
  if (!state) return;
  state.weightMode = state.weightMode === "posts" ? "engagement" : "posts";
  els.weightToggle.textContent = state.weightMode === "posts" ? "weighting: posts" : "weighting: engagement";
  render();
});

// ---- share card -------------------------------------------------------------

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

let lastShareText = "";
function shareUrlForCurrent() {
  const rootAuthor = state.data.nodes.find((n) => n.id === state.data.rootId)?.author;
  const did = rootAuthor ? rootAuthor.did : didOf(state.data.rootId);
  const rkey = rkeyOf(state.data.rootId);
  return `https://threadriver.bisks.net/s/${did}/${rkey}`;
}
function buildShareText() {
  const rootAuthor = state.data.nodes.find((n) => n.id === state.data.rootId)?.author;
  const who = rootAuthor ? "@" + rootAuthor.handle : "a thread";
  return `threadriver: ${who}'s thread has ${fmt(state.data.totalPosts)} posts in it, drawn as a giant sankey. ${shareUrlForCurrent()}`;
}

async function buildShareCard() {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const mono = "system-ui, -apple-system, sans-serif";
  const rootAuthor = state.data.nodes.find((n) => n.id === state.data.rootId)?.author;
  const avatar = await loadImg(rootAuthor && rootAuthor.avatar);

  const bg = colorVar("page") || "#08101a";
  const surface = colorVar("surface-1") || "#0f1c2b";
  const ink = colorVar("text-primary") || "#fff";
  const dim = colorVar("text-secondary") || "#a9c0d4";
  const accent = colorVar("accent") || "#3fb6c9";

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = `800 50px ${mono}`;
  ctx.fillText("threadriver", 56, 90);

  let textX = 56;
  const who = rootAuthor ? "@" + rootAuthor.handle : "a Bluesky thread";
  ctx.fillStyle = ink;
  ctx.font = `700 24px ${mono}`;
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(80, 132, 24, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 56, 108, 48, 48);
    ctx.restore();
    textX = 118;
  }
  ctx.fillText(who + "'s thread", textX, 140);
  ctx.fillStyle = dim;
  ctx.font = `400 15px ${mono}`;
  ctx.fillText(`${fmt(state.data.totalPosts)} posts · ${fmt(state.data.maxDepth)} replies deep · ${fmt(state.data.totalEngagement)} likes+reposts+replies`, textX, 162);

  const cardX = 56, cardY = 196, cardW = W - 112, cardH = H - 260;
  ctx.fillStyle = surface;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 14);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 14);
  ctx.clip();
  const sc = els.canvas;
  const scale = Math.min(cardW / sc.width, cardH / sc.height);
  const dw = sc.width * scale, dh = sc.height * scale;
  ctx.drawImage(sc, cardX + (cardW - dw) / 2, cardY + (cardH - dh) / 2, dw, dh);
  ctx.restore();

  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.font = `700 20px ${mono}`;
  ctx.fillText("threadriver.bisks.net", 56, H - 36);

  lastShareText = buildShareText();
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
}

els.shareDownload.addEventListener("click", () => {
  els.canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "threadriver-full.png";
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});
els.shareCardDownload.addEventListener("click", () => {
  els.shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "threadriver-card.png";
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});
function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([""], "probe.png", { type: "image/png" })] });
  } catch (_) {
    return false;
  }
}
if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", () => {
    els.shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "threadriver-card.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "threadriver" });
      } catch (_) {
        // cancelled
      }
    }, "image/png");
  });
}

// ---- theme -------------------------------------------------------------

function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
  els.themeToggle.textContent = "🌗 theme: " + (t || "auto");
  if (state) render();
}
applyTheme(localStorage.getItem("threadriver-theme"));
els.themeToggle.addEventListener("click", () => {
  const order = [null, "light", "dark"];
  const cur = localStorage.getItem("threadriver-theme");
  const next = order[(order.indexOf(cur) + 1) % order.length];
  if (next) localStorage.setItem("threadriver-theme", next);
  else localStorage.removeItem("threadriver-theme");
  applyTheme(next);
});

document.addEventListener("mousemove", (e) => {
  if (tooltip.classList.contains("show")) moveTip(e);
});

// ---- run ------------------------------------------------------------------

async function run(rawInput) {
  const raw = (rawInput || "").trim();
  if (!raw) {
    setStatus("paste a Bluesky post link first.", true);
    return;
  }
  els.go.disabled = true;
  els.results.classList.remove("show");
  setStatus("resolving that post...");

  try {
    const uri = await resolvePostUri(raw);
    setStatus("downloading the whole thread (up to 1000 replies deep)...");
    const thread = await fetchThread(uri);
    setStatus("mapping the flow...");
    const data = buildGraph(thread);

    state = { data, weightMode: "posts", zoom: 1 };
    els.weightToggle.textContent = "weighting: posts";
    els.results.classList.add("show");
    render();
    fitZoom();

    history.replaceState(null, "", "/s/" + didOf(data.rootId) + "/" + rkeyOf(data.rootId));

    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus("couldn't map that thread: " + (err && err.message ? err.message : err), true);
  } finally {
    els.go.disabled = false;
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  run(els.input.value);
});

window.addEventListener("resize", () => {
  if (state) fitZoom();
});

// auto-run from a shared /s/<did>/<rkey> link or a ?u= query param
const shareMatch = /^\/s\/(did:[^/]+)\/([^/]+)\/?$/.exec(location.pathname);
if (shareMatch) {
  const uri = `at://${shareMatch[1]}/app.bsky.feed.post/${shareMatch[2]}`;
  els.input.value = uri;
  run(uri);
} else {
  const params = new URLSearchParams(location.search);
  const initial = params.get("u");
  if (initial) {
    els.input.value = initial;
    run(initial);
  }
}
