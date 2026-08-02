// eulerize — trace a graph over an uploaded map, check it for an Eulerian
// circuit (connected + every vertex even degree), and if one exists, walk it
// with Hierholzer's algorithm. Everything runs client-side; no server, no wasm
// needed — a few hundred edges is nowhere near enough to need it.

const SITE_URL = "https://eulerize.bisks.net/";

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const wrap = document.getElementById("canvasWrap");

const els = {
  fileInput: document.getElementById("fileInput"),
  drawTool: document.getElementById("drawTool"),
  eraseTool: document.getElementById("eraseTool"),
  undoBtn: document.getElementById("undoBtn"),
  clearBtn: document.getElementById("clearBtn"),
  solveBtn: document.getElementById("solveBtn"),
  replayBtn: document.getElementById("replayBtn"),
  vertexCount: document.getElementById("vertexCount"),
  edgeCount: document.getElementById("edgeCount"),
  result: document.getElementById("result"),
  shareRow: document.getElementById("shareRow"),
  shareBluesky: document.getElementById("shareBluesky"),
  shareNative: document.getElementById("shareNative"),
  downloadBtn: document.getElementById("downloadBtn"),
};

// ---- state --------------------------------------------------------------

let image = null; // HTMLImageElement or null
let vertices = []; // {id, x, y}
let edges = []; // {id, a, b, used}
let nextId = 1;
let tool = "draw"; // "draw" | "erase"
let history = []; // stack of {vertices, edges} snapshots for undo

let dragStart = null; // {x,y} in canvas space
let dragStartVertex = null; // existing vertex under the pointer at start, or null
let dragCurrent = null; // live pointer pos while dragging

let circuit = null; // ordered [{v, viaEdge}] from the last solve, or null
let oddIds = new Set(); // vertex ids currently flagged odd-degree
let compColor = null; // Map(vertexId -> component index), set when disconnected

const COMPONENT_COLORS = ["#ff8a5c", "#ffd35c", "#8a7cff", "#ff5c9c", "#5cc8ff"];
let animTimer = null;
let animStep = 0; // how many circuit edges are currently drawn (0..edges.length)

const VERTEX_R = 7;
const HIT_R = 12;
const TAP_DIST = 6;
const EDGE_HIT_DIST = 8;

// ---- geometry helpers -----------------------------------------------------

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

function vertexById(id) {
  return vertices.find((v) => v.id === id);
}

function findVertexNear(x, y) {
  let best = null, bestD = HIT_R;
  for (const v of vertices) {
    const d = dist(x, y, v.x, v.y);
    if (d <= bestD) { best = v; bestD = d; }
  }
  return best;
}

function findEdgeNear(x, y) {
  let best = null, bestD = EDGE_HIT_DIST;
  for (const e of edges) {
    const a = vertexById(e.a), b = vertexById(e.b);
    if (!a || !b) continue;
    const d = pointToSegmentDist(x, y, a.x, a.y, b.x, b.y);
    if (d <= bestD) { best = e; bestD = d; }
  }
  return best;
}

function degree(id) {
  let n = 0;
  for (const e of edges) {
    if (e.a === id) n++;
    if (e.b === id) n++;
  }
  return n;
}

// ---- pointer -> canvas coordinates ---------------------------------------

function pointerPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY,
  };
}

// ---- history / mutation ---------------------------------------------------

function snapshot() {
  history.push({
    vertices: vertices.map((v) => ({ ...v })),
    edges: edges.map((e) => ({ id: e.id, a: e.a, b: e.b })),
  });
  if (history.length > 200) history.shift();
}

function restore(snap) {
  vertices = snap.vertices.map((v) => ({ ...v }));
  edges = snap.edges.map((e) => ({ ...e }));
}

function addVertex(x, y) {
  const v = { id: nextId++, x, y };
  vertices.push(v);
  return v;
}

function addEdge(aId, bId) {
  edges.push({ id: nextId++, a: aId, b: bId });
}

function removeVertex(id) {
  vertices = vertices.filter((v) => v.id !== id);
  edges = edges.filter((e) => e.a !== id && e.b !== id);
}

function removeEdge(id) {
  edges = edges.filter((e) => e.id !== id);
}

function clearResult() {
  circuit = null;
  oddIds = new Set();
  compColor = null;
  clearInterval(animTimer);
  animTimer = null;
  animStep = 0;
  lastShareBlob = null;
  els.result.className = "result";
  els.result.innerHTML = "";
  els.shareRow.classList.remove("show");
  els.replayBtn.style.display = "none";
}

