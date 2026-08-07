// liquid chess — a chess board where every piece is a wobbling liquid
// droplet (an SVG "goo" filter merges nearby blobs), moves glide across the
// board, and captures play a dissolve animation. Standard piece movement;
// the variant drops check/checkmate/castling/en-passant for simplicity —
// capturing the king ends the game outright.

const PIECE_GLYPH = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const PIECE_NAME = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const SIZE_SCALE = { p: 0.72, n: 0.86, b: 0.86, r: 0.92, q: 1.05, k: 1.12 };
const SAT_COUNT = { p: 2, n: 3, b: 3, r: 3, q: 4, k: 5 };
const SHARE_URL = "https://liquidchess.bisks.net/";

const boardEl = document.getElementById("board");
const squaresEl = document.getElementById("squares");
const liquidLayer = document.getElementById("liquidLayer");
const glyphLayer = document.getElementById("glyphLayer");
const winnerOverlay = document.getElementById("winnerOverlay");
const winnerTitle = document.getElementById("winnerTitle");
const winnerSub = document.getElementById("winnerSub");
const shareResultBtn = document.getElementById("shareResult");
const shareBlueskyBtn = document.getElementById("shareBluesky");
const playAgainBtn = document.getElementById("playAgain");
const resetBtn = document.getElementById("resetBtn");
const turnDot = document.getElementById("turnDot");
const turnText = document.getElementById("turnText");
const statusLine = document.getElementById("statusLine");
const trayW = document.getElementById("trayW");
const trayB = document.getElementById("trayB");

let idCounter = 0;
let board, pieces, turn, selected, legalTargets, moveCount, gameOver, winner, captured, lastMove;
const squareEls = [];
const pieceDom = new Map(); // id -> { blob, glyph }

shareBlueskyBtn.href =
  "https://bsky.app/intent/compose?text=" +
  encodeURIComponent(
    "chess, but every piece is a droplet of liquid — it flows across the board and dissolves whatever it captures. liquid chess: " +
      SHARE_URL,
  );

function mkPiece(color, type, r, c) {
  return { id: "p" + idCounter++, color, type, r, c };
}

function newBoard() {
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  const backRank = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const list = [];
  for (let c = 0; c < 8; c++) {
    const bp = mkPiece("b", backRank[c], 0, c);
    const bpawn = mkPiece("b", "p", 1, c);
    const wpawn = mkPiece("w", "p", 6, c);
    const wp = mkPiece("w", backRank[c], 7, c);
    b[0][c] = bp;
    b[1][c] = bpawn;
    b[6][c] = wpawn;
    b[7][c] = wp;
    list.push(bp, bpawn, wpawn, wp);
  }
  return { b, list };
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function genMoves(piece) {
  const { r, c, type, color } = piece;
  const moves = [];
  if (type === "p") {
    const dir = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;
    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push({ r: r + dir, c, capture: false });
      if (r === startRow && !board[r + 2 * dir][c]) {
        moves.push({ r: r + 2 * dir, c, capture: false });
      }
    }
    for (const dc of [-1, 1]) {
      const tr = r + dir,
        tc = c + dc;
      if (inBounds(tr, tc) && board[tr][tc] && board[tr][tc].color !== color) {
        moves.push({ r: tr, c: tc, capture: true });
      }
    }
  } else if (type === "n") {
    const offs = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    for (const [dr, dc] of offs) {
      const tr = r + dr, tc = c + dc;
      if (!inBounds(tr, tc)) continue;
      const occ = board[tr][tc];
      if (!occ) moves.push({ r: tr, c: tc, capture: false });
      else if (occ.color !== color) moves.push({ r: tr, c: tc, capture: true });
    }
  } else if (type === "k") {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const tr = r + dr, tc = c + dc;
        if (!inBounds(tr, tc)) continue;
        const occ = board[tr][tc];
        if (!occ) moves.push({ r: tr, c: tc, capture: false });
        else if (occ.color !== color) moves.push({ r: tr, c: tc, capture: true });
      }
    }
  } else {
    const dirs = [];
    if (type === "b" || type === "q") dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    if (type === "r" || type === "q") dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    for (const [dr, dc] of dirs) {
      let tr = r + dr, tc = c + dc;
      while (inBounds(tr, tc)) {
        const occ = board[tr][tc];
        if (!occ) {
          moves.push({ r: tr, c: tc, capture: false });
        } else {
          if (occ.color !== color) moves.push({ r: tr, c: tc, capture: true });
          break;
        }
        tr += dr;
        tc += dc;
      }
    }
  }
  return moves;
}

