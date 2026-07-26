// game.js — pacmoot. Fetches happen in lib/cluster.js (copied from
// mootdrone/clustercrawl — copy, don't abstract); this file is the maze,
// the movement, the flee AI, and the canvas rendering.

import { moots, getProfiles } from "./lib/cluster.js";

// ---- maze -----------------------------------------------------------------
// Border walls plus a lattice of isolated single-cell pillars: guarantees a
// single connected open region (removing isolated interior vertices from a
// grid graph can't disconnect it) while still giving corners and loops to
// chase around. Row 8 is left free of pillars and its border cells are open,
// making it a straight tunnel that wraps left/right — classic Pac-Man escape
// hatch.
const ROWS = 17;
const COLS = 19;
const TUNNEL_ROW = 8;
const PILLAR_ROWS = [2, 4, 6, 10, 12, 14];
const PILLAR_COLS = [2, 4, 6, 8, 10, 12, 14, 16];
const TILE = 26;

function isWall(r, c) {
  if (r < 0 || r >= ROWS) return true;
  if (c < 0 || c >= COLS) {
    return r !== TUNNEL_ROW; // off-grid is only open at the tunnel row
  }
  if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
    if (r === TUNNEL_ROW && (c === 0 || c === COLS - 1)) return false;
    return true;
  }
  return PILLAR_ROWS.includes(r) && PILLAR_COLS.includes(c);
}

const OPEN_TILES = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (!isWall(r, c)) OPEN_TILES.push({ r, c });
  }
}

const START = { r: Math.floor(ROWS / 2), c: Math.floor(COLS / 2) };
const DIRS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

// ---- entities ---------------------------------------------------------
const MAX_MOOTS = 6;
const GAME_SECONDS = 60;
const PLAYER_SPEED = 6.6; // tiles/sec
const MOOT_SPEED = 5.7;
const ALIGN_EPS = 0.045;
const CHOMP_DIST = 0.55;

