// furmerge — a 2048-style merge game where tiles are cat breeds ordered
// least to most fluffy. Merging two Sphynxes gets you a Devon Rex; merge
// your way up to a Persian to win. Pure vanilla JS, no build step.

const MOUNT = "/games/furmerge";
const SIZE = 4;

// Least -> most fluffy. index 0 = value 2, index 10 = value 2048 (win tile).
// earStyle: "point" | "fold" (Scottish Fold) | "lynx" (tufted ear tips)
// pattern: null | "mask" (Siamese color points) | "spots" (Bengal rosettes)
//          | "tabby" (forehead M stripes)
const BREEDS = [
  { name: "Sphynx", value: 2, bg: "#3b3f46", fg: "#f2f2f2", furTufts: 0, ruff: 0, earStyle: "point", pattern: null, wrinkles: true, flat: false },
  { name: "Devon Rex", value: 4, bg: "#5b5346", fg: "#f5efe2", furTufts: 2, ruff: 1, earStyle: "point", pattern: null, wrinkles: false, flat: false },
  { name: "Siamese", value: 8, bg: "#8a6a4a", fg: "#fff7ea", furTufts: 3, ruff: 1, earStyle: "point", pattern: "mask", wrinkles: false, flat: false },
  { name: "Bengal", value: 16, bg: "#b8802f", fg: "#fff7ea", furTufts: 4, ruff: 2, earStyle: "point", pattern: "spots", wrinkles: false, flat: false },
  { name: "Abyssinian", value: 32, bg: "#c9832a", fg: "#fff7ea", furTufts: 5, ruff: 2, earStyle: "point", pattern: "tabby", wrinkles: false, flat: false },
  { name: "British Shorthair", value: 64, bg: "#6f8fa6", fg: "#ffffff", furTufts: 6, ruff: 4, earStyle: "point", pattern: null, wrinkles: false, flat: false },
  { name: "Scottish Fold", value: 128, bg: "#8a99a8", fg: "#ffffff", furTufts: 7, ruff: 5, earStyle: "fold", pattern: null, wrinkles: false, flat: false },
  { name: "American Shorthair", value: 256, bg: "#c9944f", fg: "#ffffff", furTufts: 8, ruff: 6, earStyle: "point", pattern: "tabby", wrinkles: false, flat: false },
  { name: "Maine Coon", value: 512, bg: "#c06a2c", fg: "#ffffff", furTufts: 10, ruff: 8, earStyle: "lynx", pattern: null, wrinkles: false, flat: false },
  { name: "Norwegian Forest Cat", value: 1024, bg: "#d68a3a", fg: "#ffffff", furTufts: 12, ruff: 10, earStyle: "lynx", pattern: null, wrinkles: false, flat: false },
  { name: "Persian", value: 2048, bg: "#e8b84b", fg: "#4a3300", furTufts: 16, ruff: 13, earStyle: "point", pattern: null, wrinkles: false, flat: true },
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

// A cute, breed-distinct cat face as an inline SVG. Shared by the board
// tiles, the legend, and the share card. See og-gen.mjs for a duplicate
// (house style: copy, don't abstract) used when rasterizing the OG image.
function catFaceMarkup(b, s) {
  const cx = s / 2, cy = s / 2 + s * 0.05;
  const r = b.flat ? s * 0.33 : s * 0.3;
  const rx = b.flat ? r * 1.08 : r;
  const ry = b.flat ? r * 0.92 : r;
  const sw = (s * 0.015).toFixed(1);
  const MARK = "#4a2f18";
  const INK = "#2a1c10";

  // Fluffy ruff: a scatter of little fur bumps behind the head, more of
  // them (and bigger) the fluffier the breed is.
  let ruff = "";
  if (b.ruff > 0) {
    const n = Math.max(6, Math.round(b.ruff * 1.5));
    const bumpR = r * (0.16 + Math.min(b.ruff, 13) * 0.012);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * r * 1.05;
      const y = cy + Math.sin(a) * r * 1.05 * (ry / r);
      ruff += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${bumpR.toFixed(1)}" fill="${b.bg}" stroke="${b.fg}" stroke-width="${(s * 0.008).toFixed(1)}" opacity="0.9"/>`;
    }
  }

  // Ears: pointed, folded-forward (Scottish Fold), or tufted at the tip
  // (Maine Coon / Norwegian Forest Cat "lynx tips").
  const earFill = b.pattern === "mask" ? MARK : b.bg;
  const ear = (side) => {
    if (b.earStyle === "fold") {
      const bx = cx + side * r * 0.58, by = cy - r * 0.68;
      return `<ellipse cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" rx="${(r * 0.26).toFixed(1)}" ry="${(r * 0.17).toFixed(1)}" fill="${earFill}" stroke="${b.fg}" stroke-width="${sw}" transform="rotate(${side * 20} ${bx.toFixed(1)} ${by.toFixed(1)})"/>`;
    }
    const base = `<path d="M ${(cx + side * r * 0.85).toFixed(1)} ${(cy - r * 0.55).toFixed(1)} L ${(cx + side * r * 0.35).toFixed(1)} ${(cy - r * 1.15).toFixed(1)} L ${(cx + side * r * 0.1).toFixed(1)} ${(cy - r * 0.55).toFixed(1)} Z" fill="${earFill}" stroke="${b.fg}" stroke-width="${sw}"/>`;
    const inner = `<path d="M ${(cx + side * r * 0.6).toFixed(1)} ${(cy - r * 0.62).toFixed(1)} L ${(cx + side * r * 0.35).toFixed(1)} ${(cy - r * 0.96).toFixed(1)} L ${(cx + side * r * 0.22).toFixed(1)} ${(cy - r * 0.62).toFixed(1)} Z" fill="${b.fg}" opacity="0.22"/>`;
    let tips = "";
    if (b.earStyle === "lynx") {
      for (let i = 0; i < 2; i++) {
        const tx = cx + side * r * (0.32 - i * 0.14);
        const ty = cy - r * (1.13 + i * 0.1);
        tips += `<line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${(tx + side * r * 0.1).toFixed(1)}" y2="${(ty - r * 0.24).toFixed(1)}" stroke="${b.fg}" stroke-width="${sw}" stroke-linecap="round"/>`;
      }
    }
    return base + inner + tips;
  };

  // Breed markings, layered on top of the head fill.
  let pattern = "";
  if (b.pattern === "mask") {
    pattern += `<ellipse cx="${cx.toFixed(1)}" cy="${(cy + r * 0.3).toFixed(1)}" rx="${(rx * 0.5).toFixed(1)}" ry="${(ry * 0.32).toFixed(1)}" fill="${MARK}" opacity="0.85"/>`;
  } else if (b.pattern === "spots") {
    const spots = [[-0.42, -0.22], [0.4, -0.15], [-0.1, -0.4], [0.15, 0.1], [-0.35, 0.18]];
    spots.forEach(([dx, dy]) => {
      pattern += `<ellipse cx="${(cx + rx * dx).toFixed(1)}" cy="${(cy + ry * dy).toFixed(1)}" rx="${(rx * 0.11).toFixed(1)}" ry="${(rx * 0.08).toFixed(1)}" fill="${MARK}" opacity="0.55"/>`;
    });
  } else if (b.pattern === "tabby") {
    for (let i = -1; i <= 1; i++) {
      const x = cx + i * rx * 0.16;
      pattern += `<path d="M ${x.toFixed(1)} ${(cy - ry * 0.72).toFixed(1)} q ${(i * rx * 0.06).toFixed(1)} ${(ry * 0.14).toFixed(1)} 0 ${(ry * 0.28).toFixed(1)}" fill="none" stroke="${MARK}" stroke-width="${(s * 0.012).toFixed(1)}" opacity="0.6" stroke-linecap="round"/>`;
    }
  }

  const wrinkles = b.wrinkles
    ? `<path d="M ${(cx - rx * 0.3).toFixed(1)} ${(cy - ry * 0.55).toFixed(1)} q ${(rx * 0.3).toFixed(1)} ${(-ry * 0.1).toFixed(1)} ${(rx * 0.6).toFixed(1)} 0" fill="none" stroke="${b.fg}" stroke-width="${(s * 0.01).toFixed(1)}" opacity="0.4"/>
       <path d="M ${(cx - rx * 0.22).toFixed(1)} ${(cy - ry * 0.4).toFixed(1)} q ${(rx * 0.22).toFixed(1)} ${(-ry * 0.08).toFixed(1)} ${(rx * 0.44).toFixed(1)} 0" fill="none" stroke="${b.fg}" stroke-width="${(s * 0.01).toFixed(1)}" opacity="0.3"/>`
    : "";

  const eyeDx = b.flat ? 0.3 : 0.34;
  const eyeY = cy - ry * (b.flat ? 0.02 : 0.06);
  const eyeR = r * (b.flat ? 0.15 : 0.13);
  const eye = (dx) => {
    const ex = cx + rx * dx;
    return `<ellipse cx="${ex.toFixed(1)}" cy="${eyeY.toFixed(1)}" rx="${eyeR.toFixed(1)}" ry="${(eyeR * 1.15).toFixed(1)}" fill="#fbeee0"/>
      <circle cx="${ex.toFixed(1)}" cy="${(eyeY + eyeR * 0.1).toFixed(1)}" r="${(eyeR * 0.62).toFixed(1)}" fill="${INK}"/>
      <circle cx="${(ex - eyeR * 0.22).toFixed(1)}" cy="${(eyeY - eyeR * 0.28).toFixed(1)}" r="${(eyeR * 0.2).toFixed(1)}" fill="#ffffff" opacity="0.9"/>`;
  };

  const muzzleY = cy + ry * (b.flat ? 0.28 : 0.42);
  const blush = `<ellipse cx="${(cx - rx * 0.55).toFixed(1)}" cy="${(muzzleY - ry * 0.06).toFixed(1)}" rx="${(rx * 0.16).toFixed(1)}" ry="${(rx * 0.1).toFixed(1)}" fill="#ff8fa3" opacity="0.3"/>
    <ellipse cx="${(cx + rx * 0.55).toFixed(1)}" cy="${(muzzleY - ry * 0.06).toFixed(1)}" rx="${(rx * 0.16).toFixed(1)}" ry="${(rx * 0.1).toFixed(1)}" fill="#ff8fa3" opacity="0.3"/>`;

  const nose = `<path d="M ${cx.toFixed(1)} ${(muzzleY - ry * 0.1).toFixed(1)} L ${(cx - rx * 0.08).toFixed(1)} ${(muzzleY + ry * 0.02).toFixed(1)} L ${(cx + rx * 0.08).toFixed(1)} ${(muzzleY + ry * 0.02).toFixed(1)} Z" fill="#f2a3b3"/>`;
  const mouth = `<path d="M ${cx.toFixed(1)} ${(muzzleY + ry * 0.03).toFixed(1)} q ${(-rx * 0.12).toFixed(1)} ${(ry * 0.12).toFixed(1)} ${(-rx * 0.22).toFixed(1)} 0 M ${cx.toFixed(1)} ${(muzzleY + ry * 0.03).toFixed(1)} q ${(rx * 0.12).toFixed(1)} ${(ry * 0.12).toFixed(1)} ${(rx * 0.22).toFixed(1)} 0" fill="none" stroke="${b.fg}" stroke-width="${(s * 0.015).toFixed(1)}" stroke-linecap="round" opacity="0.85"/>`;

  let whiskers = "";
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 3; i++) {
      const y = muzzleY - ry * 0.06 + i * ry * 0.09;
      const x1 = cx + side * rx * 0.14;
      const x2 = cx + side * rx * (0.75 + i * 0.06);
      whiskers += `<line x1="${x1.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${(y + side * 0 + (i - 1) * ry * 0.03).toFixed(1)}" stroke="${b.fg}" stroke-width="${(s * 0.008).toFixed(1)}" opacity="0.55" stroke-linecap="round"/>`;
    }
  });

  const head = b.flat
    ? `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${b.bg}" stroke="${b.fg}" stroke-width="${sw}"/>`
    : `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${b.bg}" stroke="${b.fg}" stroke-width="${sw}"/>`;

  return `${ruff}${ear(-1)}${ear(1)}${head}${pattern}${wrinkles}${blush}${eye(-eyeDx)}${eye(eyeDx)}${nose}${mouth}${whiskers}`;
}

function catFaceSVG(tier, sizePx) {
  const b = BREEDS[tier];
  const s = sizePx;
  return `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg">${catFaceMarkup(b, s)}</svg>`;
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
        cell.innerHTML = `<div class="cell-face">${catFaceSVG(tier, 88)}</div><div class="cell-label">${b.name}</div>`;
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
  item.innerHTML = `<div class="legend-face" style="background:${b.bg}">${catFaceSVG(i, 40)}</div><span>${b.name}</span>`;
  legendEl.appendChild(item);
});

best = loadBest();
newGame();