function getSquareSize() {
  return boardEl.clientWidth / 8;
}

function placeEl(el, r, c) {
  const sq = getSquareSize();
  el.style.left = (c + 0.5) * sq + "px";
  el.style.top = (r + 0.5) * sq + "px";
}

function buildSquares() {
  squaresEl.innerHTML = "";
  squareEls.length = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement("div");
      sq.className = "square " + ((r + c) % 2 === 0 ? "light" : "dark");
      sq.dataset.r = r;
      sq.dataset.c = c;
      squaresEl.appendChild(sq);
      squareEls.push(sq);
    }
  }
}

function squareEl(r, c) {
  return squareEls[r * 8 + c];
}

function createBlobDom(piece) {
  const sq = getSquareSize();
  const blob = document.createElement("div");
  blob.className = "blob " + (piece.color === "w" ? "white" : "black");
  blob.style.animationDelay = (-Math.random() * 3.2).toFixed(2) + "s";

  const scale = SIZE_SCALE[piece.type];
  const mainR = sq * 0.34 * scale;
  const dots = [{ dx: 0, dy: 0, r: mainR }];
  const satCount = SAT_COUNT[piece.type];
  for (let i = 0; i < satCount; i++) {
    const angle = (i / satCount) * Math.PI * 2 + Math.random() * 0.6;
    const dist = mainR * 0.55;
    dots.push({ dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, r: mainR * 0.48 });
  }
  for (const d of dots) {
    const dot = document.createElement("div");
    dot.className = "blob-dot";
    dot.style.width = dot.style.height = d.r * 2 + "px";
    dot.style.left = d.dx + "px";
    dot.style.top = d.dy + "px";
    dot.style.setProperty("--wx", (2 + Math.random() * 3.5).toFixed(1) + "px");
    dot.style.setProperty("--wy", (2 + Math.random() * 3.5).toFixed(1) + "px");
    dot.style.animationDelay = (-Math.random() * 2.6).toFixed(2) + "s";
    dot.style.animationDuration = (2.2 + Math.random() * 1.2).toFixed(2) + "s";
    blob.appendChild(dot);
  }
  placeEl(blob, piece.r, piece.c);
  return blob;
}

function createGlyphDom(piece) {
  const g = document.createElement("div");
  g.className = "glyph " + (piece.color === "w" ? "white" : "black");
  g.textContent = PIECE_GLYPH[piece.type];
  placeEl(g, piece.r, piece.c);
  return g;
}

function buildAllPieceDom() {
  liquidLayer.innerHTML = "";
  glyphLayer.innerHTML = "";
  pieceDom.clear();
  for (const piece of pieces) {
    const blob = createBlobDom(piece);
    const glyph = createGlyphDom(piece);
    liquidLayer.appendChild(blob);
    glyphLayer.appendChild(glyph);
    pieceDom.set(piece.id, { blob, glyph });
  }
}

function positionPieceDom(piece) {
  const dom = pieceDom.get(piece.id);
  if (!dom) return;
  placeEl(dom.blob, piece.r, piece.c);
  placeEl(dom.glyph, piece.r, piece.c);
}

function rebuildBlobFor(piece) {
  const dom = pieceDom.get(piece.id);
  if (!dom) return;
  const newBlob = createBlobDom(piece);
  newBlob.classList.add("boiling");
  liquidLayer.replaceChild(newBlob, dom.blob);
  dom.blob = newBlob;
  dom.glyph.textContent = PIECE_GLYPH[piece.type];
  setTimeout(() => newBlob.classList.remove("boiling"), 720);
}

function removePieceDom(piece) {
  const dom = pieceDom.get(piece.id);
  if (!dom) return;
  dom.blob.classList.add("dissolving");
  dom.glyph.classList.add("fading");
  setTimeout(() => {
    dom.blob.remove();
    dom.glyph.remove();
    pieceDom.delete(piece.id);
  }, 600);
}

function clearHighlights() {
  for (const el of squareEls) {
    el.classList.remove("selected", "legal", "legal-capture", "last-from", "last-to");
  }
}

function applyHighlights() {
  clearHighlights();
  if (lastMove) {
    squareEl(lastMove.fr, lastMove.fc).classList.add("last-from");
    squareEl(lastMove.tr, lastMove.tc).classList.add("last-to");
  }
  if (selected) {
    squareEl(selected.r, selected.c).classList.add("selected");
    for (const m of legalTargets) {
      squareEl(m.r, m.c).classList.add(m.capture ? "legal-capture" : "legal");
    }
  }
}

