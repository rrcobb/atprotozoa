(() => {
"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

// ---------- layout ----------
const DIVIDER_X = 245;
const DESKS = [
  { x: 120, y: 140 },
  { x: 120, y: 270 },
  { x: 120, y: 400 },
];
const PICKUP_SLOTS = [
  { x: 270, y: 110 },
  { x: 270, y: 210 },
  { x: 270, y: 310 },
  { x: 270, y: 410 },
];
const TABLES = [
  { x: 360, y: 150 },
  { x: 560, y: 150 },
  { x: 740, y: 190 },
  { x: 440, y: 400 },
  { x: 660, y: 400 },
];
const PLAYER_BOUNDS = { minX: 285, maxX: 775, minY: 100, maxY: 465 };
const INTERACT_R = 62;
const PLAYER_SPEED = 205;

const UPGRADES = [
  { id: "shoes", at: 5, icon: "\u{1F45F}", label: "quick shoes", desc: "+15% move speed" },
  { id: "doubleBag", at: 12, icon: "\u{1F392}", label: "double bag", desc: "carry 2 floppies at once" },
  { id: "espresso", at: 20, icon: "☕", label: "espresso machine", desc: "coders write 20% faster" },
  { id: "tipJar", at: 30, icon: "\u{1F4B0}", label: "tip jar", desc: "+1 rating, right now" },
];

const ORDER_TYPES = [
  { id: "cat", icon: "\u{1F431}", label: "cat blog" },
  { id: "pizza", icon: "\u{1F355}", label: "pizza joint" },
  { id: "band", icon: "\u{1F3B8}", label: "band site" },
  { id: "flower", icon: "\u{1F490}", label: "flower shop" },
  { id: "ghost", icon: "\u{1F47B}", label: "haunted b&b" },
  { id: "crypto", icon: "\u{1FA99}", label: "crypto scheme" },
  { id: "wedding", icon: "\u{1F48D}", label: "wedding invite" },
  { id: "gym", icon: "\u{1F3CB}️", label: "gym membership" },
  { id: "bones", icon: "\u{1F9B4}", label: "taxidermy shop" },
  { id: "zine", icon: "\u{1F4CE}", label: "zine archive" },
];

// ---------- helpers ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const randRange = (lo, hi) => lo + Math.random() * (hi - lo);
const randInt = (lo, hi) => Math.floor(randRange(lo, hi + 1));
const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);
const pick = (arr) => arr[randInt(0, arr.length - 1)];

function currentWave(elapsed) {
  return 1 + Math.floor(elapsed / 25);
}
function patienceRange(wave) {
  const base = clamp(26 - wave * 1.6, 12, 26);
  return [base * 0.85, base * 1.15];
}
function spawnRange(wave) {
  const base = clamp(4.2 - wave * 0.22, 1.7, 4.2);
  return [base * 0.7, base * 1.3];
}
function cookRange(wave) {
  const base = clamp(5.4 - wave * 0.18, 3.0, 5.4);
  return [base * 0.85, base * 1.15];
}

// ---------- state ----------
let state = "start"; // start | playing | gameover
let score = 0, stars = 3, combo = 1, comboIdle = 0;
let elapsed = 0, delivered = 0, missed = 0, spawnTimer = 1;
let tableState = new Array(TABLES.length).fill(null);
let deskState = new Array(DESKS.length).fill(null);
let queue = [];
let pickupSlots = new Array(PICKUP_SLOTS.length).fill(null);
let player = { x: 500, y: 465, carrying: [], dir: "down" };
let floatingTexts = [];
let upgrades = {};
let speedMult = 1;
let upgradeToast = null;
let best = Number(localStorage.getItem("floppydash-best") || 0);

document.getElementById("best").textContent = String(best);

function resetGame() {
  score = 0; stars = 3; combo = 1; comboIdle = 0;
  elapsed = 0; delivered = 0; missed = 0; spawnTimer = 1;
  tableState = new Array(TABLES.length).fill(null);
  deskState = new Array(DESKS.length).fill(null);
  queue = [];
  pickupSlots = new Array(PICKUP_SLOTS.length).fill(null);
  player = { x: 500, y: 465, carrying: [], dir: "down" };
  floatingTexts = [];
  upgrades = {};
  speedMult = 1;
  upgradeToast = null;
  updateUpgradeTrack();
}

function applyUpgrade(id) {
  if (id === "shoes") speedMult = 1.15;
  if (id === "tipJar") stars = Math.min(3, stars + 1);
}

function checkUpgrades() {
  for (const u of UPGRADES) {
    if (delivered >= u.at && !upgrades[u.id]) {
      upgrades[u.id] = true;
      applyUpgrade(u.id);
      upgradeToast = { icon: u.icon, label: u.label, desc: u.desc, life: 3.2, maxLife: 3.2 };
      spawnFloatText(player.x, player.y - 40, "upgrade!", "#ffcb47");
    }
  }
  updateUpgradeTrack();
}

function updateUpgradeTrack() {
  const iconsEl = document.getElementById("upgrade-icons");
  const nextEl = document.getElementById("upgrade-next");
  if (!iconsEl || !nextEl) return;
  const owned = UPGRADES.filter((u) => upgrades[u.id]);
  iconsEl.textContent = owned.length ? owned.map((u) => u.icon).join(" ") : "—";
  const next = UPGRADES.find((u) => !upgrades[u.id]);
  nextEl.textContent = next ? "next: " + next.icon + " " + next.label + " (" + delivered + "/" + next.at + ")" : "all upgrades unlocked";
}

function spawnFloatText(x, y, text, color) {
  floatingTexts.push({ x, y, text, color, life: 1.1, maxLife: 1.1 });
}

// ---------- simulation ----------
function trySpawnCustomer() {
  const empty = [];
  for (let i = 0; i < tableState.length; i++) if (tableState[i] === null) empty.push(i);
  if (!empty.length) return;
  const idx = pick(empty);
  const wave = currentWave(elapsed);
  const [pLo, pHi] = patienceRange(wave);
  const maxPatience = randRange(pLo, pHi);
  const order = pick(ORDER_TYPES);
  tableState[idx] = {
    order, patience: maxPatience, maxPatience,
    orderState: "seated", // seated | ordered | leaving
    leaveKind: null, leaveTimer: 0, popT: 0.35,
  };
}

function clearKitchenFor(tableIdx) {
  queue = queue.filter((o) => o.tableIdx !== tableIdx);
  for (let i = 0; i < deskState.length; i++) {
    if (deskState[i] && deskState[i].tableIdx === tableIdx) deskState[i] = null;
  }
  for (let i = 0; i < pickupSlots.length; i++) {
    if (pickupSlots[i] && pickupSlots[i].tableIdx === tableIdx) pickupSlots[i] = null;
  }
  player.carrying = player.carrying.filter((it) => it.tableIdx !== tableIdx);
}

function missCustomer(idx) {
  const c = tableState[idx];
  if (!c) return;
  c.orderState = "leaving";
  c.leaveKind = "angry";
  c.leaveTimer = 1.0;
  clearKitchenFor(idx);
  stars -= 1;
  combo = 1; comboIdle = 0;
  missed += 1;
  spawnFloatText(TABLES[idx].x, TABLES[idx].y - 30, "walked out!", "#ff5d5d");
}

function deliverTo(idx) {
  const c = tableState[idx];
  const ci = player.carrying.findIndex((it) => it.tableIdx === idx);
  if (!c || ci === -1) return;
  const frac = clamp(c.patience / c.maxPatience, 0, 1);
  const pts = Math.round((60 + 140 * frac) * combo);
  score += pts;
  spawnFloatText(TABLES[idx].x, TABLES[idx].y - 30, "+" + pts, "#59e88f");
  combo = Math.min(combo + 1, 6);
  comboIdle = 0;
  delivered += 1;
  c.orderState = "leaving";
  c.leaveKind = "happy";
  c.leaveTimer = 1.0;
  player.carrying.splice(ci, 1);
  checkUpgrades();
}

function tryInteract() {
  if (state !== "playing") return;
  const capacity = upgrades.doubleBag ? 2 : 1;

  // 1. deliver to a nearby table if carrying its matching order
  for (const item of player.carrying) {
    const target = item.tableIdx;
    const c = tableState[target];
    if (c && c.orderState === "ordered" && dist(player.x, player.y, TABLES[target].x, TABLES[target].y) < INTERACT_R) {
      deliverTo(target);
      return;
    }
  }

  if (player.carrying.length < capacity) {
    // 2. pick up a ready floppy
    let best = -1, bestD = INTERACT_R;
    for (let i = 0; i < PICKUP_SLOTS.length; i++) {
      if (!pickupSlots[i]) continue;
      const d = dist(player.x, player.y, PICKUP_SLOTS[i].x, PICKUP_SLOTS[i].y);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      player.carrying.push(pickupSlots[best]);
      pickupSlots[best] = null;
      return;
    }
    // 3. take an order from a seated customer
    best = -1; bestD = INTERACT_R;
    for (let i = 0; i < TABLES.length; i++) {
      const c = tableState[i];
      if (!c || c.orderState !== "seated") continue;
      const d = dist(player.x, player.y, TABLES[i].x, TABLES[i].y);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0) {
      const c = tableState[best];
      c.orderState = "ordered";
      queue.push({ order: c.order, tableIdx: best });
    }
  }
}

function update(dt) {
  if (state !== "playing") return;
  elapsed += dt;
  const wave = currentWave(elapsed);

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    trySpawnCustomer();
    const [sLo, sHi] = spawnRange(wave);
    spawnTimer = randRange(sLo, sHi);
  }

  for (let i = 0; i < tableState.length; i++) {
    const c = tableState[i];
    if (!c) continue;
    if (c.popT > 0) c.popT = Math.max(0, c.popT - dt);
    if (c.orderState === "seated" || c.orderState === "ordered") {
      c.patience -= dt;
      if (c.patience <= 0) { c.patience = 0; missCustomer(i); }
    } else if (c.orderState === "leaving") {
      c.leaveTimer -= dt;
      if (c.leaveTimer <= 0) tableState[i] = null;
    }
  }

  for (let i = 0; i < deskState.length; i++) {
    const d = deskState[i];
    if (!d) continue;
    if (!d.done) {
      d.progress += dt;
      if (d.progress >= d.duration) d.done = true;
    }
    if (d.done) {
      const slot = pickupSlots.findIndex((s) => s === null);
      if (slot >= 0) {
        pickupSlots[slot] = { order: d.order, tableIdx: d.tableIdx, bornT: elapsed };
        deskState[i] = null;
      }
    }
  }
  for (let i = 0; i < deskState.length; i++) {
    if (deskState[i] === null && queue.length) {
      const next = queue.shift();
      const [cLo, cHi] = cookRange(wave);
      const duration = randRange(cLo, cHi) * (upgrades.espresso ? 0.8 : 1);
      deskState[i] = { order: next.order, tableIdx: next.tableIdx, progress: 0, duration, done: false };
    }
  }

  let vx = 0, vy = 0;
  if (keys.up) vy -= 1;
  if (keys.down) vy += 1;
  if (keys.left) vx -= 1;
  if (keys.right) vx += 1;
  if (vx || vy) {
    const len = Math.hypot(vx, vy);
    vx /= len; vy /= len;
    player.x = clamp(player.x + vx * PLAYER_SPEED * speedMult * dt, PLAYER_BOUNDS.minX, PLAYER_BOUNDS.maxX);
    player.y = clamp(player.y + vy * PLAYER_SPEED * speedMult * dt, PLAYER_BOUNDS.minY, PLAYER_BOUNDS.maxY);
    if (Math.abs(vx) > Math.abs(vy)) player.dir = vx > 0 ? "right" : "left";
    else player.dir = vy > 0 ? "down" : "up";
  }

  comboIdle += dt;
  if (comboIdle > 12 && combo > 1) { combo = 1; comboIdle = 0; }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const t = floatingTexts[i];
    t.y -= 28 * dt; t.life -= dt;
    if (t.life <= 0) floatingTexts.splice(i, 1);
  }

  if (upgradeToast) {
    upgradeToast.life -= dt;
    if (upgradeToast.life <= 0) upgradeToast = null;
  }

  if (stars <= 0) endGame();

  document.getElementById("score").textContent = String(score);
  document.getElementById("stars").textContent = "♥".repeat(Math.max(0, stars)) + "♡".repeat(Math.max(0, 3 - stars));
  const comboEl = document.getElementById("combo");
  comboEl.textContent = "×" + combo;
  comboEl.classList.toggle("hot", combo >= 3);
  document.getElementById("wave").textContent = String(wave);
}

