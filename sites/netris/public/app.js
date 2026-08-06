// netris client — landing form resolves a handle's moots (lib/cluster.js,
// public AppView, no auth) and hands the room off to a WebSocket-backed
// Durable Object (see src/index.ts's Match class) for live presence and
// battle relay. The Tetris engine itself — board, gravity, rotation, lock
// delay, hold, line clears — runs entirely client-side; the only thing the
// server does is broadcast a shared piece-bag seed at match start (so every
// board deals the identical sequence) and relay attack garbage between
// players.
//
// Honest scope note: rotation uses a small fixed wall-kick offset list, not
// the full per-state SRS kick tables, and garbage has no combo/back-to-back/
// T-spin bonus. Plays like Tetris, isn't tournament-accurate Tetris — fine
// for a "battle your moots" toy.

import { resolveDid, moots, getProfiles } from "./lib/cluster.js";

const LS_ME = "netris:me";

const els = {
  landing: document.getElementById("landing"),
  room: document.getElementById("room"),
  startForm: document.getElementById("start-form"),
  handleInput: document.getElementById("handle-input"),
  landingStatus: document.getElementById("landing-status"),
  roomOwnerName: document.getElementById("room-owner-name"),
  roomKind: document.getElementById("room-kind"),
  roomStatus: document.getElementById("room-status"),
  meName: document.getElementById("me-name"),
  meEdit: document.getElementById("me-edit"),
  shareBtn: document.getElementById("share-btn"),
  copyBtn: document.getElementById("copy-btn"),
  boardCanvas: document.getElementById("board-canvas"),
  holdCanvas: document.getElementById("hold-canvas"),
  nextCanvas: document.getElementById("next-canvas"),
  garbageMeter: document.getElementById("garbage-meter"),
  countdown: document.getElementById("countdown"),
  boardOverlay: document.getElementById("board-overlay"),
  statScore: document.getElementById("stat-score"),
  statLines: document.getElementById("stat-lines"),
  statSent: document.getElementById("stat-sent"),
  startMatchBtn: document.getElementById("start-match-btn"),
  matchStatusLine: document.getElementById("match-status-line"),
  opponentsList: document.getElementById("opponents-list"),
  recordLine: document.getElementById("record-line"),
  historyList: document.getElementById("history-list"),
  resultsPanel: document.getElementById("results-panel"),
  resultsList: document.getElementById("results-list"),
  rosterList: document.getElementById("roster-list"),
  cheerFlyLayer: document.getElementById("cheer-fly-layer"),
};

const boardCtx = els.boardCanvas.getContext("2d");
const holdCtx = els.holdCanvas.getContext("2d");
const nextCtx = els.nextCanvas.getContext("2d");

// ---------------------------------------------------------------------
// Tetris engine
// ---------------------------------------------------------------------

const COLS = 10;
const ROWS = 20;
const BLOCK = 30; // board canvas is 300x600
const SPAWN_ROW = -2;

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
const COLORS = {
  I: "#4fd6f2", O: "#f2d94c", T: "#bb86fc", S: "#6fcf97",
  Z: "#eb5757", J: "#5b8def", L: "#ff9b3d", G: "#5c6478",
};
const BAG = ["I", "O", "T", "S", "Z", "J", "L"];

function rotateMatrixCW(m) {
  const n = m.length;
  const res = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) res[c][n - 1 - r] = m[r][c];
  return res;
}

const ROTATIONS = {};
for (const key of Object.keys(SHAPES)) {
  if (key === "O") {
    ROTATIONS[key] = [SHAPES.O, SHAPES.O, SHAPES.O, SHAPES.O];
    continue;
  }
  const states = [SHAPES[key]];
  let cur = SHAPES[key];
  for (let i = 0; i < 3; i++) {
    cur = rotateMatrixCW(cur);
    states.push(cur);
  }
  ROTATIONS[key] = states;
}

function cellsOf(type, rot) {
  const m = ROTATIONS[type][((rot % 4) + 4) % 4];
  const out = [];
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (m[r][c]) out.push([r, c]);
    }
  }
  return out;
}

// Deterministic PRNG (mulberry32) — every client seeds this from the same
// server-issued match seed, so the 7-bag sequence is bit-identical across
// every board in the room. That's the whole "fair" trick.
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBagGenerator(seed) {
  const rng = mulberry32(seed >>> 0);
  let bag = [];
  return function next() {
    if (bag.length === 0) {
      bag = BAG.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  };
}

const DAS_MS = 140;
const ARR_MS = 35;
const LOCK_DELAY_MS = 500;
const MAX_LOCK_RESETS = 15;
const SOFT_DROP_MS = 35;
const SCORE_TABLE = [0, 100, 300, 500, 800];

function emptyBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
}

