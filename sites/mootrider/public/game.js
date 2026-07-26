// game.js — mootrider. Fetches happen in lib/cluster.js (copied from
// pacmoot, itself from mootdrone/clustercrawl/simcluster — copy, don't
// abstract). This file is the endless hill, the one-button jump, the
// moot-rock hazards, the top-chicken bonus, and the canvas rendering.

import { moots, getProfiles } from "./lib/cluster.js";

// ---- view / world -----------------------------------------------------
const VIEW_W = 640;
const VIEW_H = 360;
const PLAYER_SCREEN_X = VIEW_W * 0.3;
const GROUND_BASE = VIEW_H * 0.6;

const BASE_SCROLL = 175; // world px/sec
const MAX_SCROLL_BONUS = 95;
const RAMP_PER_PX = 0.012; // scroll speeds up slowly as you travel
const GRAVITY = 1500;
const JUMP_V = 500;

const PLAYER_R = 16;
const ROCK_R = 15;
const CHICK_R = 13;
const HIT_SLOP = 3; // a little forgiveness on collisions

const ROCK_GAP = [300, 480];
const CHICK_GAP = [560, 950];
// The hill steepens the longer a run goes: rocks pack tighter, the bonus
// chicken gets rarer. Ramps linearly from the values above to these over
// DIFFICULTY_DIST world-px (~900m), then holds — "slowly increasing", not
// a wall.
const ROCK_GAP_HARD = [175, 300];
const CHICK_GAP_HARD = [700, 1300];
const DIFFICULTY_DIST = 9000;
const MAX_MOOTS = 10;