// ---- rendering --------------------------------------------------------

function resizeCanvasToImage() {
  const maxW = 860;
  if (image) {
    const scale = Math.min(1, maxW / image.naturalWidth);
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
  } else {
    canvas.width = maxW;
    canvas.height = Math.round(maxW * 0.62);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (image) {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(10, 15, 22, 0.28)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // edges
  for (const e of edges) {
    const a = vertexById(e.a), b = vertexById(e.b);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = "rgba(230, 237, 243, 0.55)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // circuit overlay (progressively revealed)
  if (circuit && animStep > 0) {
    for (let i = 1; i <= animStep; i++) {
      const from = vertexById(circuit[i - 1].v);
      const to = vertexById(circuit[i].v);
      if (!from || !to) continue;
      const t = i / edges.length;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      const hue = Math.round(168 - t * 40);
      ctx.strokeStyle = `hsl(${hue} 70% 60%)`;
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round";
      ctx.stroke();

      const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
      ctx.font = "bold 12px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(6, 12, 10, 0.85)";
      const label = String(i);
      const tw = ctx.measureText(label).width;
      ctx.fillRect(mx - tw / 2 - 4, my - 9, tw + 8, 16);
      ctx.fillStyle = `hsl(${hue} 85% 78%)`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, mx, my - 1);
    }
  }

  // vertices
  for (const v of vertices) {
    const isOdd = oddIds.has(v.id);
    const comp = compColor && compColor.get(v.id);
    ctx.beginPath();
    ctx.arc(v.x, v.y, VERTEX_R, 0, Math.PI * 2);
    ctx.fillStyle = isOdd ? "#ff5c7a" : "#e6edf3";
    ctx.fill();
    if (isOdd) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, VERTEX_R + 5, 0, Math.PI * 2);
      ctx.strokeStyle = "#ff5c7a";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (comp) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, VERTEX_R + 5, 0, Math.PI * 2);
      ctx.strokeStyle = COMPONENT_COLORS[(comp - 1) % COMPONENT_COLORS.length];
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (circuit && circuit[0].v === v.id) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, VERTEX_R + 5, 0, Math.PI * 2);
      ctx.strokeStyle = "#56d2c2";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // live drag preview
  if (dragStart && dragCurrent && tool === "draw") {
    const from = dragStartVertex || dragStart;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(dragCurrent.x, dragCurrent.y);
    ctx.strokeStyle = "rgba(86, 210, 194, 0.85)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  els.vertexCount.textContent = String(vertices.length);
  els.edgeCount.textContent = String(edges.length);
}

// ---- pointer interaction -----------------------------------------------

let pointerActive = false;

canvas.addEventListener("pointerdown", (evt) => {
  canvas.setPointerCapture(evt.pointerId);
  pointerActive = true;
  const pos = pointerPos(evt);

  if (tool === "erase") {
    const v = findVertexNear(pos.x, pos.y);
    if (v) {
      snapshot();
      removeVertex(v.id);
      clearResult();
      draw();
      return;
    }
    const e = findEdgeNear(pos.x, pos.y);
    if (e) {
      snapshot();
      removeEdge(e.id);
      clearResult();
      draw();
    }
    return;
  }

  dragStart = pos;
  dragStartVertex = findVertexNear(pos.x, pos.y);
  dragCurrent = pos;
});

canvas.addEventListener("pointermove", (evt) => {
  if (!pointerActive || tool !== "draw" || !dragStart) return;
  dragCurrent = pointerPos(evt);
  draw();
});

canvas.addEventListener("pointerup", (evt) => {
  pointerActive = false;
  if (tool !== "draw" || !dragStart) { dragStart = null; dragCurrent = null; return; }

  const end = pointerPos(evt);
  const startPos = dragStartVertex || dragStart;
  const d = dist(startPos.x, startPos.y, end.x, end.y);

  snapshot();
  let mutated = false;

  if (d < TAP_DIST) {
    if (!dragStartVertex) {
      addVertex(dragStart.x, dragStart.y);
      mutated = true;
    }
  } else {
    const a = dragStartVertex || addVertex(dragStart.x, dragStart.y);
    const existingB = findVertexNear(end.x, end.y);
    const b = existingB || addVertex(end.x, end.y);
    if (a.id !== b.id) {
      addEdge(a.id, b.id);
      mutated = true;
    }
  }

  if (mutated) {
    clearResult();
  } else {
    history.pop();
  }

  dragStart = null;
  dragStartVertex = null;
  dragCurrent = null;
  draw();
});

canvas.addEventListener("pointercancel", () => {
  pointerActive = false;
  dragStart = null;
  dragStartVertex = null;
  dragCurrent = null;
  draw();
});

// ---- toolbar --------------------------------------------------------------

els.drawTool.addEventListener("click", () => setTool("draw"));
els.eraseTool.addEventListener("click", () => setTool("erase"));

function setTool(t) {
  tool = t;
  els.drawTool.classList.toggle("active", t === "draw");
  els.eraseTool.classList.toggle("active", t === "erase");
  wrap.classList.toggle("erase-mode", t === "erase");
}

els.undoBtn.addEventListener("click", () => {
  const snap = history.pop();
  if (!snap) return;
  restore(snap);
  clearResult();
  draw();
});

els.clearBtn.addEventListener("click", () => {
  if (vertices.length === 0 && edges.length === 0) return;
  snapshot();
  vertices = [];
  edges = [];
  nextId = 1;
  clearResult();
  draw();
});

els.fileInput.addEventListener("change", async () => {
  const file = els.fileInput.files && els.fileInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    image = img;
    snapshot();
    vertices = [];
    edges = [];
    nextId = 1;
    clearResult();
    resizeCanvasToImage();
    draw();
    URL.revokeObjectURL(url);
  };
  img.src = url;
});

