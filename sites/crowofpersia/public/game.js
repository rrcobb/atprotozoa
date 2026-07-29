// game.js — crowofpersia. A Prince-of-Persia-flavoured side-scrolling dungeon
// platformer: you're a crow, escaping a guarded dungeon by hopping stairs,
// clearing pits, and pecking guards instead of dueling them with a sword.
// The guards' faces are drawn from lib/cluster.js's roster — everyone
// @norvid-studies.bsky.social follows on Bluesky.
//
// Structurally copied from pacmoot/game.js (canvas + rAF loop + avatar
// drawing + hue fallback) — copy, don't abstract — but the mechanics
// (gravity, jumping, a heightmap terrain, a peck attack) are new; pacmoot's
// board is a fixed maze with no verticality.

import { loadGuardRoster, GUARD_ACTOR } from "./lib/cluster.js";

// ---- tunables ---------------------------------------------------------
const TILE = 40;
const COLS_VISIBLE = 14;
const ROWS_VISIBLE = 11;
const CANVAS_W = TILE * COLS_VISIBLE; // 560
const CANVAS_H = TILE * ROWS_VISIBLE; // 440

const ROW_MIN = 0;
const ROW_MAX = 4;
const GROUND_BASE_Y = 120; // px — y of row 0's surface
const rowY = (row) => GROUND_BASE_Y + row * TILE;
const PIT_DEATH_Y = CANVAS_H + 60; // fall past this = dead

const GRAVITY = 2200; // px/s^2
const JUMP_V = -700; // px/s
const RUN_SPEED = 220; // px/s
const PLAYER_HW = 14; // half-width
const GUARD_HW = 15;

const LEVEL_COLS = 110;
const START_RUNWAY = 6; // safe flat tiles at the very start
const END_RUNWAY = 6; // safe flat tiles before the gate
const GAME_SECONDS = 100;
const MAX_LIVES = 3;
const PECK_COOLDOWN = 0.36;
const PECK_REACH = TILE * 0.62;
const PECK_ACTIVE = 0.14; // seconds the peck hitbox is live
const INVULN_TIME = 1.1;
const GUARD_RESPAWN_DELAY = 5; // seconds before a downed guard's spot refills
const MAX_ACTIVE_GUARDS = 26;
const SITE_URL = "https://bisks.net/games/crowofpersia";

// guard aggro — patrol guards notice a nearby crow, freeze for a beat
// (telegraphed with a "!"), then lunge within their own patrol footprint
// instead of just pacing past you.
const ALERT_RANGE = TILE * 4.2;
const LOSE_RANGE = TILE * 6.5;
const ALERT_DELAY = 0.3; // seconds frozen before the lunge starts
const CHASE_MULT = 2.1; // speed multiplier while chasing

// the captain — GUARD_ACTOR's own face, standing at the gate. Two pecks to
// put down, and the gate stays shut until the captain falls.
const BOSS_HP = 2;
const BOSS_SCALE = 1.35;

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
  img.referrerPolicy = "no-referrer";
  img.src = url;
  return img;
}
function imgReady(img) {
  return img && img.complete && img.naturalWidth > 0;
}
function rand(a, b) {
  return a + Math.random() * (b - a);
}
function randInt(a, b) {
  return Math.floor(rand(a, b + 1));
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ---- level generation ---------------------------------------------------
// ground[col] is either a tile-row number (elevation) or null (a pit — no
// floor, walk/jump over it or fall). Guards patrol a bounded flat run.
function buildLevel() {
  const ground = new Array(LEVEL_COLS).fill(2);
  const spikes = new Set();
  const guardSpawns = []; // { fromCol, toCol, row }
  let col = START_RUNWAY;
  let row = 2;
  let lastFeatureWasGap = true; // start conservative
  let lastGuardCol = -999;

  while (col < LEVEL_COLS - END_RUNWAY) {
    const remaining = LEVEL_COLS - END_RUNWAY - col;
    const roll = Math.random();
    if (!lastFeatureWasGap && roll < 0.28 && remaining > 8) {
      // step up or down one tile, then a short flat landing
      const dir = Math.random() < 0.5 ? -1 : 1;
      row = clamp(row + dir, ROW_MIN, ROW_MAX);
      const runLen = randInt(3, 5);
      for (let i = 0; i < runLen && col < LEVEL_COLS; i++, col++) ground[col] = row;
      lastFeatureWasGap = false;
    } else if (!lastFeatureWasGap && roll < 0.52 && remaining > 8) {
      // a pit — same elevation on both sides
      const width = randInt(1, 3);
      for (let i = 0; i < width && col < LEVEL_COLS; i++, col++) ground[col] = null;
      lastFeatureWasGap = true;
    } else {
      const runLen = randInt(3, 7);
      // occasionally drop a floor spike partway through a flat run
      const spikeAt =
        runLen >= 4 && Math.random() < 0.35 ? col + randInt(2, runLen - 2) : -1;
      for (let i = 0; i < runLen && col < LEVEL_COLS; i++, col++) {
        ground[col] = row;
        if (col === spikeAt) spikes.add(col);
      }
      lastFeatureWasGap = false;

      if (runLen >= 4 && col - lastGuardCol > 7 && Math.random() < 0.6) {
        const from = col - runLen + 1;
        const to = col - 1;
        if (to - from >= 2) {
          guardSpawns.push({ fromCol: from, toCol: to, row });
          lastGuardCol = col;
        }
      }
    }
  }
  for (let i = col; i < LEVEL_COLS; i++) ground[i] = row;
  const gateCol = LEVEL_COLS - 2;
  // the captain patrols the guaranteed-flat runway right before the gate.
  const bossSpec = {
    fromCol: LEVEL_COLS - END_RUNWAY,
    toCol: gateCol - 1,
    row,
    isBoss: true,
  };
  return { ground, spikes, guardSpawns, gateCol, widthPx: LEVEL_COLS * TILE, bossSpec };
}

function topYAt(level, col) {
  if (col < 0 || col >= level.ground.length) return rowY(ROW_MAX) + TILE;
  const g = level.ground[col];
  return g == null ? Infinity : rowY(g);
}

// ---- DOM ----------------------------------------------------------------
const statusEl = document.getElementById("status");
const gameEl = document.getElementById("game");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const timeEl = document.getElementById("time");
const livesEl = document.getElementById("lives");
const progressFill = document.getElementById("progress-fill");
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const startOverlay = document.getElementById("start-overlay");
const startCopy = document.getElementById("start-copy");
const startBtn = document.getElementById("start-btn");
const overOverlay = document.getElementById("over-overlay");
const overTitle = document.getElementById("over-title");
const overCopy = document.getElementById("over-copy");
const againBtn = document.getElementById("again-btn");
const shareBtn = document.getElementById("share-btn");
const cardBtn = document.getElementById("card-btn");
const shareCanvas = document.getElementById("share-canvas");
const muteBtn = document.getElementById("mute-btn");

const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = CANVAS_W * dpr;
canvas.height = CANVAS_H * dpr;
canvas.style.aspectRatio = `${CANVAS_W} / ${CANVAS_H}`;

// ---- state ----------------------------------------------------------------
let roster = []; // full guard pool from cluster.js
let rosterIdx = 0;
let captainEntry = null; // GUARD_ACTOR's own profile — the boss's face
let level = null;
let guards = []; // active guard instances
let bossGuard = null; // the captain, also present in `guards`
let gateBlockedCooldown = 0; // throttles the "captain blocks the way" nudge
let player = null;
let particles = [];
let running = false;
let score = 0;
let lives = MAX_LIVES;
let timeLeft = GAME_SECONDS;
let elapsed = 0;
let rafId = null;
let lastT = 0;
let camX = 0;
let peckCooldown = 0;
let peckTimer = 0; // >0 while the hitbox is live
let invuln = 0;
let checkpoint = null;
let outcome = null; // "won" | "dead" | "time"

function setStatus(msg, isError) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}