function hashInt(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function hue(str) {
  return hashInt(str) % 360;
}
function rand(lo, hi) {
  return lo + Math.random() * (hi - lo);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function difficultyT() {
  return Math.min(player.dist / DIFFICULTY_DIST, 1);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
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

// ---- terrain ------------------------------------------------------------
// Multi-octave sine hill, seeded from the loaded handle's DID so every
// rider gets their own personal slope.
let seedA = 0, seedB = 0, seedC = 0, farSeed = 0;
function seedTerrain(did) {
  const h = hashInt(did);
  seedA = (h % 1000) / 1000 * Math.PI * 2;
  seedB = ((h >> 3) % 1000) / 1000 * Math.PI * 2;
  seedC = ((h >> 7) % 1000) / 1000 * Math.PI * 2;
  farSeed = ((h >> 11) % 1000) / 1000 * Math.PI * 2;
}
function terrainY(x) {
  return (
    GROUND_BASE +
    Math.sin(x * 0.0032 + seedA) * 46 +
    Math.sin(x * 0.0091 + seedB) * 22 +
    Math.sin(x * 0.021 + seedC) * 10
  );
}
function farY(x) {
  return GROUND_BASE - 40 + Math.sin(x * 0.0018 + farSeed) * 30;
}
function slopeAngle(x) {
  const d = 6;
  return Math.atan2(terrainY(x + d) - terrainY(x - d), d * 2);
}

// ---- quips: simcluster case-file energy + cluckstonks top-chicken energy --
const WEAPONS = [
  "the sled",
  "a poorly-timed jump",
  "gravity",
  "a rogue avatar",
  "momentum",
  "an untimely nap",
  "the slope itself",
];
const TIPS = [
  "the chicken tried to warn you.",
  "simcluster's rival detectives are taking notes.",
  "the file stays open until you ride again.",
  "cluckstonks was short this hill the whole time.",
  "somewhere, a trigram judges your form.",
  "the case reopens the moment you press ride again.",
];
const CHICKEN_QUIPS = [
  "buy the dip.",
  "diversify into trigrams.",
  "the chicken has seen tomorrow's close.",
  "sell high, moot low.",
  "past feathers are not indicative of future gains.",
  "top chicken never misses.",
  "this is not financial advice, it's a chicken.",
];

// ---- DOM ------------------------------------------------------------------
const form = document.getElementById("load-form");
const input = document.getElementById("handle-input");
const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const gameEl = document.getElementById("game");
const boardMeta = document.getElementById("board-meta");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const distEl = document.getElementById("dist");
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const startOverlay = document.getElementById("start-overlay");
const startCopy = document.getElementById("start-copy");
const startBtn = document.getElementById("start-btn");
const overOverlay = document.getElementById("over-overlay");
const overNum = document.getElementById("over-num");
const overBody = document.getElementById("over-body");
const overTip = document.getElementById("over-tip");
const overRank = document.getElementById("over-rank");
const againBtn = document.getElementById("again-btn");
const shareBtn = document.getElementById("share-btn");
const shareNativeBtn = document.getElementById("share-native");
const jumpBtn = document.getElementById("t-jump");
const shareCanvas = document.getElementById("share-canvas");
const shareCtx = shareCanvas.getContext("2d");
const leaderboardList = document.getElementById("leaderboard-list");

const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = VIEW_W * dpr;
canvas.height = VIEW_H * dpr;
canvas.style.aspectRatio = `${VIEW_W} / ${VIEW_H}`;
ctx.scale(dpr, dpr);

// ---- state ------------------------------------------------------------
let cluster = null;
let playerImg = null, playerHue = 0, playerInitial = "?";
let mootPool = []; // { img, hue, initial, handle }
let player = null; // { dist, y, vy, grounded, angle }
let rocks = [];
let chickens = [];
let particles = [];
let running = false;
let score = 0;
let running_dist = 0;
let nextRockX = 0;
let nextChickX = 0;
let wantJump = false;
let rafId = null;
let lastT = 0;

function setStatus(msg, isError) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}
function bestKey(did) {
  return `mootrider:best:${did}`;
}
function filesKey(did) {
  return `mootrider:files:${did}`;
}
function getBest(did) {
  return parseInt(localStorage.getItem(bestKey(did)) || "0", 10) || 0;
}
function setBest(did, v) {
  try {
    localStorage.setItem(bestKey(did), String(v));
  } catch {}
}
function nextFileNum(did) {
  const n = (parseInt(localStorage.getItem(filesKey(did)) || "0", 10) || 0) + 1;
  try {
    localStorage.setItem(filesKey(did), String(n));
  } catch {}
  return n;
}

// ---- global leaderboard -------------------------------------------------
// The tiny server surface: a single Durable Object (src/index.ts) holding
// everyone's best run. localStorage best/file-count above stay per-browser
// flavor text; this is the actual public board.
function renderLeaderboard(list) {
  if (!list || !list.length) {
    leaderboardList.innerHTML = '<li class="empty">no case files yet — be the first name in the ledger.</li>';
    return;
  }
  leaderboardList.innerHTML = list
    .map((e, i) => {
      const mine = !!(cluster && e.did === cluster.did);
      const label = e.displayName || e.handle || "?";
      const avatar = e.avatar
        ? `<img src="${escapeHtml(e.avatar)}" alt="" loading="lazy" />`
        : `<span class="ph" style="background:hsl(${hue(e.did)} 55% 42%)">${escapeHtml(label[0]?.toUpperCase() || "?")}</span>`;
      const closedBy = e.culprit ? ` title="case closed by @${escapeHtml(e.culprit)}"` : "";
      return (
        `<li class="${mine ? "mine" : ""}"${closedBy}>` +
        `<span class="rank">#${i + 1}</span>` +
        `<span class="pfp">${avatar}</span>` +
        `<span class="name">@${escapeHtml(e.handle)}</span>` +
        `<span class="stat">${e.score} dodged</span>` +
        `<span class="stat muted">${e.meters}m</span>` +
        `</li>`
      );
    })
    .join("");
}

async function loadLeaderboard() {
  try {
    const r = await fetch("/api/leaderboard");
    if (!r.ok) return;
    const data = await r.json();
    renderLeaderboard(data.leaderboard);
  } catch {
    // no board yet / offline — leave whatever's already rendered
  }
}

async function submitScore({ score, meters, culprit }) {
  if (!cluster) return null;
  try {
    const r = await fetch("/api/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        did: cluster.did,
        handle: cluster.handle,
        displayName: (cluster.self && cluster.self.displayName) || cluster.handle,
        avatar: (cluster.self && cluster.self.avatar) || "",
        score,
        meters,
        culprit,
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    renderLeaderboard(data.leaderboard);
    return data;
  } catch {
    return null;
  }
}

function pickMoot() {
  return mootPool[Math.floor(Math.random() * mootPool.length)];
}

function spawnRock(x) {
  const m = pickMoot();
  rocks.push({
    x,
    y: terrainY(x),
    moot: m,
    passed: false,
  });
}
function spawnChicken(x) {
  chickens.push({
    x,
    baseY: terrainY(x) - 52,
    taken: false,
  });
}

function ensureSpawns() {
  const horizon = player.dist + VIEW_W + 260;
  const t = difficultyT();
  const rockGap = [lerp(ROCK_GAP[0], ROCK_GAP_HARD[0], t), lerp(ROCK_GAP[1], ROCK_GAP_HARD[1], t)];
  const chickGap = [lerp(CHICK_GAP[0], CHICK_GAP_HARD[0], t), lerp(CHICK_GAP[1], CHICK_GAP_HARD[1], t)];
  while (nextRockX < horizon) {
    spawnRock(nextRockX);
    nextRockX += rand(rockGap[0], rockGap[1]);
  }
  while (nextChickX < horizon) {
    spawnChicken(nextChickX);
    nextChickX += rand(chickGap[0], chickGap[1]);
  }
}

function addParticle(text, x, y, color) {
  particles.push({ text, x, y, life: 1, color: color || "#ffd166" });
}

function currentScroll() {
  return Math.min(BASE_SCROLL + running_dist * RAMP_PER_PX, BASE_SCROLL + MAX_SCROLL_BONUS);
}

function crash(moot) {
  running = false;
  cancelAnimationFrame(rafId);
  const handle = moot.handle;
  const did = cluster.did;
  const best = getBest(did);
  const newBest = score > best;
  if (newBest) setBest(did, score);
  bestEl.textContent = String(newBest ? score : best);

  overNum.textContent = String(nextFileNum(did));
  const weapon = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
  overBody.innerHTML =
    `you were done in by <b>@${handle}</b>, on the hillside, with <b>${weapon}</b>.` +
    (newBest ? " new best, for whatever that's worth to a closed case." : "");
  overTip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];

  const meters = Math.floor(running_dist / 10);
  const shareText =
    `rode ${meters}m down my own moots on mootrider before @${handle}'s pfp ` +
    `took me out. dodged ${score}. mootrider.bisks.net`;
  shareBtn.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

  overRank.textContent = "";
  overOverlay.classList.remove("hidden");

  buildShareCard({ handle, weapon, meters, score, newBest }).then(() => {
    lastShareText = shareText;
    if (canShareFiles()) shareNativeBtn.hidden = false;
  });

  submitScore({ score, meters, culprit: handle }).then((data) => {
    if (!data || !data.rank) return;
    overRank.textContent = data.personalBest
      ? `new personal best — #${data.rank} on the board.`
      : `rank #${data.rank} on the board — your best still stands above this one.`;
  });
}

// ---- share card -------------------------------------------------------
// A second, offscreen canvas snapshot of the actual run (real terrain seed,
// real avatars) for navigator.share/download — separate from #board so we
// can size it to OG proportions without touching the live game canvas.
let lastShareText = "";
const SHARE_W = 1200, SHARE_H = 630;
const SHARE_SCALE = SHARE_W / VIEW_W;

function loadImgCORS(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function buildShareCard({ handle, weapon, meters, score, newBest }) {
  const camX = player.dist - PLAYER_SCREEN_X;
  const sx = (wx) => (wx - camX) * SHARE_SCALE;
  const sy = (wy) => wy * SHARE_SCALE;

  // Re-fetch the player + culprit avatars CORS-safe so toBlob() isn't tainted
  // (the live game's <img>s were loaded without crossOrigin).
  const [pImg, mImg] = await Promise.all([
    loadImgCORS(playerImg && playerImg.src),
    loadImgCORS(mootPool.find((m) => m.handle === handle)?.img?.src),
  ]);

  shareCtx.clearRect(0, 0, SHARE_W, SHARE_H);
  const g = shareCtx.createLinearGradient(0, 0, 0, SHARE_H);
  g.addColorStop(0, "#1b1233");
  g.addColorStop(0.55, "#2c1a3f");
  g.addColorStop(1, "#3a2140");
  shareCtx.fillStyle = g;
  shareCtx.fillRect(0, 0, SHARE_W, SHARE_H);

  shareCtx.beginPath();
  shareCtx.moveTo(0, SHARE_H);
  for (let wx = camX; wx <= camX + VIEW_W; wx += 6) {
    shareCtx.lineTo(sx(wx), sy(terrainY(wx)));
  }
  shareCtx.lineTo(SHARE_W, SHARE_H);
  shareCtx.closePath();
  shareCtx.fillStyle = "#161022";
  shareCtx.fill();
  shareCtx.beginPath();
  let started = false;
  for (let wx = camX; wx <= camX + VIEW_W; wx += 6) {
    const px = sx(wx), py = sy(terrainY(wx));
    if (!started) { shareCtx.moveTo(px, py); started = true; }
    else shareCtx.lineTo(px, py);
  }
  shareCtx.strokeStyle = "#ffb454";
  shareCtx.lineWidth = 4;
  shareCtx.lineJoin = "round";
  shareCtx.stroke();

  drawAvatar(shareCtx, sx(player.dist), sy(player.y), PLAYER_R * SHARE_SCALE * 0.85, {
    img: pImg, hue: playerHue, initial: playerInitial, ring: "#ffd166",
  });
  drawAvatar(shareCtx, sx(player.dist) + 130, sy(player.y) - 40, ROCK_R * SHARE_SCALE * 0.85, {
    img: mImg, hue: hue(handle), initial: handle[0]?.toUpperCase() || "?", ring: "rgba(255,127,127,0.9)",
  });

  shareCtx.textAlign = "left";
  shareCtx.fillStyle = "#f1ece2";
  shareCtx.font = "700 44px ui-monospace, monospace";
  shareCtx.fillText(`@${cluster.handle}`, 56, 90);
  shareCtx.fillStyle = "#9089a3";
  shareCtx.font = "20px ui-monospace, monospace";
  shareCtx.fillText(
    `rode ${meters}m, dodged ${score} moots before @${handle} (${weapon}) closed the case`,
    56,
    128,
  );
  if (newBest) {
    shareCtx.fillStyle = "#ffb454";
    shareCtx.font = "700 18px ui-monospace, monospace";
    shareCtx.fillText("new best", 56, 156);
  }
  shareCtx.fillStyle = "#ffb454";
  shareCtx.font = "700 22px ui-monospace, monospace";
  shareCtx.textAlign = "right";
  shareCtx.fillText("mootrider.bisks.net", SHARE_W - 56, SHARE_H - 40);
}

function canShareFiles() {
  if (!navigator.canShare) return false;
  try {
    const probe = new File(["x"], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

shareNativeBtn.addEventListener("click", () => {
  shareCanvas.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], `mootrider-${cluster.handle}.png`, { type: "image/png" });
    try {
      await navigator.share({ files: [file], text: lastShareText, title: "mootrider" });
    } catch {}
  }, "image/png");
});

function tryJump() {
  if (!running || !player.grounded) return;
  player.vy = -JUMP_V;
  player.grounded = false;
}

function update(dt) {
  const scroll = currentScroll();
  player.dist += scroll * dt;
  running_dist = player.dist;

  const groundY = terrainY(player.dist);
  if (wantJump) {
    tryJump();
    wantJump = false;
  }
  if (player.grounded) {
    player.y = groundY;
    player.vy = 0;
  } else {
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y >= groundY) {
      player.y = groundY;
      player.vy = 0;
      player.grounded = true;
    }
  }
  player.angle = slopeAngle(player.dist);

  ensureSpawns();

  for (const r of rocks) {
    if (r.passed) continue;
    const dx = r.x - player.dist;
    const dy = r.y - player.y;
    if (Math.hypot(dx, dy) < PLAYER_R + ROCK_R - HIT_SLOP) {
      r.passed = true;
      crash(r.moot);
      return;
    }
    if (r.x < player.dist - PLAYER_R) {
      r.passed = true;
      score++;
      scoreEl.textContent = String(score);
      addParticle(`dodged @${r.moot.handle}`, PLAYER_SCREEN_X, player.y - 26, "#8affc1");
    }
  }
  rocks = rocks.filter((r) => r.x > player.dist - VIEW_W);

  for (const c of chickens) {
    if (c.taken) continue;
    const dx = c.x - player.dist;
    const dy = c.baseY - player.y;
    if (Math.hypot(dx, dy) < PLAYER_R + CHICK_R + 4) {
      c.taken = true;
      score += 5;
      scoreEl.textContent = String(score);
      const quip = CHICKEN_QUIPS[Math.floor(Math.random() * CHICKEN_QUIPS.length)];
      addParticle(`🐔 top chicken says: ${quip}`, PLAYER_SCREEN_X, player.y - 46, "#ffd166");
    }
  }
  chickens = chickens.filter((c) => c.x > player.dist - VIEW_W);

  for (const p of particles) {
    p.life -= dt * 0.55;
    p.y -= dt * 16;
  }
  particles = particles.filter((p) => p.life > 0);

  distEl.textContent = String(Math.floor(running_dist / 10));
}

// ---- rendering ------------------------------------------------------------
function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, "#1b1233");
  g.addColorStop(0.55, "#2c1a3f");
  g.addColorStop(1, "#3a2140");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawGraphPaper(camX) {
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  const step = 32;
  const offset = -((camX * 0.5) % step);
  for (let x = offset; x < VIEW_W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, VIEW_H);
    ctx.stroke();
  }
  for (let y = 0; y < VIEW_H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
  }
}

