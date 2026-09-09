// kidpix — a Kid Pix 1.0 tribute. Plain full-color canvas drawing (no bitmap
// abstraction needed here, unlike macpaint's 1-bit pattern engine); every
// tool draws straight to a 2D context.

const W = 800, H = 600;

const PALETTE = [
  "#000000", "#ffffff", "#7f7f7f", "#c2c2c2",
  "#ff3b3b", "#ff9d1f", "#ffe14d", "#a8e05f",
  "#4ade4a", "#2fd6c0", "#2fb5ff", "#3b6bff",
  "#b06bff", "#ff6bd6", "#ff2f92", "#8b4513",
  "#ffb6c1", "#00ced1", "#ff8c00", "#9acd32",
  "#dc143c", "#4169e1", "#ffd700", "#2e8b57",
];

const STAMPS = ["⭐", "❤️", "🌞", "🌈", "🚀", "🐱",
  "🎈", "⚡", "🎉", "🍕", "🎵", "🌻",
  "🐢", "🌙", "☀️", "🌧️"];

const canvas = document.getElementById("canvas");
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext("2d", { willReadFrequently: true });
ctx.fillStyle = "#ffffff";
ctx.fillRect(0, 0, W, H);
ctx.lineCap = "round";
ctx.lineJoin = "round";

const canvasFrame = document.getElementById("canvasFrame");
const textInput = document.getElementById("textInput");
const musicBtn = document.getElementById("musicBtn");
const wackyStyleRow = document.getElementById("wackyStyleRow");
const wackyStyleSel = document.getElementById("wackyStyle");
const mixerPanel = document.getElementById("mixerPanel");
const stampsPanel = document.getElementById("stamps");
const stampLabel = document.getElementById("stampLabel");
const sizeLabel = document.getElementById("sizeLabel");
const brushSize = document.getElementById("brushSize");

let tool = "brush";
let color = "#ff3b3b";
let shapeFilled = true;
let stampChar = STAMPS[0];
let drawing = false;
let lastPt = null;
let startPt = null;
let snapshotBeforeStroke = null;
let strokeTickCounter = 0;

// Undo history: full-canvas ImageData snapshots. Capped at 25 — an 800x600
// RGBA frame is ~1.9MB, so 25 of them (~48MB) is a real browser-memory bound,
// not a habitual "seemed safe" number.
const HISTORY_CAP = 25;
let history = [];

function pushHistory() {
  history.push(ctx.getImageData(0, 0, W, H));
  if (history.length > HISTORY_CAP) history.shift();
}
function undo() {
  if (!history.length) return;
  const snap = history.pop();
  ctx.putImageData(snap, 0, 0);
  SoundKit.oopsUndo();
}

// ---------------------------------------------------------------- palette --
const paletteEl = document.getElementById("palette");
PALETTE.forEach((c, i) => {
  const b = document.createElement("button");
  b.className = "swatch";
  b.style.background = c;
  b.type = "button";
  b.addEventListener("click", () => {
    color = c;
    [...paletteEl.children].forEach((el) => el.classList.remove("active"));
    b.classList.add("active");
    SoundKit.toolSelect(1);
  });
  if (i === 4) b.classList.add("active");
  paletteEl.appendChild(b);
});

// ---------------------------------------------------------------- stamps --
STAMPS.forEach((s, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = s;
  b.addEventListener("click", () => {
    stampChar = s;
    [...stampsPanel.children].forEach((el) => el.classList.remove("active"));
    b.classList.add("active");
    SoundKit.toolSelect(9);
  });
  if (i === 0) b.classList.add("active");
  stampsPanel.appendChild(b);
});

