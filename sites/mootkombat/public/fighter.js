// fighter.js — moot kombat. Canvas stick-figure fighter: build a moot ladder
// (lib/moots.js) then fight up it, one bout per moot, one retry per moot.
// No frameworks, no build step — vanilla JS + canvas 2D.

import { buildLadder } from "./lib/moots.js";

// ── DOM ────────────────────────────────────────────────────────────────
const form = document.getElementById("form");
const input = document.getElementById("handle");
const msg = document.getElementById("msg");
const playBtn = document.getElementById("play");
const finder = document.querySelector("form.finder");
const game = document.getElementById("game");

const ladderTrackEl = document.getElementById("ladderTrack");

const prefightEl = document.getElementById("prefight");
const rungTagEl = document.getElementById("rungTag");
const oppPortraitEl = document.getElementById("oppPortrait");
const oppNameEl = document.getElementById("oppName");
const oppHandleEl = document.getElementById("oppHandle");
const diffFillEl = document.getElementById("diffFill");
const diffLabelEl = document.getElementById("diffLabel");
const tauntBubbleEl = document.getElementById("tauntBubble");
const retriesLabelEl = document.getElementById("retriesLabel");
const fightBtn = document.getElementById("fightBtn");

const arenaWrapEl = document.getElementById("arenaWrap");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const playerFillEl = document.getElementById("playerFill");
const oppFillEl = document.getElementById("oppFill");
const playerHpEl = document.getElementById("playerHp");
const oppHpEl = document.getElementById("oppHp");
const playerBarNameEl = document.getElementById("playerBarName");
const oppBarNameEl = document.getElementById("oppBarName");

const resultOverlayEl = document.getElementById("resultOverlay");
const resultTitleEl = document.getElementById("resultTitle");
const resultTextEl = document.getElementById("resultText");
const resultActionsEl = document.getElementById("resultActions");

const victoryCard = document.getElementById("victoryCard");
const victoryMsg = document.getElementById("victoryMsg");
const defeatCard = document.getElementById("defeatCard");
const defeatMsg = document.getElementById("defeatMsg");

const shareCanvas = document.getElementById("shareCanvas");
const shareCtx = shareCanvas.getContext("2d");

// ── constants ──────────────────────────────────────────────────────────
const W = canvas.width, H = canvas.height;
const GROUND = H - 46;
const ARENA_MIN = 60, ARENA_MAX = W - 60;
const MOVE_SPEED = 210; // px/sec
const MAX_HP = 100;

const PUNCH = { range: 74, dmg: [5, 9], startup: 110, active: 90, recovery: 160 };
const KICK = { range: 96, dmg: [8, 13], startup: 190, active: 100, recovery: 230 };
const HITSTUN = 260;
const BLOCK_CHIP = 0.15; // fraction of damage that still gets through a block

const escapeHtml = (s) =>
  (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shortHandle = (h) => "@" + (h || "").replace(/\.bsky\.social$/, "");
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const rand = (a, b) => a + Math.random() * (b - a);

// ── avatar image cache ────────────────────────────────────────────────
const imgCache = new Map();
function loadAvatar(url) {
  if (!url) return null;
  if (imgCache.has(url)) return imgCache.get(url);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  const entry = { img, ready: false };
  img.onload = () => (entry.ready = true);
  img.onerror = () => (entry.ready = false);
  imgCache.set(url, entry);
  return entry;
}

// ── run state ──────────────────────────────────────────────────────────
let ladderData = null; // { self, ladder, mootCount }
let rungIndex = 0;
let retriesLeft = 1;
let cleared = 0;

// ── fighter entity ────────────────────────────────────────────────────
function makeFighter({ x, facingRight, isPlayer, name, avatar, color, difficulty }) {
  return {
    x, isPlayer, name, avatar: avatar ? loadAvatar(avatar) : null, color,
    difficulty: difficulty || 0,
    facing: facingRight ? 1 : -1,
    hp: MAX_HP,
    vx: 0,
    walking: false,
    blocking: false,
    action: null, // { type:'punch'|'kick', spec, t, hit }
    hitstunT: 0,
    koT: -1,
    flashT: 0,
    // AI-only
    aiNextT: 0,
    aiIntent: "idle", // 'idle'|'approach'|'retreat'|'block'
  };
}

let player, opp;
let running = false;
let lastT = 0;
let held = new Set();
let sparks = []; // { x, y, t }
let shakeT = 0;
let popups = []; // { x, y, text, t, color }

// ── input ──────────────────────────────────────────────────────────────
window.addEventListener("keydown", (e) => {
  if (e.target === input || e.target.tagName === "INPUT") return; // don't eat keys while typing a handle
  const k = e.key.toLowerCase();
  if (["arrowleft", "arrowright", "a", "d", "l", "shift"].includes(k)) e.preventDefault();
  held.add(k);
  if (!running) return;
  if (k === "j") tryAttack(player, PUNCH, "punch");
  if (k === "k") tryAttack(player, KICK, "kick");
});
window.addEventListener("keyup", (e) => {
  if (e.target === input || e.target.tagName === "INPUT") return;
  held.delete(e.key.toLowerCase());
});

document.querySelectorAll(".touch button").forEach((btn) => {
  const k = btn.dataset.k;
  const map = { left: "a", right: "d", block: "l" };
  if (map[k]) {
    const key = map[k];
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); held.add(key); });
    btn.addEventListener("touchend", (e) => { e.preventDefault(); held.delete(key); });
    btn.addEventListener("mousedown", () => held.add(key));
    btn.addEventListener("mouseup", () => held.delete(key));
    btn.addEventListener("mouseleave", () => held.delete(key));
  } else {
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); if (running) tryAttack(player, k === "punch" ? PUNCH : KICK, k); });
    btn.addEventListener("click", () => { if (running) tryAttack(player, k === "punch" ? PUNCH : KICK, k); });
  }
});

