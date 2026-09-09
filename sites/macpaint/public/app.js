// macpaint — a 1-bit MacPaint tribute with a tiny text drawing language so an
// LLM can paint by writing a script instead of diffusing pixels.
//
// Everything here is a plain Uint8Array bitmap (0 = white, 1 = black). "Color"
// is really one of 17 ordered-dither patterns (a classic 8x8 Bayer matrix,
// thresholded) standing in for gray, exactly like the original 1984 MacPaint's
// pattern palette — dithering, not diffusion.

const W = 512, H = 342;

// Standard 8x8 Bayer ordered-dither matrix (values 0-63).
const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];
const PATTERN_COUNT = 17; // 0 = white .. 16 = solid black

function patternBit(pattern, x, y) {
  if (pattern <= 0) return 0;
  if (pattern >= PATTERN_COUNT - 1) return 1;
  return BAYER8[y & 7][x & 7] < pattern * 4 ? 1 : 0;
}

function clampPattern(n) {
  if (!Number.isFinite(n)) return 16;
  return Math.max(0, Math.min(PATTERN_COUNT - 1, Math.round(n)));
}

// ---------------------------------------------------------------- bitmap ---

class PixelCanvas {
  constructor(canvasEl, w, h) {
    this.w = w;
    this.h = h;
    this.bits = new Uint8Array(w * h);
    this.canvas = canvasEl;
    canvasEl.width = w;
    canvasEl.height = h;
    this.ctx = canvasEl.getContext("2d", { willReadFrequently: true });
    this.ctx.imageSmoothingEnabled = false;
    this.imageData = this.ctx.createImageData(w, h);
  }
  idx(x, y) {
    return y * this.w + x;
  }
  inBounds(x, y) {
    return x >= 0 && x < this.w && y >= 0 && y < this.h;
  }
  getBit(x, y) {
    return this.inBounds(x, y) ? this.bits[this.idx(x, y)] : 0;
  }
  plot(x, y, pattern) {
    x = Math.round(x);
    y = Math.round(y);
    if (!this.inBounds(x, y)) return;
    this.bits[this.idx(x, y)] = patternBit(pattern, x, y);
  }
  clear(pattern) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) this.plot(x, y, pattern);
    }
  }
  render() {
    const data = this.imageData.data;
    const bits = this.bits;
    for (let i = 0, p = 0; i < bits.length; i++, p += 4) {
      const v = bits[i] ? 0 : 255;
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }
    this.ctx.putImageData(this.imageData, 0, 0);
  }
  snapshot() {
    return this.bits.slice();
  }
  restore(snap) {
    this.bits.set(snap);
  }
}

// ------------------------------------------------------------ primitives ---

function drawLine(pc, x0, y0, x1, y1, pattern) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pc.plot(x0, y0, pattern);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function plotBrush(pc, x, y, size, pattern) {
  const r = Math.max(0, Math.floor(size / 2));
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r + 1) pc.plot(x + dx, y + dy, pattern);
    }
  }
}

function strokeBetween(pc, x0, y0, x1, y1, size, pattern) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plotBrush(pc, x0, y0, size, pattern);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function drawRect(pc, x, y, w, h, pattern, fill) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  if (fill) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) pc.plot(xx, yy, pattern);
    }
  } else {
    if (w <= 0 || h <= 0) return;
    drawLine(pc, x, y, x + w - 1, y, pattern);
    drawLine(pc, x, y + h - 1, x + w - 1, y + h - 1, pattern);
    drawLine(pc, x, y, x, y + h - 1, pattern);
    drawLine(pc, x + w - 1, y, x + w - 1, y + h - 1, pattern);
  }
}

function drawOval(pc, cx, cy, rx, ry, pattern, fill) {
  cx = Math.round(cx); cy = Math.round(cy);
  rx = Math.round(Math.abs(rx)); ry = Math.round(Math.abs(ry));
  if (rx === 0 || ry === 0) return;
  if (fill) {
    for (let yy = -ry; yy <= ry; yy++) {
      const xw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry))));
      for (let xx = -xw; xx <= xw; xx++) pc.plot(cx + xx, cy + yy, pattern);
    }
  } else {
    const steps = Math.max(64, Math.round(2 * Math.PI * Math.max(rx, ry)));
    let px = null, py = null;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const x = Math.round(cx + rx * Math.cos(t));
      const y = Math.round(cy + ry * Math.sin(t));
      if (x !== px || y !== py) pc.plot(x, y, pattern);
      px = x; py = y;
    }
  }
}

