// furmerge — a 2048-style merge game where tiles are cat breeds ordered
// least to most fluffy. Merging two Sphynxes gets you a Devon Rex; merge
// your way up to a Persian to win. Pure vanilla JS, no build step.

const MOUNT = "/games/furmerge";
const SIZE = 4;

// Least -> most fluffy. index 0 = value 2, index 10 = value 2048 (win tile).
const BREEDS = [
  { name: "Sphynx", value: 2, bg: "#3b3f46", fg: "#f2f2f2", furTufts: 0, earFuzz: 0 },
  { name: "Devon Rex", value: 4, bg: "#5b5346", fg: "#f5efe2", furTufts: 2, earFuzz: 0 },
  { name: "Siamese", value: 8, bg: "#8a6a4a", fg: "#fff7ea", furTufts: 3, earFuzz: 1 },
  { name: "Bengal", value: 16, bg: "#b8802f", fg: "#fff7ea", furTufts: 4, earFuzz: 1 },
  { name: "Abyssinian", value: 32, bg: "#c9832a", fg: "#fff7ea", furTufts: 5, earFuzz: 2 },
  { name: "British Shorthair", value: 64, bg: "#6f8fa6", fg: "#ffffff", furTufts: 6, earFuzz: 2 },
  { name: "Scottish Fold", value: 128, bg: "#8a99a8", fg: "#ffffff", furTufts: 7, earFuzz: 3 },
  { name: "American Shorthair", value: 256, bg: "#c9944f", fg: "#ffffff", furTufts: 8, earFuzz: 3 },
  { name: "Maine Coon", value: 512, bg: "#c06a2c", fg: "#ffffff", furTufts: 10, earFuzz: 4 },
  { name: "Norwegian Forest Cat", value: 1024, bg: "#d68a3a", fg: "#ffffff", furTufts: 12, earFuzz: 5 },
  { name: "Persian", value: 2048, bg: "#e8b84b", fg: "#4a3300", furTufts: 16, earFuzz: 6 },
];

const WIN_TIER = BREEDS.length - 1;

let board, score, best, won, keepPlayingAfterWin, over;

const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlay-title");
const overlaySubEl = document.getElementById("overlay-sub");
const newGameBtn = document.getElementById("new-game");
const keepPlayingBtn = document.getElementById("keep-playing");
const shareBlueskyEl = document.getElementById("share-bluesky");
const shareBlueskyEl2 = document.getElementById("share-bluesky-2");
const shareNativeEl = document.getElementById("share-native");
const shareDownloadEl = document.getElementById("share-download");
const shareCardCanvas = document.getElementById("share-card");

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function catFaceSVG(tier, sizePx) {
  const b = BREEDS[tier];
  const s = sizePx;
  const cx = s / 2, cy = s / 2 + s * 0.04;
  const r = s * 0.3;
  let tufts = "";
  for (let i = 0; i < b.furTufts; i++) {
    const a = (i / b.furTufts) * Math.PI * 2 - Math.PI / 2;
    const len = r * (0.22 + (i % 3) * 0.06);
    const x1 = cx + Math.cos(a) * r;
    const y1 = cy + Math.sin(a) * r;
    const x2 = cx + Math.cos(a) * (r + len);
    const y2 = cy + Math.sin(a) * (r + len);
    tufts += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${b.fg}" stroke-width="${(s * 0.02).toFixed(1)}" stroke-linecap="round" opacity="0.85"/>`;
  }
  const earFuzzPx = b.earFuzz;
  let earFuzzMarks = (side) => {
    let out = "";
    const bx = side < 0 ? cx - r * 0.62 : cx + r * 0.62;
    const by = cy - r * 0.78;
    for (let i = 0; i < earFuzzPx; i++) {
      const ox = (i - earFuzzPx / 2) * s * 0.02;
      out += `<line x1="${(bx + ox).toFixed(1)}" y1="${by.toFixed(1)}" x2="${(bx + ox + side * s * 0.02).toFixed(1)}" y2="${(by - s * 0.05).toFixed(1)}" stroke="${b.fg}" stroke-width="${(s * 0.015).toFixed(1)}" stroke-linecap="round" opacity="0.7"/>`;
    }
    return out;
  };
  const earL = `<path d="M ${cx - r * 0.85} ${cy - r * 0.55} L ${cx - r * 0.35} ${cy - r * 1.15} L ${cx - r * 0.1} ${cy - r * 0.55} Z" fill="${b.bg}" stroke="${b.fg}" stroke-width="${(s * 0.012).toFixed(1)}"/>`;
  const earR = `<path d="M ${cx + r * 0.85} ${cy - r * 0.55} L ${cx + r * 0.35} ${cy - r * 1.15} L ${cx + r * 0.1} ${cy - r * 0.55} Z" fill="${b.bg}" stroke="${b.fg}" stroke-width="${(s * 0.012).toFixed(1)}"/>`;
  const eyeY = cy - r * 0.05;
  return `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">
    ${earL}${earR}
    ${earFuzzMarks(-1)}${earFuzzMarks(1)}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${b.bg}" stroke="${b.fg}" stroke-width="${(s * 0.015).toFixed(1)}"/>
    ${tufts}
    <ellipse cx="${cx - r * 0.35}" cy="${eyeY}" rx="${r * 0.12}" ry="${r * 0.14}" fill="${b.fg}"/>
    <ellipse cx="${cx + r * 0.35}" cy="${eyeY}" rx="${r * 0.12}" ry="${r * 0.14}" fill="${b.fg}"/>
    <path d="M ${cx} ${cy + r * 0.15} L ${cx - r * 0.1} ${cy + r * 0.28} L ${cx + r * 0.1} ${cy + r * 0.28} Z" fill="${b.fg}"/>
  </svg>`;
}