function gravityForElapsed(ms) {
  const step = Math.floor(ms / 20000);
  return Math.max(100, 800 - step * 60);
}

function newGame(seed) {
  return {
    board: emptyBoard(),
    bagNext: makeBagGenerator(seed),
    queue: [],
    hold: null,
    holdUsed: false,
    piece: null,
    lockTimer: 0,
    lockResets: 0,
    grounded: false,
    fallAcc: 0,
    softDrop: false,
    input: { left: false, right: false },
    dasTimer: { left: 0, right: 0 },
    started: false,
    over: false,
    score: 0,
    lines: 0,
    sent: 0,
    garbagePending: 0,
    rafId: null,
    lastTs: 0,
  };
}

function ensureQueue(g, n) {
  while (g.queue.length < n) g.queue.push(g.bagNext());
}

function spawnSizeFor(type) {
  return type === "I" ? 4 : type === "O" ? 2 : 3;
}

function collides(g, type, rot, row, col) {
  for (const [dr, dc] of cellsOf(type, rot)) {
    const r = row + dr;
    const c = col + dc;
    if (c < 0 || c >= COLS) return true;
    if (r >= ROWS) return true;
    if (r >= 0 && g.board[r][c]) return true;
  }
  return false;
}

function spawnPiece(g) {
  ensureQueue(g, 4);
  const type = g.queue.shift();
  ensureQueue(g, 4);
  const size = spawnSizeFor(type);
  const col = Math.floor((COLS - size) / 2);
  const piece = { type, rot: 0, row: SPAWN_ROW, col };
  g.holdUsed = false;
  g.lockResets = 0;
  g.lockTimer = 0;
  g.fallAcc = 0;
  if (collides(g, piece.type, piece.rot, piece.row, piece.col)) {
    g.piece = piece;
    g.over = true;
    return;
  }
  g.piece = piece;
  g.grounded = collides(g, piece.type, piece.rot, piece.row + 1, piece.col);
}

function tryMove(g, dr, dc) {
  if (!g.piece || g.over) return false;
  const p = g.piece;
  if (collides(g, p.type, p.rot, p.row + dr, p.col + dc)) return false;
  p.row += dr;
  p.col += dc;
  const nowGrounded = collides(g, p.type, p.rot, p.row + 1, p.col);
  if (dr !== 0 || dc !== 0) noteAction(g, nowGrounded);
  g.grounded = nowGrounded;
  return true;
}

const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]];

function tryRotate(g, dir) {
  if (!g.piece || g.over) return false;
  const p = g.piece;
  if (p.type === "O") return false;
  const nextRot = p.rot + dir;
  for (const [dc, dr] of KICKS) {
    if (!collides(g, p.type, nextRot, p.row + dr, p.col + dc)) {
      p.rot = nextRot;
      p.row += dr;
      p.col += dc;
      const nowGrounded = collides(g, p.type, p.rot, p.row + 1, p.col);
      noteAction(g, nowGrounded);
      g.grounded = nowGrounded;
      return true;
    }
  }
  return false;
}

// A successful move/rotate while grounded refreshes the lock timer (capped
// so a piece can't float forever by spamming inputs).
function noteAction(g, grounded) {
  if (grounded && g.lockResets < MAX_LOCK_RESETS) {
    g.lockTimer = 0;
    g.lockResets++;
  }
}

function ghostRow(g) {
  const p = g.piece;
  let r = p.row;
  while (!collides(g, p.type, p.rot, r + 1, p.col)) r++;
  return r;
}

function hardDrop(g) {
  if (!g.piece || g.over) return;
  g.piece.row = ghostRow(g);
  lockPiece(g);
}

function holdPiece(g) {
  if (!g.piece || g.over || g.holdUsed) return;
  g.holdUsed = true;
  const cur = g.piece.type;
  if (g.hold == null) {
    g.hold = cur;
    spawnPiece(g);
    g.holdUsed = true;
  } else {
    const swap = g.hold;
    g.hold = cur;
    const size = spawnSizeFor(swap);
    const col = Math.floor((COLS - size) / 2);
    const piece = { type: swap, rot: 0, row: SPAWN_ROW, col };
    if (collides(g, piece.type, piece.rot, piece.row, piece.col)) {
      g.piece = piece;
      g.over = true;
      return;
    }
    g.piece = piece;
    g.lockResets = 0;
    g.lockTimer = 0;
    g.fallAcc = 0;
    g.grounded = collides(g, piece.type, piece.rot, piece.row + 1, piece.col);
  }
}

