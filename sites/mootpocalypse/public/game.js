// game.js — mootpocalypse. Project Zomboid energy, but every zombie is a
// real, currently-unliked Bluesky post from one of your moots (see
// lib/moots.js for the mutual-follow graph). Liking a post — walking up and
// pressing the LIKE key — is a real app.bsky.feed.like write to the
// player's own repo via lib/oauth.js's DPoP-bound session. There's no
// pretend backlog here: run the loadout again and it reflects whatever you
// actually liked, because it re-reads viewer.like straight off an
// authenticated getAuthorFeed call.

import { login, getSession, clearSession, completeLoginIfCallback, dpopFetch } from "./lib/oauth.js";
import { moots, getProfiles } from "./lib/moots.js";

// ---- world / view constants ----------------------------------------------
const WORLD_W = 2000, WORLD_H = 1300;
const VIEW_W = 720, VIEW_H = 440;

const PLAYER_R = 16;
const ZOMBIE_R = 15;
const CONTACT_R = PLAYER_R + ZOMBIE_R - 4;
const ATTACK_R = 72;
const ATTACK_COOLDOWN = 180; // ms
const SPEED = 170; // world px/sec
const DPS = 26; // damage per second while a zombie is touching you
const MAX_HP = 100;
const MIN_SPAWN_DIST = 380;
const DEATH_TIME = 0.4; // seconds
const MAX_MOOTS = 16;
const MAX_PER_MOOT = 6;

// ---- small helpers ---------------------------------------------------------
function hashInt(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function hue(str) {
  return hashInt(str) % 360;
}
function seededRandom(seed) {
  let s = seed || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// Like .slice(n), but never leaves a lone surrogate half dangling at the cut
// point — post text is arbitrary user content, and encodeURIComponent throws
// "URI malformed" on an unpaired surrogate.
function safeSlice(s, n) {
  const out = String(s || "").slice(0, n);
  return /[\uD800-\uDBFF]$/.test(out) ? out.slice(0, -1) : out;
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function loadImg(url) {
  if (!url) return null;
  const img = new Image();
  img.src = url;
  return img;
}
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
function imgReady(img) {
  return img && img.complete && img.naturalWidth > 0;
}
function shareIntent(text) {
  return "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
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

// ---- DOM ---------------------------------------------------------------
const introEl = document.getElementById("intro");
const gameScreenEl = document.getElementById("game");
const whoEl = document.getElementById("who");

const loginBox = document.getElementById("login-box");
const continueBox = document.getElementById("continue-box");
const handleInput = document.getElementById("handle-input");
if (window.attachHandleTypeahead) window.attachHandleTypeahead(handleInput);
const loginBtn = document.getElementById("login-btn");
const continueBtn = document.getElementById("continue-btn");
const continueHandleEl = document.getElementById("continue-handle");
const logoutBtn = document.getElementById("logout-btn");
const statusEl = document.getElementById("status");

const hpBar = document.getElementById("hp-bar");
const hpLabel = document.getElementById("hp-label");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const remainingEl = document.getElementById("remaining");

const board = document.getElementById("board");
const ctx = board.getContext("2d");
const startOverlay = document.getElementById("start-overlay");
const startCopy = document.getElementById("start-copy");
const startBtn = document.getElementById("start-btn");
const overOverlay = document.getElementById("over-overlay");
const overTitle = document.getElementById("over-title");
const overBody = document.getElementById("over-body");
const overStats = document.getElementById("over-stats");
const againBtn = document.getElementById("again-btn");
const shareBtn = document.getElementById("share-btn");
const shareNativeBtn = document.getElementById("share-native");
const likeBtn = document.getElementById("like-btn");
const shareCanvas = document.getElementById("share-canvas");
const shareCtx = shareCanvas.getContext("2d");

const dpr = Math.min(window.devicePixelRatio || 1, 2);
board.width = VIEW_W * dpr;
board.height = VIEW_H * dpr;
board.style.aspectRatio = `${VIEW_W} / ${VIEW_H}`;
ctx.scale(dpr, dpr);

function setStatus(msg, isError) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}
function showToast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.style.cssText =
      "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#1c2416;border:1px solid rgba(159,224,138,0.35);color:#eafcd8;padding:9px 16px;border-radius:999px;font:12.5px ui-monospace,monospace;z-index:50;opacity:0;transition:opacity .2s ease;pointer-events:none";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(t._to);
  t._to = setTimeout(() => (t.style.opacity = "0"), 2600);
}

// ---- session -------------------------------------------------------------
let session = null;
let playerProfile = null; // { avatar, displayName }

function updateAuthUI() {
  if (session) {
    loginBox.classList.add("hidden");
    continueBox.classList.remove("hidden");
    continueHandleEl.textContent = "@" + session.handle;
    whoEl.textContent = "@" + session.handle;
  } else {
    loginBox.classList.remove("hidden");
    continueBox.classList.add("hidden");
    whoEl.textContent = "";
  }
}

async function boot() {
  try {
    const cb = await completeLoginIfCallback();
    if (cb) session = cb;
  } catch (e) {
    setStatus(e.message || String(e), true);
  }
  if (!session) session = await getSession();
  updateAuthUI();
}

loginBtn.addEventListener("click", async () => {
  const h = handleInput.value.trim().replace(/^@/, "");
  if (!h) return;
  loginBtn.disabled = true;
  setStatus("redirecting to your PDS…");
  try {
    await login(h); // navigates away on success
  } catch (e) {
    setStatus(e.message || String(e), true);
    loginBtn.disabled = false;
  }
});
handleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn.click();
});
logoutBtn.addEventListener("click", async () => {
  await clearSession();
  session = null;
  updateAuthUI();
});
continueBtn.addEventListener("click", () => {
  introEl.classList.add("hidden");
  gameScreenEl.classList.remove("hidden");
  startLoadout();
});

