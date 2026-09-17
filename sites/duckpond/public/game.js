// game.js — duckpond. lib/moots.js (copied from simcluster/moot-bingo) finds
// a handle's real mutuals; everything below is the follow-the-leader chain,
// the stray/recover mechanic, and the canvas rendering.
//
// The brief this was built from named a specific real Bluesky account as the
// "evil stepmother duck" leading strays into the woods. That part is left
// out on purpose — the woods don't need a real, non-consenting person cast
// as their villain for the game to work, so the escort duck below is a
// generic, unnamed silhouette by default. See CLAUDE.md's builder
// instructions, "Declines" / the consent test, for why.
//
// A later ask ("so they're not so generic") added a villain picker: a preset
// pool of fictional look-alikes (fox/hawk/cat/raccoon/the original shadow
// duck) plus an optional freeform nickname. Both are the player's own choice
// for their own session — never resolved against a real atproto handle or
// avatar — and neither is baked into the auto-generated share card/text, so
// a chosen nickname stays on-page rather than becoming a public artifact.

import { moots } from "./lib/moots.js";

const W = 900, H = 500; // logical canvas size
const DISPLAY_CAP = 18; // rendering/readability cap, not a data cap — the full
  // mutual count always comes from moots.js's unpaginated-to-exhaustion fetch
  // and is shown in the status line; past ~18 chained avatar sprites overlap
  // unreadably on a 900px-wide canvas and the frame rate suffers on phones,
  // so the *game* samples a subset of the *real, fully-read* mutual list.
const GAME_SECONDS = 75;
const SPACING = 28; // px between chained ducks
const CHAIN_EASE = 0.15;
const MAMA_EASE = 0.18;
const DUCK_R = 14;
const MAMA_R = 19;
const STRAY_SPEED = 42; // px/sec toward the woods
const FOREST_X = W - 78; // crossing this x while straying = lost
const HONK_COOLDOWN_MS = 3000;

const TINTS = ["#1a5fd0","#1f8a4c","#d81e6a","#e0a400","#8e44ad",
  "#c0392b","#0f9b9b","#e2711d","#5566dd","#2c8c3c"];
function tintFor(did) {
  let h = 0;
  for (const c of did || "x") h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return TINTS[h % TINTS.length];
}
function initialFor(p) {
  return ((p.displayName || p.handle || "?").trim()[0] || "?").toUpperCase();
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
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// ---- DOM ------------------------------------------------------------------
const form = document.getElementById("form");
const input = document.getElementById("handle");
const loadBtn = document.getElementById("load");
const msg = document.getElementById("msg");
const gameSection = document.getElementById("gameSection");
const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overTitle = document.getElementById("overTitle");
const overCopy = document.getElementById("overCopy");
const againBtn = document.getElementById("again");
const honkBtn = document.getElementById("honk");
const safeNumEl = document.getElementById("safeNum");
const lostNumEl = document.getElementById("lostNum");
const timeNumEl = document.getElementById("timeNum");
const shareRow = document.getElementById("shareRow");
const shareBlueskyEl = document.getElementById("shareBluesky");
const shareSaveBtn = document.getElementById("shareSave");
const shareNativeBtn = document.getElementById("shareNative");
const shareCanvas = document.getElementById("shareCanvas");
const sharePreview = document.getElementById("sharePreview");
const villainTypeEl = document.getElementById("villainType");
const villainNameEl = document.getElementById("villainName");

// ---- villain picker -----------------------------------------------------
// Cosmetic-only presets: a shape and two colors, nothing tied to any real
// identity. See the file header for why a nickname never resolves to a handle.
const VILLAINS = {
  shadow: { shape: "duck", color: "#2a2f2a", eye: "#ff5252" },
  fox: { shape: "fox", color: "#c9591c", eye: "#3a2410" },
  hawk: { shape: "hawk", color: "#6b5638", eye: "#2a2010" },
  cat: { shape: "cat", color: "#33363a", eye: "#8affc1" },
  raccoon: { shape: "raccoon", color: "#5b5b5b", eye: "#ffffff" },
};
const VILLAIN_PREFS_KEY = "duckpond:villain";

function loadVillainPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(VILLAIN_PREFS_KEY) || "null");
    if (saved && VILLAINS[saved.type]) villainTypeEl.value = saved.type;
    if (saved && typeof saved.name === "string") villainNameEl.value = saved.name.slice(0, 24);
  } catch {
    // no localStorage (private browsing, etc.) — presets just start at default
  }
}
function saveVillainPrefs() {
  try {
    localStorage.setItem(
      VILLAIN_PREFS_KEY,
      JSON.stringify({ type: villainTypeEl.value, name: villainNameEl.value.trim() })
    );
  } catch {
    // ignore — persistence is a nicety, not required for the picker to work
  }
}
function currentVillain() {
  const preset = VILLAINS[villainTypeEl.value] || VILLAINS.shadow;
  return { ...preset, name: villainNameEl.value.trim().slice(0, 24) };
}
villainTypeEl.addEventListener("change", saveVillainPrefs);
villainNameEl.addEventListener("input", saveVillainPrefs);
loadVillainPrefs();