// Returns cleared-line count. Called right after a piece merges into the
// board grid.
function clearLines(g) {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (g.board[r].every((c) => c)) {
      g.board.splice(r, 1);
      g.board.unshift(new Array(COLS).fill(null));
      cleared++;
      r++; // re-check same index after the shift
    }
  }
  return cleared;
}

// Shifts the stack up and fills the bottom `n` rows with garbage (one open
// gap column per batch). If any row being pushed off the top already had
// blocks in it, the stack was already at the ceiling — that's a topout, not
// a silent delete.
function applyGarbage(g, n) {
  if (n <= 0) return true;
  for (let r = 0; r < n; r++) {
    if (g.board[r].some((c) => c)) return false;
  }
  const gapCol = Math.floor(Math.random() * COLS);
  g.board.splice(0, n);
  for (let i = 0; i < n; i++) {
    const row = new Array(COLS).fill("G");
    row[gapCol] = null;
    g.board.push(row);
  }
  return true;
}

function lockPiece(g) {
  const p = g.piece;
  let offTop = false;
  for (const [dr, dc] of cellsOf(p.type, p.rot)) {
    const r = p.row + dr;
    const c = p.col + dc;
    if (r < 0) {
      offTop = true;
      continue;
    }
    g.board[r][c] = p.type;
  }
  if (offTop) {
    g.over = true;
    return;
  }
  const cleared = clearLines(g);
  if (cleared > 0) {
    g.lines += cleared;
    g.score += SCORE_TABLE[cleared];
    sendMsg({ t: "lines", n: cleared });
  }
  if (g.garbagePending > 0) {
    const ok = applyGarbage(g, g.garbagePending);
    g.garbagePending = 0;
    if (!ok) {
      g.over = true;
      return;
    }
  }
  sendBoardSnapshot(g);
  spawnPiece(g);
}

// ---------------------------------------------------------------------
// room / networking state
// ---------------------------------------------------------------------

const room = {
  handle: "",
  owner: null,
  pool: [],
  kind: "",
  bestScore: null,
  bestBy: "",
  history: [],
  presence: [],
  myId: null,
  mySeat: null,
  ws: null,
  match: { state: "lobby", startedAt: 0, seed: 0, players: [] },
};

let game = null;
let countdownTimer = null;
const opponentCanvases = new Map(); // seat -> {canvas, ctx, card, nameEl, scoreEl}

function cleanHandle(raw) {
  return (raw || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split(/[\/\s]/)[0]
    .toLowerCase();
}

function setStatus(el, text, isError) {
  el.textContent = text || "";
  el.classList.toggle("error", !!isError);
}

// ---- routing ----

function route() {
  const m = location.pathname.match(/^\/n\/([^/]+)\/?$/);
  if (m) {
    startRoom(decodeURIComponent(m[1]));
  } else {
    els.landing.hidden = false;
    els.room.hidden = true;
  }
}

els.startForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const handle = cleanHandle(els.handleInput.value);
  if (!handle) return;
  localStorage.setItem(LS_ME, handle);
  history.pushState({}, "", `/n/${encodeURIComponent(handle)}`);
  route();
});

window.addEventListener("popstate", route);

// ---- room boot ----