function drawPolyOutline(pc, pts, pattern) {
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    drawLine(pc, x0, y0, x1, y1, pattern);
  }
}

function drawPolyFill(pc, pts, pattern) {
  const ys = pts.map((p) => p[1]);
  const ymin = Math.max(0, Math.floor(Math.min(...ys)));
  const ymax = Math.min(pc.h - 1, Math.ceil(Math.max(...ys)));
  const n = pts.length;
  for (let y = ymin; y <= ymax; y++) {
    const xs = [];
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.round(xs[i]), xb = Math.round(xs[i + 1]);
      for (let x = xa; x <= xb; x++) pc.plot(x, y, pattern);
    }
  }
  drawPolyOutline(pc, pts, pattern);
}

function floodFill(pc, sx, sy, pattern) {
  sx = Math.round(sx); sy = Math.round(sy);
  if (!pc.inBounds(sx, sy)) return;
  const target = pc.getBit(sx, sy);
  const visited = new Uint8Array(pc.w * pc.h); // bounded by canvas size, not an arbitrary cap
  const stack = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (!pc.inBounds(x, y)) continue;
    const i = pc.idx(x, y);
    if (visited[i] || pc.bits[i] !== target) continue;
    visited[i] = 1;
    pc.plot(x, y, pattern);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

function drawSpray(pc, cx, cy, r, density, pattern) {
  const count = Math.max(1, Math.round(Math.PI * r * r * density * 0.15));
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * r;
    pc.plot(cx + Math.cos(a) * d, cy + Math.sin(a) * d, pattern);
  }
}

function drawText(pc, x, y, str, size, pattern) {
  const tmp = document.createElement("canvas");
  const pad = 4;
  const measCtx = tmp.getContext("2d");
  measCtx.font = `${size}px monospace`;
  const w = Math.max(1, Math.ceil(measCtx.measureText(str).width) + pad * 2);
  const h = Math.ceil(size * 1.4) + pad * 2;
  tmp.width = w;
  tmp.height = h;
  const ctx = tmp.getContext("2d");
  ctx.font = `${size}px monospace`;
  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";
  ctx.fillText(str, pad, pad);
  const id = ctx.getImageData(0, 0, w, h).data;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      if (id[(yy * w + xx) * 4 + 3] > 100) pc.plot(x + xx, y + yy, pattern);
    }
  }
}

// ---------------------------------------------------------- DSL parsing ---

