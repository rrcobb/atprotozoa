import {
  POINTS, ROWS, HOME, initialState, other, legalMoves, applyMove,
  occupiesAllHome, solve,
} from "./engine.js";

const svg = document.getElementById("board");
const statusEl = document.getElementById("status");
const solveNoteEl = document.getElementById("solveNote");
const overlayEl = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayBody = document.getElementById("overlayBody");
const pickBlueBtn = document.getElementById("pickBlue");
const pickRedBtn = document.getElementById("pickRed");
const newGameBtn = document.getElementById("newGame");
const playAgainBtn = document.getElementById("playAgain");
const shareBlueskyLink = document.getElementById("shareBluesky");

// One solve cache for the life of the page — solving is a pure function of
// (state, player), so once a position has been explored once (which happens
// automatically while solving any earlier position that leads to it), it's
// instant forever after, across every game played in this tab.
const cache = new Map();
let warm = false;

let state = initialState();
let humanColor = "blue";
let selected = null;
let gameOver = false;

function pointRadius() { return 6; }

function edgePath(row) {
  return row.map((p) => `${POINTS[p].x},${POINTS[p].y}`).join(" ");
}

function homeGlowRect(color) {
  const pts = HOME[color].map((p) => POINTS[p]);
  const pad = 26;
  const minX = Math.min(...pts.map((p) => p.x)) - pad;
  const maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad;
  const maxY = Math.max(...pts.map((p) => p.y)) + pad;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function whoOwns(point) {
  if (state.blue.has(point)) return "blue";
  if (state.red.has(point)) return "red";
  return null;
}

function render() {
  const humanCanAct = !gameOver && state.turn === humanColor;
  const destinations = selected
    ? legalMoves(state, humanColor).filter((m) => m.from === selected).map((m) => m.to)
    : [];

  let s = "";

  // home glows + labels
  const bg = homeGlowRect("blue"), rg = homeGlowRect("red");
  s += `<rect class="home-glow-blue" x="${bg.x}" y="${bg.y}" width="${bg.w}" height="${bg.h}" rx="26"/>`;
  s += `<rect class="home-glow-red" x="${rg.x}" y="${rg.y}" width="${rg.w}" height="${rg.h}" rx="26"/>`;
  s += `<text class="home-label" x="${bg.x + bg.w / 2}" y="${bg.y - 8}" text-anchor="middle">BLUE HOME</text>`;
  s += `<text class="home-label" x="${rg.x + rg.w / 2}" y="${rg.y - 8}" text-anchor="middle">RED HOME</text>`;

  // edges
  for (const row of ROWS) s += `<polyline class="edge" points="${edgePath(row)}"/>`;

  // empty points (skip ones with a piece, drawn separately below)
  for (const [id, p] of Object.entries(POINTS)) {
    if (whoOwns(id)) continue;
    const isDest = destinations.includes(id);
    if (isDest) {
      s += `<circle class="dest-ring" data-point="${id}" cx="${p.x}" cy="${p.y}" r="12"/>`;
    } else {
      s += `<circle class="pt" cx="${p.x}" cy="${p.y}" r="${pointRadius()}"/>`;
    }
  }

  // pieces
  for (const [id, p] of Object.entries(POINTS)) {
    const owner = whoOwns(id);
    if (!owner) continue;
    const clickable = humanCanAct && owner === humanColor;
    s += `<circle class="piece ${owner} ${clickable ? "" : "disabled"}" data-point="${id}"
            cx="${p.x}" cy="${p.y}" r="11"/>`;
    if (id === selected) {
      s += `<circle class="sel-ring" cx="${p.x}" cy="${p.y}" r="15.5"/>`;
    }
  }

  svg.innerHTML = s;
}

function updateStatus() {
  if (gameOver) return;
  if (!warm) {
    statusEl.innerHTML = `warming up the bot's solver&hellip;`;
    return;
  }
  if (state.turn === humanColor) {
    statusEl.innerHTML = `your turn — <span class="${humanColor}-ink">${humanColor}</span>`;
  } else {
    statusEl.innerHTML = `bot is thinking&hellip; (<span class="${state.turn}-ink">${state.turn}</span>)`;
  }
}

function buildShareText(winner) {
  const youWon = winner === humanColor;
  let text;
  if (youWon && humanColor === "blue") {
    text = "I just beat a bot that had fully solved Change! — playing blue, the side our solver says is a forced loss with perfect play. ";
  } else if (youWon) {
    text = "I just beat a bot that had fully solved Change! (the 14-point GamesCrafters board game) before it made a single move. ";
  } else {
    text = "A bot that had already solved the entire game of Change! just beat me. ";
  }
  text += "play at https://change.bisks.net/";
  return text;
}

function showOverlay(winner, reason) {
  const youWon = winner === humanColor;
  overlayTitle.textContent = youWon ? "you win!" : "bot wins";
  overlayTitle.className = youWon ? "win" : "lose";
  const who = youWon ? "you" : winner === "blue" ? "the bot (blue)" : "the bot (red)";
  overlayBody.textContent = reason === "home"
    ? `${who} occupied all three of the opponent's home points.`
    : `${who} left the other side with no legal move.`;
  shareBlueskyLink.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText(winner));
  overlayEl.classList.add("show");
}