// ---- horde loading ---------------------------------------------------------
let zombiePool = []; // { post: {uri,cid,text,createdAt,moot:{did,handle,displayName,avatar,img,hue,initial}} }
let hordeKind = "moots";

async function loadZombies(picked, byDid) {
  const out = [];
  let i = 0;
  for (const p of picked) {
    i++;
    startCopy.textContent = `checking @${p.handle}'s recent posts… (${out.length} found, ${i}/${picked.length} moots)`;
    try {
      const pds = session.pdsUrl.replace(/\/$/, "");
      const url = new URL(`${pds}/xrpc/app.bsky.feed.getAuthorFeed`);
      url.searchParams.set("actor", p.did);
      url.searchParams.set("limit", "15");
      url.searchParams.set("filter", "posts_no_replies");
      const res = await dpopFetch(session, url.toString(), {
        headers: { accept: "application/json", "atproto-proxy": "did:web:api.bsky.app#bsky_appview" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      let count = 0;
      const full = byDid.get(p.did) || {};
      for (const item of data.feed || []) {
        if (count >= MAX_PER_MOOT) break;
        if (item.reason) continue; // a repost of someone else — not their own post
        const post = item.post;
        if (!post || post.author?.did !== p.did) continue;
        if (post.viewer && post.viewer.like) continue; // already liked — not a zombie
        const text = (post.record && post.record.text) || "";
        if (!text.trim()) continue; // needs something to shamble around saying
        out.push({
          post: {
            uri: post.uri,
            cid: post.cid,
            text,
            createdAt: (post.record && post.record.createdAt) || post.indexedAt,
            moot: {
              did: p.did,
              handle: p.handle,
              displayName: full.displayName || p.displayName || p.handle,
              avatar: full.avatar || p.avatar || "",
            },
          },
        });
        count++;
      }
    } catch {
      // one moot's feed failing shouldn't sink the whole loadout
    }
  }
  // shuffle so the horde isn't sorted by moot
  for (let j = out.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [out[j], out[k]] = [out[k], out[j]];
  }
  return out;
}

const mootAssetCache = new Map();
function assetsFor(m) {
  if (!mootAssetCache.has(m.did)) {
    mootAssetCache.set(m.did, {
      img: loadImg(m.avatar),
      hue: hue(m.did),
      initial: (m.displayName || m.handle || "?")[0].toUpperCase(),
    });
  }
  return mootAssetCache.get(m.did);
}

let playerImg = null, playerHue = 0, playerInitial = "?";

async function startLoadout() {
  overOverlay.classList.add("hidden");
  startOverlay.classList.remove("hidden");
  startBtn.hidden = true;
  startCopy.textContent = "mapping your moots…";
  running = false;
  if (rafId) cancelAnimationFrame(rafId);

  try {
    const cluster = await moots(session.did, { onStep: (s) => (startCopy.textContent = s) });
    hordeKind = cluster.kind;
    if (!cluster.pool.length) {
      startCopy.textContent = "no moots or follows to raise a horde from.";
      startBtn.hidden = false;
      startBtn.textContent = "retry";
      startBtn.onclick = () => startLoadout();
      return;
    }
    const picked = cluster.pool.slice().sort(() => Math.random() - 0.5).slice(0, MAX_MOOTS);

    startCopy.textContent = "loading avatars…";
    const profiles = await getProfiles([session.did, ...picked.map((p) => p.did)]);
    const byDid = new Map(profiles.map((p) => [p.did, p]));

    const selfFull = byDid.get(session.did) || {};
    playerProfile = selfFull;
    playerImg = loadImg(selfFull.avatar || "");
    playerHue = hue(session.did);
    playerInitial = (selfFull.displayName || session.handle || "?")[0].toUpperCase();

    zombiePool = await loadZombies(picked, byDid);
    for (const z of zombiePool) Object.assign(z.post.moot, assetsFor(z.post.moot));

    buildDecor(session.did);

    if (!zombiePool.length) {
      startCopy.textContent = `your backlog is already clear — every recent post from ${picked.length} moots is already liked. no horde today.`;
      startBtn.hidden = false;
      startBtn.textContent = "check again";
      startBtn.onclick = () => startLoadout();
      return;
    }

    startCopy.textContent = `${zombiePool.length} unliked posts from ${picked.length} ${hordeKind === "moots" ? "moots" : "moots + follows"} are shambling around town. bite back with ❤️ before they corner you.`;
    startBtn.hidden = false;
    startBtn.textContent = "enter the town";
    startBtn.onclick = beginRun;
  } catch (e) {
    startCopy.textContent = `couldn't load the horde: ${e.message || e}`;
    startBtn.hidden = false;
    startBtn.textContent = "retry";
    startBtn.onclick = () => startLoadout();
  }
}

// ---- town decoration (deterministic per player) ---------------------------
let decor = [];
function buildDecor(did) {
  const rnd = seededRandom(hashInt(did));
  decor = [];
  for (let i = 0; i < 46; i++) {
    decor.push({
      x: rnd() * WORLD_W,
      y: rnd() * WORLD_H,
      w: 40 + rnd() * 90,
      h: 30 + rnd() * 70,
      shade: 0.45 + rnd() * 0.4,
    });
  }
}

// ---- run state -------------------------------------------------------------
let running = false;
let player = null; // { x, y, hp, hitFlash }
let pending = []; // zombiePool items not yet spawned
let onField = []; // { x, y, spdMul, bob, dying, deathAge, post }
let particles = [];
let score = 0;
let startTime = 0;
let spawnTimer = 0;
let lastAttackT = 0;
let lastBiter = null;
let rafId = null;
let lastT = 0;

function spawnCap(s) {
  return clamp(3 + Math.floor(s / 6), 3, 8);
}
function spawnInterval(s) {
  return Math.max(0.55, 1.7 - s * 0.02);
}
function zombieSpeed(s, mul) {
  return (50 + Math.min(s, 40) * 0.6) * mul;
}

function spawnZombie() {
  const item = pending.shift();
  if (!item) return;
  let x = 0, y = 0, tries = 0;
  do {
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) { x = Math.random() * WORLD_W; y = 0; }
    else if (edge === 1) { x = WORLD_W; y = Math.random() * WORLD_H; }
    else if (edge === 2) { x = Math.random() * WORLD_W; y = WORLD_H; }
    else { x = 0; y = Math.random() * WORLD_H; }
    tries++;
  } while (Math.hypot(x - player.x, y - player.y) < MIN_SPAWN_DIST && tries < 20);
  onField.push({ x, y, spdMul: 0.85 + Math.random() * 0.3, bob: Math.random() * 10, dying: false, deathAge: 0, post: item.post });
}

function beginRun() {
  startOverlay.classList.add("hidden");
  overOverlay.classList.add("hidden");
  pending = zombiePool.slice();
  onField = [];
  particles = [];
  score = 0;
  startTime = performance.now();
  player = { x: WORLD_W / 2, y: WORLD_H / 2, hp: MAX_HP, hitFlash: 0 };
  spawnTimer = 0.4;
  lastBiter = null;
  running = true;
  updateHud();
  lastT = performance.now();
  rafId = requestAnimationFrame(loop);
}

function updateHud() {
  const pct = clamp(player ? player.hp / MAX_HP : 1, 0, 1);
  hpBar.style.transform = `scaleX(${pct})`;
  hpLabel.textContent = String(Math.max(0, Math.round(player ? player.hp : MAX_HP)));
  scoreEl.textContent = String(score);
  timerEl.textContent = fmtTime(player ? (performance.now() - startTime) / 1000 : 0);
  remainingEl.textContent = String(pending.length + onField.filter((z) => !z.dying).length);
}

// ---- input -----------------------------------------------------------------
const heldKeys = new Set();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
    heldKeys.add(k);
    if (running) e.preventDefault();
  }
  if (e.code === "Space") {
    if (running) e.preventDefault();
    attack();
  }
});
window.addEventListener("keyup", (e) => heldKeys.delete(e.key.toLowerCase()));

