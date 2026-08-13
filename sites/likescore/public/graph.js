import { escapeHtml, fetchJSON } from "./common.js";

const params = new URLSearchParams(location.search);
const focusSubject = params.get("focus") || params.get("subject") || "";

const canvas = document.getElementById("graph");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");
const heading = document.getElementById("graph-heading");
const wholeLink = document.getElementById("whole-network-link");
const edgeTableBody = document.getElementById("edge-table-body");
const mutualsCheckbox = document.getElementById("mutuals-only");

let rawNodes = []; // full data from the API, before the mutuals-only filter
let rawEdges = [];
let nodes = []; // {id, handle, avatar, status, score, x, y, vx, vy, fixed} — filtered, laid-out set
let edges = []; // {from, to, weight, reciprocal} — filtered set
let byId = new Map();
let view = { scale: 1, ox: 0, oy: 0 };
let dragging = null; // node being dragged
let panPointer = null; // {id, lastX, lastY}
let selected = null;
let hovered = null;
let pinch = null; // {startDist, startScale}
const pointers = new Map();

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
// Resizing a <canvas> clears its pixels. Mobile browsers fire "resize" as the
// address bar collapses/expands mid-scroll (the canvas is sized in vh), which
// was wiping the graph to blank until the next interaction. Redraw right after
// every resize so the graph survives scrolling instead of vanishing.
let resizeRaf = null;
function scheduleResize() {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = null;
    resizeCanvas();
    draw();
  });
}
window.addEventListener("resize", scheduleResize);

function scoreRadius(score) {
  return 5 + Math.sqrt(Math.max(score, 1)) * 1.7;
}

function worldToScreen(x, y) {
  const rect = canvas.getBoundingClientRect();
  return [
    (x + view.ox) * view.scale + rect.width / 2,
    (y + view.oy) * view.scale + rect.height / 2,
  ];
}
function screenToWorld(sx, sy) {
  const rect = canvas.getBoundingClientRect();
  return [
    (sx - rect.width / 2) / view.scale - view.ox,
    (sy - rect.height / 2) / view.scale - view.oy,
  ];
}

// ---- fit-to-graph: frames the current node extent in the canvas, instead
// of snapping to a fixed scale/origin that only happens to work for one
// particular graph size. Used on load, on "fit view", and after a re-layout.
const LAYOUT_R = 260;
function scatterCircular(list) {
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(n, 1)) * Math.PI * 2;
    list[i].x = Math.cos(a) * LAYOUT_R + (Math.random() - 0.5) * 40;
    list[i].y = Math.sin(a) * LAYOUT_R + (Math.random() - 0.5) * 40;
    list[i].vx = 0;
    list[i].vy = 0;
    list[i].fixed = false;
  }
}

function computeBounds() {
  if (!nodes.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const r = scoreRadius(n.score);
    minX = Math.min(minX, n.x - r);
    maxX = Math.max(maxX, n.x + r);
    minY = Math.min(minY, n.y - r);
    maxY = Math.max(maxY, n.y + r);
  }
  return { minX, maxX, minY, maxY };
}

function fitView() {
  const rect = canvas.getBoundingClientRect();
  const bounds = computeBounds();
  if (!bounds || !rect.width || !rect.height) {
    view = { scale: 1, ox: 0, oy: 0 };
    draw();
    return;
  }
  const pad = 60;
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const scale = clamp(Math.min((rect.width - pad * 2) / w, (rect.height - pad * 2) / h), 0.15, 4);
  view = {
    scale,
    ox: -(bounds.minX + bounds.maxX) / 2,
    oy: -(bounds.minY + bounds.maxY) / 2,
  };
  draw();
}

async function load() {
  const url = focusSubject
    ? `/api/graph?focus=${encodeURIComponent(focusSubject)}`
    : `/api/graph`;
  heading.textContent = focusSubject ? "account-focused graph" : "whole-network graph";
  if (focusSubject) wholeLink.hidden = false;
  let data;
  try {
    data = await fetchJSON(url);
  } catch (err) {
    heading.textContent = `couldn't load graph: ${err.message}`;
    return;
  }
  rawNodes = data.nodes;
  rawEdges = data.edges;
  applyFilter(true);
}

