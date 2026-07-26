// game.js — moottris. Graph fetches happen in lib/cluster.js (copied from
// mootrider, itself from pacmoot/mootdrone/clustercrawl/simcluster — copy,
// don't abstract). This file is the actual Tetris: a 10x20 board, standard
// tetromino rotation, line clears, and the moots-as-pieces conceit — shape
// from zodiac sign (via classical planetary rulership), fall speed from
// 48h posting activity, and a "Mercury retrograde" chaos event on a Tetris
// (4-line clear). Canvas + vanilla JS, no build step.

import { moots, getProfiles, zodiacOf, postsIn48h } from "./lib/cluster.js";

// ---- board ------------------------------------------------------------
const COLS = 10;
const ROWS = 20;
const CELL = 26;
const VIEW_W = COLS * CELL;
const VIEW_H = ROWS * CELL;
const MAX_MOOTS = 12; // one getAuthorFeed call per moot — keep this bounded

// Base tetromino cells in a 4x4 box, classic simple-rotation layout.
const SHAPES = {
  I: [[1, 0], [1, 1], [1, 2], [1, 3]],
  O: [[1, 1], [1, 2], [2, 1], [2, 2]],
  T: [[1, 0], [1, 1], [1, 2], [2, 1]],
  S: [[1, 1], [1, 2], [2, 0], [2, 1]],
  Z: [[1, 0], [1, 1], [2, 1], [2, 2]],
  J: [[1, 0], [2, 0], [2, 1], [2, 2]],
  L: [[1, 2], [2, 0], [2, 1], [2, 2]],
};
function rotateCells(cells) {
  return cells.map(([r, c]) => [c, 3 - r]);
}