// ---------- rendering ----------
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFloppy(x, y, scale, orderIcon) {
  const s = scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = "#2b6fd6";
  roundRect(-16, -16, 32, 32, 3);
  ctx.fill();
  ctx.fillStyle = "#0b0e12";
  ctx.fillRect(-16, -16, 32, 8);
  ctx.fillStyle = "#dfe8f5";
  ctx.fillRect(-9, -16, 12, 7);
  ctx.fillStyle = "#f2f5fa";
  roundRect(-11, -2, 22, 16, 2);
  ctx.fill();
  ctx.restore();
  if (orderIcon) {
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(orderIcon, x, y + 4);
  }
}

function drawPatienceBar(x, y, frac) {
  const w = 44, h = 6;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  roundRect(x - w / 2, y, w, h, 3);
  ctx.fill();
  const color = frac > 0.5 ? "#59e88f" : frac > 0.25 ? "#ffcb47" : "#ff5d5d";
  ctx.fillStyle = color;
  roundRect(x - w / 2, y, w * frac, h, 3);
  ctx.fill();
}

function drawPerson(x, y, bodyColor, bob) {
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, 22, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = bodyColor;
  roundRect(-11, -6, 22, 26, 8);
  ctx.fill();
  ctx.fillStyle = "#f2c9a0";
  ctx.beginPath();
  ctx.arc(0, -16, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0d1218";
  ctx.fillRect(0, 0, W, H);

  // floor tiles (dining side)
  const tile = 40;
  for (let y = 70; y < 470; y += tile) {
    for (let x = DIVIDER_X; x < 800; x += tile) {
      ctx.fillStyle = ((x / tile + y / tile) % 2 === 0) ? "#141b23" : "#121820";
      ctx.fillRect(x, y, tile, tile);
    }
  }
  // kitchen zone
  ctx.fillStyle = "#0f1720";
  ctx.fillRect(0, 60, DIVIDER_X, 420);
  ctx.strokeStyle = "#2a323d";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(DIVIDER_X, 60);
  ctx.lineTo(DIVIDER_X, 480);
  ctx.stroke();

  ctx.font = "bold 12px ui-monospace, monospace";
  ctx.fillStyle = "#5b6875";
  ctx.textAlign = "left";
  ctx.fillText("KITCHEN", 16, 44);
  ctx.fillText("PICKUP →", 190, 90);
  ctx.textAlign = "right";
  ctx.fillText("DINING FLOOR", 784, 44);

  // desks
  for (let i = 0; i < DESKS.length; i++) {
    const d = DESKS[i];
    const st = deskState[i];
    ctx.fillStyle = "#1c242e";
    roundRect(d.x - 45, d.y - 20, 90, 40, 6);
    ctx.fill();
    ctx.strokeStyle = "#333d49";
    ctx.lineWidth = 2;
    roundRect(d.x - 45, d.y - 20, 90, 40, 6);
    ctx.stroke();
    const bob = st ? Math.sin(elapsed * 14 + i) * 2 : 0;
    drawPerson(d.x, d.y - 30, "#3a4b8f", bob);
    if (st) {
      ctx.font = "18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(st.done ? "✅" : "⌨️", d.x, d.y + 4);
      if (!st.done) {
        const frac = clamp(st.progress / st.duration, 0, 1);
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        roundRect(d.x - 30, d.y + 16, 60, 6, 3);
        ctx.fill();
        ctx.fillStyle = "#ffcb47";
        roundRect(d.x - 30, d.y + 16, 60 * frac, 6, 3);
        ctx.fill();
      }
    } else {
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#4a5560";
      ctx.fillText("—", d.x, d.y + 4);
    }
  }

  // pickup slots
  for (let i = 0; i < PICKUP_SLOTS.length; i++) {
    const p = PICKUP_SLOTS[i];
    ctx.fillStyle = "#171e26";
    roundRect(p.x - 24, p.y - 22, 48, 44, 6);
    ctx.fill();
    ctx.strokeStyle = "#333d49";
    roundRect(p.x - 24, p.y - 22, 48, 44, 6);
    ctx.stroke();
    const slot = pickupSlots[i];
    if (slot) {
      const pulse = 1 + Math.sin(elapsed * 6) * 0.06;
      drawFloppy(p.x, p.y, pulse, slot.order.icon);
    }
  }

  // tables
  for (let i = 0; i < TABLES.length; i++) {
    const t = TABLES[i];
    ctx.fillStyle = "#20293380";
    ctx.beginPath();
    ctx.ellipse(t.x, t.y + 34, 30, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a2b1f";
    ctx.beginPath();
    ctx.ellipse(t.x, t.y + 18, 26, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5a4530";
    ctx.lineWidth = 2;
    ctx.stroke();

    const c = tableState[i];
    if (c) {
      const bodyColor = c.orderState === "ordered" ? "#c07a2e" : "#7a8bb0";
      drawPerson(t.x, t.y - 4, bodyColor, 0);

      if (c.orderState === "leaving") {
        ctx.font = "22px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = clamp(c.leaveTimer / 1.0, 0, 1);
        ctx.fillText(c.leaveKind === "happy" ? "\u{1F60A}" : "\u{1F621}", t.x, t.y - 42);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = "#0b0e12";
        roundRect(t.x - 20, t.y - 58, 40, 26, 6);
        ctx.fill();
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(c.orderState === "seated" ? "❓" : c.order.icon, t.x, t.y - 45);
        drawPatienceBar(t.x, t.y - 76, clamp(c.patience / c.maxPatience, 0, 1));
      }
    }
  }

  // player
  const carryBob = Math.sin(elapsed * 10) * 1.5;
  drawPerson(player.x, player.y, "#59e88f", 0);
  player.carrying.forEach((item, i) => {
    const offsetX = player.carrying.length > 1 ? (i === 0 ? -14 : 14) : 0;
    drawFloppy(player.x + offsetX, player.y - 34 + carryBob, 0.8, item.order.icon);
  });

  // floating texts
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of floatingTexts) {
    ctx.globalAlpha = clamp(t.life / t.maxLife, 0, 1);
    ctx.font = "bold 16px ui-monospace, monospace";
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  // upgrade toast
  if (upgradeToast) {
    const t = upgradeToast;
    const alpha = t.life > t.maxLife - 0.4 ? (t.maxLife - t.life) / 0.4 : clamp(t.life / 0.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    const w = 360, h = 56, x = (W - w) / 2, y = 14;
    ctx.fillStyle = "#101820ee";
    roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = "#ffcb47";
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 10);
    ctx.stroke();
    ctx.font = "26px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(t.icon, x + 16, y + h / 2);
    ctx.font = "bold 14px ui-monospace, monospace";
    ctx.fillStyle = "#ffcb47";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("UPGRADE: " + t.label, x + 54, y + 23);
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillStyle = "#a9b8c2";
    ctx.fillText(t.desc, x + 54, y + 41);
    ctx.restore();
  }
}

// ---------- input ----------
const keys = { up: false, down: false, left: false, right: false };
const KEY_MAP = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
};

window.addEventListener("keydown", (e) => {
  if (KEY_MAP[e.code]) { keys[KEY_MAP[e.code]] = true; e.preventDefault(); }
  if ((e.code === "Space" || e.code === "Enter") && !e.repeat) { tryInteract(); e.preventDefault(); }
});
window.addEventListener("keyup", (e) => {
  if (KEY_MAP[e.code]) { keys[KEY_MAP[e.code]] = false; e.preventDefault(); }
});

function bindHold(el, key) {
  const on = (e) => { e.preventDefault(); keys[key] = true; };
  const off = (e) => { e.preventDefault(); keys[key] = false; };
  el.addEventListener("pointerdown", on);
  el.addEventListener("pointerup", off);
  el.addEventListener("pointercancel", off);
  el.addEventListener("pointerleave", off);
}
bindHold(document.getElementById("btn-up"), "up");
bindHold(document.getElementById("btn-down"), "down");
bindHold(document.getElementById("btn-left"), "left");
bindHold(document.getElementById("btn-right"), "right");
document.getElementById("btn-action").addEventListener("click", (e) => { e.preventDefault(); tryInteract(); });

if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
  document.getElementById("touch-controls").classList.add("active");
}

// ---------- share card ----------
const shareCanvas = document.getElementById("shareCanvas");
function buildShareCard() {
  const sctx = shareCanvas.getContext("2d");
  const w = shareCanvas.width, h = shareCanvas.height;
  sctx.clearRect(0, 0, w, h);
  const grad = sctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#0b1a12");
  grad.addColorStop(1, "#0b0e12");
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, w, h);

  sctx.textAlign = "left";
  sctx.fillStyle = "#59e88f";
  sctx.font = "800 64px ui-monospace, monospace";
  sctx.fillText("\u{1F4BE} floppydash", 60, 120);

  sctx.fillStyle = "#a9b8c2";
  sctx.font = "24px ui-monospace, monospace";
  sctx.fillText("the website shop needed legs. i had them.", 60, 165);

  sctx.fillStyle = "#ffcb47";
  sctx.font = "800 120px ui-monospace, monospace";
  sctx.fillText(String(score), 60, 320);
  sctx.fillStyle = "#7d8b96";
  sctx.font = "26px ui-monospace, monospace";
  sctx.fillText("points this shift", 60, 360);

  const stats = [
    ["sites delivered", delivered],
    ["customers walked", missed],
    ["best combo", "×" + combo],
    ["rating", "♥".repeat(Math.max(0, stars)) + "♡".repeat(Math.max(0, 3 - stars))],
  ];
  sctx.font = "24px ui-monospace, monospace";
  stats.forEach((s, i) => {
    const y = 430 + i * 42;
    sctx.fillStyle = "#7d8b96";
    sctx.fillText(s[0], 60, y);
    sctx.fillStyle = "#e8f1ea";
    sctx.textAlign = "right";
    sctx.fillText(String(s[1]), 640, y);
    sctx.textAlign = "left";
  });

  sctx.font = "22px ui-monospace, monospace";
  sctx.fillStyle = "#59e88f";
  sctx.fillText("floppydash.bisks.net", 60, h - 50);

  // a big floppy on the right
  sctx.save();
  sctx.translate(950, 300);
  sctx.scale(6, 6);
  sctx.fillStyle = "#2b6fd6";
  roundRect(-16, -16, 32, 32, 3); sctx.fill();
  sctx.fillStyle = "#0b0e12";
  sctx.fillRect(-16, -16, 32, 8);
  sctx.fillStyle = "#dfe8f5";
  sctx.fillRect(-9, -16, 12, 7);
  sctx.fillStyle = "#f2f5fa";
  roundRect(-11, -2, 22, 16, 2); sctx.fill();
  sctx.restore();
}