async function startRoom(handle) {
  room.handle = handle;
  els.landing.hidden = true;
  els.room.hidden = false;
  els.roomOwnerName.textContent = handle;
  setStatus(els.roomStatus, "opening the room…");
  els.rosterList.innerHTML = "";
  els.historyList.innerHTML = "";
  els.opponentsList.innerHTML = "";
  opponentCanvases.clear();

  let snap;
  try {
    const res = await fetch(`/api/netris/${encodeURIComponent(handle)}`);
    snap = await res.json();
  } catch {
    setStatus(els.roomStatus, "couldn't reach the room. try again?", true);
    return;
  }

  if (!snap.exists) {
    try {
      setStatus(els.roomStatus, `resolving @${handle}…`);
      const result = await moots(handle, {
        onStep: (s) => setStatus(els.roomStatus, s),
      });
      setStatus(els.roomStatus, "opening the room…");
      const seedRes = await fetch(`/api/netris/${encodeURIComponent(handle)}/seed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: result.self, pool: result.pool, kind: result.kind }),
      });
      snap = await seedRes.json();
    } catch (err) {
      setStatus(els.roomStatus, `couldn't find @${handle} — ${err.message || "check the handle"}`, true);
      return;
    }
  }

  applySnapshot(snap);
  els.roomOwnerName.textContent = room.owner.displayName || room.owner.handle;
  els.roomKind.textContent = room.pool.length
    ? `${room.pool.length} ${room.kind === "moots" ? "moots" : "players"} could join`
    : "playing solo (for now)";
  setStatus(els.roomStatus, "");

  renderRoster();
  renderRecord();
  renderHistory();
  renderIdleBoard();
  connect(handle);
}

function applySnapshot(snap) {
  room.owner = snap.owner;
  room.pool = snap.pool || [];
  room.kind = snap.kind || "moots";
  room.bestScore = snap.bestScore ?? null;
  room.bestBy = snap.bestBy || "";
  room.history = snap.history || [];
  room.presence = snap.presence || [];
  room.match = snap.match || { state: "lobby", startedAt: 0, seed: 0, players: [] };
}

// ---- websocket ----

function connect(handle) {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${location.host}/api/netris/${encodeURIComponent(handle)}/ws`);
  room.ws = ws;

  ws.addEventListener("open", async () => {
    const me = await resolveMe();
    ws.send(JSON.stringify({ t: "hello", ...me }));
  });

  ws.addEventListener("message", (evt) => {
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch {
      return;
    }
    handleMessage(msg);
  });

  ws.addEventListener("close", () => {
    setStatus(els.roomStatus, "disconnected — reconnecting…", true);
    setTimeout(() => {
      if (room.handle === handle) connect(handle);
    }, 1500);
  });
}

function sendMsg(msg) {
  if (room.ws && room.ws.readyState === 1) room.ws.send(JSON.stringify(msg));
}

async function resolveMe() {
  const stored = localStorage.getItem(LS_ME);
  if (!stored) return { did: "", handle: "", displayName: "", avatar: "" };

  if (room.owner && stored === room.owner.handle.toLowerCase()) {
    updateMeLabel(room.owner.displayName || room.owner.handle);
    return { did: room.owner.did, handle: room.owner.handle, displayName: room.owner.displayName, avatar: room.owner.avatar };
  }
  const poolMatch = room.pool.find((r) => r.handle.toLowerCase() === stored);
  if (poolMatch) {
    updateMeLabel(poolMatch.displayName || poolMatch.handle);
    return { did: poolMatch.did, handle: poolMatch.handle, displayName: poolMatch.displayName, avatar: poolMatch.avatar };
  }
  try {
    const did = await resolveDid(stored);
    const profiles = await getProfiles([did]);
    const p = profiles[0];
    const me = {
      did,
      handle: p?.handle || stored,
      displayName: p?.displayName || p?.handle || stored,
      avatar: p?.avatar || "",
    };
    updateMeLabel(me.displayName);
    return me;
  } catch {
    updateMeLabel(stored);
    return { did: "", handle: stored, displayName: stored, avatar: "" };
  }
}

function updateMeLabel(name) {
  els.meName.textContent = name || "a passerby";
}

function handleMessage(msg) {
  if (msg.t === "init") {
    room.myId = msg.you.id;
    room.mySeat = msg.you.seat;
    applySnapshot(msg);
    renderRoster();
    renderRecord();
    renderHistory();
    renderIdleBoard();
    return;
  }
  if (msg.t === "seat") {
    if (msg.id === room.myId) room.mySeat = msg.seat;
    return;
  }
  if (msg.t === "presence") {
    room.presence = msg.presence || [];
    renderRoster();
    return;
  }
  if (msg.t === "match_start") {
    room.match = { state: "playing", startedAt: msg.startedAt, seed: msg.seed, players: msg.players || [] };
    els.resultsPanel.hidden = true;
    beginMatch();
    return;
  }
  if (msg.t === "score") {
    updateOpponentScore(msg.seat, msg.lines, msg.score);
    return;
  }
  if (msg.t === "garbage") {
    if (msg.from === room.mySeat) return;
    if (game && !game.over) {
      game.garbagePending += msg.amount;
      flashGarbage();
    }
    return;
  }
  if (msg.t === "board") {
    renderOpponentBoard(msg.seat, msg.cells);
    return;
  }
  if (msg.t === "eliminated") {
    markOpponentEliminated(msg.seat, msg.place);
    return;
  }
  if (msg.t === "match_over") {
    endMatch(msg);
    return;
  }
  if (msg.t === "cheer") {
    flyCheer(msg.emoji);
    return;
  }
}

// ---- rendering: roster (lobby) ----

function renderRoster() {
  els.rosterList.innerHTML = "";
  const knownSeats = new Set(["owner", ...room.pool.map((r) => r.did)]);
  const entries = [];
  if (room.owner) entries.push({ seat: "owner", name: room.owner.displayName || room.owner.handle });
  for (const r of room.pool) entries.push({ seat: r.did, name: r.displayName || r.handle });

  for (const e of entries) {
    const present = room.presence.some((p) => p.seat === e.seat);
    const li = document.createElement("li");
    li.textContent = `${present ? "🟢" : "⚪"} ${e.name}`;
    if (e.seat === room.mySeat) {
      const tag = document.createElement("span");
      tag.className = "you-tag";
      tag.textContent = "YOU";
      li.appendChild(tag);
    }
    els.rosterList.appendChild(li);
  }
  const passersby = room.presence.filter((p) => !knownSeats.has(p.seat));
  const uniqueSeats = new Map();
  for (const p of passersby) if (!uniqueSeats.has(p.seat)) uniqueSeats.set(p.seat, p);
  for (const p of uniqueSeats.values()) {
    const li = document.createElement("li");
    li.textContent = `🟢 ${p.displayName || "a passerby"}`;
    if (p.seat === room.mySeat) {
      const tag = document.createElement("span");
      tag.className = "you-tag";
      tag.textContent = "YOU";
      li.appendChild(tag);
    }
    els.rosterList.appendChild(li);
  }
  if (!entries.length && !uniqueSeats.size) {
    const li = document.createElement("li");
    li.textContent = "nobody here yet";
    els.rosterList.appendChild(li);
  }

  const playing = room.match.state === "playing";
  els.startMatchBtn.hidden = playing;
  els.startMatchBtn.disabled = false;
  if (!playing) {
    const passerby = !room.mySeat || room.mySeat.startsWith("passerby:");
    els.matchStatusLine.textContent = passerby
      ? "tap \"change\" above and enter your handle to join the match yourself"
      : "hit start whenever — everyone connected drops in together";
  }
}

els.startMatchBtn.addEventListener("click", () => sendMsg({ t: "start" }));

// ---- match lifecycle ----

function beginMatch() {
  game = newGame(room.match.seed);
  ensureQueue(game, 4);
  els.boardOverlay.hidden = true;
  els.garbageMeter.classList.remove("active");
  updateStats();
  buildOpponentCards();
  renderBoard();
  renderHold();
  renderNext();

  els.matchStatusLine.textContent = "";
  els.countdown.hidden = false;
  const tick = () => {
    const remaining = room.match.startedAt - Date.now();
    if (remaining <= 0) {
      els.countdown.hidden = true;
      clearInterval(countdownTimer);
      launchGame();
      return;
    }
    els.countdown.textContent = Math.ceil(remaining / 1000);
  };
  clearInterval(countdownTimer);
  countdownTimer = setInterval(tick, 100);
  tick();
}

function launchGame() {
  if (!game || game.over) return;
  const amIPlaying = room.match.players.some((p) => p.seat === room.mySeat);
  if (!amIPlaying) {
    els.boardOverlay.hidden = false;
    els.boardOverlay.innerHTML = `<div class="overlay-title">👀 spectating</div><div class="overlay-sub">not in this match — watch the boards below, or join next round</div>`;
    return;
  }
  game.started = true;
  spawnPiece(game);
  game.lastTs = performance.now();
  const loop = (ts) => {
    if (!game || game.over) return;
    const dt = ts - game.lastTs;
    game.lastTs = ts;
    tickGame(game, dt);
    renderBoard();
    renderHold();
    renderNext();
    updateStats();
    if (game.over) {
      handleTopout();
      return;
    }
    game.rafId = requestAnimationFrame(loop);
  };
  game.rafId = requestAnimationFrame(loop);
}

function tickGame(g, dt) {
  if (g.input.left) {
    g.dasTimer.left += dt;
    if (g.dasTimer.left >= DAS_MS) {
      while (g.dasTimer.left >= ARR_MS) {
        g.dasTimer.left -= ARR_MS;
        if (!tryMove(g, 0, -1)) break;
      }
    }
  }
  if (g.input.right) {
    g.dasTimer.right += dt;
    if (g.dasTimer.right >= DAS_MS) {
      while (g.dasTimer.right >= ARR_MS) {
        g.dasTimer.right -= ARR_MS;
        if (!tryMove(g, 0, 1)) break;
      }
    }
  }

  const gravityMs = g.softDrop ? SOFT_DROP_MS : gravityForElapsed(Date.now() - room.match.startedAt);
  if (g.grounded) {
    g.lockTimer += dt;
    if (g.lockTimer >= LOCK_DELAY_MS) {
      lockPiece(g);
      return;
    }
  } else {
    g.fallAcc += dt;
    let guard = 0;
    while (g.fallAcc >= gravityMs && guard < 20) {
      g.fallAcc -= gravityMs;
      guard++;
      if (!tryMove(g, 1, 0)) break;
    }
  }
}

function handleTopout() {
  sendMsg({ t: "topout" });
  els.boardOverlay.hidden = false;
  els.boardOverlay.innerHTML = `<div class="overlay-title">💥 topped out</div><div class="overlay-sub">score ${game.score.toLocaleString()} · ${game.lines} lines — waiting for the match to finish</div>`;
}

function endMatch(msg) {
  if (game && game.rafId) cancelAnimationFrame(game.rafId);
  clearInterval(countdownTimer);
  els.countdown.hidden = true;
  room.match = { state: "lobby", startedAt: 0, seed: 0, players: [] };
  room.bestScore = msg.bestScore ?? room.bestScore;
  room.bestBy = msg.bestBy || room.bestBy;
  room.history = msg.history || room.history;
  renderRecord();
  renderHistory();
  renderResults(msg.results || []);
  renderRoster();
  renderIdleBoard();
  celebrateMatchOver(msg.results || []);
  game = null;
}

// ---- rendering: my board / hud ----

function renderIdleBoard() {
  boardCtx.fillStyle = "#080b1e";
  boardCtx.fillRect(0, 0, els.boardCanvas.width, els.boardCanvas.height);
  drawGrid();
  holdCtx.clearRect(0, 0, els.holdCanvas.width, els.holdCanvas.height);
  nextCtx.clearRect(0, 0, els.nextCanvas.width, els.nextCanvas.height);
  els.boardOverlay.hidden = false;
  els.boardOverlay.innerHTML =
    room.match.state === "playing"
      ? `<div class="overlay-title">🔒 match in progress</div><div class="overlay-sub">hang tight for the next round</div>`
      : `<div class="overlay-title">🧱 ready?</div><div class="overlay-sub">hit start in the lobby panel to drop in</div>`;
  els.countdown.hidden = true;
}

function drawGrid() {
  boardCtx.strokeStyle = "#ffffff10";
  boardCtx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) {
    boardCtx.beginPath();
    boardCtx.moveTo(c * BLOCK + 0.5, 0);
    boardCtx.lineTo(c * BLOCK + 0.5, ROWS * BLOCK);
    boardCtx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    boardCtx.beginPath();
    boardCtx.moveTo(0, r * BLOCK + 0.5);
    boardCtx.lineTo(COLS * BLOCK, r * BLOCK + 0.5);
    boardCtx.stroke();
  }
}

function drawBlock(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#ffffff30";
  ctx.fillRect(x, y, size, Math.max(2, size * 0.15));
  ctx.fillStyle = "#00000030";
  ctx.fillRect(x, y + size - Math.max(2, size * 0.15), size, Math.max(2, size * 0.15));
}

function renderBoard() {
  if (!game) return;
  boardCtx.fillStyle = "#080b1e";
  boardCtx.fillRect(0, 0, els.boardCanvas.width, els.boardCanvas.height);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = game.board[r][c];
      if (v) drawBlock(boardCtx, c * BLOCK, r * BLOCK, BLOCK, COLORS[v]);
    }
  }

  if (game.piece && !game.over) {
    const p = game.piece;
    const gr = ghostRow(game);
    boardCtx.globalAlpha = 0.25;
    for (const [dr, dc] of cellsOf(p.type, p.rot)) {
      const r = gr + dr;
      const c = p.col + dc;
      if (r >= 0) drawBlock(boardCtx, c * BLOCK, r * BLOCK, BLOCK, COLORS[p.type]);
    }
    boardCtx.globalAlpha = 1;
    for (const [dr, dc] of cellsOf(p.type, p.rot)) {
      const r = p.row + dr;
      const c = p.col + dc;
      if (r >= 0) drawBlock(boardCtx, c * BLOCK, r * BLOCK, BLOCK, COLORS[p.type]);
    }
  }

  drawGrid();
}

function renderHold() {
  holdCtx.clearRect(0, 0, els.holdCanvas.width, els.holdCanvas.height);
  if (!game || game.hold == null) return;
  drawMiniPiece(holdCtx, game.hold, els.holdCanvas.width / 2, els.holdCanvas.height / 2, 16);
}

function renderNext() {
  nextCtx.clearRect(0, 0, els.nextCanvas.width, els.nextCanvas.height);
  if (!game) return;
  const n = Math.min(3, game.queue.length);
  for (let i = 0; i < n; i++) {
    drawMiniPiece(nextCtx, game.queue[i], els.nextCanvas.width / 2, 44 + i * 84, 14);
  }
}

function drawMiniPiece(ctx, type, cx, cy, size) {
  const cells = cellsOf(type, 0);
  const maxR = Math.max(...cells.map((c) => c[0]));
  const maxC = Math.max(...cells.map((c) => c[1]));
  const w = (maxC + 1) * size;
  const h = (maxR + 1) * size;
  const ox = cx - w / 2;
  const oy = cy - h / 2;
  for (const [r, c] of cells) {
    drawBlock(ctx, ox + c * size, oy + r * size, size, COLORS[type]);
  }
}

function updateStats() {
  if (!game) {
    els.statScore.textContent = "0";
    els.statLines.textContent = "0";
    els.statSent.textContent = "0";
    return;
  }
  els.statScore.textContent = game.score.toLocaleString();
  els.statLines.textContent = String(game.lines);
  els.statSent.textContent = String(game.sent);
  els.garbageMeter.classList.toggle("active", game.garbagePending > 0);
}

function flashGarbage() {
  els.garbageMeter.classList.add("active");
  setTimeout(() => {
    if (game && game.garbagePending <= 0) els.garbageMeter.classList.remove("active");
  }, 400);
}

// ---- rendering: opponents ----

function buildOpponentCards() {
  els.opponentsList.innerHTML = "";
  opponentCanvases.clear();
  const others = room.match.players.filter((p) => p.seat !== room.mySeat);
  if (others.length === 0) {
    const note = document.createElement("div");
    note.className = "empty-note";
    note.textContent = "solo run — no one else in this match";
    els.opponentsList.appendChild(note);
    return;
  }
  for (const p of others) {
    const card = document.createElement("div");
    card.className = "opponent-card";
    card.dataset.seat = p.seat;

    const canvas = document.createElement("canvas");
    canvas.width = 60;
    canvas.height = 120;
    card.appendChild(canvas);

    const nameEl = document.createElement("div");
    nameEl.className = "opp-name";
    nameEl.textContent = p.displayName || p.handle || "guest";
    card.appendChild(nameEl);

    const scoreEl = document.createElement("div");
    scoreEl.className = "opp-score";
    scoreEl.textContent = "0";
    card.appendChild(scoreEl);

    els.opponentsList.appendChild(card);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#080b1e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    opponentCanvases.set(p.seat, { canvas, ctx, card, nameEl, scoreEl });
  }
}

function renderOpponentBoard(seat, cells) {
  const o = opponentCanvases.get(seat);
  if (!o || !cells || cells.length !== ROWS * COLS) return;
  const size = o.canvas.width / COLS;
  o.ctx.fillStyle = "#080b1e";
  o.ctx.fillRect(0, 0, o.canvas.width, o.canvas.height);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = cells[r * COLS + c];
      if (ch !== "0") {
        o.ctx.fillStyle = COLORS[ch] || "#5c6478";
        o.ctx.fillRect(c * size, r * size, size, size);
      }
    }
  }
}

function updateOpponentScore(seat, lines, score) {
  const o = opponentCanvases.get(seat);
  if (!o) return;
  o.scoreEl.textContent = score.toLocaleString();
}

function markOpponentEliminated(seat, place) {
  if (seat === room.mySeat) return;
  const o = opponentCanvases.get(seat);
  if (!o) return;
  o.card.classList.add("eliminated");
  const tag = document.createElement("div");
  tag.className = "opp-name";
  tag.textContent = place === 1 ? "🥇 winner" : `#${place}`;
  o.card.appendChild(tag);
}

function sendBoardSnapshot(g) {
  let cells = "";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) cells += g.board[r][c] || "0";
  }
  sendMsg({ t: "board", cells });
}