// ---------------------------------------------------------------- toolbox --
const toolButtons = [...document.querySelectorAll(".tool")];
const TOOL_INDEX = { pencil: 0, brush: 1, wacky: 2, line: 3, rect: 4, oval: 5, bucket: 6, eraser: 7, text: 8, stamp: 9, fillshape: 10, mixer: 11 };
function selectTool(name) {
  if (name === "fillshape") {
    shapeFilled = !shapeFilled;
    SoundKit.toolSelect(10);
    document.querySelector('[data-tool="fillshape"]').textContent = shapeFilled ? "🎨" : "⬜";
    return;
  }
  tool = name;
  toolButtons.forEach((b) => b.classList.toggle("active", b.dataset.tool === name));
  wackyStyleRow.style.display = tool === "wacky" ? "flex" : "none";
  mixerPanel.style.display = tool === "mixer" ? "flex" : "none";
  const showStamps = tool === "stamp";
  stampsPanel.style.display = showStamps ? "grid" : "none";
  stampLabel.style.display = showStamps ? "block" : "none";
  sizeLabel.textContent = tool === "stamp" ? "stamp size" : tool === "text" ? "text size" : "brush size";
  SoundKit.toolSelect(TOOL_INDEX[name] ?? 0);
  finishTextEdit();
}
toolButtons.forEach((b) => {
  b.addEventListener("click", () => selectTool(b.dataset.tool));
});
selectTool("brush");

// -------------------------------------------------------------- geometry --
function canvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  const x = ((evt.clientX - rect.left) / rect.width) * W;
  const y = ((evt.clientY - rect.top) / rect.height) * H;
  return { x, y };
}

function hueRotate(baseHue, amt) {
  return (baseHue + amt) % 360;
}
let wackyHue = Math.random() * 360;