function colorName(color) {
  return color === "w" ? "white" : "black";
}

function updateTurnUi() {
  if (gameOver) return;
  turnDot.className = "turn-dot " + turn;
  turnText.textContent = colorName(turn) + (turn === "w" ? "'s puddle to flow" : "'s puddle to flow");
}

function updateTray() {
  trayW.innerHTML = "";
  trayB.innerHTML = "";
  for (const cap of captured) {
    const dot = document.createElement("span");
    dot.className = "tray-dot " + cap.color;
    dot.title = colorName(cap.color) + " " + PIECE_NAME[cap.type];
    (cap.color === "w" ? trayW : trayB).appendChild(dot);
  }
}

function onSquareClick(r, c) {
  if (gameOver) return;
  const occ = board[r][c];

  if (selected) {
    const target = legalTargets.find((m) => m.r === r && m.c === c);
    if (target) {
      const piece = board[selected.r][selected.c];
      doMove(piece, r, c);
      selected = null;
      legalTargets = [];
      applyHighlights();
      return;
    }
    if (occ && occ.color === turn) {
      selectPiece(r, c);
      return;
    }
    selected = null;
    legalTargets = [];
    applyHighlights();
    return;
  }

  if (occ && occ.color === turn) {
    selectPiece(r, c);
  }
}

function selectPiece(r, c) {
  selected = { r, c };
  legalTargets = genMoves(board[r][c]);
  applyHighlights();
  statusLine.textContent =
    legalTargets.length === 0
      ? "that droplet has nowhere to flow."
      : "tap a highlighted square to send it there.";
}

function doMove(piece, tr, tc) {
  const capturedPiece = board[tr][tc];
  const fr = piece.r,
    fc = piece.c;

  if (capturedPiece) {
    captured.push({ color: capturedPiece.color, type: capturedPiece.type });
    pieces = pieces.filter((p) => p !== capturedPiece);
    board[tr][tc] = null;
    removePieceDom(capturedPiece);
    updateTray();
  }

  board[fr][fc] = null;
  piece.r = tr;
  piece.c = tc;
  board[tr][tc] = piece;
  positionPieceDom(piece);

  lastMove = { fr, fc, tr, tc };
  moveCount++;

  let promoted = false;
  if (piece.type === "p" && (tr === 0 || tr === 7)) {
    piece.type = "q";
    promoted = true;
    setTimeout(() => rebuildBlobFor(piece), 480);
  }

  if (capturedPiece && capturedPiece.type === "k") {
    winner = piece.color;
    gameOver = true;
    setTimeout(() => showWinner(), 550);
    statusLine.textContent = colorName(piece.color) + "'s king-dissolving move ends the game.";
    return;
  }

  turn = turn === "w" ? "b" : "w";
  updateTurnUi();
  statusLine.textContent = promoted
    ? "a pawn boiled off and condensed back down as a queen."
    : capturedPiece
      ? colorName(capturedPiece.color) + "'s " + PIECE_NAME[capturedPiece.type] + " dissolved."
      : "tap a droplet to see where it can flow.";
}

function showWinner() {
  winnerTitle.textContent = colorName(winner) + "'s puddle wins";
  winnerSub.textContent =
    "the " + colorName(winner === "w" ? "b" : "w") + " king dissolved after " + moveCount + " moves.";
  winnerOverlay.classList.add("show");
  const text =
    colorName(winner) +
    "'s liquid just swallowed the board in liquid chess — " +
    moveCount +
    " moves, the king dissolved. play it yourself: " +
    SHARE_URL;
  shareResultBtn.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

function resetGame() {
  const built = newBoard();
  board = built.b;
  pieces = built.list;
  turn = "w";
  selected = null;
  legalTargets = [];
  moveCount = 0;
  gameOver = false;
  winner = null;
  captured = [];
  lastMove = null;
  buildAllPieceDom();
  clearHighlights();
  updateTurnUi();
  updateTray();
  winnerOverlay.classList.remove("show");
  statusLine.textContent = "tap a droplet to see where it can flow.";
}

squaresEl.addEventListener("click", (e) => {
  const sq = e.target.closest(".square");
  if (!sq) return;
  onSquareClick(parseInt(sq.dataset.r, 10), parseInt(sq.dataset.c, 10));
});

resetBtn.addEventListener("click", resetGame);
playAgainBtn.addEventListener("click", resetGame);

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    buildAllPieceDom();
    applyHighlights();
  }, 120);
});

buildSquares();
resetGame();