// ---- rendering: record / history / results ----

function renderRecord() {
  els.recordLine.textContent = room.bestScore
    ? `${room.bestScore.toLocaleString()} pts — ${room.bestBy}`
    : "nobody's won a match yet";
}

function renderHistory() {
  els.historyList.innerHTML = "";
  if (!room.history.length) {
    const li = document.createElement("li");
    li.textContent = "no matches yet";
    els.historyList.appendChild(li);
    return;
  }
  for (const h of room.history.slice().reverse()) {
    const li = document.createElement("li");
    li.textContent = `${h.winner} won with ${h.winnerScore.toLocaleString()} pts (${h.players} playing)`;
    els.historyList.appendChild(li);
  }
}

function renderResults(results) {
  els.resultsList.innerHTML = "";
  els.resultsPanel.hidden = results.length === 0;
  for (const r of results) {
    const li = document.createElement("li");
    li.textContent = `${r.displayName} — ${r.score.toLocaleString()} pts, ${r.lines} lines, ${r.sent} sent`;
    els.resultsList.appendChild(li);
  }
}

function celebrateMatchOver(results) {
  const winner = results.find((r) => r.place === 1);
  const banner = document.createElement("div");
  banner.className = "match-over-banner";
  banner.textContent = winner ? `🏁 ${winner.displayName} wins the match!` : "🏁 the match is over";
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 3600);
}

