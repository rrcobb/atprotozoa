// game.js — grand moot auto. Fetches happen in lib/cluster.js (copied
// verbatim from pacmoot — copy, don't abstract); this file is the five-block
// city, the car physics, the pedestrian wander AI, the honk mechanic, and the
// canvas rendering. No ray tracing was harmed in the making of this file.

import { moots, getProfiles } from "./lib/cluster.js";

// ---- the entire map (five whole blocks) ------------------------------------
const TILE = 40;
const COLS = 18;
const ROWS = 14;
// Five 3x3-tile building blocks scattered across the map; everything else is
// drivable road, including a ring around the whole perimeter.
const BLOCKS = [
  { r: 1, c: 1 },
  { r: 1, c: 9 },
  { r: 1, c: 14 },
  { r: 8, c: 4 },
  { r: 8, c: 11 },
];

function isBuilding(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  for (const b of BLOCKS) {
    if (r >= b.r && r < b.r + 3 && c >= b.c && c < b.c + 3) return true;
  }
  return false;
}

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

const OPEN_TILES = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (!isBuilding(r, c)) OPEN_TILES.push({ r, c });
  }
}

const W = COLS * TILE;
const H = ROWS * TILE;

// road corridors that get a dashed center line, purely cosmetic
const ROAD_COLS = [];
const ROAD_ROWS = [];
for (let c = 0; c < COLS; c++) {
  if (OPEN_TILES.filter((t) => t.c === c).length === ROWS) ROAD_COLS.push(c);
}
for (let r = 0; r < ROWS; r++) {
  if (OPEN_TILES.filter((t) => t.r === r).length === COLS) ROAD_ROWS.push(r);
}

// ---- shared helpers (hue/avatar helpers copied from pacmoot) --------------
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

function drawAvatarCircle(ctx, cx, cy, radius, opts) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
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

// ---- car physics ------------------------------------------------------------
const CAR_R = 11;
const ACCEL = 230;
const BRAKE = 340;
const FRICTION = 160;
const MAX_SPEED = 195;
const MAX_REVERSE = -90;
const TURN_RATE = 2.7;
const HONK_RADIUS = 62;
const HONK_COOLDOWN = 0.3;
const GAME_SECONDS = 45;
const MAX_MOOTS = 8;
const PED_SPEED = 1.15; // tiles/sec

function closestPointOnRect(cx, cy, rx, ry, rw, rh) {
  return {
    x: Math.max(rx, Math.min(cx, rx + rw)),
    y: Math.max(ry, Math.min(cy, ry + rh)),
  };
}

function circleHitsBuilding(cx, cy, r) {
  const minC = Math.max(0, Math.floor((cx - r) / TILE));
  const maxC = Math.min(COLS - 1, Math.floor((cx + r) / TILE));
  const minR = Math.max(0, Math.floor((cy - r) / TILE));
  const maxR = Math.min(ROWS - 1, Math.floor((cy + r) / TILE));
  for (let tr = minR; tr <= maxR; tr++) {
    for (let tc = minC; tc <= maxC; tc++) {
      if (!isBuilding(tr, tc)) continue;
      const p = closestPointOnRect(cx, cy, tc * TILE, tr * TILE, TILE, TILE);
      if (Math.hypot(cx - p.x, cy - p.y) < r) return true;
    }
  }
  return false;
}

function makeCar() {
  return { x: W / 2, y: H / 2, angle: -Math.PI / 2, speed: 0 };
}

function updateCar(car, dt, keys) {
  if (keys.up) car.speed += ACCEL * dt;
  else if (keys.down) car.speed -= BRAKE * dt;
  else {
    const decel = FRICTION * dt;
    if (car.speed > 0) car.speed = Math.max(0, car.speed - decel);
    else if (car.speed < 0) car.speed = Math.min(0, car.speed + decel);
  }
  car.speed = Math.max(MAX_REVERSE, Math.min(MAX_SPEED, car.speed));

  const turnFactor = Math.min(1, Math.abs(car.speed) / 45);
  const dir = car.speed < 0 ? -1 : 1;
  if (keys.left) car.angle -= TURN_RATE * turnFactor * dir * dt;
  if (keys.right) car.angle += TURN_RATE * turnFactor * dir * dt;

  const vx = Math.cos(car.angle) * car.speed;
  const vy = Math.sin(car.angle) * car.speed;
  const nx = car.x + vx * dt;
  const ny = car.y + vy * dt;

  if (!circleHitsBuilding(nx, car.y, CAR_R)) car.x = nx;
  else car.speed *= 0.25;
  if (!circleHitsBuilding(car.x, ny, CAR_R)) car.y = ny;
  else car.speed *= 0.25;

  car.x = Math.max(CAR_R, Math.min(W - CAR_R, car.x));
  car.y = Math.max(CAR_R, Math.min(H - CAR_R, car.y));
}