function drawWackySegment(p0, p1, styleOverride, sizeOverride, colorOverride) {
  const style = styleOverride || wackyStyleSel.value;
  const size = sizeOverride || Number(brushSize.value);
  const col = colorOverride || color;
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const dist = Math.hypot(dx, dy) || 1;
  const steps = Math.max(1, Math.floor(dist / Math.max(4, size * 0.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = p0.x + dx * t, y = p0.y + dy * t;
    if (style === "rainbow") {
      wackyHue = hueRotate(wackyHue, 4);
      ctx.fillStyle = `hsl(${wackyHue}, 90%, 55%)`;
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (style === "dots") {
      if (i % 3 !== 0) continue;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, size / 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (style === "zigzag") {
      const nx = -dy / dist, ny = dx / dist;
      const off = (i % 2 === 0 ? 1 : -1) * size;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1, size / 5);
      ctx.beginPath();
      ctx.moveTo(x - nx * off, y - ny * off);
      ctx.lineTo(x + nx * off, y + ny * off);
      ctx.stroke();
    } else if (style === "confetti") {
      if (i % 2 !== 0) continue;
      const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      ctx.fillStyle = c;
      const s = size * (0.3 + Math.random() * 0.6);
      ctx.save();
      ctx.translate(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size);
      ctx.rotate(Math.random() * Math.PI);
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    } else if (style === "bubbles") {
      if (i % 4 !== 0) continue;
      const r = size * (0.3 + Math.random() * 0.9);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (style === "sparkle") {
      if (i % 3 !== 0) continue;
      drawStar(x + (Math.random() - 0.5) * size, y + (Math.random() - 0.5) * size, size / 2, col);
    }
  }
}

function drawStar(cx, cy, r, fill) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r / 2.4;
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFreehandSegment(p0, p1) {
  const size = Number(brushSize.value);
  ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
  ctx.lineWidth = tool === "pencil" ? 2 : size;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.stroke();
}

function drawShapePreview(p0, p1) {
  ctx.putImageData(snapshotBeforeStroke, 0, 0);
  const x = Math.min(p0.x, p1.x), y = Math.min(p0.y, p1.y);
  const w = Math.abs(p1.x - p0.x), h = Math.abs(p1.y - p0.y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, Number(brushSize.value) / 3);
  if (tool === "line") {
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  } else if (tool === "rect") {
    if (shapeFilled) ctx.fillRect(x, y, w, h);
    else ctx.strokeRect(x, y, w, h);
  } else if (tool === "oval") {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (shapeFilled) ctx.fill();
    else ctx.stroke();
  }
}

// --------------------------------------------------------------- bucket ---
function hexToRgba(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 255];
}
function floodFill(startX, startY, fillColor) {
  startX = Math.round(startX);
  startY = Math.round(startY);
  if (startX < 0 || startX >= W || startY < 0 || startY >= H) return;
  const img = ctx.getImageData(0, 0, W, H);
  const data = img.data;
  const idx = (x, y) => (y * W + x) * 4;
  const start = idx(startX, startY);
  const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  const fill = hexToRgba(fillColor);
  if (target[0] === fill[0] && target[1] === fill[1] && target[2] === fill[2]) return;
  const tol = 40;
  function matches(i) {
    return Math.abs(data[i] - target[0]) <= tol &&
      Math.abs(data[i + 1] - target[1]) <= tol &&
      Math.abs(data[i + 2] - target[2]) <= tol &&
      Math.abs(data[i + 3] - target[3]) <= tol;
  }
  const stack = [[startX, startY]];
  const visited = new Uint8Array(W * H);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const p = y * W + x;
    if (visited[p]) continue;
    const i = p * 4;
    if (!matches(i)) continue;
    visited[p] = 1;
    data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3];
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  ctx.putImageData(img, 0, 0);
}

// ----------------------------------------------------------------- text ---
let textPos = null;
function finishTextEdit() {
  if (textInput.style.display === "none") return;
  const val = textInput.value.trim();
  if (val && textPos) {
    pushHistory();
    ctx.fillStyle = color;
    ctx.font = `bold ${Number(brushSize.value) * 2}px "Comic Sans MS", sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(val, textPos.x, textPos.y);
  }
  textInput.style.display = "none";
  textInput.value = "";
  textPos = null;
}
textInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") finishTextEdit();
  else SoundKit.typewriterClick();
});
textInput.addEventListener("blur", finishTextEdit);

// -------------------------------------------------------------- mixer fx --
// mixTransform is the pure pixel transform; applyMixerFx wraps it with the
// undo snapshot + sound for interactive button clicks. The script runner
// below calls mixTransform directly so a MIX line in a script doesn't spam
// pushHistory()/sound for every command.
function mixTransform(fx) {
  const img = ctx.getImageData(0, 0, W, H);
  const src = img.data;
  const out = new Uint8ClampedArray(src.length);
  const idx = (x, y) => (y * W + x) * 4;

  if (fx === "mirror") {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W / 2; x++) {
        const i = idx(x, y), j = idx(W - 1 - x, y);
        for (let k = 0; k < 4; k++) { out[i + k] = src[i + k]; out[j + k] = src[i + k]; }
      }
    }
  } else if (fx === "invert") {
    for (let i = 0; i < src.length; i += 4) {
      out[i] = 255 - src[i]; out[i + 1] = 255 - src[i + 1]; out[i + 2] = 255 - src[i + 2]; out[i + 3] = src[i + 3];
    }
  } else if (fx === "melt") {
    for (let x = 0; x < W; x++) {
      const shift = Math.floor(Math.random() * 40);
      for (let y = 0; y < H; y++) {
        const sy = Math.max(0, y - shift);
        const i = idx(x, y), j = idx(x, sy);
        for (let k = 0; k < 4; k++) out[i + k] = src[j + k];
      }
    }
  } else if (fx === "swirl") {
    const cx = W / 2, cy = H / 2, maxR = Math.hypot(cx, cy);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - cx, dy = y - cy;
        const r = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) + (1 - r / maxR) * 2.2;
        const sx = Math.round(cx + Math.cos(angle) * r);
        const sy = Math.round(cy + Math.sin(angle) * r);
        const i = idx(x, y);
        if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
          const j = idx(sx, sy);
          for (let k = 0; k < 4; k++) out[i + k] = src[j + k];
        } else {
          for (let k = 0; k < 4; k++) out[i + k] = 255;
        }
      }
    }
  } else if (fx === "smear") {
    for (let y = 0; y < H; y++) {
      const shift = Math.floor(Math.sin(y * 0.05) * 30);
      for (let x = 0; x < W; x++) {
        const sx = Math.min(W - 1, Math.max(0, x - shift));
        const i = idx(x, y), j = idx(sx, y);
        for (let k = 0; k < 4; k++) out[i + k] = src[j + k];
      }
    }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
}
function applyMixerFx(fx) {
  pushHistory();
  mixTransform(fx);
  SoundKit.bucketWhoosh();
}
mixerPanel.querySelectorAll("button[data-fx]").forEach((b) => {
  b.addEventListener("click", () => applyMixerFx(b.dataset.fx));
});

// -------------------------------------------------------------- pointer --
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const p = canvasPoint(e);
  if (tool === "text") {
    // Without this, the canvas's default mousedown focus-handling runs right
    // after our textInput.focus() call below and steals focus back, which
    // immediately blurs (and thus hides) the input before anyone can type.
    e.preventDefault();
    finishTextEdit();
    textPos = p;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / W;
    textInput.style.left = rect.left - canvasFrame.getBoundingClientRect().left + p.x * scale + "px";
    textInput.style.top = rect.top - canvasFrame.getBoundingClientRect().top + p.y * scale + "px";
    textInput.style.fontSize = Math.max(12, Number(brushSize.value) * 2 * scale) + "px";
    textInput.style.display = "block";
    textInput.focus();
    return;
  }
  if (tool === "bucket") {
    pushHistory();
    floodFill(p.x, p.y, color);
    SoundKit.bucketWhoosh();
    return;
  }
  if (tool === "stamp") {
    pushHistory();
    const size = Number(brushSize.value) * 2.2;
    ctx.font = `${size}px sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(stampChar, p.x, p.y);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    SoundKit.stampPop();
    return;
  }
  if (tool === "mixer") return;

  drawing = true;
  lastPt = p;
  startPt = p;
  strokeTickCounter = 0;
  pushHistory();
  if (["line", "rect", "oval"].includes(tool)) {
    snapshotBeforeStroke = ctx.getImageData(0, 0, W, H);
  } else {
    drawFreehandDot(p);
  }
});

function drawFreehandDot(p) {
  if (tool === "wacky") drawWackySegment(p, { x: p.x + 0.1, y: p.y + 0.1 });
  else {
    const size = tool === "pencil" ? 2 : Number(brushSize.value);
    ctx.fillStyle = tool === "eraser" ? "#ffffff" : color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

canvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const p = canvasPoint(e);
  if (["line", "rect", "oval"].includes(tool)) {
    drawShapePreview(startPt, p);
  } else {
    drawFreehandSegment(lastPt, p);
    if (tool === "wacky") drawWackySegment(lastPt, p);
    lastPt = p;
    strokeTickCounter++;
    if (strokeTickCounter % 3 === 0) SoundKit.drawTick(tool === "wacky" ? "brush" : tool);
  }
});

function endStroke() {
  if (!drawing) return;
  drawing = false;
  if (tool === "line" || tool === "rect" || tool === "oval") SoundKit.lineWhoosh();
  lastPt = null;
  startPt = null;
  snapshotBeforeStroke = null;
}
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);
canvas.addEventListener("pointerleave", () => { if (drawing) endStroke(); });

