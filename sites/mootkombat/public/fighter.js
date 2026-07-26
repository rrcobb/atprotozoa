// fighter.js — moot kombat. Canvas stick-figure fighter: build a moot ladder
// (lib/moots.js) then fight up it, one bout per moot, one retry per moot.
// Smash-style: floating stage + platforms, double jump, dash, percent-based
// knockback that sends fighters flying off the blast zones for the KO.
// No frameworks, no build step — vanilla JS + canvas 2D + WebAudio.

import { buildLadder } from "./lib/moots.js";

// ── DOM ────────────────────────────────────────────────────────────────
const form = document.getElementById("form");
const input = document.getElementById("handle");
if (window.attachHandleTypeahead) window.attachHandleTypeahead(input);
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
const muteBtn = document.getElementById("muteBtn");

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
const GROUND = H - 70;
const ARENA_MIN = 90, ARENA_MAX = W - 90; // walkable stage edge — step past it and you fall
const MOVE_SPEED = 230, AIR_MOVE_SPEED = 170;
const MAX_PERCENT = 300;

const GRAVITY = 1400;
const JUMP_V = -630;
const AIRJUMP_V = -560;
const DASH_SPEED = 520, DASH_DURATION = 150, DASH_COOLDOWN = 420;

const BLAST_LEFT = -60, BLAST_RIGHT = W + 60, BLAST_BOTTOM = GROUND + 170, BLAST_TOP = -240;

const GROUND_SURFACE = { x1: ARENA_MIN, x2: ARENA_MAX, y: GROUND };
const platL = { x1: 170, x2: 330, y: GROUND - 110 };
const platR = { x1: W - 330, x2: W - 170, y: GROUND - 110 };
const platC = { x1: W / 2 - 70, x2: W / 2 + 70, y: GROUND - 195 };
const SURFACES = [GROUND_SURFACE, platL, platR, platC];

const PUNCH = {
  range: 74, dmg: [5, 9], startup: 110, active: 90, recovery: 160,
  kbBase: 110, kbGrowth: 3.0, angle: (58 * Math.PI) / 180,
};
const KICK = {
  range: 96, dmg: [8, 13], startup: 190, active: 100, recovery: 230,
  kbBase: 150, kbGrowth: 3.7, angle: (50 * Math.PI) / 180,
};
const BLOCK_CHIP = 0.15; // fraction of damage that still gets through a block

const escapeHtml = (s) =>
  (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shortHandle = (h) => "@" + (h || "").replace(/\.bsky\.social$/, "");
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const rand = (a, b) => a + Math.random() * (b - a);

// ── sound (tiny synthesized WebAudio — no external assets) ─────────────
let muted = localStorage.getItem("mootkombat-muted") === "1";
let actx = null;
function audioCtx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === "suspended") actx.resume();
  return actx;
}
function beep({ freq = 440, dur = 0.08, type = "square", gain = 0.15, slide = 0, delay = 0 }) {
  if (muted) return;
  try {
    const c = audioCtx();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {}
}
function noiseBurst({ dur = 0.1, gain = 0.2, delay = 0, filterFreq = 1200 } = {}) {
  if (muted) return;
  try {
    const c = audioCtx();
    const t0 = c.currentTime + delay;
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = filterFreq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filt).connect(g).connect(c.destination);
    src.start(t0);
  } catch {}
}
const sfx = {
  punch: () => { noiseBurst({ dur: 0.07, gain: 0.28, filterFreq: 1800 }); beep({ freq: 180, dur: 0.06, gain: 0.12 }); },
  kick: () => { noiseBurst({ dur: 0.1, gain: 0.32, filterFreq: 900 }); beep({ freq: 120, dur: 0.09, gain: 0.14 }); },
  block: () => { beep({ freq: 340, dur: 0.05, type: "triangle", gain: 0.12 }); noiseBurst({ dur: 0.05, gain: 0.15, filterFreq: 2500 }); },
  jump: (double) => beep({ freq: double ? 520 : 420, dur: 0.08, type: "sine", gain: 0.1, slide: double ? 160 : 100 }),
  dash: () => noiseBurst({ dur: 0.12, gain: 0.18, filterFreq: 3200 }),
  land: () => noiseBurst({ dur: 0.06, gain: 0.12, filterFreq: 600 }),
  ko: () => { beep({ freq: 520, dur: 0.5, type: "sawtooth", gain: 0.15, slide: -460 }); noiseBurst({ dur: 0.4, gain: 0.2, filterFreq: 500, delay: 0.05 }); },
};
function updateMuteBtn() {
  if (muteBtn) muteBtn.textContent = muted ? "\u{1F507}" : "\u{1F50A}";
}
updateMuteBtn();
if (muteBtn) {
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    localStorage.setItem("mootkombat-muted", muted ? "1" : "0");
    updateMuteBtn();
  });
}

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
    x, footY: GROUND, vx: 0, vy: 0, airborne: false, jumpsLeft: 2,
    surface: GROUND_SURFACE, dashT: 0, dashCdT: 0, moveDir: 0,
    isPlayer, name, avatar: avatar ? loadAvatar(avatar) : null, color,
    difficulty: difficulty || 0,
    facing: facingRight ? 1 : -1,
    percent: 0,
    walking: false,
    blocking: false,
    action: null, // { type:'punch'|'kick', spec, t, hit }
    hitstunT: 0,
    koT: -1,
    flashT: 0,
    // AI-only
    aiNextT: 0,
    aiIntent: "idle", // 'idle'|'approach'|'retreat'|'block'|'recover'
  };
}