function canAct(f) {
  return !f.action && f.hitstunT <= 0 && f.koT < 0;
}

function tryAttack(f, spec, type) {
  if (!canAct(f)) return;
  f.action = { type, spec, t: 0, hit: false };
  f.blocking = false;
}

// ── combat resolution ─────────────────────────────────────────────────
function applyHit(attacker, defender, spec) {
  const dist = Math.abs(attacker.x - defender.x);
  if (dist > spec.range) return;
  // must be facing them
  const facingRight = defender.x > attacker.x;
  if ((facingRight && attacker.facing < 0) || (!facingRight && attacker.facing > 0)) return;

  let dmg = rand(spec.dmg[0], spec.dmg[1]);
  const blocked = defender.blocking && canAct(defender);
  if (blocked) {
    dmg *= BLOCK_CHIP;
  } else {
    defender.hitstunT = HITSTUN;
    defender.action = null;
    defender.vx = 0;
  }
  defender.hp = clamp(defender.hp - dmg, 0, MAX_HP);
  defender.flashT = 120;
  shakeT = blocked ? 60 : 120;

  const midX = (attacker.x + defender.x) / 2;
  sparks.push({ x: midX, y: GROUND - 90, t: blocked ? 140 : 220, blocked });
  popups.push({
    x: defender.x, y: GROUND - 150,
    text: blocked ? "blocked" : "-" + Math.round(dmg),
    color: blocked ? "#9a86b8" : "#ffd23f",
    t: 600,
  });

  updateBars();
  if (defender.hp <= 0 && defender.koT < 0) {
    defender.koT = 0;
    endBout(attacker.isPlayer);
  }
}

// ── AI ─────────────────────────────────────────────────────────────────
function aiDecide(f, target, dt) {
  f.aiNextT -= dt;
  if (f.aiNextT > 0) return;
  const t = f.difficulty;
  const reactionMs = 620 - t * 460; // 620ms easy .. 160ms hard
  f.aiNextT = reactionMs + rand(-60, 60);

  const dist = Math.abs(target.x - f.x);
  const aggression = 0.18 + t * 0.5; // 0.18 .. 0.68
  const blockChance = 0.04 + t * 0.42; // 0.04 .. 0.46

  if (!canAct(f)) { f.aiIntent = "idle"; return; }

  if (dist <= KICK.range * 0.9) {
    const roll = Math.random();
    if (roll < aggression) {
      f.aiIntent = "idle";
      tryAttack(f, dist <= PUNCH.range ? (Math.random() < 0.5 ? PUNCH : KICK) : KICK, "atk");
    } else if (roll < aggression + blockChance) {
      f.aiIntent = "block";
    } else if (f.hp < 30 && Math.random() < 0.5) {
      f.aiIntent = "retreat";
    } else {
      f.aiIntent = "idle";
    }
  } else {
    f.aiIntent = "approach";
  }
}

