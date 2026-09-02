// brewpaint — a tiny Paint.NET tribute. Everything runs client-side: a stack
// of offscreen layer canvases, composited onto the visible #view canvas.

const W = 900, H = 600;
const SITE_URL = "https://brewpaint.bisks.net/";

// Undo stack is capped — each entry is a full-resolution ImageData
// (900x600x4 bytes ≈ 2.1MB), so an uncapped stack is real, unbounded
// browser-memory growth on a long drawing session, not just a habit cap.
const UNDO_CAP = 60;

const view = document.getElementById("view");
const vctx = view.getContext("2d");

const PALETTE = [
  "#000000", "#404040", "#808080", "#c0c0c0", "#ffffff", "#a05a2c", "#7f2020", "#ff0000",
  "#ff7f00", "#ffff00", "#7fff00", "#00a020", "#00ffff", "#0060ff", "#4000ff", "#a000ff",
  "#ff00ff", "#ff80c0", "#ffd8a8", "#f5deb3", "#3a2a1a", "#1a3a1a", "#1a1a3a", "#202020",
];

let layers = []; // { canvas, ctx, name, visible }
let activeLayer = 0;
let tool = "brush";
let shapeFilled = false;
let primaryColor = "#111111";
let secondaryColor = "#ffffff";
let brushSize = 6;
let brushOpacity = 1;

let undoStack = [];
let redoStack = [];

function newLayerCanvas() {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  return c;
}

function addLayer(name) {
  const canvas = newLayerCanvas();
  const ctx = canvas.getContext("2d");
  layers.push({ canvas, ctx, name: name || `layer ${layers.length + 1}`, visible: true });
  activeLayer = layers.length - 1;
  renderLayerList();
  composite();
}

function composite() {
  vctx.clearRect(0, 0, W, H);
  for (const layer of layers) {
    if (!layer.visible) continue;
    vctx.drawImage(layer.canvas, 0, 0);
  }
}

function renderLayerList() {
  const el = document.getElementById("layers");
  el.innerHTML = "";
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const row = document.createElement("div");
    row.className = "layer-row" + (i === activeLayer ? " active" : "");

    const vis = document.createElement("input");
    vis.type = "checkbox";
    vis.checked = layer.visible;
    vis.onchange = () => { layer.visible = vis.checked; composite(); };

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = layer.name;
    name.title = "click to select, double-click to rename";
    name.onclick = () => { activeLayer = i; renderLayerList(); };
    name.ondblclick = () => {
      const next = prompt("layer name", layer.name);
      if (next) { layer.name = next; renderLayerList(); }
    };

    const actions = document.createElement("div");
    actions.className = "layer-actions";
    const up = document.createElement("button");
    up.textContent = "▲";
    up.title = "move up";
    up.disabled = i === layers.length - 1;
    up.onclick = () => { moveLayer(i, i + 1); };
    const down = document.createElement("button");
    down.textContent = "▼";
    down.title = "move down";
    down.disabled = i === 0;
    down.onclick = () => { moveLayer(i, i - 1); };
    actions.append(up, down);

    row.append(vis, name, actions);
    el.appendChild(row);
  }
}

function moveLayer(from, to) {
  if (to < 0 || to >= layers.length) return;
  const [l] = layers.splice(from, 1);
  layers.splice(to, 0, l);
  if (activeLayer === from) activeLayer = to;
  else if (activeLayer === to) activeLayer = from;
  renderLayerList();
  composite();
}

function deleteActiveLayer() {
  if (layers.length <= 1) return;
  layers.splice(activeLayer, 1);
  activeLayer = Math.max(0, activeLayer - 1);
  renderLayerList();
  composite();
}

// --- undo/redo ---

function snapshot() {
  const layer = layers[activeLayer];
  return { layerIndex: activeLayer, data: layer.ctx.getImageData(0, 0, W, H) };
}

function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > UNDO_CAP) undoStack.shift();
  redoStack = [];
}

function undo() {
  if (!undoStack.length) return;
  const step = undoStack.pop();
  const layer = layers[step.layerIndex];
  if (!layer) return;
  redoStack.push({ layerIndex: step.layerIndex, data: layer.ctx.getImageData(0, 0, W, H) });
  layer.ctx.putImageData(step.data, 0, 0);
  composite();
}

function redo() {
  if (!redoStack.length) return;
  const step = redoStack.pop();
  const layer = layers[step.layerIndex];
  if (!layer) return;
  undoStack.push({ layerIndex: step.layerIndex, data: layer.ctx.getImageData(0, 0, W, H) });
  layer.ctx.putImageData(step.data, 0, 0);
  composite();
}

// --- drawing ---

function canvasPoint(e) {
  const rect = view.getBoundingClientRect();
  const sx = W / rect.width;
  const sy = H / rect.height;
  return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
}

let drawing = false;
let lastPt = null;
let shapeStart = null;
let preShapeSnapshot = null;
let strokeColor = primaryColor;