const TIPS = [
  "the retrograde was a warning, not a threat.",
  "your moots keep falling regardless of your feelings about it.",
  "the board reopens the moment you press redraw.",
  "somewhere, a trigram judges your line-clearing form.",
  "Saturn pieces are slow because Saturn is always slow.",
  "the chart never lies, it just stacks up.",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function loadImg(url) {
  if (!url) return null;
  const img = new Image();
  img.src = url;
  return img;
}
function imgReady(img) {
  return img && img.complete && img.naturalWidth > 0;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- DOM ------------------------------------------------------------------
const form = document.getElementById("load-form");
const input = document.getElementById("handle-input");
if (window.attachHandleTypeahead) window.attachHandleTypeahead(input);
const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const gameEl = document.getElementById("game");
const boardMeta = document.getElementById("board-meta");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const linesEl = document.getElementById("lines");
const retroBadge = document.getElementById("retro-badge");
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("next-canvas");
const nctx = nextCanvas.getContext("2d");
const nextWho = document.getElementById("next-who");
const curWho = document.getElementById("cur-who");
const startOverlay = document.getElementById("start-overlay");
const startCopy = document.getElementById("start-copy");
const startBtn = document.getElementById("start-btn");
const overOverlay = document.getElementById("over-overlay");
const overBody = document.getElementById("over-body");
const overTip = document.getElementById("over-tip");
const againBtn = document.getElementById("again-btn");
const shareBtn = document.getElementById("share-btn");
const shareCanvas = document.getElementById("share-canvas");
const sctx = shareCanvas.getContext("2d");
const shareNativeBtn = document.getElementById("share-native-btn");
const shareDownloadBtn = document.getElementById("share-download-btn");
const tLeft = document.getElementById("t-left");
const tRight = document.getElementById("t-right");
const tRotate = document.getElementById("t-rotate");
const tDown = document.getElementById("t-down");
const tDrop = document.getElementById("t-drop");

const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = VIEW_W * dpr;
canvas.height = VIEW_H * dpr;
canvas.style.aspectRatio = `${VIEW_W} / ${VIEW_H}`;
ctx.scale(dpr, dpr);

// ---- state ------------------------------------------------------------
let cluster = null;
let mootPool = []; // { did, handle, img, sign, glyph, planet, shape, color, posts48h, interval }
let bag = [];
let grid = null;
let current = null;
let next = null;
let banner = null;
let running = false;
let score = 0;
let lines = 0;
let dropAccum = 0;
let softDrop = false;
let retrogradeUntil = 0;
let shakeUntil = 0;
let cosmicUntil = 0;
let rafId = null;
let lastT = 0;
let lastShareText = "";

function setStatus(msg, isError) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}
function bestKey(did) {
  return `moottris:best:${did}`;
}
function getBest(did) {
  return parseInt(localStorage.getItem(bestKey(did)) || "0", 10) || 0;
}
function setBest(did, v) {
  try {
    localStorage.setItem(bestKey(did), String(v));
  } catch {}
}

// ---- bag + pieces -------------------------------------------------------
function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function refillBag() {
  bag = shuffle(mootPool.map((_, i) => i));
}
function drawFromBag() {
  if (!bag.length) refillBag();
  return mootPool[bag.pop()];
}
function makePiece(moot) {
  return {
    cells: SHAPES[moot.shape].map((c) => c.slice()),
    row: 0,
    col: 3,
    moot,
  };
}

function cellsAt(piece, cellsOverride, rowOverride, colOverride) {
  const cells = cellsOverride || piece.cells;
  const row = rowOverride ?? piece.row;
  const col = colOverride ?? piece.col;
  return cells.map(([r, c]) => [row + r, col + c]);
}
function collide(piece, cellsOverride, rowOverride, colOverride) {
  for (const [r, c] of cellsAt(piece, cellsOverride, rowOverride, colOverride)) {
    if (c < 0 || c >= COLS || r >= ROWS) return true;
    if (r >= 0 && grid[r][c]) return true;
  }
  return false;
}
function isRetro() {
  return performance.now() < retrogradeUntil;
}
function tryMove(dRow, dCol) {
  if (!collide(current, null, current.row + dRow, current.col + dCol)) {
    current.row += dRow;
    current.col += dCol;
    return true;
  }
  return false;
}
function moveLeft() {
  tryMove(0, isRetro() ? 1 : -1);
}
function moveRight() {
  tryMove(0, isRetro() ? -1 : 1);
}
function tryRotate() {
  const rotated = rotateCells(current.cells);
  for (const k of [0, -1, 1, -2, 2]) {
    if (!collide(current, rotated, current.row, current.col + k)) {
      current.cells = rotated;
      current.col += k;
      return true;
    }
  }
  return false;
}
function ghostRow() {
  let r = current.row;
  while (!collide(current, null, r + 1, current.col)) r++;
  return r;
}
function hardDrop() {
  let dist = 0;
  while (!collide(current, null, current.row + 1, current.col)) {
    current.row++;
    dist++;
  }
  score += dist * 2;
  lockPiece();
  updateHud();
}

function clearLines() {
  const remaining = grid.filter((row) => !row.every((cell) => cell));
  const cleared = ROWS - remaining.length;
  while (remaining.length < ROWS) remaining.unshift(Array(COLS).fill(null));
  grid = remaining;
  return cleared;
}

function showBanner(text) {
  banner = { lines: Array.isArray(text) ? text : [text], until: performance.now() + 2600 };
}

function triggerCosmic() {
  retrogradeUntil = performance.now() + 9000;
  shakeUntil = performance.now() + 500;
  cosmicUntil = performance.now() + 2600;
  score += 1200;
  showBanner(["✦ COSMIC ALIGNMENT ✦", "MERCURY IN RETROGRADE"]);
}

function wrapText(c, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let ly = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (line && c.measureText(test).width > maxWidth) {
      c.fillText(line, x, ly);
      line = w;
      ly += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) c.fillText(line, x, ly);
  return ly;
}

// Snapshot the final board into shareCanvas — a real per-run result card
// (not a generic static one), for the "share image" / "save image" buttons.
function buildShareCard() {
  const W = shareCanvas.width, H = shareCanvas.height;
  const mono = "ui-monospace, monospace";
  sctx.clearRect(0, 0, W, H);
  const bg = sctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#150f24");
  bg.addColorStop(1, "#0a0812");
  sctx.fillStyle = bg;
  sctx.fillRect(0, 0, W, H);
  const glow = sctx.createRadialGradient(W * 0.1, -H * 0.1, 0, W * 0.1, -H * 0.1, W * 0.55);
  glow.addColorStop(0, "rgba(199,146,255,0.28)");
  glow.addColorStop(1, "rgba(199,146,255,0)");
  sctx.fillStyle = glow;
  sctx.fillRect(0, 0, W, H);

  sctx.textAlign = "left";
  sctx.fillStyle = "#c792ff";
  sctx.font = `800 52px ${mono}`;
  sctx.fillText("moottris", 60, 96);

  sctx.fillStyle = "#f1ece2";
  sctx.font = `700 26px ${mono}`;
  sctx.fillText(`@${cluster?.handle || "?"}'s chart`, 60, 140);

  sctx.fillStyle = "#ffd166";
  sctx.font = `800 76px ${mono}`;
  sctx.fillText(String(score), 60, 244);
  sctx.fillStyle = "#9089a3";
  sctx.font = `600 18px ${mono}`;
  sctx.fillText("points", 60, 270);

  sctx.fillStyle = "#f1ece2";
  sctx.font = `700 22px ${mono}`;
  sctx.fillText(`${lines} line${lines === 1 ? "" : "s"} cleared`, 60, 320);

  const who = current?.moot;
  if (who) {
    sctx.fillStyle = "#9089a3";
    sctx.font = `16px ${mono}`;
    wrapText(
      sctx,
      `filled up with @${who.handle} (${who.glyph} ${who.sign}) still falling.`,
      60,
      360,
      560,
      24,
    );
  }

  sctx.fillStyle = "#ffd166";
  sctx.font = `700 20px ${mono}`;
  sctx.fillText("bisks.net/games/moottris", 60, 590);

  // mini render of the actual final board, right-aligned
  if (grid) {
    const cell = Math.min(300 / COLS, (H - 100) / ROWS);
    const boardW = cell * COLS;
    const boardH = cell * ROWS;
    const bx = W - boardW - 70;
    const by = (H - boardH) / 2;
    sctx.fillStyle = "#000";
    sctx.fillRect(bx, by, boardW, boardH);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cellData = grid[r][c];
        if (!cellData) continue;
        const pad = 1.5;
        const s = cell - pad * 2;
        const x = bx + c * cell + pad;
        const y = by + r * cell + pad;
        roundRect(sctx, x, y, s, s, 3);
        sctx.fillStyle = cellData.color;
        sctx.fill();
        sctx.lineWidth = 1;
        sctx.strokeStyle = "rgba(255,255,255,0.35)";
        roundRect(sctx, x, y, s, s, 3);
        sctx.stroke();
      }
    }
  }
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
const shareFilesSupported = canShareFiles();
if (shareFilesSupported) shareNativeBtn.style.display = "";