// ---- mutuals-only filter: rebuilds the laid-out `nodes`/`edges` from the
// raw API data. "mutuals only" keeps just reciprocal-liked pairs (and drops
// anyone left with no mutual edge), so the graph reads as who actually likes
// each other back rather than every one-way like too.
function applyFilter(autoFit) {
  const didSet = new Set(rawNodes.map((n) => n.did));
  const validEdges = rawEdges.filter((e) => didSet.has(e.from) && didSet.has(e.to));
  let filteredNodes;
  let filteredEdges;
  if (mutualsCheckbox.checked) {
    filteredEdges = validEdges.filter((e) => e.reciprocal);
    const keep = new Set();
    for (const e of filteredEdges) {
      keep.add(e.from);
      keep.add(e.to);
    }
    if (focusSubject) keep.add(focusSubject); // keep the focused account even if it has no mutual
    filteredNodes = rawNodes.filter((n) => keep.has(n.did));
  } else {
    filteredEdges = validEdges;
    filteredNodes = rawNodes;
  }

  nodes = filteredNodes.map((n) => ({ ...n, x: 0, y: 0, vx: 0, vy: 0, fixed: false }));
  scatterCircular(nodes);
  byId = new Map(nodes.map((n) => [n.did, n]));
  edges = filteredEdges;
  selected = null;
  hovered = null;
  hideTooltip();

  renderEdgeTable();
  if (!nodes.length) {
    draw();
    return;
  }
  resizeCanvas();
  runSimulation(autoFit);
}
mutualsCheckbox.addEventListener("change", () => applyFilter(true));

function renderEdgeTable() {
  if (!edges.length) {
    const msg =
      mutualsCheckbox.checked && rawEdges.length
        ? `no reciprocal (mutual) likes in this graph — untick "mutuals only" to see one-way likes too.`
        : "no edges in this graph yet.";
    edgeTableBody.innerHTML = `<tr><td colspan="4" class="empty">${msg}</td></tr>`;
    return;
  }
  edgeTableBody.innerHTML = edges
    .slice(0, 500)
    .map((e) => {
      const from = byId.get(e.from);
      const to = byId.get(e.to);
      return `<tr>
        <td><a class="handle" href="/account.html?subject=${encodeURIComponent(e.from)}">@${escapeHtml(from?.handle || e.from)}</a></td>
        <td><a class="handle" href="/account.html?subject=${encodeURIComponent(e.to)}">@${escapeHtml(to?.handle || e.to)}</a></td>
        <td class="num">${e.weight}</td>
        <td>${e.reciprocal ? "↔ mutual" : "—"}</td>
      </tr>`;
    })
    .join("");
}

// ---- force simulation: bounded number of ticks, animated so the graph
// visibly "settles" (fits the network-observatory feel), then interaction
// takes over without a continuous physics loop burning CPU.
const REPULSE_K = 2600;
const SPRING_K = 0.02;
const SPRING_LEN = 90;
const CENTER_K = 0.004;
const DAMPING = 0.82;
const MAX_TICKS = 220;

function tick() {
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    if (a.fixed) continue;
    let fx = -a.x * CENTER_K;
    let fy = -a.y * CENTER_K;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy || 0.01;
      const d = Math.sqrt(d2);
      const f = REPULSE_K / d2;
      fx += (dx / d) * f;
      fy += (dy / d) * f;
    }
    a.fx = fx;
    a.fy = fy;
  }
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const target = SPRING_LEN + Math.min(30, 300 / (e.weight + 1));
    const f = (d - target) * SPRING_K;
    const fx = (dx / d) * f;
    const fy = (dy / d) * f;
    if (!a.fixed) {
      a.fx += fx;
      a.fy += fy;
    }
    if (!b.fixed) {
      b.fx -= fx;
      b.fy -= fy;
    }
  }
  for (const a of nodes) {
    if (a.fixed) continue;
    a.vx = (a.vx + a.fx) * DAMPING;
    a.vy = (a.vy + a.fy) * DAMPING;
    a.x += a.vx * 0.02;
    a.y += a.vy * 0.02;
  }
}