function loadBest() {
  return Number(localStorage.getItem("furmerge_best") || 0);
}

function saveBest(v) {
  localStorage.setItem("furmerge_best", String(v));
}

function newGame() {
  board = emptyBoard();
  score = 0;
  won = false;
  over = false;
  keepPlayingAfterWin = false;
  addRandomTile();
  addRandomTile();
  overlayEl.classList.add("hidden");
  render();
}

function addRandomTile() {
  const empties = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (board[r][c] == null) empties.push([r, c]);
  if (empties.length === 0) return;
  const [r, c] = empties[Math.floor(Math.random() * empties.length)];
  board[r][c] = Math.random() < 0.9 ? 0 : 1;
}

function render() {
  boardEl.innerHTML = "";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const tier = board[r][c];
      if (tier != null) {
        const b = BREEDS[tier];
        cell.classList.add("filled");
        cell.style.background = b.bg;
        cell.style.color = b.fg;
        cell.innerHTML = `<div class="cell-face">${catFaceSVG(tier, 56)}</div><div class="cell-label">${b.name}</div>`;
      }
      boardEl.appendChild(cell);
    }
  }
  scoreEl.textContent = score;
  best = Math.max(best, score);
  bestEl.textContent = best;
  saveBest(best);
}

function cloneBoard(b) {
  return b.map((row) => row.slice());
}

function boardsEqual(a, b) {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) if (a[r][c] !== b[r][c]) return false;
  return true;
}

// Slides + merges a single row toward index 0 (left). Returns {row, gained, moved}.
function slideRow(row) {
  const vals = row.filter((v) => v != null);
  const merged = [];
  let gained = 0;
  for (let i = 0; i < vals.length; i++) {
    if (i < vals.length - 1 && vals[i] === vals[i + 1] && vals[i] < WIN_TIER) {
      const newTier = vals[i] + 1;
      merged.push(newTier);
      gained += BREEDS[newTier].value;
      i++;
    } else {
      merged.push(vals[i]);
    }
  }
  while (merged.length < SIZE) merged.push(null);
  return { row: merged, gained };
}

function rotateBoard(b) {
  // 90deg clockwise
  const out = emptyBoard();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) out[c][SIZE - 1 - r] = b[r][c];
  return out;
}

function move(dir) {
  if (over) return;
  // Normalize every direction to "slide left" by rotating the board,
  // sliding rows, then rotating back.
  let rotations = { left: 0, up: 3, right: 2, down: 1 }[dir];
  let working = cloneBoard(board);
  for (let i = 0; i < rotations; i++) working = rotateBoard(working);

  let gained = 0;
  const result = working.map((row) => {
    const { row: newRow, gained: g } = slideRow(row);
    gained += g;
    return newRow;
  });

  let finalBoard = result;
  for (let i = 0; i < (4 - rotations) % 4; i++) finalBoard = rotateBoard(finalBoard);

  if (boardsEqual(finalBoard, board)) return;

  board = finalBoard;
  score += gained;
  addRandomTile();

  const reachedWin = board.some((row) => row.some((t) => t === WIN_TIER));
  if (reachedWin && !won && !keepPlayingAfterWin) {
    won = true;
    render();
    showWin();
    return;
  }

  render();
  if (!canMove()) {
    over = true;
    showGameOver();
  }
}

function canMove() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] == null) return true;
      if (c < SIZE - 1 && board[r][c] === board[r][c + 1]) return true;
      if (r < SIZE - 1 && board[r][c] === board[r + 1][c]) return true;
    }
  }
  return false;
}

function topBreedReached() {
  let maxTier = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c] != null) maxTier = Math.max(maxTier, board[r][c]);
  return BREEDS[maxTier];
}

function article(name) {
  return /^[aeiou]/i.test(name) ? "an" : "a";
}