function gameOver() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  const did = cluster.did;
  const best = getBest(did);
  const newBest = score > best;
  if (newBest) setBest(did, score);
  bestEl.textContent = String(newBest ? score : best);

  const who = current?.moot;
  overBody.innerHTML =
    `your chart filled up with <b>@${who?.handle || "a moot"}</b> ` +
    `(${who?.glyph || ""} ${who?.sign || "?"}) still falling.` +
    (newBest ? " new best, written in the stars." : "");
  overTip.textContent = pick(TIPS);

  const shareText =
    `scored ${score} on moottris, cleared ${lines} lines with my moots as ` +
    `the falling pieces — zodiac shapes, posting-speed gravity. bisks.net/games/moottris`;
  shareBtn.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
  lastShareText = shareText;
  buildShareCard();

  overOverlay.classList.remove("hidden");
}

function lockPiece() {
  const cells = cellsAt(current);
  let above = false;
  for (const [r, c] of cells) {
    if (r < 0) {
      above = true;
      continue;
    }
    grid[r][c] = { color: current.moot.color, moot: current.moot };
  }
  if (above) {
    gameOver();
    return;
  }
  const cleared = clearLines();
  if (cleared > 0) {
    lines += cleared;
    const table = [0, 100, 300, 500, 800];
    score += table[cleared] || 0;
    if (cleared === 4) triggerCosmic();
  }
  current = next;
  next = makePiece(drawFromBag());
  updatePreview();
  if (collide(current)) {
    gameOver();
  }
}

