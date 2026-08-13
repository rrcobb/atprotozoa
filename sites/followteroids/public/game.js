// game.js — followteroids. Classic Asteroids: rotate, thrust, fire, wrap
// around the screen. Every large rock is one account you follow, sized by
// its follower count (log-scaled so the game stays playable whether they
// follow 12 people or 12,000). Rocks are anonymous until you crack one open
// — the first hit on a "founder" rock reveals the account's avatar and name
// in a floating card, and logs it to the reveal strip below the board.
// Cracking splits it into smaller, faster, anonymous rubble, same as the
// arcade original. Fetch logic lives in lib/follows.js — copy, don't
// abstract; this file is the sim + renderer.

import { loadFollows } from "./lib/follows.js";

const W = 720;
const H = 620;

const WAVE_SIZE = 14;
const MAX_ACCOUNTS = 56; // cap total accounts pulled into play across waves

const SHIP_R = 13;
const ROT_SPEED = 3.5; // rad/s
const THRUST = 230; // px/s^2
const MAX_SPEED = 260;
const DRAG = 0.62; // velocity half-life-ish drag per second

const BULLET_SPEED = 430;
const BULLET_LIFE = 0.85;
const FIRE_COOLDOWN = 0.2;
const MAX_BULLETS = 8;

const R_MIN = 30; // tier-0 (founder) radius range
const R_MAX = 62;
const TIER_SHRINK = 0.62;
const R_FLOOR = 11; // never shrink smaller than this

const SCORE_TIER = [15, 30, 60]; // points per tier broken

const INVULN_TIME = 2;

function rand(a, b) {
  return a + Math.random() * (b - a);
}
function hashInt(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function loadImg(url) {
  if (!url) return null;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  return img;
}
function imgReady(img) {
  return img && img.complete && img.naturalWidth > 0;
}
function wrap(v, max) {
  if (v < 0) return v + max;
  if (v >= max) return v - max;
  return v;
}

// ---- DOM ------------------------------------------------------------------
const form = document.getElementById("load-form");
const input = document.getElementById("handle-input");
if (window.attachHandleTypeahead) window.attachHandleTypeahead(input);
const loadBtn = document.getElementById("load-btn");
const statusEl = document.getElementById("status");
const gameEl = document.getElementById("game");
const boardMeta = document.getElementById("board-meta");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const livesEl = document.getElementById("lives");
const waveEl = document.getElementById("wave");
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const startOverlay = document.getElementById("start-overlay");
const startCopy = document.getElementById("start-copy");
const startBtn = document.getElementById("start-btn");
const overOverlay = document.getElementById("over-overlay");
const overTitle = document.getElementById("over-title");
const overCopy = document.getElementById("over-copy");
const againBtn = document.getElementById("again-btn");
const shareRow = document.getElementById("share-row");
const shareBluesky = document.getElementById("share-bluesky");
const revealStrip = document.getElementById("reveal-strip");

const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr;
canvas.height = H * dpr;
canvas.style.aspectRatio = `${W} / ${H}`;

// ---- state ------------------------------------------------------------
let cluster = null; // { did, handle, self, follows }
let waves = []; // array of arrays of follow entries
let waveIndex = 0;
let ship, bullets, rocks, particles;
let running = false;
let score = 0;
let lives = 3;
let invuln = 0;
let shakeT = 0;
let rafId = null;
let lastT = 0;
let revealedCount = 0;
let totalAccounts = 0;

const keys = { left: false, right: false, thrust: false, fire: false };

function bestKey(did) {
  return `followteroids:best:${did}`;
}
function getBest(did) {
  return parseInt(localStorage.getItem(bestKey(did)) || "0", 10) || 0;
}
function setBest(did, v) {
  try {
    localStorage.setItem(bestKey(did), String(v));
  } catch {}
}

function setStatus(msg, isError) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}

// ---- rock shape -------------------------------------------------------
function makeShape(seed) {
  const pts = 9 + (hashInt(String(seed)) % 4);
  const shape = [];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const wobble = 0.72 + ((Math.sin(seed * 12.9898 + i * 4.1) * 0.5 + 0.5) * 0.5);
    shape.push({ a, m: wobble });
  }
  return shape;
}