// ---- input ----

window.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  if (!game || game.over || !game.started) return;
  const key = e.key.toLowerCase();
  if (key === "arrowleft" || key === "a") {
    if (!e.repeat) {
      game.input.left = true;
      game.dasTimer.left = 0;
      tryMove(game, 0, -1);
    }
    e.preventDefault();
  } else if (key === "arrowright" || key === "d") {
    if (!e.repeat) {
      game.input.right = true;
      game.dasTimer.right = 0;
      tryMove(game, 0, 1);
    }
    e.preventDefault();
  } else if (key === "arrowdown" || key === "s") {
    game.softDrop = true;
    e.preventDefault();
  } else if (key === "arrowup" || key === "x") {
    if (!e.repeat) tryRotate(game, 1);
    e.preventDefault();
  } else if (key === "z") {
    if (!e.repeat) tryRotate(game, -1);
    e.preventDefault();
  } else if (key === " ") {
    if (!e.repeat) hardDrop(game);
    e.preventDefault();
  } else if (key === "c" || key === "shift") {
    if (!e.repeat) holdPiece(game);
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  const key = e.key.toLowerCase();
  if (!game) return;
  if (key === "arrowleft" || key === "a") game.input.left = false;
  else if (key === "arrowright" || key === "d") game.input.right = false;
  else if (key === "arrowdown" || key === "s") game.softDrop = false;
});