// ---- rendering ------------------------------------------------------------
function drawCell(x, y, cellData) {
  const pad = 1.5;
  const s = CELL - pad * 2;
  roundRect(ctx, x + pad, y + pad, s, s, 4);
  ctx.fillStyle = cellData.color;
  ctx.fill();
  const img = cellData.moot?.img;
  if (imgReady(img)) {
    ctx.save();
    roundRect(ctx, x + pad, y + pad, s, s, 4);
    ctx.clip();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(img, x + pad, y + pad, s, s);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  roundRect(ctx, x + pad, y + pad, s, s, 4);
  ctx.stroke();
}
function drawGhostCell(x, y, color) {
  const pad = 1.5;
  const s = CELL - pad * 2;
  roundRect(ctx, x + pad, y + pad, s, s, 4);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.45;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
function drawAvatarDot(x, y, r, m, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  if (imgReady(m.img)) {
    ctx.drawImage(m.img, x - r, y - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = m.color;
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawBackdrop() {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, "#150f24");
  g.addColorStop(1, "#0a0812");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, VIEW_H);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(VIEW_W, r * CELL);
    ctx.stroke();
  }
}

function drawCosmicOverlay() {
  if (performance.now() > cosmicUntil) return;
  const remain = (cosmicUntil - performance.now()) / 2600;
  const p = 1 - remain;
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;
  const n = mootPool.length || 1;
  const t = performance.now();
  for (let i = 0; i < n; i++) {
    const m = mootPool[i];
    const ang = (i / n) * Math.PI * 2 + t / 380;
    const radius = 30 + p * 150;
    const x = cx + Math.cos(ang) * radius;
    const y = cy + Math.sin(ang) * radius * 0.55;
    drawAvatarDot(x, y, 9, m, Math.max(0, 1 - p));
  }
  const flashA = Math.max(0, 1 - p * 2.2);
  if (flashA > 0) {
    ctx.fillStyle = `rgba(199,146,255,${flashA * 0.35})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function drawBanner() {
  if (!banner) return;
  if (performance.now() > banner.until) {
    banner = null;
    return;
  }
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.fillStyle = "#ffd166";
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 5;
  banner.lines.forEach((line, i) => {
    ctx.fillText(line, VIEW_W / 2, 22 + i * 14);
  });
  ctx.restore();
}

function render() {
  ctx.save();
  let sx = 0, sy = 0;
  if (performance.now() < shakeUntil) {
    sx = (Math.random() - 0.5) * 10;
    sy = (Math.random() - 0.5) * 10;
  }
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.translate(sx, sy);
  drawBackdrop();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c]) drawCell(c * CELL, r * CELL, grid[r][c]);
    }
  }

  if (current) {
    const gr = ghostRow();
    if (gr !== current.row) {
      for (const [r, c] of cellsAt(current, null, gr, current.col)) {
        if (r < 0) continue;
        drawGhostCell(c * CELL, r * CELL, current.moot.color);
      }
    }
    for (const [r, c] of cellsAt(current)) {
      if (r < 0) continue;
      drawCell(c * CELL, r * CELL, { color: current.moot.color, moot: current.moot });
    }
  }

  drawCosmicOverlay();
  drawBanner();
  ctx.restore();
}

function renderNextPreview() {
  nctx.clearRect(0, 0, 88, 88);
  if (!next) return;
  const cs = 22;
  for (const [r, c] of next.cells) {
    nctx.fillStyle = next.moot.color;
    nctx.fillRect(c * cs + 2, r * cs + 2, cs - 4, cs - 4);
    const img = next.moot.img;
    if (imgReady(img)) {
      nctx.save();
      nctx.beginPath();
      nctx.rect(c * cs + 2, r * cs + 2, cs - 4, cs - 4);
      nctx.clip();
      nctx.globalAlpha = 0.9;
      nctx.drawImage(img, c * cs + 2, r * cs + 2, cs - 4, cs - 4);
      nctx.globalAlpha = 1;
      nctx.restore();
    }
  }
}

function mootLabel(m) {
  return `@${m.handle}<br><span class="sign">${m.glyph} ${m.sign}</span> · <span class="speed">${m.posts48h} posts/48h</span>`;
}
function updatePreview() {
  renderNextPreview();
  nextWho.innerHTML = next ? mootLabel(next.moot) : "—";
  curWho.innerHTML = current ? mootLabel(current.moot) : "—";
}
function updateHud() {
  scoreEl.textContent = String(score);
  linesEl.textContent = String(lines);
  retroBadge.classList.toggle("on", isRetro());
}

// ---- loop ------------------------------------------------------------
// Drive the tick off performance.now() rather than the rAF callback's own
// timestamp — every other clock in this file (retrograde/shake/cosmic/banner
// windows) already reads performance.now(), and on some mobile browsers
// (seen on Firefox Android) the rAF timestamp arg can stall or diverge from
// it, which desynced the drop timer from everything else keyed off isRetro().
function loop() {
  if (!running) return;
  const now = performance.now();
  const dt = Math.max(0, Math.min(now - lastT, 50)) || 0;
  lastT = now;
  dropAccum += dt;
  const interval = softDrop ? Math.min(current.interval, 45) : current.interval;
  if (dropAccum >= interval) {
    dropAccum = 0;
    if (tryMove(1, 0)) {
      if (softDrop) score += 1;
    } else {
      lockPiece();
    }
  }
  updateHud();
  if (running) render();
  if (running) rafId = requestAnimationFrame(loop);
}

// A backgrounded tab (mobile especially — switching apps, locking the
// screen) can suspend rAF for an arbitrary stretch. Resuming with a stale
// lastT would otherwise just eat one clamped 50ms tick, but re-syncing the
// clock on resume keeps the drop timer from ever reading as "stuck" the
// moment the game becomes visible again.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && running) lastT = performance.now();
});

function startGame() {
  grid = emptyGrid();
  score = 0;
  lines = 0;
  dropAccum = 0;
  softDrop = false;
  retrogradeUntil = 0;
  shakeUntil = 0;
  cosmicUntil = 0;
  banner = null;
  refillBag();
  current = makePiece(drawFromBag());
  next = makePiece(drawFromBag());
  updatePreview();
  updateHud();
  startOverlay.classList.add("hidden");
  overOverlay.classList.add("hidden");
  running = true;
  lastT = performance.now();
  rafId = requestAnimationFrame(loop);
}

startBtn.addEventListener("click", startGame);
againBtn.addEventListener("click", startGame);

shareDownloadBtn.addEventListener("click", (e) => {
  e.preventDefault();
  shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `moottris-${cluster?.handle || "chart"}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
});

if (shareFilesSupported) {
  shareNativeBtn.addEventListener("click", () => {
    shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `moottris-${cluster?.handle || "chart"}.png`, {
        type: "image/png",
      });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "moottris" });
      } catch {
        // user cancelled the share sheet, or it failed silently — no-op
      }
    }, "image/png");
  });
}