let player, opp;
window.__mkDebug = () => ({ player: { x: player.x, footY: player.footY, vx: player.vx, vy: player.vy, airborne: player.airborne, percent: player.percent, koT: player.koT }, opp: { x: opp.x, footY: opp.footY, vx: opp.vx, vy: opp.vy, airborne: opp.airborne, percent: opp.percent, koT: opp.koT } });
window.__mkForceHit = (pct, useKick) => {
  const spec = useKick ? KICK : PUNCH;
  opp.percent = pct;
  opp.x = player.x + spec.range - 5;
  applyHit(player, opp, spec);
};
let running = false;
let lastT = 0;
let held = new Set();
let sparks = []; // { x, y, t, blocked }
let particles = []; // { x, y, vx, vy, t, maxT, color, size }
let shakeT = 0;
let popups = []; // { x, y, text, t, color }

// ── input ──────────────────────────────────────────────────────────────
window.addEventListener("keydown", (e) => {
  if (e.target === input || e.target.tagName === "INPUT") return; // don't eat keys while typing a handle
  const k = e.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowup", " ", "a", "d", "w", "l", "shift", "j", "k"].includes(k)) e.preventDefault();
  held.add(k);
  if (!running) return;
  if (k === "j") tryAttack(player, PUNCH, "punch");
  if (k === "k") tryAttack(player, KICK, "kick");
  if (!e.repeat && (k === "w" || k === "arrowup" || k === " ")) doJump(player);
  if (!e.repeat && k === "shift") {
    const left = held.has("a") || held.has("arrowleft");
    const right = held.has("d") || held.has("arrowright");
    doDash(player, right && !left ? 1 : left && !right ? -1 : null);
  }
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
  } else if (k === "jump") {
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); if (running) doJump(player); });
    btn.addEventListener("click", () => { if (running) doJump(player); });
  } else if (k === "dash") {
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); if (running) doDash(player, player.facing); });
    btn.addEventListener("click", () => { if (running) doDash(player, player.facing); });
  } else {
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); if (running) tryAttack(player, k === "punch" ? PUNCH : KICK, k); });
    btn.addEventListener("click", () => { if (running) tryAttack(player, k === "punch" ? PUNCH : KICK, k); });
  }
});

function canAct(f) {
  return !f.action && f.hitstunT <= 0 && f.koT < 0;
}

function tryAttack(f, spec, type) {
  if (!canAct(f) || f.dashT > 0) return;
  f.action = { type, spec, t: 0, hit: false };
  f.blocking = false;
}