function applyAiIntent(f, target, dt) {
  f.blocking = f.aiIntent === "block" && canAct(f);
  if (!canAct(f)) { f.vx = 0; return; }
  if (f.aiIntent === "approach") {
    f.vx = target.x > f.x ? 1 : -1;
  } else if (f.aiIntent === "retreat") {
    f.vx = target.x > f.x ? -1 : 1;
  } else {
    f.vx = 0;
  }
}

// ── physics / state update ──────────────────────────────────────────────
function updateFighter(f, other, dt) {
  const dtMs = dt * 1000;

  if (f.flashT > 0) f.flashT -= dtMs;

  if (f.koT >= 0) {
    f.koT += dtMs;
    f.vx = 0;
    return;
  }

  if (f.hitstunT > 0) {
    f.hitstunT -= dtMs;
    f.vx = 0;
  }

  // action progression
  if (f.action) {
    const a = f.action;
    a.t += dtMs;
    const s = a.spec;
    if (!a.hit && a.t >= s.startup && a.t < s.startup + s.active) {
      applyHit(f, other, s);
      a.hit = true;
    }
    if (a.t >= s.startup + s.active + s.recovery) {
      f.action = null;
    }
  }

  // player input (movement + block only when idle/can act)
  if (f.isPlayer) {
    if (canAct(f)) {
      const left = held.has("a") || held.has("arrowleft");
      const right = held.has("d") || held.has("arrowright");
      f.vx = right && !left ? 1 : left && !right ? -1 : 0;
      f.blocking = held.has("l") || held.has("shift");
    } else {
      f.vx = 0;
    }
  }

  if (f.vx !== 0 && canAct(f)) {
    f.x = clamp(f.x + f.vx * MOVE_SPEED * dt, ARENA_MIN, ARENA_MAX);
    f.walking = true;
  } else {
    f.walking = false;
  }

  // face opponent unless mid-action
  if (!f.action) {
    f.facing = other.x > f.x ? 1 : -1;
  }
}

function updateBars() {
  playerFillEl.style.width = clamp((player.hp / MAX_HP) * 100, 0, 100) + "%";
  oppFillEl.style.width = clamp((opp.hp / MAX_HP) * 100, 0, 100) + "%";
  playerHpEl.textContent = Math.max(0, Math.round(player.hp));
  oppHpEl.textContent = Math.max(0, Math.round(opp.hp));
}

// ── rendering ──────────────────────────────────────────────────────────
const LEG = 46, TORSO = 52, ARM = 38, HEAD_R = 19;