function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const probe = new File([""], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) { return false; }
}

function endGame() {
  state = "gameover";
  if (score > best) { best = score; localStorage.setItem("floppydash-best", String(best)); }
  document.getElementById("best").textContent = String(best);

  document.getElementById("go-title").textContent = score >= best && score > 0 ? "new best shift!" : "shop's closed";
  document.getElementById("go-score").textContent = String(score);
  document.getElementById("go-detail").textContent =
    delivered + " site" + (delivered === 1 ? "" : "s") + " delivered, " +
    missed + " customer" + (missed === 1 ? "" : "s") + " walked out. wave " + currentWave(elapsed) + ".";

  const shareText = "just closed out a floppydash shift: " + score + " pts, " + delivered +
    " sites delivered, " + missed + " customers walked out on me. floppydash.bisks.net";
  document.getElementById("shareBluesky").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

  buildShareCard();

  document.getElementById("shareDownload").onclick = () => {
    const a = document.createElement("a");
    a.download = "floppydash-" + score + ".png";
    a.href = shareCanvas.toDataURL("image/png");
    a.click();
  };

  const nativeBtn = document.getElementById("shareNative");
  if (canShareFiles()) {
    nativeBtn.style.display = "";
    nativeBtn.onclick = () => {
      shareCanvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], "floppydash-" + score + ".png", { type: "image/png" });
        try { await navigator.share({ files: [file], text: shareText, title: "floppydash" }); }
        catch (_) { /* cancelled */ }
      }, "image/png");
    };
  } else {
    nativeBtn.style.display = "none";
  }

  document.getElementById("overlay-start").classList.add("hidden");
  document.getElementById("overlay-gameover").classList.remove("hidden");
}

document.getElementById("btn-start").addEventListener("click", () => {
  resetGame();
  state = "playing";
  document.getElementById("overlay-start").classList.add("hidden");
  document.getElementById("overlay-gameover").classList.add("hidden");
});
document.getElementById("btn-again").addEventListener("click", () => {
  resetGame();
  state = "playing";
  document.getElementById("overlay-gameover").classList.add("hidden");
});

// ---------- loop ----------
let last = null;
function frame(ts) {
  if (last === null) last = ts;
  let dt = (ts - last) / 1000;
  last = ts;
  dt = Math.min(dt, 0.05);
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