const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr;
canvas.height = H * dpr;
canvas.style.aspectRatio = `${W} / ${H}`;
ctx.scale(dpr, dpr);

function toLocal(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((clientX - r.left) / r.width) * W,
    y: ((clientY - r.top) / r.height) * H,
  };
}

// ---- game state -------------------------------------------------------
let mainInfo = null; // {did, handle, self}
let ducks = []; // {did, handle, displayName, avatar, img, x, y, status, strayY}
let order = []; // duck indices, front to back, currently in line
let mama = { x: W / 2, y: H / 2 };
let pointerTarget = { x: W / 2, y: H / 2 };
let strayTimer = 0;
let elapsed = 0;
let timeLeft = GAME_SECONDS;
let lostCount = 0;
let running = false;
let rafId = null;
let lastT = 0;
let honkReadyAt = 0;
let toasts = []; // {x,y,text,age}

function strayIntervalRange() {
  const t = Math.min(elapsed / GAME_SECONDS, 1);
  return [Math.max(5 - 2.5 * t, 1.5), Math.max(9 - 3 * t, 3)];
}
function rollStrayTimer() {
  const [lo, hi] = strayIntervalRange();
  strayTimer = lo + Math.random() * (hi - lo);
}

function resetGame(pool) {
  const flock = shuffled(pool).slice(0, DISPLAY_CAP);
  ducks = flock.map((p) => ({
    did: p.did,
    handle: p.handle,
    displayName: p.displayName,
    avatar: p.avatar,
    img: loadImg(p.avatar),
    x: W / 2 + (Math.random() - 0.5) * 40,
    y: H / 2 + 30 + Math.random() * 20,
    status: "inline",
  }));
  order = ducks.map((_, i) => i);
  mama.x = W / 2;
  mama.y = H / 2 - 40;
  pointerTarget = { x: mama.x, y: mama.y };
  elapsed = 0;
  timeLeft = GAME_SECONDS;
  lostCount = 0;
  toasts = [];
  honkReadyAt = 0;
  rollStrayTimer();
  overlay.classList.remove("on");
  shareRow.classList.remove("on");
  sharePreview.classList.remove("on");
  updateHud();
}

function updateHud() {
  safeNumEl.textContent = String(ducks.length - lostCount);
  lostNumEl.textContent = String(lostCount);
  timeNumEl.textContent = String(Math.max(0, Math.ceil(timeLeft)));
}

function followLeader(leader, self, spacing, ease) {
  const dx = self.x - leader.x, dy = self.y - leader.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const dirX = dx / dist, dirY = dy / dist;
  const desiredX = leader.x + dirX * spacing;
  const desiredY = leader.y + dirY * spacing;
  self.x += (desiredX - self.x) * ease;
  self.y += (desiredY - self.y) * ease;
}

function addToast(x, y, text) {
  toasts.push({ x, y, text, age: 0 });
}

