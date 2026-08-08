// nestedminds — a matryoshka doll of tic-tac-toe AIs. Each doll's move
// function is the previous doll's function plus exactly one more rule.
// Beat a doll, the next (slightly smarter) one is nested inside it.

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function getWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

function emptyCells(board) {
  const out = [];
  for (let i = 0; i < 9; i++) if (!board[i]) out.push(i);
  return out;
}

function winningMoves(board, player) {
  const out = [];
  for (const i of emptyCells(board)) {
    const b = board.slice();
    b[i] = player;
    if (getWinner(b) === player) out.push(i);
  }
  return out;
}

function forkMoves(board, player) {
  const out = [];
  for (const i of emptyCells(board)) {
    const b = board.slice();
    b[i] = player;
    if (winningMoves(b, player).length >= 2) out.push(i);
  }
  return out;
}

function pick(arr) {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}

const CORNERS = [0, 2, 6, 8];
const EDGES = [1, 3, 5, 7];

function centerCornerEdge(board) {
  if (!board[4]) return 4;
  const c = pick(CORNERS.filter((i) => !board[i]));
  if (c !== null) return c;
  return pick(EDGES.filter((i) => !board[i]));
}

// minimax — O maximizes, X minimizes. Board tiny, no pruning needed.
function minimaxScore(board, depth, isMax) {
  const w = getWinner(board);
  if (w === "O") return 10 - depth;
  if (w === "X") return depth - 10;
  if (emptyCells(board).length === 0) return 0;
  let best = isMax ? -Infinity : Infinity;
  for (const i of emptyCells(board)) {
    const b = board.slice();
    b[i] = isMax ? "O" : "X";
    const score = minimaxScore(b, depth + 1, !isMax);
    best = isMax ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

function bestMinimaxMove(board) {
  let bestScore = -Infinity;
  let move = null;
  for (const i of emptyCells(board)) {
    const b = board.slice();
    b[i] = "O";
    const score = minimaxScore(b, 0, false);
    if (score > bestScore) {
      bestScore = score;
      move = i;
    }
  }
  return move;
}

// Each level fn takes the board and returns O's move. Comment shows exactly
// what got added on top of the previous doll.
const LEVELS = [
  // doll 0 — no rules at all.
  (board) => pick(emptyCells(board)),

  // doll 1 — + take the win if it's sitting right there.
  (board) => winningMoves(board, "O")[0] ?? pick(emptyCells(board)),

  // doll 2 — + block your winning move.
  (board) =>
    winningMoves(board, "O")[0] ??
    winningMoves(board, "X")[0] ??
    pick(emptyCells(board)),

  // doll 3 — + hold the center, then a corner, before an edge.
  (board) =>
    winningMoves(board, "O")[0] ??
    winningMoves(board, "X")[0] ??
    centerCornerEdge(board),

  // doll 4 — + notice a one-move-away fork and block that square.
  (board) => {
    const win = winningMoves(board, "O")[0];
    if (win !== undefined) return win;
    const block = winningMoves(board, "X")[0];
    if (block !== undefined) return block;
    const oppForks = forkMoves(board, "X");
    if (oppForks.length === 1) return oppForks[0];
    return centerCornerEdge(board);
  },

  // doll 5 — + stop guessing, play the whole game out to the end.
  (board) => bestMinimaxMove(board),
];

const DOLLS = [
  { subtitle: "pure chaos", rule: "moves anywhere empty. no plan at all.", color: "#3a4a63", glow: 0 },
  { subtitle: "finishes what it starts", rule: "+ takes the win when one's sitting right there.", color: "#39586f", glow: 0 },
  { subtitle: "sees you coming", rule: "+ blocks your winning move.", color: "#2f6a7a", glow: 0 },
  { subtitle: "holds the middle", rule: "+ grabs the center, then a corner, before wasting a move on an edge.", color: "#1f7a86", glow: 1 },
  { subtitle: "smells a trap", rule: "+ notices when you're one move from forking it, and blocks that square.", color: "#14948f", glow: 1 },
  { subtitle: "perfect", rule: "+ stops guessing and plays the whole game out to the end. best you can do now is draw.", color: "#0dd8bd", glow: 2 },
];

const DOTS = [
  [70, 118], [130, 118], [60, 145], [140, 145], [72, 205], [128, 205],
];

function dollSvg(depth, { small = false } = {}) {
  const d = DOLLS[depth];
  const dots = DOTS.slice(0, depth)
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#ffffff" opacity="0.55"/>`)
    .join("");
  const glowFilter = d.glow ? `filter="url(#glow${depth})"` : "";
  const defs = d.glow
    ? `<defs><filter id="glow${depth}" x="-40%" y="-40%" width="180%" height="180%">
         <feGaussianBlur stdDeviation="${d.glow === 2 ? 6 : 3.5}" result="b"/>
         <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
       </filter></defs>`
    : "";
  return `<svg viewBox="0 0 200 260" class="${small ? "doll-mini" : "doll-main"}" role="img" aria-label="doll ${depth}, ${d.subtitle}">
    ${defs}
    <path ${glowFilter} d="M100,20 C60,20 42,55 46,95 C28,108 18,140 18,182 C18,228 55,252 100,252 C145,252 182,228 182,182 C182,140 172,108 154,95 C158,55 140,20 100,20 Z" fill="${d.color}" stroke="#00000030" stroke-width="2"/>
    <path d="M46,95 C70,110 130,110 154,95" fill="none" stroke="#ffffff2e" stroke-width="6" stroke-linecap="round"/>
    <circle cx="80" cy="65" r="6" fill="#0c1420"/>
    <circle cx="120" cy="65" r="6" fill="#0c1420"/>
    <path d="M84,84 Q100,96 116,84" stroke="#0c1420" stroke-width="4" fill="none" stroke-linecap="round"/>
    ${dots}
    <circle cx="100" cy="178" r="27" fill="#ffffff22"/>
    <text x="100" y="187" text-anchor="middle" font-size="24" font-weight="700" fill="#fff" font-family="ui-monospace,monospace">${depth}</text>
  </svg>`;
}

// ---- game state ----

const STORAGE_KEY = "nestedminds:progress";
function loadProgress() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { maxDepth: v.maxDepth ?? 0 };
  } catch {
    return { maxDepth: 0 };
  }
}
function saveProgress(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

const state = {
  depth: 0,
  board: Array(9).fill(null),
  over: false,
  locked: false,
  progress: loadProgress(),
};

const els = {};

function $(id) {
  return document.getElementById(id);
}

function render() {
  const d = DOLLS[state.depth];
  els.dollSlot.innerHTML = dollSvg(state.depth);
  els.dollSlot.style.setProperty("--doll-color", d.color);
  els.dollTitle.textContent = `doll ${state.depth} — ${d.subtitle}`;

  els.ruleList.innerHTML = "";
  for (let i = 0; i <= state.depth; i++) {
    const li = document.createElement("li");
    li.textContent = DOLLS[i].rule;
    if (i === state.depth) li.className = "new";
    els.ruleList.appendChild(li);
  }

  els.cells.forEach((cell, i) => {
    cell.textContent = state.board[i] || "";
    cell.className = "cell" + (state.board[i] ? " filled " + state.board[i] : "");
    cell.disabled = !!state.board[i] || state.over || state.locked;
  });

  els.breadcrumb.querySelectorAll(".mini-btn").forEach((btn, i) => {
    btn.classList.toggle("current", i === state.depth);
    btn.disabled = i > state.progress.maxDepth;
    btn.classList.toggle("locked", i > state.progress.maxDepth);
  });

  els.deepest.textContent = state.progress.maxDepth;
}

function setStatus(text, tone) {
  els.status.textContent = text;
  els.status.className = "status" + (tone ? " " + tone : "");
}

function resetBoard() {
  state.board = Array(9).fill(null);
  state.over = false;
  state.locked = false;
  els.nextBtn.hidden = true;
  els.retryBtn.hidden = true;
  setStatus("your move — you're X.", "");
  render();
}

function startDepth(depth) {
  state.depth = depth;
  resetBoard();
}

function checkEnd() {
  const w = getWinner(state.board);
  if (w) {
    state.over = true;
    if (w === "X") {
      handleResult("win");
    } else {
      handleResult("lose");
    }
    return true;
  }
  if (emptyCells(state.board).length === 0) {
    state.over = true;
    handleResult("draw");
    return true;
  }
  return false;
}

function handleResult(kind) {
  const isFinal = state.depth === DOLLS.length - 1;
  els.retryBtn.hidden = false;
  els.nextBtn.hidden = true;

  if (kind === "win") {
    if (isFinal) {
      // shouldn't happen against perfect play, but handle gracefully
      setStatus("you beat the perfect doll?! that shouldn't be possible — but it's yours.", "good");
      finishGame();
    } else {
      setStatus(`cracked doll ${state.depth} open — there's a sharper one inside.`, "good");
      if (state.depth >= state.progress.maxDepth) {
        state.progress.maxDepth = Math.min(state.depth + 1, DOLLS.length - 1);
        saveProgress(state.progress);
        updateShareLink();
      }
      els.nextBtn.hidden = false;
    }
  } else if (kind === "lose") {
    setStatus(`doll ${state.depth} got you. try again?`, "bad");
  } else {
    if (isFinal) {
      setStatus("a draw against doll 5 — that's the ceiling. nothing smarter is nested inside.", "good");
      finishGame();
    } else {
      setStatus(`played it to a draw — doll ${state.depth} is still beatable. try again?`, "");
    }
  }
  render();
}

function finishGame() {
  els.completion.hidden = false;
  buildShareCard();
}

function aiMove() {
  state.locked = true;
  render();
  setTimeout(() => {
    const move = LEVELS[state.depth](state.board);
    if (move !== null && move !== undefined) {
      state.board[move] = "O";
    }
    state.locked = false;
    if (!checkEnd()) {
      setStatus("your move.", "");
    }
    render();
  }, 380);
}

function onCellClick(i) {
  if (state.board[i] || state.over || state.locked) return;
  state.board[i] = "X";
  if (!checkEnd()) {
    setStatus("doll is thinking...", "");
    render();
    aiMove();
  } else {
    render();
  }
}

function buildShareCard() {
  const canvas = els.shareCanvas;
  const ctx = canvas.getContext("2d");
  const W = 1200, H = 630;
  canvas.width = W;
  canvas.height = H;

  const bg = "#0b1220";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const grad = ctx.createRadialGradient(200, 100, 50, 200, 100, 700);
  grad.addColorStop(0, "#123634");
  grad.addColorStop(1, bg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#35e0c0";
  ctx.font = "800 56px ui-monospace, monospace";
  ctx.fillText("nestedminds", 64, 120);

  ctx.fillStyle = "#eaf2ff";
  ctx.font = "600 30px ui-monospace, monospace";
  ctx.fillText(`reached doll ${state.progress.maxDepth} of ${DOLLS.length - 1}`, 64, 180);

  ctx.fillStyle = "#7f93b8";
  ctx.font = "20px ui-monospace, monospace";
  const sub = DOLLS[state.progress.maxDepth].subtitle;
  ctx.fillText(`"${sub}"`, 64, 220);

  // rule ladder
  let y = 280;
  for (let i = 0; i <= state.progress.maxDepth && i < 5; i++) {
    ctx.fillStyle = i === state.progress.maxDepth ? "#ffb84d" : "#4a5c7a";
    ctx.font = "18px ui-monospace, monospace";
    const text = `doll ${i}: ${DOLLS[i].subtitle}`;
    ctx.fillText(text.length > 46 ? text.slice(0, 46) + "…" : text, 64, y);
    y += 34;
  }

  ctx.fillStyle = "#35e0c0";
  ctx.font = "700 24px ui-monospace, monospace";
  ctx.fillText("nestedminds.bisks.net", 64, 560);

  // doll art on the right
  const cx = 950, cy = 340, s = 3.2;
  const d = DOLLS[state.progress.maxDepth];
  ctx.save();
  ctx.translate(cx - 100 * s, cy - 130 * s);
  ctx.scale(s, s);
  roundDollPath(ctx);
  ctx.fillStyle = d.color;
  ctx.fill();
  ctx.fillStyle = "#ffffff22";
  ctx.beginPath();
  ctx.arc(100, 178, 27, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "700 26px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(String(state.progress.maxDepth), 100, 188);
  ctx.textAlign = "left";
  ctx.restore();
}

function roundDollPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(100, 20);
  ctx.bezierCurveTo(60, 20, 42, 55, 46, 95);
  ctx.bezierCurveTo(28, 108, 18, 140, 18, 182);
  ctx.bezierCurveTo(18, 228, 55, 252, 100, 252);
  ctx.bezierCurveTo(145, 252, 182, 228, 182, 182);
  ctx.bezierCurveTo(182, 140, 172, 108, 154, 95);
  ctx.bezierCurveTo(158, 55, 140, 20, 100, 20);
  ctx.closePath();
}

function buildShareText() {
  const d = state.progress.maxDepth;
  const sub = DOLLS[d].subtitle;
  if (d === DOLLS.length - 1) {
    return `I drew doll 5 in nestedminds — perfect play, that's the ceiling. one rule at a time, tic-tac-toe went from pure chaos to unbeatable. open the dolls yourself: https://nestedminds.bisks.net/`;
  }
  return `I made it to doll ${d} in nestedminds ("${sub}") — a matryoshka doll where each one nested inside plays one rule smarter tic-tac-toe. https://nestedminds.bisks.net/`;
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

async function shareCard() {
  buildShareCard();
  const blob = await new Promise((res) => els.shareCanvas.toBlob(res, "image/png"));
  if (!blob) return;
  const text = buildShareText();
  if (canShareFiles()) {
    const file = new File([blob], "nestedminds.png", { type: "image/png" });
    try {
      await navigator.share({ files: [file], text, title: "nestedminds" });
      return;
    } catch {
      // fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nestedminds.png";
  a.click();
  URL.revokeObjectURL(url);
}

function init() {
  els.dollSlot = $("dollSlot");
  els.dollTitle = $("dollTitle");
  els.ruleList = $("ruleList");
  els.status = $("status");
  els.nextBtn = $("nextBtn");
  els.retryBtn = $("retryBtn");
  els.breadcrumb = $("breadcrumb");
  els.deepest = $("deepestStat");
  els.completion = $("completion");
  els.shareCanvas = $("shareCanvas");
  els.shareCardBtn = $("shareCardBtn");
  els.shareBluesky = $("shareBluesky");
  els.cells = Array.from(document.querySelectorAll(".cell"));

  els.breadcrumb.innerHTML = DOLLS.map(
    (_, i) => `<button class="mini-btn" data-depth="${i}" title="doll ${i}">${dollSvg(i, { small: true })}</button>`
  ).join("");
  els.breadcrumb.querySelectorAll(".mini-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const depth = Number(btn.dataset.depth);
      if (depth <= state.progress.maxDepth) {
        els.completion.hidden = true;
        startDepth(depth);
      }
    });
  });

  els.cells.forEach((cell, i) => cell.addEventListener("click", () => onCellClick(i)));
  els.nextBtn.addEventListener("click", () => {
    els.completion.hidden = true;
    startDepth(Math.min(state.depth + 1, DOLLS.length - 1));
  });
  els.retryBtn.addEventListener("click", () => {
    els.completion.hidden = true;
    startDepth(state.depth);
  });
  els.shareCardBtn.addEventListener("click", shareCard);

  updateShareLink();
  startDepth(0);
}

function updateShareLink() {
  els.shareBluesky.href =
    "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText());
}

document.addEventListener("DOMContentLoaded", init);