function hashInt(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function hue(str) {
  return hashInt(str) % 360;
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

function wrapCol(c) {
  if (c < -0.5) return c + COLS;
  if (c > COLS - 0.5) return c - COLS;
  return c;
}

function canStep(r, c, dr, dc) {
  // isWall already treats out-of-range columns at TUNNEL_ROW as open, so
  // this also covers the tunnel wraparound.
  return !isWall(r + dr, c + dc);
}

function makeEntity(r, c) {
  return { row: r, col: c, dr: 0, dc: 0, nextDr: 0, nextDc: 0, facing: 0 };
}

function stepEntity(e, dt, speed, decide) {
  const cr = Math.round(e.row);
  const cc = Math.round(e.col);
  const aligned = Math.abs(e.row - cr) < ALIGN_EPS && Math.abs(e.col - cc) < ALIGN_EPS;
  if (aligned) {
    e.row = cr;
    e.col = cc;
    decide(e, cr, cc);
    if ((e.nextDr || e.nextDc) && canStep(cr, cc, e.nextDr, e.nextDc)) {
      e.dr = e.nextDr;
      e.dc = e.nextDc;
    } else if (!canStep(cr, cc, e.dr, e.dc)) {
      e.dr = 0;
      e.dc = 0;
    }
    if (e.dr || e.dc) e.facing = Math.atan2(e.dr, e.dc);
  }
  e.row += e.dr * speed * dt;
  e.col = wrapCol(e.col + e.dc * speed * dt);
}

// ---- rendering ----------------------------------------------------------
function drawWalls(ctx) {
  ctx.fillStyle = "#141a4a";
  ctx.strokeStyle = "#3346e0";
  ctx.lineWidth = 1.5;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isWall(r, c)) continue;
      const x = c * TILE + 2;
      const y = r * TILE + 2;
      const s = TILE - 4;
      ctx.beginPath();
      ctx.roundRect(x, y, s, s, 4);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.fillStyle = "#1c2130";
  for (const t of OPEN_TILES) {
    ctx.beginPath();
    ctx.arc(t.c * TILE + TILE / 2, t.r * TILE + TILE / 2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function clipMouth(ctx, cx, cy, radius, facing, mouth) {
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, facing + mouth, facing - mouth + Math.PI * 2);
  ctx.closePath();
  ctx.clip();
}

function drawAvatar(ctx, entity, radius, opts) {
  const cx = entity.col * TILE + TILE / 2;
  const cy = entity.row * TILE + TILE / 2;
  ctx.save();
  if (opts.mouth != null) {
    clipMouth(ctx, cx, cy, radius, entity.facing, opts.mouth);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
  }
  if (imgReady(opts.img)) {
    ctx.drawImage(opts.img, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = `hsl(${opts.hue} 55% 42%)`;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `${Math.round(radius)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.initial || "?", cx, cy + 1);
  }
  ctx.restore();
  if (opts.ring) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
    ctx.strokeStyle = opts.ring;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// ---- game state -----------------------------------------------------------
const form = document.getElementById("load-form");
const input = document.getElementById("handle-input");
if (window.attachHandleTypeahead) window.attachHandleTypeahead(input);
const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const gameEl = document.getElementById("game");
const boardMeta = document.getElementById("board-meta");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const timeEl = document.getElementById("time");
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const startOverlay = document.getElementById("start-overlay");
const startCopy = document.getElementById("start-copy");
const startBtn = document.getElementById("start-btn");
const overOverlay = document.getElementById("over-overlay");
const overTitle = document.getElementById("over-title");
const overCopy = document.getElementById("over-copy");
const againBtn = document.getElementById("again-btn");

const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = COLS * TILE * dpr;
canvas.height = ROWS * TILE * dpr;
canvas.style.aspectRatio = `${COLS} / ${ROWS}`;
ctx.scale(dpr, dpr);

let cluster = null;
let player = null;
let playerImg = null;
let playerHue = 0;
let playerInitial = "?";
let mootEntities = []; // { entity, img, hue, initial, handle, chomps }
let particles = [];
let running = false;
let score = 0;
let timeLeft = GAME_SECONDS;
let rafId = null;
let lastT = 0;

function setStatus(msg, isError) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}

function bestKey(did) {
  return `pacmoot:best:${did}`;
}

function getBest(did) {
  return parseInt(localStorage.getItem(bestKey(did)) || "0", 10) || 0;
}

function setBest(did, v) {
  try {
    localStorage.setItem(bestKey(did), String(v));
  } catch {}
}

function farTile(exclude, minDist) {
  const candidates = OPEN_TILES.filter((t) => {
    for (const e of exclude) {
      if (Math.hypot(e.r - t.r, e.c - t.c) < minDist) return false;
    }
    return true;
  });
  if (!candidates.length) return OPEN_TILES[Math.floor(Math.random() * OPEN_TILES.length)];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function respawnMoot(m) {
  const exclude = [{ r: Math.round(player.row), c: Math.round(player.col) }];
  for (const other of mootEntities) {
    if (other !== m) exclude.push({ r: Math.round(other.entity.row), c: Math.round(other.entity.col) });
  }
  const t = farTile(exclude, 5);
  m.entity.row = t.r;
  m.entity.col = t.c;
  m.entity.dr = 0;
  m.entity.dc = 0;
  m.entity.nextDr = 0;
  m.entity.nextDc = 0;
}

function fleeDecide(m) {
  return (e, r, c) => {
    const opts = DIRS.filter((d) => canStep(r, c, d.dr, d.dc));
    if (!opts.length) return;
    const notReverse = opts.filter((d) => !(d.dr === -e.dr && d.dc === -e.dc));
    const pool = notReverse.length ? notReverse : opts;
    const scored = pool
      .map((d) => {
        const nr = r + d.dr;
        const nc = wrapCol(c + d.dc);
        return { d, dist: Math.hypot(nr - player.row, nc - player.col) };
      })
      .sort((a, b) => b.dist - a.dist);
    const pick =
      scored.length > 1 && Math.random() < 0.18 ? scored[1] : scored[0];
    e.nextDr = pick.d.dr;
    e.nextDc = pick.d.dc;
  };
}

function playerDecide(e) {
  e.nextDr = e.desiredDr || 0;
  e.nextDc = e.desiredDc || 0;
}

function setDesired(dr, dc) {
  if (!player) return;
  player.desiredDr = dr;
  player.desiredDc = dc;
}

const KEY_DIRS = {
  ArrowUp: [-1, 0], w: [-1, 0], W: [-1, 0],
  ArrowDown: [1, 0], s: [1, 0], S: [1, 0],
  ArrowLeft: [0, -1], a: [0, -1], A: [0, -1],
  ArrowRight: [0, 1], d: [0, 1], D: [0, 1],
};

window.addEventListener("keydown", (e) => {
  const d = KEY_DIRS[e.key];
  if (!d || !running) return;
  e.preventDefault();
  setDesired(d[0], d[1]);
});

for (const [id, dr, dc] of [
  ["t-up", -1, 0],
  ["t-down", 1, 0],
  ["t-left", 0, -1],
  ["t-right", 0, 1],
]) {
  const btn = document.getElementById(id);
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    setDesired(dr, dc);
  });
}

function addParticle(text, r, c) {
  particles.push({ text, x: c * TILE + TILE / 2, y: r * TILE + TILE / 2, life: 1 });
}

function tryChomp() {
  for (const m of mootEntities) {
    const dist = Math.hypot(
      m.entity.row - player.row,
      Math.min(
        Math.abs(m.entity.col - player.col),
        COLS - Math.abs(m.entity.col - player.col),
      ),
    );
    if (dist < CHOMP_DIST) {
      score++;
      m.chomps++;
      scoreEl.textContent = String(score);
      addParticle(`+1 @${m.handle}`, m.entity.row, m.entity.col);
      respawnMoot(m);
    }
  }
}

function update(dt) {
  stepEntity(player, dt, PLAYER_SPEED, playerDecide);
  for (const m of mootEntities) stepEntity(m.entity, dt, MOOT_SPEED * m.speedMul, fleeDecide(m));
  tryChomp();
  for (const p of particles) {
    p.life -= dt * 0.7;
    p.y -= dt * 14;
  }
  particles = particles.filter((p) => p.life > 0);

  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    endGame();
  }
  timeEl.textContent = String(Math.ceil(timeLeft));
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, COLS * TILE, ROWS * TILE);
  drawWalls(ctx);

  for (const m of mootEntities) {
    drawAvatar(ctx, m.entity, TILE * 0.42, {
      img: m.img,
      hue: m.hue,
      initial: m.initial,
      ring: "rgba(255,255,255,0.15)",
    });
  }

  const moving = player.dr || player.dc;
  const t = performance.now() / 1000;
  const mouth = moving ? 0.14 + Math.abs(Math.sin(t * 9)) * 0.42 : 0.16;
  drawAvatar(ctx, player, TILE * 0.46, {
    img: playerImg,
    hue: playerHue,
    initial: playerInitial,
    mouth,
  });

  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = "#ffd166";
    ctx.fillText(p.text, p.x, p.y);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function loop(t) {
  if (!running) return;
  const dt = Math.min((t - lastT) / 1000, 0.05) || 0;
  lastT = t;
  update(dt);
  render();
  rafId = requestAnimationFrame(loop);
}

function resetPositions() {
  player.row = START.r;
  player.col = START.c;
  player.dr = 0;
  player.dc = 0;
  player.desiredDr = 0;
  player.desiredDc = 0;
  player.facing = 0;
  for (const m of mootEntities) respawnMoot(m);
  particles = [];
}

function endGame() {
  running = false;
  cancelAnimationFrame(rafId);
  const best = getBest(cluster.did);
  const newBest = score > best;
  if (newBest) setBest(cluster.did, score);
  bestEl.textContent = String(newBest ? score : best);
  overTitle.textContent = "time!";
  overCopy.textContent = newBest
    ? `chomped ${score} moots — new best.`
    : `chomped ${score} moots. best is still ${best}.`;
  overOverlay.classList.remove("hidden");
}

function startGame() {
  score = 0;
  timeLeft = GAME_SECONDS;
  scoreEl.textContent = "0";
  timeEl.textContent = String(GAME_SECONDS);
  resetPositions();
  startOverlay.classList.add("hidden");
  overOverlay.classList.add("hidden");
  running = true;
  lastT = performance.now();
  rafId = requestAnimationFrame(loop);
}

startBtn.addEventListener("click", startGame);
againBtn.addEventListener("click", startGame);

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
    setStatus("no moots or follows to chase down.", true);
    loadBtn.disabled = false;
    return;
  }

  cluster = c;
  const picked = c.pool
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, MAX_MOOTS);

  setStatus("loading avatars…");
  const profiles = await getProfiles([c.did, ...picked.map((p) => p.did)]);
  const byDid = new Map(profiles.map((p) => [p.did, p]));

  const selfFull = byDid.get(c.did) || {};
  playerImg = loadImg(selfFull.avatar || c.self.avatar);
  playerHue = hue(c.did);
  playerInitial = (selfFull.displayName || c.handle || "?")[0].toUpperCase();

  player = makeEntity(START.r, START.c);

  mootEntities = picked.map((p) => {
    const full = byDid.get(p.did) || {};
    return {
      entity: makeEntity(START.r, START.c),
      img: loadImg(full.avatar || p.avatar),
      hue: hue(p.did),
      initial: (full.displayName || p.handle || "?")[0].toUpperCase(),
      handle: p.handle,
      speedMul: 0.85 + (hashInt(p.did) % 30) / 100,
      chomps: 0,
    };
  });
  resetPositions();

  boardMeta.textContent = `${c.kind} · ${picked.length} of ${c.counts.pool} on the board`;
  bestEl.textContent = String(getBest(c.did));
  startCopy.textContent = `you're @${c.handle}. ${picked.length} moots are already looking over their shoulder.`;
  startOverlay.classList.remove("hidden");
  overOverlay.classList.add("hidden");
  gameEl.hidden = false;
  loadBtn.disabled = false;
  setStatus("");
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const actor = input.value.trim();
  if (!actor) return;
  loadNetwork(actor);
});

if (input.value.trim()) loadNetwork(input.value.trim());