function startStray() {
  if (!order.length) return;
  const pick = Math.floor(Math.random() * order.length);
  const idx = order[pick];
  order.splice(pick, 1);
  const d = ducks[idx];
  d.status = "straying";
  d.strayY = Math.max(50, Math.min(H - 50, d.y + (Math.random() - 0.5) * 120));
}

function recoverDuck(d) {
  if (d.status !== "straying") return;
  d.status = "inline";
  order.push(ducks.indexOf(d));
  addToast(d.x, d.y, "grabbed!");
}

function honk() {
  const now = performance.now();
  if (now < honkReadyAt) return;
  honkReadyAt = now + HONK_COOLDOWN_MS;
  let called = 0;
  for (const d of ducks) {
    if (d.status === "straying") {
      recoverDuck(d);
      called++;
    }
  }
  if (!called) addToast(mama.x, mama.y - 30, "honk!");
  playHonk();
}

// ---- tiny synthesized honk, no external asset --------------------------
let audioCtx = null;
function playHonk() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, t0);
    osc.frequency.exponentialRampToValueAtTime(140, t0 + 0.18);
    gain.gain.setValueAtTime(0.001, t0);
    gain.gain.exponentialRampToValueAtTime(0.28, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.24);
  } catch {
    // no WebAudio (very old browser) — honk still works, just silently
  }
}

// ---- update -------------------------------------------------------------
function update(dt) {
  elapsed += dt;
  timeLeft -= dt;

  mama.x += (pointerTarget.x - mama.x) * MAMA_EASE;
  mama.y += (pointerTarget.y - mama.y) * MAMA_EASE;
  mama.x = Math.max(MAMA_R, Math.min(W - MAMA_R, mama.x));
  mama.y = Math.max(MAMA_R, Math.min(H - MAMA_R, mama.y));

  let leader = mama;
  for (const idx of order) {
    const d = ducks[idx];
    followLeader(leader, d, SPACING, CHAIN_EASE);
    leader = d;
  }

  for (const d of ducks) {
    if (d.status !== "straying") continue;
    const dx = FOREST_X - d.x, dy = d.strayY - d.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const step = STRAY_SPEED * dt;
    if (dist <= step) {
      d.status = "lost";
      lostCount++;
      const v = currentVillain();
      addToast(d.x, d.y, v.name ? `taken by ${v.name}` : "lost to the woods");
    } else {
      d.x += (dx / dist) * step;
      d.y += (dy / dist) * step;
    }
  }

  strayTimer -= dt;
  if (strayTimer <= 0) {
    startStray();
    rollStrayTimer();
  }

  for (const t of toasts) t.age += dt;
  toasts = toasts.filter((t) => t.age < 1.3);

  updateHud();

  if (timeLeft <= 0 || lostCount >= ducks.length) {
    endGame();
  }
}