// ---- identity ----

els.meEdit.addEventListener("click", async () => {
  const current = localStorage.getItem(LS_ME) || "";
  const next = window.prompt("your bluesky handle (leave blank to play anonymous):", current);
  if (next === null) return;
  const cleaned = cleanHandle(next);
  if (cleaned) localStorage.setItem(LS_ME, cleaned);
  else localStorage.removeItem(LS_ME);
  updateMeLabel(cleaned || "a passerby");
  if (room.ws && room.ws.readyState === 1) {
    const me = await resolveMe();
    room.ws.send(JSON.stringify({ t: "hello", ...me }));
  }
});

// ---- sharing ----

els.shareBtn.addEventListener("click", () => {
  const url = `${location.origin}/n/${encodeURIComponent(room.handle)}`;
  const name = room.owner ? room.owner.displayName || room.owner.handle : room.handle;
  const text = `battling ${name} and the moots in netris 🧱⚔️ hop in: ${url}`;
  window.open(`https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`, "_blank", "noopener");
});

els.copyBtn.addEventListener("click", async () => {
  const url = `${location.origin}/n/${encodeURIComponent(room.handle)}`;
  try {
    await navigator.clipboard.writeText(url);
    els.copyBtn.textContent = "copied!";
    els.copyBtn.classList.add("copied");
  } catch {
    window.prompt("copy this link:", url);
  }
  setTimeout(() => {
    els.copyBtn.textContent = "copy link";
    els.copyBtn.classList.remove("copied");
  }, 1600);
});

// ---- cheer ----

function flyCheer(emoji) {
  const rect = els.boardCanvas.getBoundingClientRect();
  const bubble = document.createElement("div");
  bubble.className = "cheer-bubble-fly";
  bubble.textContent = emoji;
  bubble.style.left = rect.left + rect.width / 2 + "px";
  bubble.style.top = rect.top + 20 + "px";
  els.cheerFlyLayer.appendChild(bubble);
  const anim = bubble.animate(
    [
      { transform: "translate(-50%, 0)", opacity: 1 },
      { transform: "translate(-50%, -30px)", opacity: 0 },
    ],
    { duration: 900, easing: "ease-out" },
  );
  anim.onfinish = () => bubble.remove();
}

// ---- boot ----

const savedMe = localStorage.getItem(LS_ME);
if (savedMe) els.handleInput.value = savedMe;
renderIdleBoard();
route();