function makeRock({ x, y, vx, vy, radius, tier, account }) {
  return {
    x, y, vx, vy, radius, tier,
    angle: rand(0, Math.PI * 2),
    spin: rand(-1, 1),
    shape: makeShape(rand(0, 1000)),
    account: account || null, // only tier 0 carries an account
    broken: false,
  };
}

function scaleRadius(followersCount, minF, maxF) {
  if (maxF <= minF) return (R_MIN + R_MAX) / 2;
  const t = Math.log10(followersCount + 1) - Math.log10(minF + 1);
  const span = Math.log10(maxF + 1) - Math.log10(minF + 1);
  const f = span > 0 ? t / span : 0.5;
  return R_MIN + f * (R_MAX - R_MIN);
}

function safeSpawnSpot(exclude, minDist) {
  let best = null, bestScore = -1;
  for (let i = 0; i < 24; i++) {
    const x = rand(0, W), y = rand(0, H);
    let d = Infinity;
    for (const e of exclude) d = Math.min(d, Math.hypot(e.x - x, e.y - y));
    if (d > minDist && d > bestScore) {
      bestScore = d;
      best = { x, y };
    }
  }
  return best || { x: W / 2, y: H / 2 };
}

function spawnWave(entries) {
  const counts = entries.map((e) => e.followersCount || 0);
  const minF = Math.min(...counts);
  const maxF = Math.max(...counts);
  const placed = [];
  for (const entry of entries) {
    const radius = scaleRadius(entry.followersCount || 0, minF, maxF);
    const spot = safeSpawnSpot([{ x: W / 2, y: H / 2 }, ...placed], 120);
    const speed = rand(14, 36);
    const a = rand(0, Math.PI * 2);
    placed.push(
      makeRock({
        x: spot.x, y: spot.y,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        radius, tier: 0, account: entry,
      }),
    );
  }
  rocks = placed;
}

// ---- particles / reveal cards ------------------------------------------
function addDebris(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(30, 140);
    particles.push({
      kind: "debris", x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.4, 0.9), maxLife: 0.9, color: color || "#cfd3e0",
    });
  }
}

function addReveal(x, y, account) {
  const img = loadImg(account.avatar);
  particles.push({
    kind: "reveal", x, y, img,
    displayName: account.displayName || account.handle,
    handle: account.handle,
    followers: account.followersCount || 0,
    life: 2.4, maxLife: 2.4,
    vy: -18,
  });
  revealedCount++;
  pushRevealChip(account);
}

function pushRevealChip(account) {
  const chip = document.createElement("div");
  chip.className = "chip";
  chip.title = `@${account.handle} · ${(account.followersCount || 0).toLocaleString()} followers`;
  const av = document.createElement("img");
  av.alt = "";
  av.loading = "lazy";
  if (account.avatar) av.src = account.avatar;
  const label = document.createElement("span");
  label.textContent = "@" + account.handle;
  chip.appendChild(av);
  chip.appendChild(label);
  revealStrip.prepend(chip);
}

// ---- ship / input -------------------------------------------------------
function resetShip() {
  ship = {
    x: W / 2, y: H / 2, vx: 0, vy: 0, angle: 0,
  };
  invuln = INVULN_TIME;
}

const KEYMAP = {
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
  ArrowUp: "thrust", w: "thrust", W: "thrust",
  " ": "fire",
};

window.addEventListener("keydown", (e) => {
  const k = KEYMAP[e.key];
  if (!k || !running) return;
  e.preventDefault();
  keys[k] = true;
});
window.addEventListener("keyup", (e) => {
  const k = KEYMAP[e.key];
  if (!k) return;
  keys[k] = false;
});

function bindTouch(id, key) {
  const btn = document.getElementById(id);
  const set = (v) => (e) => {
    e.preventDefault();
    keys[key] = v;
  };
  btn.addEventListener("pointerdown", set(true));
  btn.addEventListener("pointerup", set(false));
  btn.addEventListener("pointercancel", set(false));
  btn.addEventListener("pointerleave", set(false));
}
bindTouch("t-left", "left");
bindTouch("t-right", "right");
bindTouch("t-thrust", "thrust");
bindTouch("t-fire", "fire");