let simFrame = 0;
let rafId = null;
function runSimulation(autoFit) {
  simFrame = 0;
  cancelAnimationFrame(rafId);
  function frame() {
    tick();
    draw();
    simFrame++;
    if (simFrame < MAX_TICKS) {
      rafId = requestAnimationFrame(frame);
    } else if (autoFit && !dragging && !panPointer) {
      // graph has settled and nobody's mid-interaction: frame it automatically
      // rather than leaving whatever scale/origin the layout happened to start at.
      fitView();
    }
  }
  rafId = requestAnimationFrame(frame);
}

const searchInput = document.getElementById("search-input");
function matchesSearch(node) {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return false;
  return (
    node.handle?.toLowerCase().includes(q) ||
    node.displayName?.toLowerCase().includes(q)
  );
}

const zoomReadout = document.getElementById("zoom-readout");
function draw() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  const hasQuery = searchInput.value.trim().length > 0;
  zoomReadout.textContent = `${Math.round(view.scale * 100)}%`;

  // edges
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const [ax, ay] = worldToScreen(a.x, a.y);
    const [bx, by] = worldToScreen(b.x, b.y);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineWidth = Math.max(0.6, Math.min(6, Math.log2(e.weight + 1))) * view.scale;
    ctx.strokeStyle = e.reciprocal
      ? "rgba(59,167,159,0.55)"
      : "rgba(255,180,170,0.28)";
    ctx.stroke();
    // arrowhead at b, offset by node radius
    const rb = scoreRadius(b.score) * view.scale;
    const dx = bx - ax;
    const dy = by - ay;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const tipx = bx - ux * rb;
    const tipy = by - uy * rb;
    const size = 4 + Math.min(4, Math.log2(e.weight + 1));
    ctx.beginPath();
    ctx.moveTo(tipx, tipy);
    ctx.lineTo(tipx - ux * size - uy * size * 0.6, tipy - uy * size + ux * size * 0.6);
    ctx.lineTo(tipx - ux * size + uy * size * 0.6, tipy - uy * size - ux * size * 0.6);
    ctx.closePath();
    ctx.fillStyle = e.reciprocal ? "rgba(59,167,159,0.7)" : "rgba(255,180,170,0.45)";
    ctx.fill();
  }

  // nodes
  for (const node of nodes) {
    const [x, y] = worldToScreen(node.x, node.y);
    const r = scoreRadius(node.score) * view.scale;
    const isMatch = hasQuery && matchesSearch(node);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (node.status === "provisional") {
      ctx.fillStyle = "rgba(217,166,60,0.12)";
      ctx.strokeStyle = "#d9a63c";
      ctx.setLineDash([3, 3]);
    } else if (node.status === "deactivated") {
      ctx.fillStyle = "rgba(92,96,99,0.25)";
      ctx.strokeStyle = "#5c6063";
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = "rgba(59,167,159,0.28)";
      ctx.strokeStyle = "#3ba79f";
      ctx.setLineDash([]);
    }
    ctx.lineWidth = (node === selected ? 3 : 1.4) * (isMatch ? 1.6 : 1);
    if (isMatch) ctx.strokeStyle = "#ffd9d4";
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    if (view.scale > 0.55 || nodes.length < 40 || isMatch || node === selected || node === hovered) {
      ctx.fillStyle = isMatch ? "#ffd9d4" : "#e9e6df";
      ctx.font = `${Math.max(10, 11 * Math.min(view.scale, 1.4))}px var(--mono, monospace)`;
      ctx.textAlign = "center";
      ctx.fillText(`@${node.handle}`, x, y + r + 12);
    }
  }
}