// ---- input ------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if (!running) return;
  switch (e.code) {
    case "ArrowLeft":
      e.preventDefault();
      moveLeft();
      break;
    case "ArrowRight":
      e.preventDefault();
      moveRight();
      break;
    case "ArrowUp":
      e.preventDefault();
      tryRotate();
      break;
    case "ArrowDown":
      e.preventDefault();
      softDrop = true;
      break;
    case "Space":
      e.preventDefault();
      if (!e.repeat) hardDrop();
      break;
    default:
      return;
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "ArrowDown") softDrop = false;
});

function bindTap(el, fn) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (running) fn();
  });
}
bindTap(tLeft, moveLeft);
bindTap(tRight, moveRight);
bindTap(tRotate, tryRotate);
bindTap(tDrop, hardDrop);
tDown.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  softDrop = true;
});
tDown.addEventListener("pointerup", () => (softDrop = false));
tDown.addEventListener("pointerleave", () => (softDrop = false));

// ---- start / load -------------------------------------------------------
async function loadNetwork(actor) {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  gameEl.hidden = true;
  loadBtn.disabled = true;
  setStatus("resolving handle…");

  let c;
  try {
    c = await moots(actor, { onStep: (s) => setStatus(s) });
  } catch (e) {
    setStatus(`couldn't load that: ${e.message}`, true);
    loadBtn.disabled = false;
    return;
  }

  if (!c.pool.length) {
    setStatus("no moots or follows to build a board out of.", true);
    loadBtn.disabled = false;
    return;
  }

  cluster = c;
  const picked = c.pool
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, MAX_MOOTS);

  setStatus("reading birth charts…");
  const profiles = await getProfiles(picked.map((p) => p.did));
  const byDid = new Map(profiles.map((p) => [p.did, p]));

  setStatus("counting recent posts…");
  mootPool = await Promise.all(
    picked.map(async (p) => {
      const full = byDid.get(p.did) || {};
      const z = zodiacOf(full.createdAt);
      const posts48h = await postsIn48h(p.did);
      return {
        did: p.did,
        handle: p.handle,
        img: loadImg(full.avatar || p.avatar),
        sign: z.sign,
        glyph: z.glyph,
        planet: z.planet,
        shape: z.shape,
        color: z.color,
        posts48h,
        interval: Math.max(110, 820 - posts48h * 13),
      };
    }),
  );

  if (!mootPool.length) {
    setStatus("couldn't chart anyone.", true);
    loadBtn.disabled = false;
    return;
  }

  refillBag();
  grid = emptyGrid();
  current = makePiece(drawFromBag());
  next = makePiece(drawFromBag());
  updatePreview();

  const fastest = mootPool.slice().sort((a, b) => b.posts48h - a.posts48h)[0];
  boardMeta.textContent = `${c.kind} · ${mootPool.length} charted`;
  bestEl.textContent = String(getBest(c.did));
  startCopy.textContent =
    `you're @${c.handle}. ${mootPool.length} moots are stacked up as pieces — ` +
    `fastest faller is @${fastest.handle} (${fastest.glyph} ${fastest.sign}, ${fastest.posts48h} posts/48h).`;
  startOverlay.classList.remove("hidden");
  overOverlay.classList.add("hidden");
  gameEl.hidden = false;
  loadBtn.disabled = false;
  setStatus("");
  render();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const actor = input.value.trim();
  if (!actor) return;
  loadNetwork(actor);
});

if (input.value.trim()) loadNetwork(input.value.trim());