function drawCar(ctx, car, img, hue, initial) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // body
  ctx.fillStyle = "#e7e2f2";
  ctx.strokeStyle = "#0c0812";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-14, -8, 28, 16, 5);
  ctx.fill();
  ctx.stroke();
  // headlights
  ctx.fillStyle = "#ffe999";
  ctx.fillRect(11, -6, 3, 3);
  ctx.fillRect(11, 3, 3, 3);
  // taillights
  ctx.fillStyle = "#ff2ea6";
  ctx.fillRect(-14, -6, 3, 3);
  ctx.fillRect(-14, 3, 3, 3);
  ctx.restore();
  // driver avatar riding on top, always upright
  drawAvatarCircle(ctx, car.x, car.y, 8, { img, hue, initial, ring: "rgba(255,255,255,0.5)" });
}

// ---- pedestrian wander AI ---------------------------------------------------
const DIRS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];
const ALIGN_EPS = 0.04;

function canStepPed(r, c, dr, dc) {
  const nr = r + dr;
  const nc = c + dc;
  return inBounds(nr, nc) && !isBuilding(nr, nc);
}

function makePedEntity(r, c) {
  return { row: r, col: c, dr: 0, dc: 0 };
}

function stepPed(e, dt, speed) {
  const cr = Math.round(e.row);
  const cc = Math.round(e.col);
  const aligned = Math.abs(e.row - cr) < ALIGN_EPS && Math.abs(e.col - cc) < ALIGN_EPS;
  if (aligned) {
    e.row = cr;
    e.col = cc;
    const opts = DIRS.filter((d) => canStepPed(cr, cc, d.dr, d.dc));
    if (opts.length) {
      const keepGoing = opts.find((d) => d.dr === e.dr && d.dc === e.dc);
      const pick =
        keepGoing && Math.random() < 0.6
          ? keepGoing
          : opts[Math.floor(Math.random() * opts.length)];
      e.dr = pick.dr;
      e.dc = pick.dc;
    } else {
      e.dr = 0;
      e.dc = 0;
    }
  }
  e.row += e.dr * speed * dt;
  e.col += e.dc * speed * dt;
}

function farTile(exclude, minDist) {
  const candidates = OPEN_TILES.filter((t) => {
    for (const e of exclude) {
      if (Math.hypot(e.r - t.r, e.c - t.c) < minDist) return false;
    }
    return true;
  });
  const pool = candidates.length ? candidates : OPEN_TILES;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---- DOM --------------------------------------------------------------------
const form = document.getElementById("load-form");
const input = document.getElementById("handle-input");
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
const shareLink = document.getElementById("share-link");
const breakthroughBtn = document.getElementById("breakthrough-btn");
const breakthroughFlash = document.getElementById("breakthrough-flash");
const chipRtx = document.getElementById("chip-rtx");
const chipDlss = document.getElementById("chip-dlss");
const chipFsr = document.getElementById("chip-fsr");

const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr;
canvas.height = H * dpr;
canvas.style.aspectRatio = `${W} / ${H}`;
ctx.scale(dpr, dpr);

let cluster = null;
let car = null;
let playerImg = null;
let playerHue = 0;
let playerInitial = "?";
let peds = []; // { entity, img, hue, initial, handle }
let particles = [];
let honkRings = [];
let running = false;
let score = 0;
let timeLeft = GAME_SECONDS;
let rafId = null;
let lastT = 0;
let honkCooldown = 0;
let breakthroughUsed = false;
let breakthroughTimeLeft = 0;

const keys = { up: false, down: false, left: false, right: false };

// ---- fake graphics settings (the whole joke) --------------------------------
const gfx = { rtx: true, dlss: true, fsr: true };
function applyFilters() {
  if (canvas.classList.contains("breakthrough")) return;
  const filters = [];
  if (gfx.rtx) filters.push("contrast(1.15)", "saturate(1.3)", "drop-shadow(0 0 5px rgba(255,46,166,0.28))");
  if (gfx.dlss) filters.push("saturate(1.08)", "blur(0.3px)");
  if (gfx.fsr) filters.push("contrast(1.04)", "hue-rotate(-2deg)");
  canvas.style.filter = filters.join(" ");
}
function toggleChip(key, chipEl, onLabel) {
  gfx[key] = !gfx[key];
  chipEl.classList.toggle("on", gfx[key]);
  chipEl.textContent = gfx[key] ? onLabel : onLabel.split(" ")[0] + " OFF";
  applyFilters();
}
chipRtx.addEventListener("click", () => toggleChip("rtx", chipRtx, "RTX ON"));
chipDlss.addEventListener("click", () => toggleChip("dlss", chipDlss, "DLSS 5"));
chipFsr.addEventListener("click", () => toggleChip("fsr", chipFsr, "FSR 4"));
applyFilters();

function doBreakthrough() {
  if (breakthroughUsed || !running) return;
  breakthroughUsed = true;
  breakthroughTimeLeft = 2.5;
  breakthroughBtn.disabled = true;
  canvas.classList.add("breakthrough");
  breakthroughFlash.classList.add("show");
}
breakthroughBtn.addEventListener("click", doBreakthrough);

// ---- input --------------------------------------------------------------
const KEY_MAP = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
};
window.addEventListener("keydown", (e) => {
  if (e.key === " ") {
    if (running) { e.preventDefault(); doHonk(); }
    return;
  }
  const k = KEY_MAP[e.key];
  if (!k || !running) return;
  e.preventDefault();
  keys[k] = true;
});
window.addEventListener("keyup", (e) => {
  const k = KEY_MAP[e.key];
  if (!k) return;
  keys[k] = false;
});