function doJump(f) {
  if (f.koT >= 0 || f.hitstunT > 0 || f.action || f.dashT > 0) return;
  if (!f.airborne) {
    f.airborne = true;
    f.vy = JUMP_V;
    f.jumpsLeft = 1;
    spawnBurst(f.x, f.footY, f.color, 5, 20, 60, 200);
    sfx.jump(false);
  } else if (f.jumpsLeft > 0) {
    f.vy = AIRJUMP_V;
    f.jumpsLeft--;
    spawnBurst(f.x, f.footY, f.color, 7, 30, 90, 220);
    sfx.jump(true);
  }
}

function doDash(f, dir) {
  if (f.koT >= 0 || f.hitstunT > 0 || f.action || f.dashT > 0 || f.dashCdT > 0) return;
  const d = dir || f.facing;
  f.dashT = DASH_DURATION;
  f.dashCdT = DASH_COOLDOWN;
  f.vx = d * DASH_SPEED;
  f.blocking = false;
  spawnBurst(f.x, f.footY, f.color, 6, 40, 120, 200);
  sfx.dash();
}

// ── particles ────────────────────────────────────────────────────────
function spawnBurst(x, y, color, count, speedMin, speedMax, life) {
  for (let i = 0; i < count; i++) {
    const ang = rand(0, Math.PI * 2);
    const spd = rand(speedMin, speedMax);
    particles.push({
      x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - spd * 0.2,
      t: life, maxT: life, color, size: rand(2, 4),
    });
  }
}
function updateParticles(dt) {
  const dtMs = dt * 1000;
  for (const p of particles) {
    p.vy += GRAVITY * 0.3 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.t -= dtMs;
  }
  particles = particles.filter((p) => p.t > 0);
}
function drawParticles() {
  for (const p of particles) {
    const a = clamp(p.t / p.maxT, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ── combat resolution ─────────────────────────────────────────────────
function applyHit(attacker, defender, spec) {
  const dist = Math.abs(attacker.x - defender.x);
  if (dist > spec.range) return;
  // must be facing them
  const facingRight = defender.x > attacker.x;
  if ((facingRight && attacker.facing < 0) || (!facingRight && attacker.facing > 0)) return;
  if (Math.abs(attacker.footY - defender.footY) > 110) return; // too far apart vertically (different platform)

  let dmg = rand(spec.dmg[0], spec.dmg[1]);
  const blocked = defender.blocking && canAct(defender) && !defender.airborne;
  const dirAway = defender.x >= attacker.x ? 1 : -1;

  if (blocked) {
    dmg *= BLOCK_CHIP;
    defender.vx = dirAway * 90;
    defender.hitstunT = 150;
    shakeT = 60;
    sfx.block();
  } else {
    defender.percent = clamp(defender.percent + dmg, 0, MAX_PERCENT);
    const launch = spec.kbBase + defender.percent * spec.kbGrowth;
    defender.vx = dirAway * Math.cos(spec.angle) * launch;
    defender.vy = -Math.sin(spec.angle) * launch;
    defender.airborne = true;
    defender.hitstunT = clamp(90 + launch * 0.55, 90, 1100);
    defender.action = null;
    defender.blocking = false;
    shakeT = 120;
    (spec === KICK ? sfx.kick : sfx.punch)();
  }

  defender.flashT = 120;
  const midX = (attacker.x + defender.x) / 2;
  const midY = (attacker.footY + defender.footY) / 2 - 90;
  sparks.push({ x: midX, y: midY, t: blocked ? 140 : 220, blocked });
  spawnBurst(midX, midY, blocked ? "#9a86b8" : defender.color, blocked ? 5 : 10, 60, blocked ? 100 : 220, blocked ? 250 : 400);
  popups.push({
    x: defender.x, y: midY - 40,
    text: blocked ? "blocked" : "+" + Math.round(dmg) + "%",
    color: blocked ? "#9a86b8" : "#ffd23f",
    t: 600,
  });

  updateBars();
}

function triggerRingOut(f, other) {
  if (!running || f.koT >= 0) return;
  f.koT = 0;
  spawnBurst(f.x, clamp(f.footY, -100, H + 100), f.color, 18, 90, 260, 650);
  sfx.ko();
  endBout(other.isPlayer);
}

// ── AI ─────────────────────────────────────────────────────────────────
function aiDecide(f, target, dt) {
  f.aiNextT -= dt;

  const inDanger = f.airborne && (f.x < ARENA_MIN - 30 || f.x > ARENA_MAX + 30 || f.footY > GROUND + 40);
  if (inDanger) {
    f.aiIntent = "recover";
    if (f.vy > -50 && f.jumpsLeft > 0 && canAct(f)) doJump(f);
    return;
  }

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
    } else if (f.percent > 60 && Math.random() < 0.4) {
      f.aiIntent = "retreat";
    } else {
      f.aiIntent = "idle";
    }
  } else {
    f.aiIntent = "approach";
    if (!f.airborne && dist > 260 && t > 0.35 && Math.random() < 0.02) doDash(f, target.x > f.x ? 1 : -1);
    if (!f.airborne && t > 0.5 && Math.random() < 0.01) doJump(f);
  }
}

function applyAiIntent(f, target) {
  f.blocking = f.aiIntent === "block" && canAct(f) && !f.airborne;
  if (!canAct(f)) { f.moveDir = 0; return; }
  if (f.aiIntent === "approach") {
    f.moveDir = target.x > f.x ? 1 : -1;
  } else if (f.aiIntent === "retreat") {
    f.moveDir = target.x > f.x ? -1 : 1;
  } else if (f.aiIntent === "recover") {
    f.moveDir = f.x < (ARENA_MIN + ARENA_MAX) / 2 ? 1 : -1;
  } else {
    f.moveDir = 0;
  }
}

function updatePlayerControl(f) {
  if (!f.isPlayer) return;
  if (canAct(f) && f.dashT <= 0) {
    const left = held.has("a") || held.has("arrowleft");
    const right = held.has("d") || held.has("arrowright");
    f.moveDir = right && !left ? 1 : left && !right ? -1 : 0;
    f.blocking = held.has("l") && !f.airborne;
  } else {
    f.moveDir = 0;
    if (!canAct(f)) f.blocking = false;
  }
}

// ── physics / surfaces ───────────────────────────────────────────────
function resolveGround(f) {
  let landedOn = null;
  if (f.vy >= 0) {
    for (const s of SURFACES) {
      if (f.x < s.x1 - 6 || f.x > s.x2 + 6) continue;
      if (f._prevFootY <= s.y + 0.5 && f.footY >= s.y) {
        if (!landedOn || s.y < landedOn.y) landedOn = s;
      }
    }
  }
  if (landedOn) {
    f.footY = landedOn.y;
    f.vy = 0;
    if (f.airborne) onLand(f);
    f.airborne = false;
    f.surface = landedOn;
    f.jumpsLeft = 2;
  } else if (!f.airborne) {
    const s = f.surface || GROUND_SURFACE;
    if (f.x < s.x1 || f.x > s.x2) {
      f.airborne = true; // walked off the edge
    } else {
      f.footY = s.y;
      f.vy = 0;
    }
  }
}

function onLand(f) {
  sfx.land();
  spawnBurst(f.x, f.footY, "#6b5a8a", 6, 20, 80, 260);
}

// ── physics / state update ──────────────────────────────────────────────
function updateFighter(f, other, dt) {
  const dtMs = dt * 1000;

  if (f.flashT > 0) f.flashT -= dtMs;
  if (f.dashCdT > 0) f.dashCdT -= dtMs;

  if (f.koT >= 0) {
    f.koT += dtMs;
    f.vy += GRAVITY * dt;
    f.x += f.vx * dt;
    f.footY += f.vy * dt;
    return;
  }

  if (f.hitstunT > 0) f.hitstunT -= dtMs;
  if (f.dashT > 0) f.dashT -= dtMs;

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

  updatePlayerControl(f);

  // horizontal velocity resolution
  if (f.dashT > 0) {
    // vx stays locked at the dash speed set when the dash triggered
  } else if (canAct(f)) {
    const targetVX = f.moveDir * (f.airborne ? AIR_MOVE_SPEED : MOVE_SPEED);
    if (f.airborne) f.vx += (targetVX - f.vx) * Math.min(1, 10 * dt);
    else f.vx = targetVX;
  } else {
    f.vx *= Math.pow(0.4, dt); // knockback/hitstun drag (dt is seconds — gentle per-second decay so a launch actually carries through hitstun)
  }
  f.walking = !f.airborne && canAct(f) && Math.abs(f.vx) > 5;

  f.x += f.vx * dt;

  // vertical physics + surface collision
  f._prevFootY = f.footY;
  if (f.airborne) f.vy += GRAVITY * dt;
  f.footY += f.vy * dt;
  resolveGround(f);

  // face opponent unless mid-action
  if (!f.action) {
    f.facing = other.x > f.x ? 1 : -1;
  }

  if (f.koT < 0 && (f.x < BLAST_LEFT || f.x > BLAST_RIGHT || f.footY > BLAST_BOTTOM || f.footY < BLAST_TOP)) {
    triggerRingOut(f, other);
  }
}

function updateBars() {
  const pctP = clamp(player.percent, 0, MAX_PERCENT);
  const pctO = clamp(opp.percent, 0, MAX_PERCENT);
  playerFillEl.style.width = clamp((pctP / 200) * 100, 0, 100) + "%";
  oppFillEl.style.width = clamp((pctO / 200) * 100, 0, 100) + "%";
  playerHpEl.textContent = Math.round(pctP) + "%";
  oppHpEl.textContent = Math.round(pctO) + "%";
  playerFillEl.classList.toggle("hot", pctP >= 100);
  oppFillEl.classList.toggle("hot", pctO >= 100);
}

// ── rendering ──────────────────────────────────────────────────────────
const LEG = 46, TORSO = 52, ARM = 38, HEAD_R = 19;

function pose(f, walkPhase) {
  const hip = { x: f.x, y: f.footY - LEG };
  const shoulder = { x: hip.x, y: hip.y - TORSO };
  const head = { x: shoulder.x, y: shoulder.y - HEAD_R - 2 };
  const fw = f.facing;

  if (f.koT >= 0) {
    const k = Math.min(1, f.koT / 260);
    return {
      hip: { x: hip.x, y: hip.y + k * 18 },
      shoulder: { x: shoulder.x + fw * 18 * k, y: shoulder.y + k * 26 },
      head: { x: head.x + fw * 26 * k, y: head.y + k * 30 },
      legL: { x: hip.x - 20, y: f.footY },
      legR: { x: hip.x + 22, y: f.footY - 6 },
      armL: { x: shoulder.x - 24, y: shoulder.y + 10 },
      armR: { x: shoulder.x + 20, y: shoulder.y + 6 },
    };
  }

  if (f.hitstunT > 0) {
    const lean = -fw * 10;
    return {
      hip, shoulder: { x: shoulder.x + lean, y: shoulder.y },
      head: { x: head.x + lean * 1.6, y: head.y + 4 },
      legL: { x: hip.x - 14, y: f.footY }, legR: { x: hip.x + 14, y: f.footY },
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
        legL: { x: hip.x - 16, y: f.footY }, legR: { x: hip.x + 16, y: f.footY },
        armL: { x: shoulder.x - fw * 10, y: shoulder.y + 18 },
        armR: { x: shoulder.x + fw * (ARM + reach), y: shoulder.y - 4 },
      };
    } else {
      // kick
      const reach = Math.sin(Math.min(1, p) * Math.PI) * 44;
      return {
        hip, shoulder: { x: shoulder.x - fw * 8, y: shoulder.y },
        head: { x: head.x - fw * 8, y: head.y },
        legL: { x: hip.x - fw * 12, y: f.footY },
        legR: { x: hip.x + fw * (LEG * 0.6 + reach), y: f.footY - 30 - reach * 0.3 },
        armL: { x: shoulder.x - fw * 24, y: shoulder.y + 10 },
        armR: { x: shoulder.x - fw * 20, y: shoulder.y - 6 },
      };
    }
  }

  if (f.airborne) {
    const rising = f.vy < -20;
    return {
      hip, shoulder,
      head,
      legL: { x: hip.x - 9, y: hip.y + (rising ? 20 : 30) },
      legR: { x: hip.x + 9, y: hip.y + (rising ? 16 : 26) },
      armL: { x: shoulder.x - fw * 15, y: shoulder.y - (rising ? 12 : 2) },
      armR: { x: shoulder.x + fw * 15, y: shoulder.y - (rising ? 12 : 2) },
    };
  }

  if (f.blocking) {
    return {
      hip, shoulder,
      head: { x: head.x, y: head.y },
      legL: { x: hip.x - 14, y: f.footY }, legR: { x: hip.x + 14, y: f.footY },
      armL: { x: shoulder.x + fw * 20, y: shoulder.y - 10 },
      armR: { x: shoulder.x + fw * 26, y: shoulder.y + 2 },
    };
  }

  const swing = f.walking ? Math.sin(walkPhase) * 16 : 0;
  return {
    hip, shoulder,
    head,
    legL: { x: hip.x - 14 + swing, y: f.footY },
    legR: { x: hip.x + 14 - swing, y: f.footY },
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

  // shadow — projected onto the main floor, shrinks with height for depth cue
  const heightAbove = Math.max(0, GROUND - f.footY);
  const shrink = clamp(1 - heightAbove / 300, 0.3, 1);
  ctx.save();
  ctx.globalAlpha = 0.25 * shrink;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(f.x, GROUND + 6, 26 * shrink, 6 * shrink, 0, 0, Math.PI * 2);
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

  // head — moot's avatar, clipped into the circle
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

function roundedBar(x1, y1, x2, y2) {
  const r = 6;
  ctx.beginPath();
  ctx.moveTo(x1 + r, y1);
  ctx.lineTo(x2 - r, y1);
  ctx.quadraticCurveTo(x2, y1, x2, y1 + r);
  ctx.lineTo(x2, y2 - r);
  ctx.quadraticCurveTo(x2, y2, x2 - r, y2);
  ctx.lineTo(x1 + r, y2);
  ctx.quadraticCurveTo(x1, y2, x1, y2 - r);
  ctx.lineTo(x1, y1 + r);
  ctx.quadraticCurveTo(x1, y1, x1 + r, y1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawStage() {
  ctx.save();
  ctx.fillStyle = "#1d1530";
  ctx.strokeStyle = "#2e2148";
  ctx.lineWidth = 2;
  roundedBar(ARENA_MIN - 14, GROUND, ARENA_MAX + 14, GROUND + 16);
  ctx.globalAlpha = 0.85;
  for (const p of [platL, platR, platC]) roundedBar(p.x1, p.y, p.x2, p.y + 10);
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

  drawStage();

  const [back, front] = player.x <= opp.x ? [player, opp] : [opp, player];
  drawFighter(back, walkPhase);
  drawFighter(front, walkPhase);
  drawParticles();
  drawSparksAndPopups(dt);

  ctx.restore();
}

// ── game loop ──────────────────────────────────────────────────────────
function loop(ts) {
  if (!running) return;
  const dt = Math.min(0.033, (ts - lastT) / 1000 || 0);
  lastT = ts;

  aiDecide(opp, player, dt * 1000);
  applyAiIntent(opp, player);

  updateFighter(player, opp, dt);
  updateFighter(opp, player, dt);
  updateParticles(dt);
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
    x: 240, facingRight: true, isPlayer: true,
    name: shortHandle(ladderData.self.handle), avatar: selfAvatar, color: "#26e0c9",
  });
  opp = makeFighter({
    x: W - 240, facingRight: false, isPlayer: false,
    name: shortHandle(rung.handle), avatar: rung.avatar, color: "#ff2e63",
    difficulty: rung.difficulty,
  });
  held.clear();
  sparks = []; popups = []; particles = []; shakeT = 0;

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
    resultTitleEl.textContent = "RING OUT — YOU WIN";
    resultTextEl.textContent = `${shortHandle(rung.handle)} got sent flying.`;
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
    resultTitleEl.textContent = "SENT FLYING";
    resultTextEl.textContent = `${shortHandle(rung.handle)} launched you off the stage. one retry left — same moot.`;
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
    resultTitleEl.textContent = "SENT FLYING — RUN OVER";
    resultTextEl.textContent = `${shortHandle(rung.handle)} launched you twice. that's the run.`;
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
    input.blur(); // keyboard controls (a/d/w/j/k/l/shift) shouldn't get eaten by the text field
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