function keyVec() {
  let x = 0, y = 0;
  if (heldKeys.has("arrowup") || heldKeys.has("w")) y -= 1;
  if (heldKeys.has("arrowdown") || heldKeys.has("s")) y += 1;
  if (heldKeys.has("arrowleft") || heldKeys.has("a")) x -= 1;
  if (heldKeys.has("arrowright") || heldKeys.has("d")) x += 1;
  const len = Math.hypot(x, y);
  return len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
}

let dragging = false, dragId = null, dragOrigin = { x: 0, y: 0 }, dragVec = { x: 0, y: 0 };
board.addEventListener("pointerdown", (e) => {
  if (!running) return;
  dragging = true;
  dragId = e.pointerId;
  dragOrigin = { x: e.clientX, y: e.clientY };
  dragVec = { x: 0, y: 0 };
  try { board.setPointerCapture(e.pointerId); } catch {}
});
board.addEventListener("pointermove", (e) => {
  if (!dragging || e.pointerId !== dragId) return;
  const dx = e.clientX - dragOrigin.x, dy = e.clientY - dragOrigin.y;
  const r = Math.hypot(dx, dy), max = 48;
  const s = r > max ? max / r : 1;
  dragVec = { x: (dx * s) / max, y: (dy * s) / max };
});
function endDrag(e) {
  if (e.pointerId !== dragId) return;
  dragging = false;
  dragVec = { x: 0, y: 0 };
  dragId = null;
}
board.addEventListener("pointerup", endDrag);
board.addEventListener("pointercancel", endDrag);