for (const [id, k] of [
  ["t-up", "up"], ["t-down", "down"], ["t-left", "left"], ["t-right", "right"],
]) {
  const btn = document.getElementById(id);
  btn.addEventListener("pointerdown", (e) => { e.preventDefault(); keys[k] = true; });
  btn.addEventListener("pointerup", (e) => { e.preventDefault(); keys[k] = false; });
  btn.addEventListener("pointerleave", () => { keys[k] = false; });
}
document.getElementById("t-honk").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (running) doHonk();
});

function addParticle(text, x, y) {
  particles.push({ text, x, y, life: 1 });
}

function doHonk() {
  if (honkCooldown > 0) return;
  honkCooldown = HONK_COOLDOWN;
  honkRings.push({ x: car.x, y: car.y, life: 1 });
  for (const p of peds) {
    const px = p.entity.col * TILE + TILE / 2;
    const py = p.entity.row * TILE + TILE / 2;
    if (Math.hypot(px - car.x, py - car.y) < HONK_RADIUS) {
      const gain = breakthroughTimeLeft > 0 ? 2 : 1;
      score += gain;
      scoreEl.textContent = String(score);
      addParticle(`+${gain} @${p.handle}`, px, py);
      const exclude = [{ r: Math.round(car.y / TILE), c: Math.round(car.x / TILE) }];
      for (const other of peds) {
        if (other !== p) exclude.push({ r: Math.round(other.entity.row), c: Math.round(other.entity.col) });
      }
      const t = farTile(exclude, 4);
      p.entity.row = t.r;
      p.entity.col = t.c;
      p.entity.dr = 0;
      p.entity.dc = 0;
    }
  }
}

// ---- game state helpers -----------------------------------------------------
function setStatus(msg, isError) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}
function bestKey(did) {
  return `grandmootauto:best:${did}`;
}
function getBest(did) {
  return parseInt(localStorage.getItem(bestKey(did)) || "0", 10) || 0;
}
function setBest(did, v) {
  try { localStorage.setItem(bestKey(did), String(v)); } catch {}
}

function resetPositions() {
  car = makeCar();
  for (const p of peds) {
    const t = farTile([{ r: Math.round(car.y / TILE), c: Math.round(car.x / TILE) }], 3);
    p.entity.row = t.r;
    p.entity.col = t.c;
    p.entity.dr = 0;
    p.entity.dc = 0;
  }
  particles = [];
  honkRings = [];
  honkCooldown = 0;
  breakthroughUsed = false;
  breakthroughTimeLeft = 0;
  breakthroughBtn.disabled = false;
  canvas.classList.remove("breakthrough");
  breakthroughFlash.classList.remove("show");
  applyFilters();
  keys.up = keys.down = keys.left = keys.right = false;
}