function tokenize(line) {
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    if (line[i] === '"') {
      let j = i + 1, s = "";
      while (j < line.length && line[j] !== '"') { s += line[j]; j++; }
      tokens.push(s);
      i = j + 1;
    } else {
      let j = i;
      while (j < line.length && !/\s/.test(line[j])) j++;
      tokens.push(line.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

function checkNums(nums, label) {
  if (nums.some((n) => Number.isNaN(n))) throw new Error(`${label} needs numeric arguments`);
  return nums;
}

const MAX_SCRIPT_LINES = 5000; // safety bound so a runaway paste can't hang the tab — a 512x342 canvas never legitimately needs more

function parseScript(text) {
  const cmds = [];
  const warnings = [];
  const rawLines = text.split("\n");
  const lines = rawLines.slice(0, MAX_SCRIPT_LINES);
  if (rawLines.length > MAX_SCRIPT_LINES) {
    warnings.push(`script has ${rawLines.length} lines — only the first ${MAX_SCRIPT_LINES} ran`);
  }
  lines.forEach((raw, idx) => {
    const line = raw.replace(/```.*/, "").trim(); // tolerate stray markdown fences an LLM might add
    if (!line || line.startsWith("#")) return;
    const tokens = tokenize(line);
    const op = tokens[0].toUpperCase();
    const nums = (from, to) => tokens.slice(from, to).map(Number);
    try {
      switch (op) {
        case "PATTERN":
          cmds.push({ op, pattern: clampPattern(Number(tokens[1])) });
          break;
        case "CLEAR":
          cmds.push({ op, pattern: tokens[1] !== undefined ? clampPattern(Number(tokens[1])) : 0 });
          break;
        case "PIXEL": {
          const [x, y] = checkNums(nums(1, 3), "PIXEL");
          cmds.push({ op, x, y });
          break;
        }
        case "LINE": {
          const [x0, y0, x1, y1] = checkNums(nums(1, 5), "LINE");
          cmds.push({ op, x0, y0, x1, y1 });
          break;
        }
        case "RECT": {
          const [x, y, w, h] = checkNums(nums(1, 5), "RECT");
          cmds.push({ op, x, y, w, h, fill: /FILL/i.test(tokens[5] || "") });
          break;
        }
        case "OVAL": {
          const [cx, cy, rx, ry] = checkNums(nums(1, 5), "OVAL");
          cmds.push({ op, cx, cy, rx, ry, fill: /FILL/i.test(tokens[5] || "") });
          break;
        }
        case "POLY": {
          let fill = false, end = tokens.length;
          if (/FILL/i.test(tokens[tokens.length - 1] || "")) { fill = true; end = tokens.length - 1; }
          const rest = checkNums(nums(1, end), "POLY");
          if (rest.length < 6 || rest.length % 2 !== 0) throw new Error("POLY needs at least 3 x y pairs");
          const pts = [];
          for (let i = 0; i < rest.length; i += 2) pts.push([rest[i], rest[i + 1]]);
          cmds.push({ op, pts, fill });
          break;
        }
        case "FILLAT": {
          const [x, y] = checkNums(nums(1, 3), "FILLAT");
          cmds.push({ op, x, y });
          break;
        }
        case "SPRAY": {
          const [x, y, r] = checkNums(nums(1, 4), "SPRAY");
          const density = tokens[4] !== undefined ? Number(tokens[4]) : 0.35;
          cmds.push({ op, x, y, r, density: Number.isFinite(density) ? density : 0.35 });
          break;
        }
        case "TEXT": {
          const x = Number(tokens[1]), y = Number(tokens[2]);
          checkNums([x, y], "TEXT");
          const str = tokens[3];
          if (str === undefined) throw new Error('TEXT needs a "quoted string"');
          const size = tokens[4] !== undefined ? Number(tokens[4]) : 14;
          cmds.push({ op, x, y, str, size: Number.isFinite(size) ? size : 14 });
          break;
        }
        default:
          warnings.push(`line ${idx + 1}: unknown command "${tokens[0]}", skipped`);
      }
    } catch (e) {
      warnings.push(`line ${idx + 1}: ${e.message}`);
    }
  });
  return { cmds, warnings };
}

function execOne(pc, cmd, state) {
  switch (cmd.op) {
    case "PATTERN": state.pattern = cmd.pattern; break;
    case "CLEAR": pc.clear(cmd.pattern); break;
    case "PIXEL": pc.plot(cmd.x, cmd.y, state.pattern); break;
    case "LINE": drawLine(pc, cmd.x0, cmd.y0, cmd.x1, cmd.y1, state.pattern); break;
    case "RECT": drawRect(pc, cmd.x, cmd.y, cmd.w, cmd.h, state.pattern, cmd.fill); break;
    case "OVAL": drawOval(pc, cmd.cx, cmd.cy, cmd.rx, cmd.ry, state.pattern, cmd.fill); break;
    case "POLY": (cmd.fill ? drawPolyFill : drawPolyOutline)(pc, cmd.pts, state.pattern); break;
    case "FILLAT": floodFill(pc, cmd.x, cmd.y, state.pattern); break;
    case "SPRAY": drawSpray(pc, cmd.x, cmd.y, cmd.r, cmd.density, state.pattern); break;
    case "TEXT": drawText(pc, cmd.x, cmd.y, cmd.str, cmd.size, state.pattern); break;
  }
}

// -------------------------------------------------------------- LLM prompt --

function buildPrompt(ask) {
  return `You are controlling a 512x342 1-bit (black/white) drawing robot descended from the original 1984 MacPaint. Reply with ONLY a script in the tiny language below, one instruction per line, nothing else — no prose, no markdown code fences, no explanation. A rendering engine executes it exactly as written.

Canvas: 512 wide (x: 0-511), 342 tall (y: 0-341), origin top-left.
Patterns are numbered 0-16: 0 is white/erase, 16 is solid black, 1-15 are ordered-dither textures of increasing darkness standing in for gray, since the canvas is strictly 1-bit — exactly like the original MacPaint's pattern palette. Pick patterns deliberately for shading, don't just use 0 and 16.

Commands (one per line):
  PATTERN n                 set the current ink pattern (0-16), stays until changed
  CLEAR [n]                 clear the whole canvas to pattern n (default 0)
  PIXEL x y                 plot a single pixel
  LINE x1 y1 x2 y2          a straight line
  RECT x y w h [FILL]       rectangle at (x,y) sized w*h; add FILL to fill it, omit for outline only
  OVAL cx cy rx ry [FILL]   ellipse centered at (cx,cy) with radii rx,ry; FILL to fill
  POLY x1 y1 x2 y2 x3 y3 ... [FILL]   closed polygon through the given points (3+ pairs); FILL to fill
  FILLAT x y                bucket-fill the region touching (x,y) with the current pattern
  SPRAY x y r [density]     a stippled spray-can dot cloud, radius r, density 0-1 (default 0.35)
  TEXT x y "words" [size]   stamp text near (x,y), size in px (default 14)
  # comment                 ignored

Draw: ${ask || "something nice"}`;
}

// ------------------------------------------------------------------- UI ---

document.addEventListener("DOMContentLoaded", () => {
  const canvasEl = document.getElementById("canvas");
  const pc = new PixelCanvas(canvasEl, W, H);
  pc.clear(0);
  pc.render();

  const state = { pattern: 16 };
  let currentTool = "pencil";
  let brushSize = 3;
  let dragging = false;
  let dragStart = null;
  let dragSnapshot = null;
  let sprayTimer = null;
  const history = [];
  const MAX_HISTORY = 100; // ~17MB at 512x342 bytes/snapshot — real memory bound, not a habit cap

  function pushHistory() {
    history.push(pc.snapshot());
    if (history.length > MAX_HISTORY) history.shift();
  }
  function undo() {
    const snap = history.pop();
    if (!snap) return;
    pc.restore(snap);
    pc.render();
  }

  // --- pattern palette ---
  const paletteEl = document.getElementById("palette");
  const swatchButtons = [];
  for (let p = 0; p < PATTERN_COUNT; p++) {
    const btn = document.createElement("button");
    btn.className = "swatch";
    btn.type = "button";
    btn.title = p === 0 ? "white" : p === PATTERN_COUNT - 1 ? "black" : `pattern ${p}`;
    const sw = document.createElement("canvas");
    sw.width = 8; sw.height = 8;
    const sctx = sw.getContext("2d");
    const id = sctx.createImageData(8, 8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const v = patternBit(p, x, y) ? 0 : 255;
        const i = (y * 8 + x) * 4;
        id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v; id.data[i + 3] = 255;
      }
    }
    sctx.putImageData(id, 0, 0);
    btn.appendChild(sw);
    btn.addEventListener("click", () => {
      state.pattern = p;
      swatchButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
    paletteEl.appendChild(btn);
    swatchButtons.push(btn);
  }
  swatchButtons[PATTERN_COUNT - 1].classList.add("active");

  // --- tool buttons ---
  const toolButtons = document.querySelectorAll("[data-tool]");
  toolButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTool = btn.dataset.tool;
      toolButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
  document.querySelector('[data-tool="pencil"]').classList.add("active");

  const sizeSlider = document.getElementById("brushSize");
  sizeSlider.addEventListener("input", () => { brushSize = Number(sizeSlider.value); });

  // --- canvas interaction ---
  function posFromEvent(evt) {
    const rect = canvasEl.getBoundingClientRect();
    const x = Math.floor((evt.clientX - rect.left) * (pc.w / rect.width));
    const y = Math.floor((evt.clientY - rect.top) * (pc.h / rect.height));
    return { x, y };
  }

  canvasEl.addEventListener("pointerdown", (evt) => {
    canvasEl.setPointerCapture(evt.pointerId);
    const { x, y } = posFromEvent(evt);
    pushHistory();
    dragging = true;
    dragStart = { x, y };
    dragSnapshot = pc.snapshot();

    if (currentTool === "pencil" || currentTool === "brush") {
      plotBrush(pc, x, y, currentTool === "pencil" ? 1 : brushSize, state.pattern);
      pc.render();
    } else if (currentTool === "eraser") {
      plotBrush(pc, x, y, brushSize, 0);
      pc.render();
    } else if (currentTool === "spray") {
      drawSpray(pc, x, y, brushSize * 2, 0.5, state.pattern);
      pc.render();
      sprayTimer = setInterval(() => {
        drawSpray(pc, dragStart.x, dragStart.y, brushSize * 2, 0.5, state.pattern);
        pc.render();
      }, 60);
    } else if (currentTool === "bucket") {
      floodFill(pc, x, y, state.pattern);
      pc.render();
    } else if (currentTool === "text") {
      const str = window.prompt("Text to stamp:");
      if (str) drawText(pc, x, y, str, 16, state.pattern);
      pc.render();
    }
  });

  canvasEl.addEventListener("pointermove", (evt) => {
    if (!dragging) return;
    const { x, y } = posFromEvent(evt);
    if (currentTool === "pencil" || currentTool === "brush") {
      strokeBetween(pc, dragStart.x, dragStart.y, x, y, currentTool === "pencil" ? 1 : brushSize, state.pattern);
      dragStart = { x, y };
      pc.render();
    } else if (currentTool === "eraser") {
      strokeBetween(pc, dragStart.x, dragStart.y, x, y, brushSize, 0);
      dragStart = { x, y };
      pc.render();
    } else if (currentTool === "spray") {
      dragStart = { x, y };
    } else if (["line", "rect", "rectFill", "oval", "ovalFill"].includes(currentTool)) {
      pc.restore(dragSnapshot);
      const { x: sx, y: sy } = dragStart;
      if (currentTool === "line") drawLine(pc, sx, sy, x, y, state.pattern);
      else if (currentTool === "rect") drawRect(pc, sx, sy, x - sx, y - sy, state.pattern, false);
      else if (currentTool === "rectFill") drawRect(pc, sx, sy, x - sx, y - sy, state.pattern, true);
      else if (currentTool === "oval") drawOval(pc, sx, sy, Math.abs(x - sx), Math.abs(y - sy), state.pattern, false);
      else if (currentTool === "ovalFill") drawOval(pc, sx, sy, Math.abs(x - sx), Math.abs(y - sy), state.pattern, true);
      pc.render();
    }
  });

  function endDrag() {
    dragging = false;
    if (sprayTimer) { clearInterval(sprayTimer); sprayTimer = null; }
  }
  canvasEl.addEventListener("pointerup", endDrag);
  canvasEl.addEventListener("pointercancel", endDrag);
  canvasEl.style.touchAction = "none";

  // --- top controls ---
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("clearBtn").addEventListener("click", () => {
    if (!window.confirm("Clear the whole canvas?")) return;
    pushHistory();
    pc.clear(0);
    pc.render();
  });
  window.addEventListener("keydown", (evt) => {
    if ((evt.metaKey || evt.ctrlKey) && evt.key.toLowerCase() === "z") { evt.preventDefault(); undo(); }
  });

  function exportCanvas(scale) {
    const out = document.createElement("canvas");
    out.width = W * scale;
    out.height = H * scale;
    const octx = out.getContext("2d");
    octx.imageSmoothingEnabled = false;
    octx.drawImage(canvasEl, 0, 0, out.width, out.height);
    return out;
  }
  document.getElementById("saveBtn").addEventListener("click", () => {
    const out = exportCanvas(3);
    const a = document.createElement("a");
    a.download = "macpaint.png";
    a.href = out.toDataURL("image/png");
    a.click();
  });

  const shareText = "I made this with macpaint.bisks.net — paint by hand, or teach an LLM to paint it with a tiny text script. no diffusion, just dithering.";
  document.getElementById("shareBtn").href =
    "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText + " https://macpaint.bisks.net/");

  // --- script / LLM panel ---
  const askInput = document.getElementById("askInput");
  const copyPromptBtn = document.getElementById("copyPromptBtn");
  const copyStatus = document.getElementById("copyStatus");
  const scriptInput = document.getElementById("scriptInput");
  const runBtn = document.getElementById("runBtn");
  const stopBtn = document.getElementById("stopBtn");
  const speedSelect = document.getElementById("speedSelect");
  const scriptLog = document.getElementById("scriptLog");
  const exampleSelect = document.getElementById("exampleSelect");

  copyPromptBtn.addEventListener("click", async () => {
    const prompt = buildPrompt(askInput.value.trim());
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = prompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    copyStatus.textContent = "copied! paste it into your LLM of choice.";
    setTimeout(() => { copyStatus.textContent = ""; }, 4000);
  });

  let runAborted = false;
  function setRunning(isRunning) {
    runBtn.disabled = isRunning;
    stopBtn.style.display = isRunning ? "inline-block" : "none";
  }

  runBtn.addEventListener("click", () => {
    const { cmds, warnings } = parseScript(scriptInput.value);
    if (!cmds.length) {
      scriptLog.textContent = warnings.length ? warnings.join("\n") : "nothing to run — paste a script first.";
      return;
    }
    pushHistory();
    runAborted = false;
    setRunning(true);
    const localState = { pattern: 16 };
    const instant = speedSelect.value === "instant";
    if (instant) {
      cmds.forEach((c) => execOne(pc, c, localState));
      pc.render();
      setRunning(false);
      scriptLog.textContent = `ran ${cmds.length} command${cmds.length === 1 ? "" : "s"}.` + (warnings.length ? "\n" + warnings.join("\n") : "");
      return;
    }
    let i = 0;
    const batch = Math.max(1, Math.floor(cmds.length / 300));
    function step() {
      if (runAborted) { setRunning(false); scriptLog.textContent = "stopped."; return; }
      for (let n = 0; n < batch && i < cmds.length; n++, i++) execOne(pc, cmds[i], localState);
      pc.render();
      if (i < cmds.length) {
        requestAnimationFrame(step);
      } else {
        setRunning(false);
        scriptLog.textContent = `ran ${cmds.length} command${cmds.length === 1 ? "" : "s"}.` + (warnings.length ? "\n" + warnings.join("\n") : "");
      }
    }
    step();
  });
  stopBtn.addEventListener("click", () => { runAborted = true; });

  const EXAMPLES = {
    smiley: `# smiley face
CLEAR
PATTERN 16
OVAL 256 171 120 120
PATTERN 0
OVAL 256 171 113 113
PATTERN 16
OVAL 210 140 14 18 FILL
OVAL 302 140 14 18 FILL
POLY 190 210 220 236 292 236 322 210 292 220 220 220`,
    house: `# little house
CLEAR
PATTERN 6
RECT 156 180 200 140 FILL
PATTERN 16
RECT 156 180 200 140
POLY 146 180 256 90 366 180 FILL
PATTERN 10
RECT 230 250 50 70 FILL
PATTERN 16
RECT 230 250 50 70
PATTERN 4
RECT 180 210 40 30 FILL
RECT 292 210 40 30 FILL
PATTERN 16
RECT 180 210 40 30
RECT 292 210 40 30`,
    sailboat: `# sailboat
CLEAR
PATTERN 12
RECT 0 260 512 82 FILL
PATTERN 16
LINE 256 60 256 260
POLY 256 70 340 205 256 205 FILL
POLY 256 80 190 205 256 205 FILL
PATTERN 16
OVAL 256 275 150 26 FILL
PATTERN 8
SPRAY 100 250 30 0.4
SPRAY 400 240 34 0.35`,
    cat: `# cat face
CLEAR
PATTERN 16
POLY 150 90 190 150 130 150 FILL
POLY 362 90 322 150 382 150 FILL
OVAL 256 190 110 90 FILL
PATTERN 0
OVAL 256 195 96 78 FILL
PATTERN 16
OVAL 220 180 12 16 FILL
OVAL 292 180 12 16 FILL
POLY 246 205 266 205 256 220 FILL
LINE 256 220 256 230
LINE 150 210 240 220
LINE 150 230 240 230
LINE 362 210 272 220
LINE 362 230 272 230`,
    hello: `# hand lettering
CLEAR
PATTERN 16
TEXT 100 140 "HELLO, WORLD" 44
TEXT 130 200 "-- a robot painted this" 16
LINE 90 250 420 250`,
  };
  Object.keys(EXAMPLES).forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = key;
    exampleSelect.appendChild(opt);
  });
  exampleSelect.addEventListener("change", () => {
    if (!exampleSelect.value) return;
    scriptInput.value = EXAMPLES[exampleSelect.value];
    scriptLog.textContent = "loaded — hit Run to paint it.";
    exampleSelect.value = "";
  });
});