// ---- interaction: pointer events unify mouse + touch -------------------
function nodeAt(sx, sy) {
  const [wx, wy] = screenToWorld(sx, sy);
  let best = null;
  let bestD = Infinity;
  for (const n of nodes) {
    const r = scoreRadius(n.score);
    const dx = n.x - wx;
    const dy = n.y - wy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= r + 4 && d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

function localXY(e) {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const [x, y] = localXY(e);
  pointers.set(e.pointerId, { x, y });
  if (pointers.size === 2) {
    const pts = [...pointers.values()];
    pinch = {
      startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      startScale: view.scale,
    };
    dragging = null;
    panPointer = null;
    return;
  }
  const hit = nodeAt(x, y);
  if (hit) {
    dragging = hit;
    hit.fixed = true;
    hideTooltip();
  } else {
    panPointer = { x, y, ox: view.ox, oy: view.oy };
    hideTooltip();
  }
});

canvas.addEventListener("pointermove", (e) => {
  const [x, y] = localXY(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x, y });

  if (pinch && pointers.size === 2) {
    const pts = [...pointers.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    view.scale = clamp(pinch.startScale * (dist / pinch.startDist), 0.15, 4);
    draw();
    return;
  }
  if (dragging) {
    const [wx, wy] = screenToWorld(x, y);
    dragging.x = wx;
    dragging.y = wy;
    draw();
    return;
  }
  if (panPointer) {
    view.ox = panPointer.ox + (x - panPointer.x) / view.scale;
    view.oy = panPointer.oy + (y - panPointer.y) / view.scale;
    draw();
    return;
  }
  const hit = nodeAt(x, y);
  if (hit !== hovered) {
    hovered = hit;
    draw();
  }
  if (hit) showTooltip(hit, x, y);
  else hideTooltip();
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (dragging) {
    dragging.fixed = false;
    dragging = null;
  }
  panPointer = null;
}
canvas.addEventListener("pointerup", (e) => {
  const wasDrag = dragging;
  const moved = panPointer && (Math.abs(panPointer.x) > 3);
  endPointer(e);
  if (!wasDrag) {
    const [x, y] = localXY(e);
    const hit = nodeAt(x, y);
    if (hit) {
      selected = hit;
      openNodeMenu(hit, x, y);
    } else {
      selected = null;
      hideTooltip();
    }
    draw();
  }
});
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("pointerleave", () => {
  if (!dragging) hideTooltip();
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    view.scale = clamp(view.scale * factor, 0.15, 4);
    draw();
  },
  { passive: false }
);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

document.getElementById("zoom-in").addEventListener("click", () => {
  view.scale = clamp(view.scale * 1.2, 0.15, 4);
  draw();
});
document.getElementById("zoom-out").addEventListener("click", () => {
  view.scale = clamp(view.scale / 1.2, 0.15, 4);
  draw();
});
document.getElementById("reset-view").addEventListener("click", () => {
  fitView();
});
document.getElementById("re-layout").addEventListener("click", () => {
  selected = null;
  hideTooltip();
  scatterCircular(nodes);
  runSimulation(true);
});
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (q) {
    const match = nodes.find(
      (n) => n.handle?.toLowerCase().includes(q) || n.displayName?.toLowerCase().includes(q)
    );
    if (match) {
      view.ox = -match.x;
      view.oy = -match.y;
    }
  }
  draw();
});

function showTooltip(node, x, y) {
  tooltip.hidden = false;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  tooltip.innerHTML = `<div class="box">@${escapeHtml(node.handle)} · PI ${node.score.toFixed(1)}${node.status === "provisional" ? " · provisional" : ""}</div>`;
}
function hideTooltip() {
  tooltip.hidden = true;
}

function openNodeMenu(node, x, y) {
  tooltip.hidden = false;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  const scanAction =
    node.status === "provisional"
      ? `<a class="btn" style="padding:4px 8px;font-size:11px" href="/?scan=${encodeURIComponent(node.did)}">scan &amp; promote</a>`
      : `<a class="btn ghost" style="padding:4px 8px;font-size:11px" href="/?scan=${encodeURIComponent(node.did)}">rescan</a>`;
  tooltip.innerHTML = `<div class="box" style="display:flex;flex-direction:column;gap:6px;white-space:normal;max-width:220px">
    <div><strong>@${escapeHtml(node.handle)}</strong> · PI ${node.score.toFixed(1)}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <a class="btn ghost" style="padding:4px 8px;font-size:11px" href="/account.html?subject=${encodeURIComponent(node.did)}">view file</a>
      <a class="btn ghost" style="padding:4px 8px;font-size:11px" href="/graph.html?focus=${encodeURIComponent(node.did)}">focus graph</a>
      ${scanAction}
    </div>
  </div>`;
}

load();