function hideOverlay() {
  overlayEl.classList.remove("show");
}

function makeMove(mover, move) {
  state = applyMove(state, mover, move);
  selected = null;

  if (occupiesAllHome(state, mover)) {
    gameOver = true;
    render();
    showOverlay(mover, "home");
    return;
  }
  const opp = other(mover);
  if (legalMoves(state, opp).length === 0) {
    gameOver = true;
    render();
    showOverlay(mover, "trapped");
    return;
  }

  render();
  updateStatus();
  if (state.turn !== humanColor) scheduleBotMove();
}

function scheduleBotMove() {
  statusEl.innerHTML = `bot is thinking&hellip; (<span class="${state.turn}-ink">${state.turn}</span>)`;
  setTimeout(() => {
    const bot = state.turn;
    const result = solve(state, bot, cache);
    if (result.move) makeMove(bot, result.move);
  }, 420);
}

function newGame() {
  state = initialState();
  selected = null;
  gameOver = false;
  hideOverlay();
  render();
  updateStatus();
  pickBlueBtn.classList.toggle("primary", humanColor === "blue");
  pickRedBtn.classList.toggle("on-red", humanColor === "red");
  if (state.turn !== humanColor) scheduleBotMove();
}

svg.addEventListener("click", (e) => {
  if (gameOver || state.turn !== humanColor || !warm) return;
  const id = e.target?.dataset?.point;
  if (!id) { selected = null; render(); return; }

  if (selected) {
    const dests = legalMoves(state, humanColor).filter((m) => m.from === selected).map((m) => m.to);
    if (dests.includes(id)) {
      makeMove(humanColor, { from: selected, to: id });
      return;
    }
  }
  if (whoOwns(id) === humanColor) {
    selected = id;
  } else {
    selected = null;
  }
  render();
});

pickBlueBtn.addEventListener("click", () => { humanColor = "blue"; newGame(); });
pickRedBtn.addEventListener("click", () => { humanColor = "red"; newGame(); });
newGameBtn.addEventListener("click", newGame);
playAgainBtn.addEventListener("click", newGame);

render();
updateStatus();

// Solve the whole reachable game tree once, off the initial paint, so the
// very first bot move (and every move after, in every game this tab plays)
// is an instant cache hit.
setTimeout(() => {
  solve(initialState(), "blue", cache);
  warm = true;
  solveNoteEl.textContent = `bot solved ${cache.size.toLocaleString()} positions`;
  updateStatus();
  if (!gameOver && state.turn !== humanColor) scheduleBotMove();
}, 30);