function pose(f, walkPhase) {
  const hip = { x: f.x, y: GROUND - LEG };
  const shoulder = { x: f.x, y: hip.y - TORSO };
  const head = { x: shoulder.x, y: shoulder.y - HEAD_R - 2 };
  const fw = f.facing;

  let legL, legR, armL, armR;

  if (f.koT >= 0) {
    const k = Math.min(1, f.koT / 260);
    return {
      hip: { x: hip.x, y: hip.y + k * 18 },
      shoulder: { x: shoulder.x + fw * 18 * k, y: shoulder.y + k * 26 },
      head: { x: head.x + fw * 26 * k, y: head.y + k * 30 },
      legL: { x: hip.x - 20, y: GROUND },
      legR: { x: hip.x + 22, y: GROUND - 6 },
      armL: { x: shoulder.x - 24, y: shoulder.y + 10 },
      armR: { x: shoulder.x + 20, y: shoulder.y + 6 },
    };
  }

  if (f.hitstunT > 0) {
    const lean = -fw * 10;
    return {
      hip, shoulder: { x: shoulder.x + lean, y: shoulder.y },
      head: { x: head.x + lean * 1.6, y: head.y + 4 },
      legL: { x: hip.x - 14, y: GROUND }, legR: { x: hip.x + 14, y: GROUND },
      armL: { x: shoulder.x - 20 + lean, y: shoulder.y + 16 },
      armR: { x: shoulder.x + 20 + lean, y: shoulder.y + 16 },
    };
  }

  if (f.action) {
    const a = f.action;
    const s = a.spec;
    const p = clamp(a.t / (s.startup + s.active), 0, 1); // 0..1 through strike
    if (a.type === "punch" || (a.type === "atk" && s === PUNCH)) {
      const reach = Math.sin(Math.min(1, p) * Math.PI) * 34;
      return {
        hip, shoulder,
        head: { x: head.x + fw * 4, y: head.y },
        legL: { x: hip.x - 16, y: GROUND }, legR: { x: hip.x + 16, y: GROUND },
        armL: { x: shoulder.x - fw * 10, y: shoulder.y + 18 },
        armR: { x: shoulder.x + fw * (ARM + reach), y: shoulder.y - 4 },
      };
    } else {
      // kick
      const reach = Math.sin(Math.min(1, p) * Math.PI) * 44;
      return {
        hip, shoulder: { x: shoulder.x - fw * 8, y: shoulder.y },
        head: { x: head.x - fw * 8, y: head.y },
        legL: { x: hip.x - fw * 12, y: GROUND },
        legR: { x: hip.x + fw * (LEG * 0.6 + reach), y: GROUND - 30 - reach * 0.3 },
        armL: { x: shoulder.x - fw * 24, y: shoulder.y + 10 },
        armR: { x: shoulder.x - fw * 20, y: shoulder.y - 6 },
      };
    }
  }

  if (f.blocking) {
    return {
      hip, shoulder,
      head: { x: head.x, y: head.y },
      legL: { x: hip.x - 14, y: GROUND }, legR: { x: hip.x + 14, y: GROUND },
      armL: { x: shoulder.x + fw * 20, y: shoulder.y - 10 },
      armR: { x: shoulder.x + fw * 26, y: shoulder.y + 2 },
    };
  }

  const swing = f.walking ? Math.sin(walkPhase) * 16 : 0;
  return {
    hip, shoulder,
    head,
    legL: { x: hip.x - 14 + swing, y: GROUND },
    legR: { x: hip.x + 14 - swing, y: GROUND },
    armL: { x: shoulder.x - fw * 12 - swing * 0.4, y: shoulder.y + 22 },
    armR: { x: shoulder.x + fw * 12 + swing * 0.4, y: shoulder.y + 22 },
  };
}