let fireCooldown = 0;
function tryFire() {
  if (fireCooldown > 0 || bullets.length >= MAX_BULLETS) return;
  fireCooldown = FIRE_COOLDOWN;
  const nx = Math.sin(ship.angle), ny = -Math.cos(ship.angle);
  bullets.push({
    x: ship.x + nx * SHIP_R, y: ship.y + ny * SHIP_R,
    vx: ship.vx + nx * BULLET_SPEED, vy: ship.vy + ny * BULLET_SPEED,
    life: BULLET_LIFE,
  });
}

// ---- breaking rocks -------------------------------------------------------
function breakRock(rock, idx) {
  rocks.splice(idx, 1);
  score += SCORE_TIER[rock.tier];
  scoreEl.textContent = String(score);
  addDebris(rock.x, rock.y, 10, rock.tier === 0 ? "#ffd166" : "#9aa0b8");

  if (rock.tier === 0 && rock.account && !rock.broken) {
    rock.broken = true;
    addReveal(rock.x, rock.y, rock.account);
  }

  if (rock.tier < 2) {
    const childR = Math.max(R_FLOOR, rock.radius * TIER_SHRINK);
    for (let i = 0; i < 2; i++) {
      const a = rand(0, Math.PI * 2);
      const speed = rand(50, 110) + rock.tier * 40;
      rocks.push(
        makeRock({
          x: rock.x, y: rock.y,
          vx: rock.vx * 0.4 + Math.cos(a) * speed,
          vy: rock.vy * 0.4 + Math.sin(a) * speed,
          radius: childR, tier: rock.tier + 1, account: null,
        }),
      );
    }
  }

  if (rocks.length === 0) {
    nextWaveOrWin();
  }
}

function hitShip() {
  if (invuln > 0) return;
  lives--;
  livesEl.textContent = String(Math.max(0, lives));
  addDebris(ship.x, ship.y, 18, "#ff8b7f");
  shakeT = 0.35;
  if (lives <= 0) {
    endGame(false);
    return;
  }
  resetShip();
}

// ---- update / render -------------------------------------------------
function update(dt) {
  if (keys.left) ship.angle -= ROT_SPEED * dt;
  if (keys.right) ship.angle += ROT_SPEED * dt;
  if (keys.thrust) {
    const ax = Math.sin(ship.angle) * THRUST;
    const ay = -Math.cos(ship.angle) * THRUST;
    ship.vx += ax * dt;
    ship.vy += ay * dt;
  }
  const drag = Math.pow(DRAG, dt);
  ship.vx *= drag;
  ship.vy *= drag;
  const sp = Math.hypot(ship.vx, ship.vy);
  if (sp > MAX_SPEED) {
    ship.vx = (ship.vx / sp) * MAX_SPEED;
    ship.vy = (ship.vy / sp) * MAX_SPEED;
  }
  ship.x = wrap(ship.x + ship.vx * dt, W);
  ship.y = wrap(ship.y + ship.vy * dt, H);

  fireCooldown -= dt;
  if (keys.fire) tryFire();
  if (invuln > 0) invuln -= dt;
  if (shakeT > 0) shakeT -= dt;

  for (const b of bullets) {
    b.x = wrap(b.x + b.vx * dt, W);
    b.y = wrap(b.y + b.vy * dt, H);
    b.life -= dt;
  }
  bullets = bullets.filter((b) => b.life > 0);

  for (const r of rocks) {
    r.x = wrap(r.x + r.vx * dt, W);
    r.y = wrap(r.y + r.vy * dt, H);
    r.angle += r.spin * dt;
  }

  // bullet vs rock
  outer: for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    for (let ri = rocks.length - 1; ri >= 0; ri--) {
      const r = rocks[ri];
      if (Math.hypot(b.x - r.x, b.y - r.y) < r.radius) {
        bullets.splice(bi, 1);
        breakRock(r, ri);
        continue outer;
      }
    }
  }

  // ship vs rock
  if (invuln <= 0) {
    for (const r of rocks) {
      if (Math.hypot(ship.x - r.x, ship.y - r.y) < r.radius + SHIP_R * 0.7) {
        hitShip();
        break;
      }
    }
  }

  for (const p of particles) {
    p.life -= dt;
    if (p.kind === "debris") {
      p.x = wrap(p.x + p.vx * dt, W);
      p.y = wrap(p.y + p.vy * dt, H);
    } else if (p.kind === "reveal") {
      p.y += p.vy * dt;
    }
  }
  particles = particles.filter((p) => p.life > 0);
}