// ---- Hierholzer's algorithm -----------------------------------------------

function hierholzer(startId) {
  const adj = new Map();
  for (const v of vertices) adj.set(v.id, []);
  for (const e of edges) {
    e.used = false;
    adj.get(e.a).push({ edge: e, other: e.b });
    adj.get(e.b).push({ edge: e, other: e.a });
  }

  const stack = [{ v: startId, viaEdge: null }];
  const path = [];
  while (stack.length) {
    const top = stack[stack.length - 1];
    const options = adj.get(top.v);
    const next = options.find((o) => !o.edge.used);
    if (next) {
      next.edge.used = true;
      stack.push({ v: next.other, viaEdge: next.edge.id });
    } else {
      path.push(stack.pop());
    }
  }
  path.reverse();
  return path;
}

function computeComponents(activeIds) {
  const compOf = new Map();
  const adj = new Map();
  for (const id of activeIds) adj.set(id, []);
  for (const e of edges) {
    if (adj.has(e.a)) adj.get(e.a).push(e.b);
    if (adj.has(e.b)) adj.get(e.b).push(e.a);
  }
  let comp = 0;
  for (const id of activeIds) {
    if (compOf.has(id)) continue;
    comp++;
    const queue = [id];
    compOf.set(id, comp);
    while (queue.length) {
      const cur = queue.pop();
      for (const n of adj.get(cur) || []) {
        if (!compOf.has(n)) { compOf.set(n, comp); queue.push(n); }
      }
    }
  }
  return { compOf, numComponents: comp };
}