// ---- audio --------------------------------------------------------------
// Tiny procedural SFX — no asset files, just oscillators + noise bursts
// gated by a mute toggle. AudioContext is created lazily on first user
// gesture (mobile browsers refuse to start it any earlier).
let actx = null;
let masterGain = null;
let muted = false;
try {
  muted = localStorage.getItem("crowofpersia:muted") === "1";
} catch {}

function ensureAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!actx) {
    actx = new AC();
    masterGain = actx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(actx.destination);
  } else if (actx.state === "suspended") {
    actx.resume();
  }
}

function setMuted(v) {
  muted = v;
  try {
    localStorage.setItem("crowofpersia:muted", muted ? "1" : "0");
  } catch {}
  if (muteBtn) {
    muteBtn.textContent = muted ? "\u{1F507}" : "\u{1F50A}";
    muteBtn.setAttribute("aria-pressed", String(muted));
  }
}
if (muteBtn) {
  setMuted(muted);
  muteBtn.addEventListener("click", () => {
    ensureAudio();
    setMuted(!muted);
  });
}

function tone({ type = "sine", f0, f1 = f0, dur = 0.12, peak = 0.4, delay = 0 }) {
  if (!actx || muted) return;
  const t0 = actx.currentTime + delay;
  const o = actx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(masterGain);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noiseBurst(dur = 0.15, peak = 0.35) {
  if (!actx || muted) return;
  const t0 = actx.currentTime;
  const n = Math.max(1, Math.floor(actx.sampleRate * dur));
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = actx.createBufferSource();
  src.buffer = buf;
  const g = actx.createGain();
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(g);
  g.connect(masterGain);
  src.start(t0);
}

function sndJump() {
  tone({ type: "triangle", f0: 420, f1: 680, dur: 0.11, peak: 0.3 });
}
function sndPeck() {
  tone({ type: "square", f0: 900, f1: 300, dur: 0.06, peak: 0.28 });
}
function sndGuardDown() {
  tone({ type: "sawtooth", f0: 220, f1: 80, dur: 0.18, peak: 0.35 });
  noiseBurst(0.08, 0.22);
}
function sndBossHit() {
  tone({ type: "square", f0: 160, f1: 90, dur: 0.22, peak: 0.4 });
  noiseBurst(0.12, 0.28);
}
function sndBossDown() {
  [0, 0.09, 0.18].forEach((delay, i) =>
    tone({ type: "sawtooth", f0: 180 + i * 140, dur: 0.22, peak: 0.38, delay }),
  );
}
function sndAlert() {
  tone({ type: "square", f0: 720, dur: 0.08, peak: 0.22 });
}
function sndHurt() {
  tone({ type: "sawtooth", f0: 180, f1: 60, dur: 0.25, peak: 0.4 });
  noiseBurst(0.15, 0.28);
}
function sndWin() {
  [0, 0.12, 0.24, 0.38].forEach((delay, i) =>
    tone({ type: "triangle", f0: 392 * Math.pow(2, (i * 4) / 12), dur: 0.24, peak: 0.36, delay }),
  );
}
function sndTimeUp() {
  tone({ type: "sine", f0: 300, f1: 120, dur: 0.5, peak: 0.35 });
}
function sndDead() {
  tone({ type: "sawtooth", f0: 140, f1: 40, dur: 0.55, peak: 0.4 });
}

function bestKey(kind) {
  return `crowofpersia:best:${kind}`;
}
function getBestScore() {
  return parseInt(localStorage.getItem(bestKey("score")) || "0", 10) || 0;
}
function setBestScore(v) {
  try {
    localStorage.setItem(bestKey("score"), String(v));
  } catch {}
}
function getBestTime() {
  const v = parseFloat(localStorage.getItem(bestKey("time")) || "");
  return Number.isFinite(v) ? v : null;
}
function setBestTime(v) {
  try {
    localStorage.setItem(bestKey("time"), String(v));
  } catch {}
}

function nextRosterEntry() {
  if (!roster.length) return null;
  const g = roster[rosterIdx % roster.length];
  rosterIdx++;
  return g;
}

function spawnGuardAt(spec) {
  const isBoss = !!spec.isBoss;
  const entry = isBoss ? captainEntry : nextRosterEntry();
  const startCol = randInt(spec.fromCol, spec.toCol);
  return {
    spec,
    entry,
    img: entry ? loadImg(entry.avatar) : null,
    hue: entry ? hue(entry.did) : hue(String(spec.fromCol)),
    initial: ((entry && (entry.displayName || entry.handle)) || (isBoss ? "C" : "?"))[0].toUpperCase(),
    x: startCol * TILE + TILE / 2,
    row: spec.row,
    dir: Math.random() < 0.5 ? -1 : 1,
    speed: isBoss ? rand(60, 72) : rand(50, 95),
    hw: isBoss ? GUARD_HW * BOSS_SCALE : GUARD_HW,
    hp: isBoss ? BOSS_HP : 1,
    maxHp: isBoss ? BOSS_HP : 1,
    state: "patrol", // "patrol" | "alert" | "chase"
    alertT: 0,
    flash: 0,
    alive: true,
    respawnIn: 0,
    facing: 1,
  };
}

function buildGuards() {
  guards = level.guardSpawns.slice(0, MAX_ACTIVE_GUARDS).map(spawnGuardAt);
  bossGuard = spawnGuardAt(level.bossSpec);
  guards.push(bossGuard);
}

// ---- player / physics -----------------------------------------------------
function makePlayer() {
  return {
    x: START_RUNWAY * TILE * 0.5,
    y: rowY(2),
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
  };
}

function colOf(x) {
  return Math.floor(x / TILE);
}

const keys = { left: false, right: false };

function updatePlayer(dt) {
  const moveDir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (moveDir) player.facing = moveDir;
  player.vx = moveDir * RUN_SPEED;

  // --- horizontal move + wall collision ---
  const newX = player.x + player.vx * dt;
  const dir = Math.sign(newX - player.x);
  if (dir !== 0) {
    const feetY = player.y;
    const leadEdge = dir > 0 ? newX + PLAYER_HW : newX - PLAYER_HW;
    const col = colOf(leadEdge);
    const wallTop = topYAt(level, col);
    if (wallTop < feetY - 2) {
      // solid wall in this column — clamp to its edge
      const edge = dir > 0 ? col * TILE - PLAYER_HW : (col + 1) * TILE + PLAYER_HW;
      player.x = edge;
    } else {
      player.x = newX;
    }
  }
  player.x = clamp(player.x, PLAYER_HW, level.widthPx - PLAYER_HW);

  // --- vertical move + ground collision ---
  player.vy += GRAVITY * dt;
  const newY = player.y + player.vy * dt;
  const spanCols = [colOf(player.x - PLAYER_HW * 0.6), colOf(player.x + PLAYER_HW * 0.6)];
  let groundY = Infinity;
  for (const c of spanCols) groundY = Math.min(groundY, topYAt(level, c));

  if (player.vy >= 0 && newY >= groundY) {
    player.y = groundY;
    player.vy = 0;
    player.grounded = true;
  } else {
    player.y = newY;
    player.grounded = false;
  }

  if (player.grounded && player.y < PIT_DEATH_Y) {
    const c = colOf(player.x);
    if (level.spikes.has(c) && invuln <= 0) hurtPlayer();
    else checkpoint = { x: player.x, y: player.y };
  }

  if (player.y > PIT_DEATH_Y) {
    fellIn();
  }
}

function tryJump() {
  ensureAudio();
  if (player.grounded) {
    player.vy = JUMP_V;
    player.grounded = false;
    sndJump();
  }
}

let peckHitGuards = new Set(); // guards already hit by the current swing — a
// multi-hp guard (the captain) must not lose more than one hit per peck,
// even though the hitbox stays live across several frames.

function tryPeck() {
  ensureAudio();
  if (peckCooldown > 0) return;
  peckCooldown = PECK_COOLDOWN;
  peckTimer = PECK_ACTIVE;
  peckHitGuards.clear();
  sndPeck();
}

function resolvePeckHits() {
  if (peckTimer <= 0) return;
  const reachX = player.x + player.facing * PECK_REACH;
  const lo = Math.min(player.x, reachX) - 6;
  const hi = Math.max(player.x, reachX) + 6;
  for (const g of guards) {
    if (!g.alive || peckHitGuards.has(g)) continue;
    if (g.x + g.hw < lo || g.x - g.hw > hi) continue;
    if (Math.abs(g.row - Math.round((player.y - GROUND_BASE_Y) / TILE)) > 0) continue;
    peckHitGuards.add(g);
    downGuard(g);
  }
}

function downGuard(g) {
  const isBoss = !!g.spec.isBoss;
  g.hp--;
  if (isBoss && g.hp > 0) {
    g.flash = 0.25;
    sndBossHit();
    addParticle(`the captain staggers! (${g.hp} hit${g.hp === 1 ? "" : "s"} left)`, g.x, rowY(g.row) - 30, "#ffd166");
    return;
  }
  g.alive = false;
  g.respawnIn = GUARD_RESPAWN_DELAY;
  score++;
  scoreEl.textContent = String(score);
  if (isBoss) {
    sndBossDown();
    addParticle("the captain falls — the gate is open!", g.x, rowY(g.row) - 30, "#ffd166");
  } else {
    sndGuardDown();
    addParticle(`+1 pecked @${(g.entry && g.entry.handle) || "guard"}`, g.x, rowY(g.row) - 24, "#ffd166");
  }
}

function hurtPlayer() {
  invuln = INVULN_TIME;
  lives--;
  updateLivesHud();
  sndHurt();
  addParticle("ouch!", player.x, player.y - 30, "#ff6b6b");
  if (lives <= 0) {
    endGame("dead");
    return;
  }
  respawnAtCheckpoint();
}

function fellIn() {
  if (invuln > 0) return;
  invuln = INVULN_TIME;
  lives--;
  updateLivesHud();
  sndHurt();
  addParticle("into the pit!", checkpoint ? checkpoint.x : player.x, CANVAS_H - 40, "#ff6b6b");
  if (lives <= 0) {
    endGame("dead");
    return;
  }
  respawnAtCheckpoint();
}

function respawnAtCheckpoint() {
  const cp = checkpoint || { x: START_RUNWAY * TILE * 0.5, y: rowY(2) };
  player.x = cp.x;
  player.y = cp.y;
  player.vx = 0;
  player.vy = 0;
}

function updateLivesHud() {
  livesEl.textContent = "\u{1F426}".repeat(Math.max(0, lives));
}

function updateGuards(dt) {
  const playerRow = Math.round((player.y - GROUND_BASE_Y) / TILE);
  for (const g of guards) {
    if (!g.alive) {
      if (g.spec.isBoss) continue; // the captain stays down once beaten
      g.respawnIn -= dt;
      if (g.respawnIn <= 0 && Math.abs(g.x - player.x) > TILE * 3) {
        Object.assign(g, spawnGuardAt(g.spec));
      }
      continue;
    }

    if (g.flash > 0) g.flash -= dt;

    const sameRow = g.row === playerRow;
    const dist = Math.abs(g.x - player.x);

    if (g.state === "patrol" && sameRow && dist < ALERT_RANGE) {
      g.state = "alert";
      g.alertT = ALERT_DELAY;
      g.dir = Math.sign(player.x - g.x) || g.dir;
      sndAlert();
      addParticle("!", g.x, rowY(g.row) - 46, "#ffd166");
    } else if (g.state === "alert") {
      g.alertT -= dt;
      if (g.alertT <= 0) g.state = "chase";
    } else if (g.state === "chase" && (!sameRow || dist > LOSE_RANGE)) {
      g.state = "patrol";
    }

    const lo = g.spec.fromCol * TILE + g.hw + 4;
    const hi = (g.spec.toCol + 1) * TILE - g.hw - 4;

    if (g.state === "chase") {
      g.dir = Math.sign(player.x - g.x) || g.dir;
      g.x = clamp(g.x + g.dir * g.speed * CHASE_MULT * dt, lo, hi);
    } else if (g.state === "patrol") {
      g.x += g.dir * g.speed * dt;
      if (g.x <= lo) {
        g.x = lo;
        g.dir = 1;
      } else if (g.x >= hi) {
        g.x = hi;
        g.dir = -1;
      }
    }
    // "alert" state: frozen mid-lunge, facing already set toward the player
    g.facing = g.dir;

    // contact damage
    if (invuln <= 0) {
      const dx = Math.abs(g.x - player.x);
      if (sameRow && dx < (g.hw + PLAYER_HW) * 0.85) hurtPlayer();
    }
  }
}

function addParticle(text, x, y, color) {
  particles.push({ text, x, y, life: 1, color: color || "#eaf2fb" });
}

// ---- rendering --------------------------------------------------------
function drawBrickCol(x, topY) {
  ctx.fillStyle = "#2a2016";
  ctx.fillRect(x, topY, TILE, CANVAS_H - topY + TILE);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  for (let y = topY; y < CANVAS_H + TILE; y += TILE / 2) {
    const offset = ((y - topY) / (TILE / 2)) % 2 === 0 ? 0 : TILE / 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + TILE, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + offset, y + TILE / 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#c9a15c";
  ctx.fillRect(x, topY, TILE, 6);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x, topY + 6, TILE, 3);
}

function drawPitSpikes(x) {
  ctx.fillStyle = "#0a0c14";
  ctx.fillRect(x, 0, TILE, CANVAS_H);
  ctx.fillStyle = "#7a8494";
  for (let i = 0; i < 3; i++) {
    const sx = x + 6 + i * 12;
    ctx.beginPath();
    ctx.moveTo(sx, CANVAS_H);
    ctx.lineTo(sx + 6, CANVAS_H - 18);
    ctx.lineTo(sx + 12, CANVAS_H);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSpikeTile(x, y) {
  ctx.fillStyle = "#c7cdd6";
  for (let i = 0; i < 4; i++) {
    const sx = x + 3 + i * 9;
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx + 4.5, y - 14);
    ctx.lineTo(sx + 9, y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawTorch(x, y, t) {
  ctx.fillStyle = "#3a2a1a";
  ctx.fillRect(x - 2, y, 4, 14);
  const flick = 0.7 + Math.sin(t * 9 + x) * 0.3;
  const grad = ctx.createRadialGradient(x, y - 6, 0, x, y - 6, 14 * flick);
  grad.addColorStop(0, "rgba(255,200,90,0.9)");
  grad.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y - 6, 14 * flick, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,${180 + Math.floor(30 * flick)},80,0.95)`;
  ctx.beginPath();
  ctx.ellipse(x, y - 6, 3, 6 * flick, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawGate(x, t, open) {
  ctx.fillStyle = "#5a4326";
  ctx.fillRect(x - 4, 0, TILE + 8, CANVAS_H);
  const bob = Math.sin(t * 1.4) * 2;
  ctx.fillStyle = open ? "#d4af37" : "#8a3a3a";
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(x + 4 + i * 6, bob, 3, CANVAS_H);
  }
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x - 4, 0, TILE + 8, 10);
  if (!open) {
    ctx.fillStyle = "rgba(122,44,44,0.3)";
    ctx.fillRect(x - 4, 0, TILE + 8, CANVAS_H);
  }
}

function drawCrow(x, y, facing, grounded, vy, hitFlash) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  const bob = grounded && Math.abs(player.vx) > 5 ? Math.sin(performance.now() / 90) * 2.5 : 0;
  ctx.translate(0, bob);
  if (hitFlash) ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 40);

  // wing
  const wingFlap = grounded ? Math.sin(performance.now() / 110) * 6 : clamp(-vy / 60, -14, 14);
  ctx.fillStyle = "#14161c";
  ctx.beginPath();
  ctx.moveTo(-2, -20);
  ctx.quadraticCurveTo(-16, -20 + wingFlap, -14, -4);
  ctx.quadraticCurveTo(-8, -8, -2, -8);
  ctx.closePath();
  ctx.fill();

  // body
  ctx.fillStyle = "#1c1f27";
  ctx.beginPath();
  ctx.ellipse(0, -14, 11, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  // head
  ctx.beginPath();
  ctx.arc(9, -26, 8, 0, Math.PI * 2);
  ctx.fill();
  // sheen
  ctx.fillStyle = "#343a4a";
  ctx.beginPath();
  ctx.ellipse(-3, -18, 5, 8, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // beak
  ctx.fillStyle = "#f2a93b";
  ctx.beginPath();
  ctx.moveTo(16, -27);
  ctx.lineTo(26, -25);
  ctx.lineTo(16, -22);
  ctx.closePath();
  ctx.fill();
  // eye
  ctx.fillStyle = "#ffe9b0";
  ctx.beginPath();
  ctx.arc(11, -28, 1.6, 0, Math.PI * 2);
  ctx.fill();
  // legs
  ctx.strokeStyle = "#e0a24a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-3, -1);
  ctx.lineTo(-3, 4);
  ctx.moveTo(4, -1);
  ctx.lineTo(4, 4);
  ctx.stroke();

  ctx.restore();

  if (peckTimer > 0) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, peckTimer / PECK_ACTIVE) * 0.8;
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + facing * 14, y - 27);
    ctx.lineTo(x + facing * (14 + PECK_REACH * 0.7), y - 27);
    ctx.stroke();
    ctx.restore();
  }
}

function drawGuard(g) {
  const x = g.x - camX;
  const y = rowY(g.row);
  if (x < -60 || x > CANVAS_W + 60) return;
  const isBoss = !!g.spec.isBoss;
  const S = isBoss ? BOSS_SCALE : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale((g.facing || 1) * S, S);
  if (g.flash > 0) ctx.globalAlpha = 0.4 + 0.6 * Math.sin(performance.now() / 30);

  // legs
  ctx.fillStyle = "#20324a";
  ctx.fillRect(-8, -14, 6, 14);
  ctx.fillRect(2, -14, 6, 14);
  // tunic
  ctx.fillStyle = isBoss ? "#7a2c2c" : "#2c4d7a";
  ctx.beginPath();
  ctx.moveTo(-10, -14);
  ctx.lineTo(10, -14);
  ctx.lineTo(8, -34);
  ctx.lineTo(-8, -34);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // belt
  ctx.fillStyle = "#d4af37";
  ctx.fillRect(-9, -18, 18, 3);
  // sword
  ctx.fillStyle = "#c7cdd6";
  ctx.fillRect(9, -30, 3, 20);
  ctx.fillStyle = "#8a6a2a";
  ctx.fillRect(6, -12, 9, 3);
  // turban
  ctx.fillStyle = "#e8ecf2";
  ctx.beginPath();
  ctx.ellipse(0, -37, 10, 7, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-9, -37, 18, 4);

  // face — avatar clipped into a circle, or a hue-fallback initial. Undo
  // the horizontal mirror first so a flipped guard's face still reads
  // upright (photos don't have a "facing" side).
  ctx.scale(g.facing || 1, 1);
  ctx.beginPath();
  ctx.arc(0, -37, 8, 0, Math.PI * 2);
  ctx.clip();
  if (imgReady(g.img)) {
    ctx.drawImage(g.img, -8, -45, 16, 16);
  } else {
    ctx.fillStyle = `hsl(${g.hue} 55% 42%)`;
    ctx.fillRect(-8, -45, 16, 16);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "9px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(g.initial, 0, -37);
  }
  ctx.restore();

  if (isBoss) {
    const pipW = 8;
    const gap = 3;
    const total = g.maxHp * pipW + (g.maxHp - 1) * gap;
    let px = x - total / 2;
    for (let i = 0; i < g.maxHp; i++) {
      ctx.fillStyle = i < g.hp ? "#ffd166" : "rgba(255,255,255,0.18)";
      ctx.fillRect(px, y - 62 * S, pipW, 4);
      px += pipW + gap;
    }
  }
}

function render(t) {
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // sky/backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  bg.addColorStop(0, "#120c08");
  bg.addColorStop(1, "#05040a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const firstCol = Math.floor(camX / TILE) - 1;
  const lastCol = firstCol + COLS_VISIBLE + 3;

  for (let c = Math.max(0, firstCol); c <= Math.min(level.ground.length - 1, lastCol); c++) {
    const x = c * TILE - camX;
    const g = level.ground[c];
    if (g == null) {
      drawPitSpikes(x);
      continue;
    }
    drawBrickCol(x, rowY(g));
    if (level.spikes.has(c)) drawSpikeTile(x, rowY(g));
    if (c % 5 === 2) drawTorch(x + TILE / 2, rowY(g) - TILE, t / 1000);
    if (c === level.gateCol) drawGate(x, t / 1000, !bossGuard || !bossGuard.alive);
  }

  for (const g of guards) if (g.alive) drawGuard(g);

  drawCrow(player.x - camX, player.y, player.facing, player.grounded, player.vy, invuln > 0);

  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x - camX, p.y);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ---- loop -----------------------------------------------------------------
function update(dt) {
  updatePlayer(dt);
  resolvePeckHits();
  updateGuards(dt);

  if (peckCooldown > 0) peckCooldown -= dt;
  if (peckTimer > 0) peckTimer -= dt;
  if (invuln > 0) invuln -= dt;

  for (const p of particles) {
    p.life -= dt * 0.7;
    p.y -= dt * 16;
  }
  particles = particles.filter((p) => p.life > 0);

  camX = clamp(player.x - CANVAS_W * 0.35, 0, level.widthPx - CANVAS_W);
  progressFill.style.width = `${clamp((player.x / level.widthPx) * 100, 0, 100)}%`;

  elapsed += dt;
  timeLeft -= dt;
  timeEl.textContent = String(Math.max(0, Math.ceil(timeLeft)));
  if (timeLeft <= 0) {
    endGame("time");
    return;
  }

  if (gateBlockedCooldown > 0) gateBlockedCooldown -= dt;
  if (player.x >= level.gateCol * TILE) {
    if (!bossGuard || !bossGuard.alive) {
      endGame("won");
      return;
    }
    if (gateBlockedCooldown <= 0) {
      addParticle("the captain blocks the way!", bossGuard.x, rowY(bossGuard.row) - 50, "#ff8b7f");
      gateBlockedCooldown = 2.5;
    }
  }
}

function loop(t) {
  if (!running) return;
  const dt = Math.min((t - lastT) / 1000, 0.05) || 0;
  lastT = t;
  update(dt);
  render(t);
  rafId = requestAnimationFrame(loop);
}

function endGame(kind) {
  running = false;
  outcome = kind;
  if (rafId) cancelAnimationFrame(rafId);

  const best = getBestScore();
  const newBestScore = score > best;
  if (newBestScore) setBestScore(score);

  let newBestTime = false;
  if (kind === "won") {
    const bt = getBestTime();
    newBestTime = bt == null || elapsed < bt;
    if (newBestTime) setBestTime(elapsed);
  }
  bestEl.textContent = String(newBestScore ? score : best);

  if (kind === "won") {
    sndWin();
    overTitle.textContent = "escaped!";
    overCopy.textContent = newBestTime
      ? `out the gate in ${elapsed.toFixed(1)}s, ${score} guards pecked, the captain put down — new best time.`
      : `out the gate in ${elapsed.toFixed(1)}s, ${score} guards pecked, the captain put down.`;
  } else if (kind === "dead") {
    sndDead();
    overTitle.textContent = "caught.";
    overCopy.textContent = `the guards got you. ${score} pecked before you went down.`;
  } else {
    sndTimeUp();
    overTitle.textContent = "time's up.";
    overCopy.textContent = `the dungeon clock ran out. ${score} guards pecked.`;
  }
  overOverlay.classList.remove("hidden");
}

function resetLevel() {
  level = buildLevel();
  buildGuards();
  player = makePlayer();
  checkpoint = { x: player.x, y: player.y };
  particles = [];
  score = 0;
  lives = MAX_LIVES;
  timeLeft = GAME_SECONDS;
  elapsed = 0;
  invuln = 0;
  peckCooldown = 0;
  peckTimer = 0;
  camX = 0;
  gateBlockedCooldown = 0;
  outcome = null;
  scoreEl.textContent = "0";
  timeEl.textContent = String(GAME_SECONDS);
  updateLivesHud();
  progressFill.style.width = "0%";
}

function startGame() {
  ensureAudio();
  resetLevel();
  startOverlay.classList.add("hidden");
  overOverlay.classList.add("hidden");
  running = true;
  lastT = performance.now();
  rafId = requestAnimationFrame(loop);
}

startBtn.addEventListener("click", startGame);
againBtn.addEventListener("click", startGame);

// the shareText itself must carry the URL back to the site — not just the
// page's og:description — so a screenshot or quote-post of the shared text
// still points somewhere (see notes/45-sharing-and-virality.md).
function buildShareText() {
  const line =
    outcome === "won"
      ? `I escaped the crowofpersia dungeon in ${elapsed.toFixed(1)}s, pecking ${score} guards drawn from @${GUARD_ACTOR}'s follows. \u{1F426}⚔️`
      : `I made it ${Math.round((player ? player.x : 0) / TILE)} tiles into the crowofpersia dungeon and pecked ${score} guards before the run ended.`;
  return `${line} ${SITE_URL}`;
}

shareBtn.addEventListener("click", () => {
  const intent = `https://bsky.app/intent/compose?text=${encodeURIComponent(buildShareText())}`;
  window.open(intent, "_blank", "noopener");
});

// ---- share card ---------------------------------------------------------
// A canvas-drawn "screenshot" of the run — dungeon backdrop, the crow, the
// captain's real face if you beat them, and the run's stats — so sharing
// hands off an actual image instead of a bare link. Drawn fresh, not reused
// from the live game canvas (that context is tangled up with camera/physics
// state); needs `crossOrigin` on any avatar so the canvas stays exportable.
function loadImgCORS(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function cardTorch(c, x, y) {
  c.fillStyle = "#3a2a1a";
  c.fillRect(x - 3, y, 6, 22);
  const grad = c.createRadialGradient(x, y - 10, 0, x, y - 10, 34);
  grad.addColorStop(0, "rgba(255,200,90,0.55)");
  grad.addColorStop(1, "rgba(255,120,40,0)");
  c.fillStyle = grad;
  c.beginPath();
  c.arc(x, y - 10, 34, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#ffb347";
  c.beginPath();
  c.ellipse(x, y - 12, 5, 11, 0, 0, Math.PI * 2);
  c.fill();
}

function cardCrow(c, x, y) {
  c.save();
  c.translate(x, y);
  c.fillStyle = "#14161c";
  c.beginPath();
  c.moveTo(-4, -46);
  c.quadraticCurveTo(-34, -40, -30, -8);
  c.quadraticCurveTo(-18, -16, -4, -18);
  c.closePath();
  c.fill();
  c.fillStyle = "#1c1f27";
  c.beginPath();
  c.ellipse(0, -32, 24, 30, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(20, -58, 17, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#f2a93b";
  c.beginPath();
  c.moveTo(34, -60);
  c.lineTo(62, -55);
  c.lineTo(34, -49);
  c.closePath();
  c.fill();
  c.fillStyle = "#ffe9b0";
  c.beginPath();
  c.arc(25, -62, 3.4, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#e0a24a";
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(-6, -2);
  c.lineTo(-6, 10);
  c.moveTo(8, -2);
  c.lineTo(8, 10);
  c.stroke();
  c.restore();
}

async function buildShareCard(kind) {
  if (!shareCanvas) return;
  const c = shareCanvas.getContext("2d");
  const W = shareCanvas.width;
  const H = shareCanvas.height;
  const mono = "ui-monospace, monospace";

  c.clearRect(0, 0, W, H);
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#120c08");
  bg.addColorStop(1, "#05040a");
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);

  // brick rows
  c.fillStyle = "#2a2016";
  c.fillRect(0, 0, W, H * 0.62);
  c.strokeStyle = "rgba(0,0,0,0.35)";
  for (let y = 0; y < H * 0.62; y += 44) {
    const offset = ((y / 44) | 0) % 2 === 0 ? 0 : 60;
    for (let x = -60 + offset; x < W + 120; x += 120) {
      c.strokeRect(x, y, 116, 40);
    }
  }
  c.fillStyle = "#0a0603";
  c.fillRect(0, H * 0.62, W, H * 0.38);
  c.fillStyle = "rgba(201,161,92,0.8)";
  c.fillRect(0, H * 0.62 - 4, W, 5);

  cardTorch(c, 150, 210);
  cardTorch(c, 1050, 210);

  const vign = c.createLinearGradient(0, 0, 0, H);
  vign.addColorStop(0, "rgba(0,0,0,0.5)");
  vign.addColorStop(0.35, "rgba(0,0,0,0.05)");
  vign.addColorStop(0.75, "rgba(0,0,0,0.05)");
  vign.addColorStop(1, "rgba(0,0,0,0.55)");
  c.fillStyle = vign;
  c.fillRect(0, 0, W, H);

  cardCrow(c, 560, 500);

  // captain's face, if beaten — the one live, personal touch on the card
  if (kind === "won" && captainEntry && captainEntry.avatar) {
    const avatar = await loadImgCORS(captainEntry.avatar);
    if (avatar) {
      c.save();
      c.beginPath();
      c.arc(700, 466, 30, 0, Math.PI * 2);
      c.closePath();
      c.clip();
      c.drawImage(avatar, 670, 436, 60, 60);
      c.restore();
      c.strokeStyle = "#d4af37";
      c.lineWidth = 3;
      c.beginPath();
      c.arc(700, 466, 30, 0, Math.PI * 2);
      c.stroke();
    }
  }

  c.textAlign = "left";
  c.fillStyle = "#f2e9d8";
  c.font = `800 60px ${mono}`;
  c.fillText("crow", 60, 110);
  c.fillStyle = "#d4af37";
  c.fillText("ofpersia", 60 + c.measureText("crow").width, 110);

  const headline =
    kind === "won" ? "escaped the dungeon!" : kind === "dead" ? "caught by the guards." : "the clock ran out.";
  c.fillStyle = "#a3937a";
  c.font = `400 21px ${mono}`;
  c.fillText(headline, 60, 150);

  // stats plate
  const px = 60, py = H - 150, pw = 620, ph = 90;
  c.fillStyle = "rgba(10,6,3,0.72)";
  c.beginPath();
  c.roundRect(px, py, pw, ph, 14);
  c.fill();
  c.strokeStyle = "#33261a";
  c.lineWidth = 1.5;
  c.stroke();

  c.fillStyle = "#ffd166";
  c.font = `700 30px ${mono}`;
  c.fillText(`${score} pecked`, px + 24, py + 38);
  if (kind === "won") {
    c.fillText(`${elapsed.toFixed(1)}s`, px + 24, py + 74);
  } else {
    c.fillStyle = "#f2e9d8";
    c.font = `400 18px ${mono}`;
    c.fillText(`${Math.round((player ? player.x : 0) / TILE)} tiles in`, px + 24, py + 70);
  }

  c.textAlign = "left";
  c.fillStyle = "#a3937a";
  c.font = `400 16px ${mono}`;
  c.fillText(`guards wear @${GUARD_ACTOR}'s real follows`, 60, H - 40);
  c.textAlign = "right";
  c.fillStyle = "#d4af37";
  c.font = `700 20px ${mono}`;
  c.fillText("bisks.net/games/crowofpersia", W - 60, H - 40);
}

// native share sheet (mobile mostly): hands the card image + text straight
// to whatever the OS offers. Falls back to a plain download when the
// platform can't share files (most desktop browsers).
function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}
if (cardBtn) cardBtn.textContent = canShareFiles() ? "share card" : "save card";

if (cardBtn) {
  cardBtn.addEventListener("click", () => {
    buildShareCard(outcome).then(() => {
      shareCanvas.toBlob(async (blob) => {
        if (!blob) return;
        if (canShareFiles()) {
          const file = new File([blob], "crowofpersia.png", { type: "image/png" });
          try {
            await navigator.share({ files: [file], text: buildShareText(), title: "crowofpersia" });
          } catch {
            // cancelled or unsupported mid-flight — no-op
          }
        } else {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "crowofpersia.png";
          a.click();
          URL.revokeObjectURL(a.href);
        }
      }, "image/png");
    });
  });
}

// ---- input ------------------------------------------------------------
const KEY_LEFT = new Set(["ArrowLeft", "a", "A"]);
const KEY_RIGHT = new Set(["ArrowRight", "d", "D"]);
const KEY_JUMP = new Set(["ArrowUp", "w", "W", " "]);
const KEY_PECK = new Set(["ArrowDown", "s", "S", "j", "J", "x", "X"]);

window.addEventListener("keydown", (e) => {
  if (!running) return;
  if (KEY_LEFT.has(e.key)) {
    keys.left = true;
    e.preventDefault();
  } else if (KEY_RIGHT.has(e.key)) {
    keys.right = true;
    e.preventDefault();
  } else if (KEY_JUMP.has(e.key)) {
    tryJump();
    e.preventDefault();
  } else if (KEY_PECK.has(e.key)) {
    tryPeck();
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  if (KEY_LEFT.has(e.key)) keys.left = false;
  else if (KEY_RIGHT.has(e.key)) keys.right = false;
});

function bindHold(id, onDown, onUp) {
  const el = document.getElementById(id);
  if (!el) return;
  const down = (ev) => {
    ev.preventDefault();
    onDown();
  };
  const up = (ev) => {
    ev.preventDefault();
    if (onUp) onUp();
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointerleave", up);
  el.addEventListener("pointercancel", up);
}
bindHold(
  "t-left",
  () => (keys.left = true),
  () => (keys.left = false),
);
bindHold(
  "t-right",
  () => (keys.right = true),
  () => (keys.right = false),
);
bindHold("t-jump", () => tryJump());
bindHold("t-peck", () => tryPeck());

// ---- boot ----------------------------------------------------------------
async function boot() {
  setStatus(`loading @${GUARD_ACTOR}'s dungeon roster…`);
  try {
    const r = await loadGuardRoster({ onStep: (s) => setStatus(s) });
    roster = r.guards.sort(() => Math.random() - 0.5);
    captainEntry = r.captain;
  } catch (e) {
    roster = [];
    setStatus(`couldn't load guard faces (${e.message}) — playing with placeholders.`, true);
  }
  gameEl.hidden = false;
  resetLevel();
  render(performance.now());
  bestEl.textContent = String(getBestScore());
  startCopy.textContent = roster.length
    ? `${roster.length} of @${GUARD_ACTOR}'s follows stand guard — get close and they'll notice you. @${GUARD_ACTOR} themself blocks the gate as the captain; two pecks puts them down.`
    : `couldn't load @${GUARD_ACTOR}'s follows — the guards go faceless this run.`;
  setStatus("");
  startOverlay.classList.remove("hidden");
}

boot();