// -------------------------------------------------------------- buttons --
document.getElementById("undoBtn").addEventListener("click", undo);
document.getElementById("saveBtn").addEventListener("click", () => {
  SoundKit.saveChime();
  const a = document.createElement("a");
  a.download = "kidpix.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
});

const clearBtn = document.getElementById("clearBtn");
clearBtn.addEventListener("click", () => {
  clearBtn.disabled = true;
  const dur = SoundKit.dynamite(() => {
    canvasFrame.classList.add("shake");
    pushHistory();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    setTimeout(() => canvasFrame.classList.remove("shake"), 400);
  });
  setTimeout(() => { clearBtn.disabled = false; }, dur);
});

const musicMoodSel = document.getElementById("musicMood");
SoundKit.MOOD_LIST.forEach(({ key, label }) => {
  const opt = document.createElement("option");
  opt.value = key;
  opt.textContent = label;
  musicMoodSel.appendChild(opt);
});
musicMoodSel.value = SoundKit.currentMood;
musicMoodSel.addEventListener("change", () => {
  SoundKit.setMood(musicMoodSel.value);
});

musicBtn.addEventListener("click", () => {
  const on = SoundKit.toggleMusic(musicMoodSel.value);
  musicBtn.textContent = on ? "🎵 music: on" : "🎵 music: off";
  musicBtn.classList.toggle("on", on);
});