function activeCtx() {
  return layers[activeLayer].ctx;
}

function strokeStyle(e) {
  return e.shiftKey || e.button === 2 ? secondaryColor : primaryColor;
}

function pointerDown(e) {
  if (!layers[activeLayer]) return;
  view.setPointerCapture(e.pointerId);
  const pt = canvasPoint(e);
  strokeColor = strokeStyle(e);

  if (tool === "eyedropper") {
    const px = vctx.getImageData(Math.round(pt.x), Math.round(pt.y), 1, 1).data;
    const hex = "#" + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
    setPrimaryColor(hex);
    return;
  }

  if (tool === "fill") {
    pushUndo();
    floodFill(activeCtx(), Math.round(pt.x), Math.round(pt.y), strokeColor);
    composite();
    return;
  }

  pushUndo();
  drawing = true;

  if (tool === "brush" || tool === "eraser") {
    lastPt = pt;
    const ctx = activeCtx();
    ctx.save();
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.globalAlpha = brushOpacity;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = brushSize;
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(pt.x + 0.01, pt.y + 0.01);
    ctx.stroke();
    ctx.restore();
    composite();
  } else if (tool === "line" || tool === "rect" || tool === "ellipse") {
    shapeStart = pt;
    preShapeSnapshot = activeCtx().getImageData(0, 0, W, H);
  }
}

function pointerMove(e) {
  if (!drawing) return;
  const pt = canvasPoint(e);

  if (tool === "brush" || tool === "eraser") {
    const ctx = activeCtx();
    ctx.save();
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.globalAlpha = brushOpacity;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = brushSize;
    ctx.beginPath();
    ctx.moveTo(lastPt.x, lastPt.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.restore();
    lastPt = pt;
    composite();
  } else if (tool === "line" || tool === "rect" || tool === "ellipse") {
    const ctx = activeCtx();
    ctx.putImageData(preShapeSnapshot, 0, 0);
    drawShape(ctx, tool, shapeStart, pt, strokeColor, brushSize, shapeFilled, secondaryColor);
    composite();
  }
}

function pointerUp() {
  drawing = false;
  lastPt = null;
  shapeStart = null;
  preShapeSnapshot = null;
}

function drawShape(ctx, kind, start, end, color, width, filled, fillColor) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = fillColor;
  ctx.lineWidth = width;
  ctx.beginPath();
  if (kind === "line") {
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  } else if (kind === "rect") {
    const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
    if (filled) ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  } else if (kind === "ellipse") {
    const cx = (start.x + end.x) / 2, cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2, ry = Math.abs(end.y - start.y) / 2;
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (filled) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// classic 4-connected stack-based flood fill with a tolerance, operating on
// one layer's ImageData directly (no recursion — plain arrays stay well
// within canvas-sized bounds, so no cap needed beyond the canvas itself).
function floodFill(ctx, startX, startY, hexColor) {
  if (startX < 0 || startY < 0 || startX >= W || startY >= H) return;
  const img = ctx.getImageData(0, 0, W, H);
  const data = img.data;
  const idx = (x, y) => (y * W + x) * 4;
  const start = idx(startX, startY);
  const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  const fill = hexToRgba(hexColor);
  if (target[0] === fill[0] && target[1] === fill[1] && target[2] === fill[2] && target[3] === fill[3]) return;

  const matches = (i) =>
    Math.abs(data[i] - target[0]) < 24 &&
    Math.abs(data[i + 1] - target[1]) < 24 &&
    Math.abs(data[i + 2] - target[2]) < 24 &&
    Math.abs(data[i + 3] - target[3]) < 24;

  const stack = [[startX, startY]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = idx(x, y);
    if (!matches(i)) continue;
    data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3];
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  ctx.putImageData(img, 0, 0);
}

function hexToRgba(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

// --- UI wiring ---

function setPrimaryColor(hex) {
  primaryColor = hex;
  document.getElementById("primaryColor").value = hex;
}
function setSecondaryColor(hex) {
  secondaryColor = hex;
  document.getElementById("secondaryColor").value = hex;
}

function setTool(name) {
  tool = name;
  document.querySelectorAll(".tool-btn[data-tool]").forEach((b) => {
    b.classList.toggle("active", b.dataset.tool === name);
  });
}

function buildPalette() {
  const el = document.getElementById("palette");
  for (const hex of PALETTE) {
    const b = document.createElement("button");
    b.style.background = hex;
    b.title = hex;
    b.addEventListener("click", (e) => {
      if (e.shiftKey) setSecondaryColor(hex); else setPrimaryColor(hex);
    });
    b.addEventListener("contextmenu", (e) => { e.preventDefault(); setSecondaryColor(hex); });
    el.appendChild(b);
  }
}

function init() {
  addLayer("background");
  buildPalette();

  document.getElementById("toolButtons").addEventListener("click", (e) => {
    const btn = e.target.closest(".tool-btn[data-tool]");
    if (btn) setTool(btn.dataset.tool);
  });
  document.getElementById("shapeFillToggle").addEventListener("click", (e) => {
    shapeFilled = !shapeFilled;
    e.target.textContent = shapeFilled ? "▪" : "▢";
    e.target.title = shapeFilled ? "filled shapes (click for outline)" : "outline shapes (click for filled)";
  });

  document.getElementById("primaryColor").addEventListener("input", (e) => { primaryColor = e.target.value; });
  document.getElementById("secondaryColor").addEventListener("input", (e) => { secondaryColor = e.target.value; });
  document.getElementById("swapColors").addEventListener("click", () => {
    const p = primaryColor;
    setPrimaryColor(secondaryColor);
    setSecondaryColor(p);
  });

  const sizeRange = document.getElementById("sizeRange");
  sizeRange.addEventListener("input", () => {
    brushSize = Number(sizeRange.value);
    document.getElementById("sizeVal").textContent = brushSize;
  });
  const opacityRange = document.getElementById("opacityRange");
  opacityRange.addEventListener("input", () => {
    brushOpacity = Number(opacityRange.value) / 100;
    document.getElementById("opacityVal").textContent = opacityRange.value;
  });

  document.getElementById("addLayer").addEventListener("click", () => addLayer());
  document.getElementById("delLayer").addEventListener("click", deleteActiveLayer);
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("redoBtn").addEventListener("click", redo);
  document.getElementById("clearBtn").addEventListener("click", () => {
    pushUndo();
    activeCtx().clearRect(0, 0, W, H);
    composite();
  });
  document.getElementById("downloadBtn").addEventListener("click", downloadPng);

  view.addEventListener("pointerdown", pointerDown);
  view.addEventListener("pointermove", pointerMove);
  view.addEventListener("pointerup", pointerUp);
  view.addEventListener("pointercancel", pointerUp);
  view.addEventListener("contextmenu", (e) => e.preventDefault());

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
      return;
    }
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const keyTools = { b: "brush", e: "eraser", l: "line", r: "rect", o: "ellipse", g: "fill", i: "eyedropper" };
    if (keyTools[e.key.toLowerCase()]) { setTool(keyTools[e.key.toLowerCase()]); return; }
    if (e.key === "[") { brushSize = Math.max(1, brushSize - 2); sizeRange.value = brushSize; document.getElementById("sizeVal").textContent = brushSize; }
    if (e.key === "]") { brushSize = Math.min(60, brushSize + 2); sizeRange.value = brushSize; document.getElementById("sizeVal").textContent = brushSize; }
  });

  setupSharing();
}