function drawFighter(f, walkPhase) {
  const p = pose(f, walkPhase);
  ctx.save();
  ctx.strokeStyle = f.color;
  ctx.fillStyle = f.color;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (f.flashT > 0) {
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 14;
  }

  // shadow on ground
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(f.x, GROUND + 6, 26, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // legs
  ctx.beginPath(); ctx.moveTo(p.hip.x, p.hip.y); ctx.lineTo(p.legL.x, p.legL.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p.hip.x, p.hip.y); ctx.lineTo(p.legR.x, p.legR.y); ctx.stroke();
  // torso
  ctx.beginPath(); ctx.moveTo(p.hip.x, p.hip.y); ctx.lineTo(p.shoulder.x, p.shoulder.y); ctx.stroke();
  // arms
  ctx.beginPath(); ctx.moveTo(p.shoulder.x, p.shoulder.y); ctx.lineTo(p.armL.x, p.armL.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p.shoulder.x, p.shoulder.y); ctx.lineTo(p.armR.x, p.armR.y); ctx.stroke();

  ctx.shadowBlur = 0;

  // head
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.head.x, p.head.y, HEAD_R, 0, Math.PI * 2);
  if (f.avatar && f.avatar.ready) {
    ctx.save();
    ctx.clip();
    ctx.drawImage(f.avatar.img, p.head.x - HEAD_R, p.head.y - HEAD_R, HEAD_R * 2, HEAD_R * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = f.color;
    ctx.fill();
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = f.color;
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function drawSparksAndPopups(dt) {
  const dtMs = dt * 1000;
  sparks = sparks.filter((s) => (s.t -= dtMs) > 0);
  for (const s of sparks) {
    const a = s.t / (s.blocked ? 140 : 220);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = s.blocked ? "#9a86b8" : "#ffd23f";
    ctx.lineWidth = 3;
    const n = s.blocked ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const r1 = 4, r2 = 4 + (1 - a) * 16;
      ctx.beginPath();
      ctx.moveTo(s.x + Math.cos(ang) * r1, s.y + Math.sin(ang) * r1);
      ctx.lineTo(s.x + Math.cos(ang) * r2, s.y + Math.sin(ang) * r2);
      ctx.stroke();
    }
    ctx.restore();
  }
  popups = popups.filter((p) => (p.t -= dtMs) > 0);
  for (const p of popups) {
    const a = clamp(p.t / 600, 0, 1);
    const rise = (1 - a) * 24;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.font = "800 16px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(p.text, p.x, p.y - rise);
    ctx.restore();
  }
}

function render(dt, walkPhase) {
  ctx.save();
  if (shakeT > 0) {
    shakeT -= dt * 1000;
    ctx.translate(rand(-3, 3), rand(-3, 3));
  }
  ctx.clearRect(-10, -10, W + 20, H + 20);

  // ground line
  ctx.strokeStyle = "#2e2148";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND + 8);
  ctx.lineTo(W, GROUND + 8);
  ctx.stroke();

  const [back, front] = player.x <= opp.x ? [player, opp] : [opp, player];
  drawFighter(back, walkPhase);
  drawFighter(front, walkPhase);
  drawSparksAndPopups(dt);

  ctx.restore();
}

// ── game loop ──────────────────────────────────────────────────────────
function loop(ts) {
  if (!running) return;
  const dt = Math.min(0.033, (ts - lastT) / 1000 || 0);
  lastT = ts;

  aiDecide(opp, player, dt * 1000);
  applyAiIntent(opp, player, dt);

  updateFighter(player, opp, dt);
  updateFighter(opp, player, dt);
  updateBars();

  const walkPhase = ts / 90;
  render(dt, walkPhase);

  requestAnimationFrame(loop);
}

// ── bout flow ──────────────────────────────────────────────────────────
function startBout() {
  const rung = ladderData.ladder[rungIndex];
  const selfAvatar = ladderData.self.avatar;

  player = makeFighter({
    x: 220, facingRight: true, isPlayer: true,
    name: shortHandle(ladderData.self.handle), avatar: selfAvatar, color: "#26e0c9",
  });
  opp = makeFighter({
    x: W - 220, facingRight: false, isPlayer: false,
    name: shortHandle(rung.handle), avatar: rung.avatar, color: "#ff2e63",
    difficulty: rung.difficulty,
  });
  held.clear();
  sparks = []; popups = []; shakeT = 0;

  playerBarNameEl.textContent = player.name;
  oppBarNameEl.textContent = opp.name;
  updateBars();

  resultOverlayEl.className = "result-overlay";
  arenaWrapEl.classList.add("on");
  prefightEl.classList.remove("on");

  running = true;
  lastT = performance.now();
  requestAnimationFrame((ts) => { lastT = ts; loop(ts); });
}

function endBout(playerWon) {
  running = false;
  arenaWrapEl.classList.remove("on");
  const rung = ladderData.ladder[rungIndex];

  resultOverlayEl.className = "result-overlay on " + (playerWon ? "win" : "lose");
  resultActionsEl.innerHTML = "";

  if (playerWon) {
    cleared++;
    resultTitleEl.textContent = "KO — YOU WIN";
    resultTextEl.textContent = `${shortHandle(rung.handle)} is down.`;
    const btn = document.createElement("button");
    btn.className = "go";
    const isLast = rungIndex === ladderData.ladder.length - 1;
    btn.textContent = isLast ? "claim victory" : "next moot";
    btn.addEventListener("click", () => {
      if (isLast) {
        showVictory();
      } else {
        rungIndex++;
        retriesLeft = 1;
        showPrefight();
      }
    });
    resultActionsEl.appendChild(btn);
  } else if (retriesLeft > 0) {
    retriesLeft--;
    resultTitleEl.textContent = "KO'D";
    resultTextEl.textContent = `${shortHandle(rung.handle)} got you. one retry left — same moot.`;
    const btn = document.createElement("button");
    btn.className = "go";
    btn.textContent = "retry";
    btn.addEventListener("click", startBout);
    resultActionsEl.appendChild(btn);
    const give = document.createElement("button");
    give.className = "ghost";
    give.textContent = "give up the run";
    give.addEventListener("click", () => showDefeat(rung));
    resultActionsEl.appendChild(give);
  } else {
    resultTitleEl.textContent = "KO'D — RUN OVER";
    resultTextEl.textContent = `${shortHandle(rung.handle)} beat you twice. that's the run.`;
    showDefeat(rung);
    return;
  }

  updateLadderTrack();
}

// ── screens ────────────────────────────────────────────────────────────
function updateLadderTrack() {
  ladderTrackEl.innerHTML = "";
  ladderData.ladder.forEach((m, i) => {
    const img = document.createElement("img");
    img.className = "rung" + (i < rungIndex ? " done" : i === rungIndex ? " now" : "");
    img.src = m.avatar || "";
    img.alt = shortHandle(m.handle);
    img.title = shortHandle(m.handle) + (i === ladderData.ladder.length - 1 ? " (biggest moot)" : "");
    img.onerror = () => (img.style.visibility = "hidden");
    ladderTrackEl.appendChild(img);
  });
  const label = document.createElement("div");
  label.className = "label";
  label.textContent = `rung ${Math.min(rungIndex + 1, ladderData.ladder.length)} / ${ladderData.ladder.length}`;
  ladderTrackEl.appendChild(label);
}

function showPrefight() {
  const rung = ladderData.ladder[rungIndex];
  const isLast = rungIndex === ladderData.ladder.length - 1;

  rungTagEl.className = "rung-tag" + (isLast ? " boss" : "");
  rungTagEl.textContent = isLast
    ? "★ FINAL BOSS — YOUR BIGGEST MOOT ★"
    : `moot ${rungIndex + 1} of ${ladderData.ladder.length}`;
  oppPortraitEl.src = rung.avatar || "";
  oppPortraitEl.onerror = () => (oppPortraitEl.style.visibility = "hidden");
  oppNameEl.textContent = rung.displayName;
  oppHandleEl.textContent = `${shortHandle(rung.handle)} · ${(rung.followersCount ?? 0).toLocaleString()} followers`;
  diffFillEl.style.width = Math.round(rung.difficulty * 100) + "%";
  diffLabelEl.textContent =
    rung.difficulty < 0.3 ? "should be manageable" : rung.difficulty < 0.65 ? "real threat" : "way out of your weight class";
  tauntBubbleEl.textContent = rung.taunt?.text || "…";
  retriesLabelEl.innerHTML = `<b>${retriesLeft}</b> retry available for this bout`;

  resultOverlayEl.className = "result-overlay";
  arenaWrapEl.classList.remove("on");
  prefightEl.classList.add("on");
  updateLadderTrack();
  prefightEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

fightBtn.addEventListener("click", startBout);

function showVictory() {
  game.classList.remove("on");
  const boss = ladderData.ladder[ladderData.ladder.length - 1];
  victoryMsg.textContent = `${shortHandle(ladderData.self.handle)} cleared all ${ladderData.ladder.length} moots and dropped ${shortHandle(boss.handle)}, the biggest one of all. undisputed champion of the moot ladder.`;
  victoryCard.classList.add("on");
  wireShare(victoryCard, victoryMsg.textContent, boss, true);
  victoryCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showDefeat(rung) {
  game.classList.remove("on");
  defeatMsg.textContent = `${shortHandle(ladderData.self.handle)} made it ${cleared} moot${cleared === 1 ? "" : "s"} up the ladder before ${shortHandle(rung.handle)} ended the run.`;
  defeatCard.classList.add("on");
  wireShare(defeatCard, defeatMsg.textContent, rung, false);
  defeatCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── share ──────────────────────────────────────────────────────────────
let lastShareText = "";
function canShareFiles() {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const test = new File([new Uint8Array([1])], "t.png", { type: "image/png" });
    return navigator.canShare({ files: [test] });
  } catch {
    return false;
  }
}

function drawShareCard(won, rung) {
  const SW = shareCanvas.width, SH = shareCanvas.height;
  shareCtx.clearRect(0, 0, SW, SH);
  const g = shareCtx.createLinearGradient(0, 0, 0, SH);
  g.addColorStop(0, "#241436");
  g.addColorStop(1, "#0a0710");
  shareCtx.fillStyle = g;
  shareCtx.fillRect(0, 0, SW, SH);

  shareCtx.textAlign = "left";
  shareCtx.fillStyle = won ? "#ffd23f" : "#ff4d4d";
  shareCtx.font = "800 56px ui-monospace, monospace";
  shareCtx.fillText(won ? "LADDER CLEARED" : "RUN OVER", 60, 110);

  shareCtx.fillStyle = "#f3ecff";
  shareCtx.font = "600 26px ui-monospace, monospace";
  const msgLine = won
    ? `beat all ${ladderData.ladder.length} moots, biggest last`
    : `made it ${cleared} moot${cleared === 1 ? "" : "s"} up the ladder`;
  shareCtx.fillText(msgLine, 60, 160);

  // fighters
  const cy = 340, r = 90;
  drawShareAvatar(shareCtx, 260, cy, r, ladderData.self.avatar, "#26e0c9", shortHandle(ladderData.self.handle));
  drawShareAvatar(shareCtx, SW - 260, cy, r, rung.avatar, "#ff2e63", shortHandle(rung.handle));

  shareCtx.fillStyle = "#9a86b8";
  shareCtx.font = "700 30px ui-monospace, monospace";
  shareCtx.textAlign = "center";
  shareCtx.fillText("VS", SW / 2, cy + 12);

  shareCtx.textAlign = "right";
  shareCtx.fillStyle = "#ffd23f";
  shareCtx.font = "700 24px ui-monospace, monospace";
  shareCtx.fillText("mootkombat.bisks.net", SW - 56, SH - 44);
}

function drawShareAvatar(c, cx, cy, r, url, color, label) {
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
  const entry = url ? loadAvatar(url) : null;
  if (entry && entry.ready) {
    c.save();
    c.clip();
    c.drawImage(entry.img, cx - r, cy - r, r * 2, r * 2);
    c.restore();
  }
  c.lineWidth = 6;
  c.strokeStyle = color;
  c.stroke();
  c.restore();

  c.textAlign = "center";
  c.fillStyle = "#f3ecff";
  c.font = "700 26px ui-monospace, monospace";
  c.fillText(label, cx, cy + r + 40);
}

function wireShare(card, text, rung, won) {
  const shareA = card.querySelector('[id$="Share"]');
  const shareNative = card.querySelector('[id$="ShareNative"]');
  const shareText = `${text} — mootkombat.bisks.net`;
  shareA.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText);

  // give avatars a beat to finish loading before we snapshot
  setTimeout(() => {
    drawShareCard(won, rung);
    lastShareText = shareText;
    if (canShareFiles()) shareNative.hidden = false;
  }, 250);

  shareNative.onclick = () => {
    drawShareCard(won, rung);
    shareCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "mootkombat.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "moot kombat" });
      } catch {}
    }, "image/png");
  };
}