// ---- render -------------------------------------------------------------
function drawCity() {
  ctx.fillStyle = "#1a1626";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255, 233, 153, 0.35)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  for (const c of ROAD_COLS) {
    const x = c * TILE + TILE / 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (const r of ROAD_ROWS) {
    const y = r * TILE + TILE / 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const b of BLOCKS) {
    const x = b.c * TILE;
    const y = b.r * TILE;
    const s = 3 * TILE;
    const h = hue(`${b.r * 31 + b.c}`);
    ctx.fillStyle = `hsl(${h} 32% 16%)`;
    ctx.strokeStyle = `hsl(${h} 45% 32%)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 3, s - 6, s - 6, 6);
    ctx.fill();
    ctx.stroke();
    // "hyper realistic" windows
    ctx.fillStyle = `hsl(${(h + 40) % 360} 80% 70% / 0.55)`;
    for (let wr = 0; wr < 4; wr++) {
      for (let wc = 0; wc < 4; wc++) {
        if ((wr + wc + b.r + b.c) % 3 === 0) continue;
        ctx.fillRect(x + 10 + wc * ((s - 20) / 4), y + 10 + wr * ((s - 20) / 4), 6, 6);
      }
    }
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);
  drawCity();

  for (const ring of honkRings) {
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, HONK_RADIUS * (1 - ring.life) + 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(52, 224, 216, ${ring.life})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  for (const p of peds) {
    drawAvatarCircle(
      ctx,
      p.entity.col * TILE + TILE / 2,
      p.entity.row * TILE + TILE / 2,
      TILE * 0.34,
      { img: p.img, hue: p.hue, initial: p.initial, ring: "rgba(255,255,255,0.18)" },
    );
  }

  drawCar(ctx, car, playerImg, playerHue, playerInitial);

  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = "#34e0d8";
    ctx.fillText(p.text, p.x, p.y);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function update(dt) {
  updateCar(car, dt, keys);
  for (const p of peds) stepPed(p.entity, dt, PED_SPEED * p.speedMul);
  if (honkCooldown > 0) honkCooldown -= dt;

  for (const p of particles) { p.life -= dt * 0.7; p.y -= dt * 14; }
  particles = particles.filter((p) => p.life > 0);
  for (const r of honkRings) r.life -= dt * 2.2;
  honkRings = honkRings.filter((r) => r.life > 0);

  if (breakthroughTimeLeft > 0) {
    breakthroughTimeLeft -= dt;
    if (breakthroughTimeLeft <= 0) {
      canvas.classList.remove("breakthrough");
      breakthroughFlash.classList.remove("show");
      applyFilters();
    }
  }

  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    endGame();
  }
  timeEl.textContent = String(Math.ceil(timeLeft));
}

function loop(t) {
  if (!running) return;
  const dt = Math.min((t - lastT) / 1000, 0.05) || 0;
  lastT = t;
  update(dt);
  render();
  rafId = requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  cancelAnimationFrame(rafId);
  canvas.classList.remove("breakthrough");
  breakthroughFlash.classList.remove("show");
  applyFilters();
  const best = getBest(cluster.did);
  const newBest = score > best;
  if (newBest) setBest(cluster.did, score);
  bestEl.textContent = String(newBest ? score : best);
  overTitle.textContent = "time!";
  overCopy.textContent = newBest
    ? `recruited ${score} moots — new best. ray tracing stayed on the whole time.`
    : `recruited ${score} moots. best is still ${best}.`;
  const shareText = `just recruited ${score} of my moots in grand moot auto. it's just all of gta 6, ray tracing ON, running in a <canvas> element. https://grand-moot-auto.bisks.net`;
  shareLink.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);
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
    setStatus("no moots or follows to populate the city with.", true);
    loadBtn.disabled = false;
    return;
  }

  cluster = c;
  const picked = c.pool.slice().sort(() => Math.random() - 0.5).slice(0, MAX_MOOTS);

  setStatus("loading avatars…");
  const profiles = await getProfiles([c.did, ...picked.map((p) => p.did)]);
  const byDid = new Map(profiles.map((p) => [p.did, p]));

  const selfFull = byDid.get(c.did) || {};
  playerImg = loadImg(selfFull.avatar || c.self.avatar);
  playerHue = hue(c.did);
  playerInitial = (selfFull.displayName || c.handle || "?")[0].toUpperCase();

  car = makeCar();
  peds = picked.map((p) => {
    const full = byDid.get(p.did) || {};
    return {
      entity: makePedEntity(1, 1),
      img: loadImg(full.avatar || p.avatar),
      hue: hue(p.did),
      initial: (full.displayName || p.handle || "?")[0].toUpperCase(),
      handle: p.handle,
      speedMul: 0.8 + (hashInt(p.did) % 40) / 100,
    };
  });
  resetPositions();

  boardMeta.textContent = `${c.kind} · ${picked.length} of ${c.counts.pool} roaming the map`;
  bestEl.textContent = String(getBest(c.did));
  startCopy.textContent = `you're @${c.handle}. ${picked.length} moots are somewhere out there, minding their business.`;
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