function solve() {
  clearResult();

  if (edges.length === 0) {
    els.result.className = "result bad show";
    els.result.innerHTML = `<h3>nothing to trace yet</h3><p>draw at least one edge between two points first.</p>`;
    draw();
    return;
  }

  const activeIds = vertices.filter((v) => degree(v.id) > 0).map((v) => v.id);
  const { compOf, numComponents } = computeComponents(activeIds);
  const odd = activeIds.filter((id) => degree(id) % 2 !== 0);

  if (numComponents > 1) {
    compColor = compOf;
    els.result.className = "result bad show";
    els.result.innerHTML = `<h3>no eulerian circuit — the graph is disconnected</h3>
      <p>the traced edges form <b>${numComponents}</b> separate pieces, each ringed
      in its own color above. an eulerian circuit needs every edge reachable from
      every other edge. connect the pieces (or erase the stray one) and try again.</p>`;
    els.shareRow.classList.add("show");
    setShareText(`traced a street graph and it split into ${numComponents} disconnected pieces — no eulerian circuit possible there. checking with hierholzer's algorithm at`);
    draw();
    return;
  }

  if (odd.length > 0) {
    oddIds = new Set(odd);
    els.result.className = "result bad show";
    els.result.innerHTML = `<h3>no eulerian circuit — ${odd.length} odd-degree vertex${odd.length === 1 ? "" : "es"}</h3>
      <p>every vertex needs an <i>even</i> number of edges touching it for a closed
      tour to exist (you can't leave a corner more times than you arrive). the
      <span class="odd-list">red</span> points above have odd degree. add or remove
      an edge to fix parity, or accept it — some street grids genuinely don't admit
      a true tour (ask <a href="https://bsky.app/profile/eternalism-when.bsky.social" target="_blank" rel="noopener">@eternalism-when</a>, whose Wallington hike started this).</p>`;
    els.shareRow.classList.add("show");
    setShareText(`traced a street graph with ${odd.length} odd-degree vertices — hierholzer says no eulerian circuit exists here, same problem @eternalism-when hit hiking Wallington. tracing your own map at`);
    draw();
    return;
  }

  const startId = activeIds[0];
  circuit = hierholzer(startId);
  oddIds = new Set();

  els.result.className = "result ok show";
  els.result.innerHTML = `<h3>eulerian circuit found</h3>
    <p>a closed tour crosses all <b>${edges.length}</b> edges exactly once, starting
    and ending at the <span style="color:#56d2c2">teal-ringed</span> point. watch it
    trace below, or hit replay.</p>`;
  els.replayBtn.style.display = "";
  els.shareRow.classList.add("show");
  setShareText(`found a one-stroke eulerian circuit through my map — ${edges.length} edges, hierholzer's algorithm doing the work. trace your own at`);

  animateCircuit();
}

function animateCircuit() {
  clearInterval(animTimer);
  animStep = 0;
  draw();
  const total = edges.length;
  const stepMs = total > 40 ? 40 : total > 15 ? 90 : 220;
  animTimer = setInterval(() => {
    animStep++;
    draw();
    if (animStep >= total) {
      clearInterval(animTimer);
      animTimer = null;
      onCircuitFullyDrawn();
    }
  }, stepMs);
}

function onCircuitFullyDrawn() {
  buildShareCard();
}

els.solveBtn.addEventListener("click", solve);
els.replayBtn.addEventListener("click", animateCircuit);

// ---- sharing ---------------------------------------------------------

let shareTextBase = "";

function setShareText(base) {
  shareTextBase = base;
  updateShareLinks();
}

function updateShareLinks() {
  const text = `${shareTextBase} ${SITE_URL}`;
  els.shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
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

let lastShareBlob = null;

function buildShareCard() {
  const card = document.createElement("canvas");
  card.width = canvas.width;
  card.height = canvas.height + 60;
  const cctx = card.getContext("2d");
  cctx.fillStyle = "#0a0f16";
  cctx.fillRect(0, 0, card.width, card.height);
  cctx.drawImage(canvas, 0, 0);
  cctx.fillStyle = "#151b23";
  cctx.fillRect(0, canvas.height, card.width, 60);
  cctx.fillStyle = "#56d2c2";
  cctx.font = "bold 22px 'JetBrains Mono', monospace";
  cctx.textAlign = "left";
  cctx.textBaseline = "middle";
  cctx.fillText("eulerize.bisks.net", 18, canvas.height + 30);
  cctx.fillStyle = "#8b96a5";
  cctx.font = "14px 'JetBrains Mono', monospace";
  cctx.textAlign = "right";
  const summary = circuit ? `${edges.length}-edge circuit` : `${oddIds.size} odd vertices`;
  cctx.fillText(summary, card.width - 18, canvas.height + 30);

  card.toBlob((blob) => {
    lastShareBlob = blob;
  }, "image/png");
}

els.downloadBtn.addEventListener("click", () => {
  if (!lastShareBlob) buildShareCard();
  setTimeout(() => {
    if (!lastShareBlob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(lastShareBlob);
    a.download = "eulerize.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 30);
});

if (canShareFiles()) {
  els.shareNative.style.display = "";
  els.shareNative.addEventListener("click", async () => {
    if (!lastShareBlob) buildShareCard();
    setTimeout(async () => {
      if (!lastShareBlob) return;
      const file = new File([lastShareBlob], "eulerize.png", { type: "image/png" });
      try {
        await navigator.share({
          files: [file],
          text: `${shareTextBase} ${SITE_URL}`,
          title: "eulerize",
        });
      } catch {
        /* user cancelled — fine */
      }
    }, 30);
  });
} else {
  els.shareNative.style.display = "none";
}

// ---- init ------------------------------------------------------------

resizeCanvasToImage();
setTool("draw");
draw();