function drawFarHills(camX) {
  ctx.beginPath();
  ctx.moveTo(0, VIEW_H);
  for (let sx = 0; sx <= VIEW_W; sx += 8) {
    const wx = camX * 0.4 + sx;
    ctx.lineTo(sx, farY(wx));
  }
  ctx.lineTo(VIEW_W, VIEW_H);
  ctx.closePath();
  ctx.fillStyle = "rgba(120, 90, 160, 0.25)";
  ctx.fill();
}

function drawTerrain(camX) {
  ctx.beginPath();
  ctx.moveTo(0, VIEW_H);
  const pts = [];
  for (let sx = 0; sx <= VIEW_W; sx += 6) {
    const wx = camX + sx;
    pts.push([sx, terrainY(wx)]);
  }
  ctx.lineTo(pts[0][0], pts[0][1]);
  for (const [sx, sy] of pts) ctx.lineTo(sx, sy);
  ctx.lineTo(VIEW_W, VIEW_H);
  ctx.closePath();
  ctx.fillStyle = "#161022";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [sx, sy] of pts) ctx.lineTo(sx, sy);
  ctx.strokeStyle = "#ffb454";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawAvatar(ctx2, cx, cy, radius, opts) {
  ctx2.save();
  ctx2.beginPath();
  ctx2.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx2.clip();
  if (imgReady(opts.img)) {
    ctx2.drawImage(opts.img, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx2.fillStyle = `hsl(${opts.hue} 55% 42%)`;
    ctx2.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx2.fillStyle = "rgba(255,255,255,0.92)";
    ctx2.font = `${Math.round(radius)}px ui-monospace, monospace`;
    ctx2.textAlign = "center";
    ctx2.textBaseline = "middle";
    ctx2.fillText(opts.initial || "?", cx, cy + 1);
  }
  ctx2.restore();
  ctx2.beginPath();
  ctx2.arc(cx, cy, radius + 1.2, 0, Math.PI * 2);
  ctx2.strokeStyle = opts.ring || "rgba(255,255,255,0.2)";
  ctx2.lineWidth = 2;
  ctx2.stroke();
}

function drawRock(r, camX) {
  const sx = r.x - camX;
  if (sx < -30 || sx > VIEW_W + 30) return;
  drawAvatar(ctx, sx, r.y, ROCK_R, {
    img: r.moot.img,
    hue: r.moot.hue,
    initial: r.moot.initial,
    ring: "rgba(255,127,127,0.85)",
  });
  ctx.fillStyle = "#ff7f7f";
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("!", sx, r.y - ROCK_R - 5);
}

function drawChicken(c, camX, t) {
  const sx = c.x - camX;
  if (c.taken || sx < -30 || sx > VIEW_W + 30) return;
  const sy = c.baseY + Math.sin(t * 3 + c.x) * 6;
  ctx.save();
  ctx.translate(sx, sy);
  // body
  ctx.fillStyle = "#f7f2e7";
  ctx.beginPath();
  ctx.ellipse(0, 0, CHICK_R, CHICK_R * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();
  // comb
  ctx.fillStyle = "#e0503f";
  ctx.beginPath();
  ctx.moveTo(-3, -CHICK_R * 0.8);
  ctx.lineTo(0, -CHICK_R * 1.25);
  ctx.lineTo(3, -CHICK_R * 0.8);
  ctx.fill();
  // beak
  ctx.fillStyle = "#ffb454";
  ctx.beginPath();
  ctx.moveTo(CHICK_R * 0.75, -2);
  ctx.lineTo(CHICK_R * 1.25, 1);
  ctx.lineTo(CHICK_R * 0.75, 4);
  ctx.fill();
  // eye
  ctx.fillStyle = "#1c1c1c";
  ctx.beginPath();
  ctx.arc(CHICK_R * 0.35, -3, 1.4, 0, Math.PI * 2);
  ctx.fill();
  // legs
  ctx.strokeStyle = "#ffb454";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-3, CHICK_R * 0.75);
  ctx.lineTo(-3, CHICK_R * 1.2);
  ctx.moveTo(3, CHICK_R * 0.75);
  ctx.lineTo(3, CHICK_R * 1.2);
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(sx, sy, CHICK_R + 6, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,209,102,0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawPlayer() {
  const sx = PLAYER_SCREEN_X;
  const sy = player.y;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(player.angle);
  // sled
  ctx.fillStyle = "#e0503f";
  ctx.beginPath();
  ctx.moveTo(-PLAYER_R * 1.3, PLAYER_R * 0.55);
  ctx.lineTo(PLAYER_R * 1.5, PLAYER_R * 0.55);
  ctx.lineTo(PLAYER_R * 1.1, PLAYER_R * 1.05);
  ctx.lineTo(-PLAYER_R * 1.0, PLAYER_R * 1.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  drawAvatar(ctx, sx, sy, PLAYER_R, {
    img: playerImg,
    hue: playerHue,
    initial: playerInitial,
    ring: "#ffd166",
  });
}

function render(t) {
  const camX = player.dist - PLAYER_SCREEN_X;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  drawSky();
  drawGraphPaper(camX);
  drawFarHills(camX);
  drawTerrain(camX);

  for (const r of rocks) drawRock(r, camX);
  for (const c of chickens) drawChicken(c, camX, t);
  drawPlayer();

  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
    ctx.globalAlpha = 1;
  }
}

function loop(t) {
  if (!running) return;
  const dt = Math.min((t - lastT) / 1000, 0.05) || 0;
  lastT = t;
  update(dt);
  if (running) render(t / 1000);
  rafId = requestAnimationFrame(loop);
}

// ---- input ------------------------------------------------------------
window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" && e.key !== " ") return;
  if (!running) return;
  e.preventDefault();
  wantJump = true;
});
canvas.addEventListener("pointerdown", (e) => {
  if (!running) return;
  e.preventDefault();
  wantJump = true;
});
jumpBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  wantJump = true;
});