// ---------------------------------------------------- LLM-programmable ---
// A tiny text drawing language so an LLM (or you) can paint kidpix without a
// diffusion model, same idea as macpaint.bisks.net's script panel — just
// adapted to kidpix's full-color canvas (COLOR instead of a dither pattern)
// and its own tools (WACKY, STAMP, MIX for the mixer effects).

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

const WACKY_STYLES = ["rainbow", "dots", "zigzag", "confetti", "bubbles", "sparkle"];
const MIX_EFFECTS = ["melt", "mirror", "invert", "swirl", "smear"];

const MAX_SCRIPT_LINES = 5000; // safety bound so a runaway paste can't hang the tab — an 800x600 canvas never legitimately needs more

function parseKidScript(text) {
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
        case "COLOR":
          if (!tokens[1]) throw new Error("COLOR needs a value, e.g. COLOR #ff3b3b");
          cmds.push({ op, color: tokens[1] });
          break;
        case "SIZE": {
          const [n] = checkNums(nums(1, 2), "SIZE");
          cmds.push({ op, size: Math.max(1, Math.min(48, Math.round(n))) });
          break;
        }
        case "CLEAR":
          cmds.push({ op });
          break;
        case "DOT": {
          const [x, y] = checkNums(nums(1, 3), "DOT");
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
        case "BUCKET": {
          const [x, y] = checkNums(nums(1, 3), "BUCKET");
          cmds.push({ op, x, y });
          break;
        }
        case "STAMP": {
          const x = Number(tokens[1]), y = Number(tokens[2]);
          checkNums([x, y], "STAMP");
          const str = tokens[3];
          if (str === undefined) throw new Error('STAMP needs a "emoji or short text"');
          const size = tokens[4] !== undefined ? Number(tokens[4]) : 48;
          cmds.push({ op, x, y, str, size: Number.isFinite(size) ? size : 48 });
          break;
        }
        case "TEXT": {
          const x = Number(tokens[1]), y = Number(tokens[2]);
          checkNums([x, y], "TEXT");
          const str = tokens[3];
          if (str === undefined) throw new Error('TEXT needs a "quoted string"');
          const size = tokens[4] !== undefined ? Number(tokens[4]) : 24;
          cmds.push({ op, x, y, str, size: Number.isFinite(size) ? size : 24 });
          break;
        }
        case "WACKY": {
          const style = (tokens[1] || "").toLowerCase();
          if (!WACKY_STYLES.includes(style)) throw new Error(`WACKY style must be one of ${WACKY_STYLES.join(", ")}`);
          const [x0, y0, x1, y1] = checkNums(nums(2, 6), "WACKY");
          cmds.push({ op, style, x0, y0, x1, y1 });
          break;
        }
        case "MIX": {
          const fx = (tokens[1] || "").toLowerCase();
          if (!MIX_EFFECTS.includes(fx)) throw new Error(`MIX effect must be one of ${MIX_EFFECTS.join(", ")}`);
          cmds.push({ op, fx });
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

function scriptDot(x, y, size, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fill();
}
function scriptLine(x0, y0, x1, y1, size, col) {
  ctx.strokeStyle = col;
  ctx.lineWidth = size;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}
function scriptRect(x, y, w, h, size, col, fill) {
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = Math.max(2, size / 3);
  if (fill) ctx.fillRect(x, y, w, h);
  else ctx.strokeRect(x, y, w, h);
}
function scriptOval(cx, cy, rx, ry, size, col, fill) {
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = Math.max(2, size / 3);
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
  if (fill) ctx.fill();
  else ctx.stroke();
}
function scriptStamp(x, y, str, size) {
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(str, x, y);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}
function scriptText(x, y, str, size, col) {
  ctx.fillStyle = col;
  ctx.font = `bold ${size}px "Comic Sans MS", sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(str, x, y);
  ctx.textBaseline = "alphabetic";
}

function execKidCmd(cmd, state) {
  switch (cmd.op) {
    case "COLOR": state.color = cmd.color; break;
    case "SIZE": state.size = cmd.size; break;
    case "CLEAR": ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H); break;
    case "DOT": scriptDot(cmd.x, cmd.y, state.size, state.color); break;
    case "LINE": scriptLine(cmd.x0, cmd.y0, cmd.x1, cmd.y1, state.size, state.color); break;
    case "RECT": scriptRect(cmd.x, cmd.y, cmd.w, cmd.h, state.size, state.color, cmd.fill); break;
    case "OVAL": scriptOval(cmd.cx, cmd.cy, cmd.rx, cmd.ry, state.size, state.color, cmd.fill); break;
    case "BUCKET": floodFill(cmd.x, cmd.y, state.color); break;
    case "STAMP": scriptStamp(cmd.x, cmd.y, cmd.str, cmd.size); break;
    case "TEXT": scriptText(cmd.x, cmd.y, cmd.str, cmd.size, state.color); break;
    case "WACKY": drawWackySegment({ x: cmd.x0, y: cmd.y0 }, { x: cmd.x1, y: cmd.y1 }, cmd.style, state.size, state.color); break;
    case "MIX": mixTransform(cmd.fx); break;
  }
}

function buildKidPrompt(ask) {
  return `You are controlling an 800x600 full-color drawing robot in the style of Kid Pix 1.0 — loud, wacky, kid-friendly. Reply with ONLY a script in the tiny language below, one instruction per line, nothing else — no prose, no markdown code fences, no explanation. A rendering engine executes it exactly as written.

Canvas: 800 wide (x: 0-799), 600 tall (y: 0-599), origin top-left. Starts white.
Colors are any CSS color: hex like #ff3b3b, or a name like "hotpink". Current color and brush size persist until changed, like a real paint program.

Commands (one per line):
  COLOR #rrggbb                  set the current color (default #1a1a1a, near-black)
  SIZE n                         set the current brush/line size, 1-48 (default 10)
  CLEAR                          clear the whole canvas to white
  DOT x y                        a filled dot at (x,y), current color+size
  LINE x1 y1 x2 y2               a straight line, current color+size
  RECT x y w h [FILL]            rectangle at (x,y) sized w*h; add FILL to fill, omit for outline
  OVAL cx cy rx ry [FILL]        ellipse centered at (cx,cy) with radii rx,ry; FILL to fill
  BUCKET x y                     flood-fill the region touching (x,y) with the current color
  STAMP x y "emoji" [size]       stamp a single emoji/character centered at (x,y), size in px (default 48) — any emoji works, not just kidpix's built-in set
  TEXT x y "words" [size]        draw bold Comic-Sans-style text starting at (x,y), size in px (default 24), current color
  WACKY style x1 y1 x2 y2        draw a wacky-brush stroke from (x1,y1) to (x2,y2). style is one of: rainbow, dots, zigzag, confetti, bubbles, sparkle — rainbow ignores the current color and cycles hue itself, the rest use the current color
  MIX effect                     apply a whole-canvas mixer effect: melt, mirror, invert, swirl, smear — use sparingly, it affects everything drawn so far
  # comment                      ignored

Have fun — bright colors, silly stamps, and a MIX effect near the end read as very "kidpix." Draw: ${ask || "something loud and colorful"}`;
}

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
  const prompt = buildKidPrompt(askInput.value.trim());
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

let scriptRunAborted = false;
function setScriptRunning(isRunning) {
  runBtn.disabled = isRunning;
  stopBtn.style.display = isRunning ? "inline-block" : "none";
}

runBtn.addEventListener("click", () => {
  const { cmds, warnings } = parseKidScript(scriptInput.value);
  if (!cmds.length) {
    scriptLog.textContent = warnings.length ? warnings.join("\n") : "nothing to run — paste a script first.";
    return;
  }
  pushHistory();
  scriptRunAborted = false;
  setScriptRunning(true);
  const localState = { color: "#1a1a1a", size: 10 };
  const instant = speedSelect.value === "instant";
  if (instant) {
    cmds.forEach((c) => execKidCmd(c, localState));
    setScriptRunning(false);
    scriptLog.textContent = `ran ${cmds.length} command${cmds.length === 1 ? "" : "s"}.` + (warnings.length ? "\n" + warnings.join("\n") : "");
    return;
  }
  let i = 0;
  const batch = Math.max(1, Math.floor(cmds.length / 300));
  function step() {
    if (scriptRunAborted) { setScriptRunning(false); scriptLog.textContent = "stopped."; return; }
    for (let n = 0; n < batch && i < cmds.length; n++, i++) execKidCmd(cmds[i], localState);
    if (i < cmds.length) {
      requestAnimationFrame(step);
    } else {
      setScriptRunning(false);
      scriptLog.textContent = `ran ${cmds.length} command${cmds.length === 1 ? "" : "s"}.` + (warnings.length ? "\n" + warnings.join("\n") : "");
    }
  }
  step();
});
stopBtn.addEventListener("click", () => { scriptRunAborted = true; });

const KID_EXAMPLES = {
  cake: `# birthday cake
CLEAR
COLOR "#b06bff"
SIZE 10
RECT 260 380 280 140 FILL
COLOR "#ff9d1f"
RECT 260 340 280 50 FILL
COLOR "#1a1a1a"
RECT 260 340 280 50
RECT 260 380 280 140
COLOR "#ff3b3b"
RECT 300 300 12 40 FILL
RECT 390 300 12 40 FILL
RECT 480 300 12 40 FILL
COLOR "#ffe14d"
STAMP 306 290 "🔥" 30
STAMP 396 290 "🔥" 30
STAMP 486 290 "🔥" 30
MIX mirror`,
  rocket: `# rocket launch
CLEAR
COLOR "#2fb5ff"
RECT 0 0 800 600 FILL
COLOR "#ffe14d"
OVAL 650 100 40 40 FILL
COLOR "#ffffff"
OVAL 200 460 380 60 FILL
COLOR "#dc143c"
RECT 370 200 60 220 FILL
OVAL 400 200 30 40 FILL
COLOR "#ffd700"
RECT 350 420 20 60 FILL
RECT 430 420 20 60 FILL
COLOR "#ff9d1f"
WACKY sparkle 400 470 400 560
STAMP 620 150 "☁️" 60
STAMP 150 200 "☁️" 50`,
  monster: `# friendly monster
CLEAR
COLOR "#4ade4a"
OVAL 400 320 160 140 FILL
COLOR "#2e8b57"
OVAL 400 320 160 140
OVAL 340 260 20 30 FILL
OVAL 460 260 20 30 FILL
COLOR "#ffffff"
OVAL 340 260 10 15 FILL
OVAL 460 260 10 15 FILL
COLOR "#1a1a1a"
LINE 330 400 470 400
STAMP 320 460 "🦷" 30
STAMP 380 470 "🦷" 30
STAMP 440 470 "🦷" 30
COLOR "#ff2f92"
WACKY confetti 200 200 600 500`,
  wackyname: `# wacky lettering with a rainbow trail behind it
CLEAR
WACKY rainbow 60 300 740 300
COLOR "#1a1a1a"
TEXT 90 240 "HELLO, WORLD" 64
TEXT 130 330 "-- a robot painted this" 22
MIX invert`,
};
Object.keys(KID_EXAMPLES).forEach((key) => {
  const opt = document.createElement("option");
  opt.value = key;
  opt.textContent = key;
  exampleSelect.appendChild(opt);
});
exampleSelect.addEventListener("change", () => {
  if (!exampleSelect.value) return;
  scriptInput.value = KID_EXAMPLES[exampleSelect.value];
  scriptLog.textContent = "loaded — hit Run to paint it.";
  exampleSelect.value = "";
});

// ------------------------------------------------------------ share/OG ---
function buildShareText() {
  return "I made this in kidpix 🎨🌈 (a Kid Pix 1.0 tribute with synthesized sound effects) — https://kidpix.bisks.net/";
}
document.getElementById("shareBtn").href =
  "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText());

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  const probe = new File([""], "probe.png", { type: "image/png" });
  return navigator.canShare({ files: [probe] });
}
if (canShareFiles()) {
  const shareBtn = document.getElementById("shareBtn");
  shareBtn.textContent = "🦋 Share drawing";
  shareBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    canvas.toBlob(async (blob) => {
      const file = new File([blob], "kidpix.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: buildShareText(), title: "kidpix" });
      } catch (err) {
        window.open("https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText()), "_blank");
      }
    }, "image/png");
  });
}