function buildShareText() {
  const b = topBreedReached();
  const url = location.origin + MOUNT + "/";
  let text = won
    ? `I merged my way to a Persian in furmerge 🐈 score ${score} — ${url}`
    : `Topped out at ${article(b.name)} ${b.name} in furmerge (score ${score}) 🐈 — ${url}`;
  if ([...text].length > 300) {
    text = `furmerge: reached ${b.name}, score ${score} — ${url}`;
  }
  return text;
}

function showWin() {
  overlayTitleEl.textContent = "You bred a Persian! 🐈";
  overlaySubEl.textContent = `Score: ${score}. Keep merging for a higher score, or start fresh.`;
  keepPlayingBtn.classList.remove("hidden");
  overlayEl.classList.remove("hidden");
  updateShareLinks();
}

function showGameOver() {
  const b = topBreedReached();
  overlayTitleEl.textContent = "No more moves";
  overlaySubEl.textContent = `Best breed: ${b.name}. Score: ${score}.`;
  keepPlayingBtn.classList.add("hidden");
  overlayEl.classList.remove("hidden");
  updateShareLinks();
}

function updateShareLinks() {
  const text = buildShareText();
  const href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  shareBlueskyEl.href = href;
  shareBlueskyEl2.href = href;
  drawShareCard(text);
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

function drawShareCard(shareText) {
  const ctx = shareCardCanvas.getContext("2d");
  const W = 1200, H = 630;
  shareCardCanvas.width = W;
  shareCardCanvas.height = H;
  const b = topBreedReached();

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#2b2118");
  grad.addColorStop(1, b.bg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#fff7ea";
  ctx.font = "800 64px 'JetBrains Mono', monospace, sans-serif";
  ctx.fillText("furmerge", 64, 110);

  ctx.font = "20px 'JetBrains Mono', monospace, sans-serif";
  ctx.fillStyle = "#f0e6d8";
  ctx.fillText("least → most fluffy cat merging", 64, 148);

  // cat face render
  const svgStr = catFaceSVG(topBreedReached() === BREEDS[WIN_TIER] ? WIN_TIER : BREEDS.indexOf(b), 260);
  const img = new Image();
  const svgBlob = new Blob([svgStr], { type: "image/svg+xml" });
  const url = URL.createObjectURL(svgBlob);
  img.onload = () => {
    ctx.drawImage(img, W - 420, 90, 260, 260);
    URL.revokeObjectURL(url);

    ctx.fillStyle = "#fff7ea";
    ctx.font = "700 40px 'JetBrains Mono', monospace, sans-serif";
    ctx.fillText(`Reached: ${b.name}`, 64, 260);

    ctx.font = "700 32px 'JetBrains Mono', monospace, sans-serif";
    ctx.fillText(`Score: ${score}`, 64, 320);

    ctx.font = "22px 'JetBrains Mono', monospace, sans-serif";
    ctx.fillStyle = "#e8dcc8";
    ctx.fillText(location.origin + MOUNT + "/", 64, 560);

    shareDownloadEl.href = shareCardCanvas.toDataURL("image/png");
  };
  img.src = url;
}

async function shareNative() {
  const text = buildShareText();
  shareCardCanvas.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], "furmerge.png", { type: "image/png" });
    try {
      if (canShareFiles()) {
        await navigator.share({ files: [file], text, title: "furmerge" });
      } else if (navigator.share) {
        await navigator.share({ text, title: "furmerge" });
      }
    } catch {
      /* user cancelled */
    }
  }, "image/png");
}

// --- input ---
window.addEventListener("keydown", (e) => {
  const map = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", a: "left", d: "right", w: "up", s: "down" };
  const dir = map[e.key];
  if (dir) {
    e.preventDefault();
    move(dir);
  }
});

let touchStartX = null, touchStartY = null;
boardEl.addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

boardEl.addEventListener("touchend", (e) => {
  if (touchStartX == null) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  const absX = Math.abs(dx), absY = Math.abs(dy);
  if (Math.max(absX, absY) < 24) return;
  if (absX > absY) move(dx > 0 ? "right" : "left");
  else move(dy > 0 ? "down" : "up");
  touchStartX = touchStartY = null;
}, { passive: true });

newGameBtn.addEventListener("click", newGame);
document.getElementById("new-game-2").addEventListener("click", newGame);
keepPlayingBtn.addEventListener("click", () => {
  keepPlayingAfterWin = true;
  overlayEl.classList.add("hidden");
});
shareNativeEl.addEventListener("click", shareNative);

// legend
const legendEl = document.getElementById("legend");
BREEDS.forEach((b, i) => {
  const item = document.createElement("div");
  item.className = "legend-item";
  item.innerHTML = `<div class="legend-face" style="background:${b.bg}">${catFaceSVG(i, 28)}</div><span>${b.name}</span>`;
  legendEl.appendChild(item);
});

best = loadBest();
newGame();