// ---- start / load -------------------------------------------------------
function startGame() {
  score = 0;
  running_dist = 0;
  scoreEl.textContent = "0";
  distEl.textContent = "0";
  rocks = [];
  chickens = [];
  particles = [];
  player = { dist: 0, y: terrainY(0), vy: 0, grounded: true, angle: 0 };
  nextRockX = 320;
  nextChickX = 500;
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
    setStatus("no moots or follows to build a hill out of.", true);
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

  mootPool = picked.map((p) => {
    const full = byDid.get(p.did) || {};
    return {
      img: loadImg(full.avatar || p.avatar),
      hue: hue(p.did),
      initial: (full.displayName || p.handle || "?")[0].toUpperCase(),
      handle: p.handle,
    };
  });

  seedTerrain(c.did);
  boardMeta.textContent = `${c.kind} · ${picked.length} on the hill`;
  bestEl.textContent = String(getBest(c.did));
  startCopy.textContent = `you're @${c.handle}. ${picked.length} moots are already lying in wait on the slope.`;
  startOverlay.classList.remove("hidden");
  overOverlay.classList.add("hidden");
  gameEl.hidden = false;
  loadBtn.disabled = false;
  setStatus("");

  player = { dist: 0, y: terrainY(0), vy: 0, grounded: true, angle: 0 };
  render(0);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const actor = input.value.trim();
  if (!actor) return;
  loadNetwork(actor);
});

loadLeaderboard();
if (input.value.trim()) loadNetwork(input.value.trim());