// ---- draw -----------------------------------------------------------------
function drawScene() {
  ctx.clearRect(0, 0, W, H);

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#eaf6e0");
  sky.addColorStop(1, "#cfe8b8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#7fb6d6";
  ctx.beginPath();
  ctx.ellipse(W * 0.36, H * 0.58, 210, 110, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath();
  ctx.ellipse(W * 0.3, H * 0.5, 90, 30, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // the woods — an unnamed treeline, not a real person
  const woods = ctx.createLinearGradient(W - 150, 0, W, 0);
  woods.addColorStop(0, "rgba(20,40,20,0)");
  woods.addColorStop(1, "rgba(10,25,12,0.35)");
  ctx.fillStyle = woods;
  ctx.fillRect(W - 150, 0, 150, H);
  for (let i = 0; i < 9; i++) {
    const tx = W - 60 + (i % 3) * 22 - 20;
    const ty = 30 + Math.floor(i / 3) * (H / 3.1) + ((i * 37) % 20);
    ctx.fillStyle = "#3a2a18";
    ctx.fillRect(tx - 3, ty + 14, 6, 20);
    ctx.fillStyle = i % 2 ? "#1f4d24" : "#255c2a";
    ctx.beginPath();
    ctx.arc(tx, ty, 20, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("the woods", W - 45, 18);

  ctx.strokeStyle = "rgba(20,40,20,0.5)";
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.moveTo(FOREST_X, 0);
  ctx.lineTo(FOREST_X, H);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawDuckBody(x, y, r, facing, bodyColor) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(-r * 0.15, r * 0.55, r * 1.05, r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  // beak
  ctx.fillStyle = "#e08a1e";
  ctx.beginPath();
  ctx.moveTo(r * 0.55, r * 0.1);
  ctx.lineTo(r * 1.15, r * 0.02);
  ctx.lineTo(r * 0.55, -r * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAvatarHead(d, x, y, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  if (imgReady(d.img)) {
    ctx.drawImage(d.img, x - r, y - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = tintFor(d.did);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `${Math.round(r)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialFor(d), x, y + 1);
  }
  ctx.restore();
}

function drawVillain(d) {
  // whichever preset the player picked (defaults to the original unnamed
  // shadow duck) leading a stray toward the woods — cosmetic only, see the
  // file header for why this never resolves to a real handle.
  const v = currentVillain();
  const t = 0.35;
  const ex = d.x + (FOREST_X - d.x) * t;
  const ey = d.y + (d.strayY - d.y) * t;
  const r = DUCK_R * 1.3;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.translate(ex, ey);
  ctx.fillStyle = v.color;
  ctx.beginPath();
  ctx.ellipse(-r * 0.1, r * 0.5, r * 1.05, r * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  switch (v.shape) {
    case "fox":
    case "cat":
    case "raccoon": {
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.1);
      ctx.lineTo(-r * 0.75, -r * 0.7);
      ctx.lineTo(-r * 0.15, -r * 0.25);
      ctx.closePath();
      ctx.moveTo(r * 0.05, -r * 0.15);
      ctx.lineTo(r * 0.15, -r * 0.75);
      ctx.lineTo(r * 0.45, -r * 0.15);
      ctx.closePath();
      ctx.fill();
      if (v.shape === "raccoon") {
        ctx.fillStyle = "#1c1c1c";
        ctx.fillRect(-r * 0.35, -r * 0.15, r * 0.7, r * 0.22);
      }
      break;
    }
    case "hawk": {
      ctx.beginPath();
      ctx.moveTo(0, r * 0.1);
      ctx.lineTo(-r * 0.9, -r * 0.5);
      ctx.lineTo(-r * 0.2, r * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    }
    default: {
      ctx.fillStyle = "#e08a1e";
      ctx.beginPath();
      ctx.moveTo(r * 0.55, r * 0.1);
      ctx.lineTo(r * 1.15, r * 0.02);
      ctx.lineTo(r * 0.55, -r * 0.28);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = v.eye;
  ctx.beginPath();
  ctx.arc(r * 0.3, -r * 0.1, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (v.name) {
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.fillStyle = "rgba(20,20,20,0.75)";
    ctx.textAlign = "center";
    ctx.fillText(v.name, ex, ey - r - 6);
  }
}

function draw() {
  drawScene();

  // straying ducks + their escort, drawn under the line so the line reads
  // clearly on top
  for (const d of ducks) {
    if (d.status !== "straying") continue;
    drawVillain(d);
    drawDuckBody(d.x, d.y, DUCK_R, Math.atan2(d.strayY - d.y, FOREST_X - d.x), "#e9d17a");
    drawAvatarHead(d, d.x, d.y, DUCK_R * 0.72);
    ctx.strokeStyle = "#8a3b23";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(d.x, d.y, DUCK_R * 0.72 + 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // the line, tail to head, so the head duck (closest to mama) is on top
  const chain = order.map((i) => ducks[i]);
  for (let i = chain.length - 1; i >= 0; i--) {
    const d = chain[i];
    const ahead = i === 0 ? mama : chain[i - 1];
    const facing = Math.atan2(ahead.y - d.y, ahead.x - d.x);
    drawDuckBody(d.x, d.y, DUCK_R, facing, "#fff4cf");
    drawAvatarHead(d, d.x, d.y, DUCK_R * 0.72);
  }

  const mamaFacing = Math.atan2(pointerTarget.y - mama.y, pointerTarget.x - mama.x);
  drawDuckBody(mama.x, mama.y, MAMA_R, mamaFacing, "#ffffff");
  if (mainInfo) drawAvatarHead(mainInfo.self, mama.x, mama.y, MAMA_R * 0.72);

  ctx.font = "bold 11px ui-monospace, monospace";
  ctx.textAlign = "center";
  for (const t of toasts) {
    ctx.globalAlpha = Math.max(0, 1 - t.age / 1.3);
    ctx.fillStyle = "#16221a";
    ctx.fillText(t.text, t.x, t.y - 20 - t.age * 14);
    ctx.globalAlpha = 1;
  }
}

// ---- loop -----------------------------------------------------------------
function frame(t) {
  if (!running) return;
  const dt = Math.min((t - lastT) / 1000, 0.05) || 0;
  lastT = t;
  update(dt);
  draw();
  rafId = requestAnimationFrame(frame);
}

function startLoop() {
  running = true;
  lastT = performance.now();
  rafId = requestAnimationFrame(frame);
}
function stopLoop() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
}

function endGame() {
  stopLoop();
  const safe = ducks.length - lostCount;
  const v = currentVillain();
  overTitle.textContent = lostCount === 0 ? "flawless outing" : safe === 0 ? "the woods won this one" : "the outing's over";
  overCopy.textContent = `${safe} of ${ducks.length} moots waddled home safe. ${lostCount} ${
    v.name ? `taken by ${v.name}` : "wandered into the woods"
  }.`;
  overlay.classList.add("on");
  buildShareText();
  buildShareCard();
  shareRow.classList.add("on");
}

// ---- pointer input ----------------------------------------------------
function hitTestStray(x, y) {
  let best = null, bestDist = 26;
  for (const d of ducks) {
    if (d.status !== "straying") continue;
    const dist = Math.hypot(d.x - x, d.y - y);
    if (dist < bestDist) { best = d; bestDist = dist; }
  }
  return best;
}

canvas.addEventListener("pointermove", (e) => {
  if (!running) return;
  pointerTarget = toLocal(e.clientX, e.clientY);
});
canvas.addEventListener("pointerdown", (e) => {
  if (!running) return;
  const p = toLocal(e.clientX, e.clientY);
  pointerTarget = p;
  const hit = hitTestStray(p.x, p.y);
  if (hit) recoverDuck(hit);
});

honkBtn.addEventListener("click", () => {
  if (!running) return;
  honk();
});
setInterval(() => {
  const remain = Math.max(0, honkReadyAt - performance.now());
  honkBtn.disabled = remain > 0 && running;
  honkBtn.textContent = remain > 0 ? `🔊 honk (${(remain / 1000).toFixed(1)}s)` : "🔊 honk!";
}, 100);

againBtn.addEventListener("click", () => {
  if (!mainInfo) return;
  resetGame(mainInfo.pool);
  startLoop();
});

// ---- sharing ------------------------------------------------------------
let lastShareText = "";
function buildShareText() {
  const safe = ducks.length - lostCount;
  const url = "https://duckpond.bisks.net/";
  lastShareText = `🦆 duckpond: @${mainInfo.handle}'s moots took a walk — ${safe}/${ducks.length} made it home, ${lostCount} lost to the woods. ${url}`;
  shareBlueskyEl.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(lastShareText);
}

function loadImgCors(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function buildShareCard() {
  const c = shareCanvas;
  const sctx = c.getContext("2d");
  const SW = c.width, SH = c.height;
  const mono = "ui-monospace, monospace";
  const safe = ducks.length - lostCount;

  sctx.fillStyle = "#eaf6e0";
  sctx.fillRect(0, 0, SW, SH);
  sctx.fillStyle = "#7fb6d6";
  sctx.beginPath();
  sctx.ellipse(SW * 0.24, SH * 0.7, 260, 140, 0, 0, Math.PI * 2);
  sctx.fill();
  sctx.fillStyle = "#255c2a";
  for (let i = 0; i < 5; i++) {
    sctx.beginPath();
    sctx.arc(SW - 90 - i * 55, 120 + (i % 2) * 60, 60, 0, Math.PI * 2);
    sctx.fill();
  }

  sctx.textAlign = "left";
  sctx.fillStyle = "#16221a";
  sctx.font = `800 52px ${mono}`;
  sctx.fillText("duckpond", 56, 96);
  sctx.fillStyle = "#5f6b61";
  sctx.font = `400 22px ${mono}`;
  sctx.fillText(`@${mainInfo.handle}'s moots took a walk`, 56, 132);

  sctx.fillStyle = "#1a7a4c";
  sctx.font = `800 120px ${mono}`;
  sctx.fillText(String(safe), 56, 300);
  sctx.fillStyle = "#16221a";
  sctx.font = `400 20px ${mono}`;
  sctx.fillText(`of ${ducks.length} waddled home safe`, 56, 335);

  sctx.fillStyle = "#8a3b23";
  sctx.font = `700 30px ${mono}`;
  sctx.fillText(`${lostCount} lost to the woods`, 56, 385);

  const homeSample = ducks.filter((d) => d.status !== "lost").slice(0, 8);
  let ax = 56;
  for (const d of homeSample) {
    const img = await loadImgCors(d.avatar);
    sctx.save();
    sctx.beginPath();
    sctx.arc(ax + 26, 460, 26, 0, Math.PI * 2);
    sctx.closePath();
    sctx.clip();
    if (img) {
      sctx.drawImage(img, ax, 434, 52, 52);
    } else {
      sctx.fillStyle = tintFor(d.did);
      sctx.fillRect(ax, 434, 52, 52);
    }
    sctx.restore();
    ax += 60;
  }

  sctx.textAlign = "center";
  sctx.fillStyle = "#1a7a4c";
  sctx.font = `700 22px ${mono}`;
  sctx.fillText("duckpond.bisks.net", SW / 2, SH - 40);

  sharePreview.src = c.toDataURL("image/png");
  sharePreview.classList.add("on");
  shareNativeBtn.style.display = canShareFiles() ? "" : "none";
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

shareSaveBtn.addEventListener("click", () => {
  shareCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `duckpond-${(mainInfo?.handle || "flock").replace(/[^a-z0-9.-]/gi, "_")}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
});
shareNativeBtn.addEventListener("click", () => {
  shareCanvas.toBlob(async (blob) => {
    if (!blob) return;
    try {
      const file = new File([blob], "duckpond.png", { type: "image/png" });
      await navigator.share({ files: [file], text: lastShareText, title: "duckpond" });
    } catch {
      // share sheet cancelled or unsupported at call time — the save button
      // still works as a fallback
    }
  }, "image/png");
});

// ---- load flow --------------------------------------------------------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const h = input.value.trim();
  if (!h) { input.focus(); return; }
  loadBtn.disabled = true;
  stopLoop();
  gameSection.classList.remove("on");
  msg.className = "msg";
  msg.textContent = "resolving handle…";

  try {
    const res = await moots(h, {
      onStep: (s) => { msg.textContent = s; },
    });
    if (!res.pool.length) {
      msg.className = "msg err";
      msg.textContent = `@${res.handle} has no mutuals — no flock to take to the park.`;
      return;
    }
    mainInfo = res;
    mainInfo.self.img = loadImg(mainInfo.self.avatar);
    const widened = res.kind === "moots + follows";
    msg.className = "msg ok";
    msg.textContent = `found ${res.counts.mutuals} real moots for @${res.handle}${widened ? " (padded with follows — not many mutuals)" : ""} — taking ${Math.min(res.pool.length, DISPLAY_CAP)} of them to the park today.`;

    resetGame(res.pool);
    gameSection.classList.add("on");
    startLoop();
    gameSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    msg.className = "msg err";
    msg.textContent =
      err && err.status === 400
        ? "couldn't find that handle. check the spelling?"
        : "couldn't load that one — " + (err.message || "try again") + ".";
  } finally {
    loadBtn.disabled = false;
  }
});

const initial = new URLSearchParams(location.search).get("h") || "";
if (initial) {
  input.value = initial;
  form.requestSubmit();
}