function drawShip() {
  if (invuln > 0 && Math.floor(invuln * 10) % 2 === 0) return;
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);
  ctx.beginPath();
  ctx.moveTo(0, -SHIP_R * 1.6);
  ctx.lineTo(SHIP_R, SHIP_R * 1.3);
  ctx.lineTo(0, SHIP_R * 0.6);
  ctx.lineTo(-SHIP_R, SHIP_R * 1.3);
  ctx.closePath();
  ctx.fillStyle = "#7fd8ff";
  ctx.fill();
  ctx.strokeStyle = "#05060a";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (keys.thrust) {
    ctx.beginPath();
    ctx.moveTo(-SHIP_R * 0.55, SHIP_R * 1.3);
    ctx.lineTo(0, SHIP_R * 1.3 + rand(10, 22));
    ctx.lineTo(SHIP_R * 0.55, SHIP_R * 1.3);
    ctx.closePath();
    ctx.fillStyle = "#ffd166";
    ctx.fill();
  }
  ctx.restore();
}

function drawRock(r) {
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(r.angle);
  ctx.beginPath();
  r.shape.forEach((pt, i) => {
    const x = Math.cos(pt.a) * r.radius * pt.m;
    const y = Math.sin(pt.a) * r.radius * pt.m;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = r.tier === 0 ? "#2a2f42" : "#20232f";
  ctx.fill();
  ctx.strokeStyle = r.tier === 0 ? "#8892b8" : "#5a5f75";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawReveal(p) {
  const alpha = Math.min(1, p.life / (p.maxLife * 0.4));
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  const w = 168, h = 46;
  let x = p.x - w / 2, y = p.y - 70;
  x = Math.max(6, Math.min(W - w - 6, x));
  y = Math.max(6, y);
  ctx.fillStyle = "rgba(10,11,17,0.92)";
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();

  const cx = x + 26, cy = y + h / 2, ar = 16;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, ar, 0, Math.PI * 2);
  ctx.clip();
  if (imgReady(p.img)) {
    ctx.drawImage(p.img, cx - ar, cy - ar, ar * 2, ar * 2);
  } else {
    ctx.fillStyle = "#3a3f52";
    ctx.fillRect(cx - ar, cy - ar, ar * 2, ar * 2);
  }
  ctx.restore();

  ctx.fillStyle = "#e7e8ea";
  ctx.font = "700 12px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const name = p.displayName.length > 16 ? p.displayName.slice(0, 15) + "…" : p.displayName;
  ctx.fillText(name, x + 50, y + 20);
  ctx.fillStyle = "#8a8fa5";
  ctx.font = "11px ui-monospace, monospace";
  ctx.fillText(`@${p.handle} · ${p.followers.toLocaleString()} followers`, x + 50, y + 36);
  ctx.restore();
}

function render() {
  ctx.save();
  ctx.scale(dpr, dpr);
  let ox = 0, oy = 0;
  if (shakeT > 0) {
    ox = rand(-4, 4) * (shakeT / 0.35);
    oy = rand(-4, 4) * (shakeT / 0.35);
  }
  ctx.translate(ox, oy);

  ctx.fillStyle = "#05060c";
  ctx.fillRect(-8, -8, W + 16, H + 16);

  for (const r of rocks) drawRock(r);

  ctx.fillStyle = "#f4f6ff";
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of particles) {
    if (p.kind !== "debris") continue;
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;

  drawShip();

  for (const p of particles) {
    if (p.kind === "reveal") drawReveal(p);
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

// ---- flow ---------------------------------------------------------------
function nextWaveOrWin() {
  waveIndex++;
  if (waveIndex >= waves.length) {
    endGame(true);
    return;
  }
  running = false;
  cancelAnimationFrame(rafId);
  waveEl.textContent = `${waveIndex + 1}/${waves.length}`;
  startCopy.textContent = `wave ${waveIndex + 1} of ${waves.length} — ${waves[waveIndex].length} more accounts drifting in.`;
  startOverlay.querySelector("h2").textContent = "wave cleared!";
  startBtn.textContent = "▶ continue";
  startOverlay.classList.remove("hidden");
}

function buildShareText() {
  const n = revealedCount;
  const total = totalAccounts;
  return (
    `flew through @${cluster.handle}'s follows in followteroids and blasted open ${n}/${total} of them. ` +
    `score: ${score}\n\nplay → https://followteroids.bisks.net/`
  );
}

function endGame(won) {
  running = false;
  cancelAnimationFrame(rafId);
  const best = getBest(cluster.did);
  const newBest = score > best;
  if (newBest) setBest(cluster.did, score);
  bestEl.textContent = String(newBest ? score : best);
  overTitle.textContent = won ? "field cleared!" : "ship lost";
  overCopy.textContent = won
    ? `every rock's broken open — ${revealedCount}/${totalAccounts} accounts revealed. score ${score}${newBest ? " — new best." : `. best is ${best}.`}`
    : `revealed ${revealedCount}/${totalAccounts} accounts before you lost your last ship. score ${score}${newBest ? " — new best." : `. best is ${best}.`}`;
  shareBluesky.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(buildShareText());
  shareRow.hidden = false;
  overOverlay.classList.remove("hidden");
}

function startWave() {
  bullets = [];
  particles = [];
  rocks = [];
  resetShip();
  spawnWave(waves[waveIndex]);
  startOverlay.classList.add("hidden");
  overOverlay.classList.add("hidden");
  running = true;
  lastT = performance.now();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function startGame() {
  score = 0;
  lives = 3;
  waveIndex = 0;
  revealedCount = 0;
  revealStrip.innerHTML = "";
  scoreEl.textContent = "0";
  livesEl.textContent = "3";
  waveEl.textContent = `1/${waves.length}`;
  shareRow.hidden = true;
  startWave();
}

startBtn.addEventListener("click", () => {
  if (!running && startOverlay.querySelector("h2").textContent === "wave cleared!") {
    startWave();
  } else {
    startGame();
  }
});
againBtn.addEventListener("click", () => {
  startOverlay.querySelector("h2").textContent = "ready?";
  startBtn.textContent = "▶ launch";
  startGame();
});

async function loadNetwork(actor) {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  gameEl.hidden = true;
  loadBtn.disabled = true;
  setStatus("resolving handle…");

  let c;
  try {
    c = await loadFollows(actor, { onStep: (s) => setStatus(s) });
  } catch (e) {
    setStatus(`couldn't load that: ${e.message}`, true);
    loadBtn.disabled = false;
    return;
  }

  if (!c.follows.length) {
    setStatus("that account doesn't follow anyone to turn into asteroids.", true);
    loadBtn.disabled = false;
    return;
  }

  cluster = c;
  const pool = c.follows.slice().sort(() => Math.random() - 0.5).slice(0, MAX_ACCOUNTS);
  totalAccounts = pool.length;
  waves = [];
  for (let i = 0; i < pool.length; i += WAVE_SIZE) waves.push(pool.slice(i, i + WAVE_SIZE));

  boardMeta.textContent = `@${c.handle} follows ${c.follows.length} — flying through ${pool.length} of them across ${waves.length} wave${waves.length > 1 ? "s" : ""}`;
  bestEl.textContent = String(getBest(c.did));
  waveEl.textContent = `1/${waves.length}`;
  startOverlay.querySelector("h2").textContent = "ready?";
  startBtn.textContent = "▶ launch";
  startCopy.textContent = `${pool.length} accounts you follow are out there as rocks, sized by follower count. shoot one open to see who it was.`;
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