function flashLikeBtn() {
  likeBtn.classList.add("no-target");
  setTimeout(() => likeBtn.classList.remove("no-target"), 180);
}
likeBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  attack();
});

function findNearestTarget() {
  let best = null, bestD = Infinity;
  for (const z of onField) {
    if (z.dying) continue;
    const d = Math.hypot(z.x - player.x, z.y - player.y);
    if (d < ATTACK_R && d < bestD) { best = z; bestD = d; }
  }
  return best;
}

function attack() {
  if (!running) return;
  const now = performance.now();
  if (now - lastAttackT < ATTACK_COOLDOWN) return;
  lastAttackT = now;
  const target = findNearestTarget();
  if (!target) { flashLikeBtn(); return; }
  target.dying = true;
  target.deathAge = 0;
  score++;
  updateHud();
  particles.push({ x: target.x, y: target.y, vy: -40, life: 0.9 });
  likePost(target);
}

async function likePost(z) {
  try {
    const pds = session.pdsUrl.replace(/\/$/, "");
    const res = await dpopFetch(session, `${pds}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repo: session.did,
        collection: "app.bsky.feed.like",
        record: { $type: "app.bsky.feed.like", subject: { uri: z.post.uri, cid: z.post.cid }, createdAt: new Date().toISOString() },
      }),
    });
    if (!res.ok) throw new Error(`like failed (${res.status})`);
  } catch (e) {
    // it wasn't really liked — put it back in the queue so it comes back around.
    score = Math.max(0, score - 1);
    pending.push({ post: z.post });
    updateHud();
    showToast(`couldn't like @${z.post.moot.handle} — it'll be back.`);
  }
}

// ---- update / render --------------------------------------------------------
function update(dt) {
  const v = dragging ? dragVec : keyVec();
  player.x = clamp(player.x + v.x * SPEED * dt, PLAYER_R, WORLD_W - PLAYER_R);
  player.y = clamp(player.y + v.y * SPEED * dt, PLAYER_R, WORLD_H - PLAYER_R);
  player.hitFlash = Math.max(0, player.hitFlash - dt);

  spawnTimer -= dt;
  const cap = spawnCap(score);
  const interval = spawnInterval(score);
  while (spawnTimer <= 0 && onField.length < cap && pending.length > 0) {
    spawnZombie();
    spawnTimer += interval;
  }

  for (const z of onField) {
    if (z.dying) {
      z.deathAge += dt;
      continue;
    }
    const dx = player.x - z.x, dy = player.y - z.y;
    const dist = Math.hypot(dx, dy) || 1;
    const spd = zombieSpeed(score, z.spdMul);
    z.x += (dx / dist) * spd * dt;
    z.y += (dy / dist) * spd * dt;
    if (dist < CONTACT_R) {
      player.hp -= DPS * dt;
      player.hitFlash = 0.25;
      lastBiter = z;
    }
  }
  onField = onField.filter((z) => !(z.dying && z.deathAge >= DEATH_TIME));

  for (const p of particles) { p.y += p.vy * dt; p.life -= dt * 1.1; }
  particles = particles.filter((p) => p.life > 0);

  updateHud();

  if (player.hp <= 0) { gameOver(lastBiter); return; }
  if (pending.length === 0 && onField.length === 0) { win(); return; }
}

function drawAvatar(cx, cy, r, opts) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (imgReady(opts.img)) {
    ctx.drawImage(opts.img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = `hsl(${opts.hue} 50% 38%)`;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `${Math.round(r)}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.initial || "?", cx, cy + 1);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.2, 0, Math.PI * 2);
  ctx.strokeStyle = opts.ring || "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawZombie(z, camX, camY, isTarget) {
  const bob = Math.sin(performance.now() / 300 + z.bob) * 3;
  const sx = z.x - camX, sy = z.y - camY + bob;
  if (sx < -40 || sx > VIEW_W + 40 || sy < -40 || sy > VIEW_H + 40) return;
  const scale = z.dying ? Math.max(0, 1 - z.deathAge / DEATH_TIME) : 1;
  const r = ZOMBIE_R * scale;
  if (r <= 0.5) return;
  if (isTarget && !z.dying) {
    ctx.beginPath();
    ctx.arc(sx, sy, r + 8, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(216,74,74,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  drawAvatar(sx, sy, r, { img: z.post.moot.img, hue: z.post.moot.hue, initial: z.post.moot.initial, ring: z.dying ? "#eafcd8" : "#6f8a4a" });
  ctx.save();
  ctx.globalAlpha = 0.3 * scale;
  ctx.fillStyle = "#3a5a2a";
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (isTarget && !z.dying) {
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#eafcd8";
    ctx.fillText(`@${z.post.moot.handle}: "${safeSlice(z.post.text, 40)}"`, sx, sy - r - 12);
  }
}

function render() {
  const camX = clamp(player.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
  const camY = clamp(player.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = "#161d10";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  const step = 48;
  const offX = -(camX % step), offY = -(camY % step);
  for (let x = offX; x < VIEW_W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, VIEW_H); ctx.stroke(); }
  for (let y = offY; y < VIEW_H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VIEW_W, y); ctx.stroke(); }

  for (const d of decor) {
    const sx = d.x - camX, sy = d.y - camY;
    if (sx < -100 || sx > VIEW_W + 100 || sy < -100 || sy > VIEW_H + 100) continue;
    ctx.fillStyle = `rgba(60,70,45,${d.shade})`;
    ctx.fillRect(sx - d.w / 2, sy - d.h / 2, d.w, d.h);
  }

  ctx.strokeStyle = "rgba(216,74,74,0.35)";
  ctx.lineWidth = 6;
  ctx.strokeRect(-camX + 3, -camY + 3, WORLD_W - 6, WORLD_H - 6);

  const target = findNearestTarget();
  for (const z of onField) drawZombie(z, camX, camY, z === target);

  drawAvatar(player.x - camX, player.y - camY, PLAYER_R, { img: playerImg, hue: playerHue, initial: playerInitial, ring: "#eafcd8" });

  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillText("❤️", p.x - camX, p.y - camY);
  }
  ctx.globalAlpha = 1;

  if (player.hitFlash > 0) {
    ctx.fillStyle = `rgba(216,40,40,${Math.min(0.35, player.hitFlash)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function loop(t) {
  if (!running) return;
  const dt = Math.min((t - lastT) / 1000, 0.05) || 0;
  lastT = t;
  update(dt);
  if (running) render();
  rafId = requestAnimationFrame(loop);
}

// ---- end states --------------------------------------------------------------
let lastShareText = "";

function endCommon() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
}

function gameOver(z) {
  endCommon();
  const survived = (performance.now() - startTime) / 1000;
  overTitle.textContent = "you didn't make it";
  const left = pending.length + onField.filter((it) => !it.dying).length;
  overBody.innerHTML = z
    ? `Cornered by <b>@${esc(z.post.moot.handle)}</b>'s post — <i>"${esc(safeSlice(z.post.text, 90))}"</i> — and it finally got you.`
    : "The horde got you.";
  overStats.textContent = `${score} liked · survived ${fmtTime(survived)} · ${left} still out there`;
  overOverlay.classList.remove("hidden");

  const shareText = `mootpocalypse: liked ${score} zombies before my own backlog caught up with me. survived ${fmtTime(survived)}. mootpocalypse.bisks.net`;
  shareBtn.href = shareIntent(shareText);
  shareNativeBtn.hidden = true;
  buildShareCard({ won: false, score, survived, culprit: z }).then(() => {
    lastShareText = shareText;
    if (canShareFiles()) shareNativeBtn.hidden = false;
  });
}

function win() {
  endCommon();
  const survived = (performance.now() - startTime) / 1000;
  overTitle.textContent = "the town is quiet";
  overBody.innerHTML = `You liked every post your moots left behind. ${score} zombies, gone. For now.`;
  overStats.textContent = `${score} liked · survived ${fmtTime(survived)} · backlog cleared`;
  overOverlay.classList.remove("hidden");

  const shareText = `mootpocalypse: cleared my entire moot backlog for real — ${score} unliked posts, liked. mootpocalypse.bisks.net`;
  shareBtn.href = shareIntent(shareText);
  shareNativeBtn.hidden = true;
  buildShareCard({ won: true, score, survived }).then(() => {
    lastShareText = shareText;
    if (canShareFiles()) shareNativeBtn.hidden = false;
  });
}

againBtn.addEventListener("click", () => startLoadout());

// ---- share card -------------------------------------------------------------
const SHARE_W = 1200, SHARE_H = 630;

async function buildShareCard({ won, score, survived, culprit }) {
  const [pImg, cImg] = await Promise.all([
    loadImgCORS(playerProfile && playerProfile.avatar),
    loadImgCORS(culprit && culprit.post.moot.avatar),
  ]);

  shareCtx.clearRect(0, 0, SHARE_W, SHARE_H);
  const g = shareCtx.createLinearGradient(0, 0, 0, SHARE_H);
  g.addColorStop(0, "#0f150b");
  g.addColorStop(0.6, "#1a2413");
  g.addColorStop(1, "#233018");
  shareCtx.fillStyle = g;
  shareCtx.fillRect(0, 0, SHARE_W, SHARE_H);

  // scattered zombie glyphs for texture
  shareCtx.font = "40px sans-serif";
  shareCtx.globalAlpha = 0.14;
  const rnd = seededRandom(hashInt((session && session.did) || "seed"));
  for (let i = 0; i < 14; i++) {
    shareCtx.fillText("🧟", 40 + rnd() * (SHARE_W - 80), 40 + rnd() * (SHARE_H - 160));
  }
  shareCtx.globalAlpha = 1;

  function shareAvatar(cx, cy, r, img, hueV, initial, ring) {
    shareCtx.save();
    shareCtx.beginPath();
    shareCtx.arc(cx, cy, r, 0, Math.PI * 2);
    shareCtx.clip();
    if (img) {
      shareCtx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    } else {
      shareCtx.fillStyle = `hsl(${hueV} 50% 38%)`;
      shareCtx.fillRect(cx - r, cy - r, r * 2, r * 2);
      shareCtx.fillStyle = "#eafcd8";
      shareCtx.font = `${Math.round(r)}px ui-monospace, monospace`;
      shareCtx.textAlign = "center";
      shareCtx.textBaseline = "middle";
      shareCtx.fillText(initial || "?", cx, cy + 2);
    }
    shareCtx.restore();
    shareCtx.beginPath();
    shareCtx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    shareCtx.strokeStyle = ring;
    shareCtx.lineWidth = 3;
    shareCtx.stroke();
  }

  shareAvatar(150, SHARE_H / 2 - 20, 92, pImg, playerHue, playerInitial, "#eafcd8");
  if (culprit) {
    shareAvatar(300, SHARE_H / 2 + 90, 46, cImg, culprit.post.moot.hue, culprit.post.moot.initial, "rgba(216,74,74,0.9)");
  }

  shareCtx.textAlign = "left";
  shareCtx.fillStyle = "#eafcd8";
  shareCtx.font = "italic 700 46px ui-serif, Georgia, serif";
  shareCtx.fillText(won ? "the town is quiet" : "you didn't make it", 320, 150);

  shareCtx.fillStyle = "#c4d3b8";
  shareCtx.font = "22px ui-monospace, monospace";
  shareCtx.fillText(`@${(session && session.handle) || "?"}`, 320, 195);

  shareCtx.fillStyle = "#9fe08a";
  shareCtx.font = "700 30px ui-monospace, monospace";
  shareCtx.fillText(`${score} zombies liked`, 320, 250);

  shareCtx.fillStyle = "#c4d3b8";
  shareCtx.font = "20px ui-monospace, monospace";
  shareCtx.fillText(`survived ${fmtTime(survived)}`, 320, 285);

  if (culprit) {
    shareCtx.fillStyle = "#e9b3a8";
    shareCtx.font = "18px ui-monospace, monospace";
    const line = `got you: @${culprit.post.moot.handle} — "${safeSlice(culprit.post.text, 60)}"`;
    shareCtx.fillText(line, 320, 325);
  }

  shareCtx.fillStyle = "#7fc257";
  shareCtx.font = "700 24px ui-monospace, monospace";
  shareCtx.textAlign = "right";
  shareCtx.fillText("mootpocalypse.bisks.net", SHARE_W - 50, SHARE_H - 42);
}

shareNativeBtn.addEventListener("click", () => {
  shareCanvas.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], `mootpocalypse-${(session && session.handle) || "run"}.png`, { type: "image/png" });
    try {
      await navigator.share({ files: [file], text: lastShareText, title: "mootpocalypse" });
    } catch {}
  }, "image/png");
});

// ---- boot --------------------------------------------------------------------
boot();