// ── replay / reset ────────────────────────────────────────────────────
function resetToPrefight() {
  rungIndex = 0;
  retriesLeft = 1;
  cleared = 0;
  victoryCard.classList.remove("on");
  defeatCard.classList.remove("on");
  game.classList.add("on");
  showPrefight();
}

function backToStart() {
  ladderData = null;
  running = false;
  victoryCard.classList.remove("on");
  defeatCard.classList.remove("on");
  game.classList.remove("on");
  finder.style.display = "";
  input.value = "";
  input.focus();
  msg.className = "msg";
  msg.textContent = "reads Bluesky's public graph and feeds in your browser — no login.";
}

document.getElementById("victoryReplay").addEventListener("click", resetToPrefight);
document.getElementById("defeatReplay").addEventListener("click", resetToPrefight);
document.getElementById("victoryNew").addEventListener("click", backToStart);
document.getElementById("defeatNew").addEventListener("click", backToStart);

// ── boot ───────────────────────────────────────────────────────────────
const initial = new URLSearchParams(location.search).get("h") || "";
if (initial) input.value = initial;

input.addEventListener("input", () => {
  msg.className = "msg";
  msg.textContent = "reads Bluesky's public graph and feeds in your browser — no login.";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const h = input.value.trim();
  if (!h) { input.focus(); return; }
  playBtn.disabled = true;
  msg.className = "msg";
  msg.textContent = "resolving @" + h.replace(/^@/, "") + "…";
  try {
    const res = await buildLadder(h, {
      onStep: (s) => { msg.className = "msg"; msg.textContent = s; },
    });
    ladderData = res;
    rungIndex = 0;
    retriesLeft = 1;
    cleared = 0;
    msg.className = "msg ok";
    msg.textContent = `ladder built: ${res.ladder.length} moots picked from ${res.mootCount} total. good luck.`;
    game.classList.add("on");
    finder.style.display = "none";
    input.blur(); // keyboard controls (a/d/j/k/l) shouldn't get eaten by the text field
    showPrefight();
    game.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    msg.className = "msg err";
    msg.textContent =
      err && err.status === 400
        ? "couldn't find that handle. check the spelling?"
        : "couldn't load that one — " + (err.message || "try again") + ".";
  } finally {
    playBtn.disabled = false;
  }
});

if (initial) form.requestSubmit();