function downloadPng() {
  view.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "brewpaint.png";
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

// --- sharing ---

function buildShareCard() {
  const sc = document.getElementById("shareCanvas");
  const sctx = sc.getContext("2d");
  sctx.fillStyle = "#1e1f22";
  sctx.fillRect(0, 0, 1200, 630);

  // fit the artwork into a centered frame with room for a watermark strip
  const pad = 48;
  const frameW = 1200 - pad * 2;
  const frameH = 630 - pad * 2 - 60;
  const scale = Math.min(frameW / W, frameH / H);
  const dw = W * scale, dh = H * scale;
  const dx = (1200 - dw) / 2, dy = pad;

  sctx.fillStyle = "#2b2d31";
  sctx.fillRect(dx - 8, dy - 8, dw + 16, dh + 16);
  sctx.drawImage(view, dx, dy, dw, dh);

  sctx.fillStyle = "#eceef0";
  sctx.font = "700 26px ui-sans-serif, system-ui, sans-serif";
  sctx.fillText("painted with brewpaint 🖌️", pad, 630 - 34);
  sctx.fillStyle = "#9a9ea6";
  sctx.font = "18px ui-sans-serif, system-ui, sans-serif";
  sctx.fillText(SITE_URL, pad, 630 - 12);

  return sc;
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  const probe = new File([""], "probe.png", { type: "image/png" });
  return navigator.canShare({ files: [probe] });
}

function setupSharing() {
  const shareText = `I made this in brewpaint 🖌️ ${SITE_URL}`;
  document.getElementById("shareBluesky").href =
    "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

  document.getElementById("shareDownload").addEventListener("click", () => {
    const sc = buildShareCard();
    sc.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "brewpaint-share.png";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  });

  const nativeBtn = document.getElementById("shareNative");
  if (canShareFiles()) {
    nativeBtn.style.display = "";
    nativeBtn.addEventListener("click", async () => {
      const sc = buildShareCard();
      sc.toBlob(async (blob) => {
        const file = new File([blob], "brewpaint-share.png", { type: "image/png" });
        try {
          await navigator.share({ files: [file], text: shareText, title: "brewpaint" });
        } catch (_) { /* user cancelled */ }
      });
    });
  }
}

init();
