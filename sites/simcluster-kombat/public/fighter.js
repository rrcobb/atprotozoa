// fighter.js — simcluster kombat (forked from mootkombat). Canvas stick-figure fighter: build a moot ladder
// (lib/moots.js) then fight up it, one bout per moot, one retry per moot.
// Every account is a class (lib/characters.js) with its own body, basic
// punch/kick and two specials (U / I): projectiles, blinks, lunges, lightning.
// Smash-style: floating stage + platforms, double jump, dash, percent-based
// knockback that sends fighters flying off the blast zones for the KO.
// No frameworks, no build step — vanilla JS + canvas 2D + WebAudio.

import { buildLadder, fetchHitTweet, pickLadder } from "./lib/moots.js";
import { characterFor, SLOT_KEYS } from "./lib/characters.js";

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
const sp1NameEl = document.getElementById("sp1Name");
const sp2NameEl = document.getElementById("sp2Name");
const moveListEl = document.getElementById("moveList");

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
  boom: () => { noiseBurst({ dur: 0.25, gain: 0.35, filterFreq: 400 }); beep({ freq: 80, dur: 0.22, type: "sawtooth", gain: 0.16, slide: -40 }); },
  zap: () => { beep({ freq: 900, dur: 0.14, type: "sawtooth", gain: 0.1, slide: -700 }); noiseBurst({ dur: 0.12, gain: 0.15, filterFreq: 5000 }); },
  whoosh: () => noiseBurst({ dur: 0.16, gain: 0.16, filterFreq: 2400 }),
  cast: () => beep({ freq: 300, dur: 0.18, type: "triangle", gain: 0.12, slide: 360 }),
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
let ladderData = null; // { self, ladder, mootCount } — self = the fighter you picked, ladder = the rest of the cluster
let cast = null; // { self, ladder, mootCount } as fetched: the whole simcluster, before anyone is picked
const rosterEl = document.getElementById("roster");
const rosterGridEl = document.getElementById("rosterGrid");
let rungIndex = 0;
let retriesLeft = 1;
let cleared = 0;

// ── fighter entity ────────────────────────────────────────────────────
function makeFighter({ x, facingRight, isPlayer, name, avatar, color, difficulty, sheet }) {
  return {
    sheet, moves: sheet.moves, dims: sheet.dims, accent: sheet.accent,
    cd: { sp1: 0, sp2: 0 }, trails: {}, alpha: 1,
    x, footY: GROUND, vx: 0, vy: 0, airborne: false, jumpsLeft: 2,
    surface: GROUND_SURFACE, dashT: 0, dashCdT: 0, moveDir: 0,
    isPlayer, name, avatar: avatar ? loadAvatar(avatar) : null, color,
    difficulty: difficulty || 0,
    facing: facingRight ? 1 : -1,
    percent: 0,
    walking: false,
    blocking: false,
    action: null, // { type: slot, spec, t, hit, began }
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
  const spec = useKick ? player.moves.kick : player.moves.punch;
  opp.percent = pct;
  opp.x = player.x + spec.range - 5;
  meleeHit(player, opp, spec);
};
let running = false;
let lastT = 0;
let held = new Set();
let projs = []; // projectiles + lightning bolts
let sparks = []; // { x, y, t, blocked }
let particles = []; // { x, y, vx, vy, t, maxT, color, size }
let shakeT = 0;
let popups = []; // { x, y, text, t, color }

// ── input ──────────────────────────────────────────────────────────────
window.addEventListener("keydown", (e) => {
  if (e.target === input || e.target.tagName === "INPUT") return; // don't eat keys while typing a handle
  const k = e.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowup", " ", "a", "d", "w", "l", "shift", "j", "k", "u", "i"].includes(k)) e.preventDefault();
  held.add(k);
  if (!running) return;
  if (k === "j") tryAttack(player, "punch");
  if (k === "k") tryAttack(player, "kick");
  if (k === "u") tryAttack(player, "sp1");
  if (k === "i") tryAttack(player, "sp2");
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
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); if (running) tryAttack(player, k); });
    btn.addEventListener("click", () => { if (running) tryAttack(player, k); });
  }
});

function canAct(f) {
  return !f.action && f.hitstunT <= 0 && f.koT < 0;
}

function tryAttack(f, slot) {
  if (!canAct(f) || f.dashT > 0) return;
  const spec = f.moves[slot];
  if (!spec || (f.cd[slot] || 0) > 0) return;
  if (spec.cd) f.cd[slot] = spec.cd;
  f.action = { type: slot, spec, t: 0, hit: false, began: false };
  f.blocking = false;
}

function doJump(f) {
  if (f.koT >= 0 || f.hitstunT > 0 || f.action || f.dashT > 0) return;
  if (!f.airborne) {
    f.airborne = true;
    f.vy = JUMP_V * f.sheet.jump;
    f.jumpsLeft = 1;
    spawnBurst(f.x, f.footY, f.color, 5, 20, 60, 200);
    sfx.jump(false);
  } else if (f.jumpsLeft > 0) {
    f.vy = AIRJUMP_V * f.sheet.jump;
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
const otherOf = (f) => (f === player ? opp : player);

// A melee move connects if the defender is inside range, in front of the
// attacker (unless the move hits both sides), and on roughly the same level.
function meleeHit(attacker, defender, spec) {
  if (defender.koT >= 0) return false;
  const dist = Math.abs(attacker.x - defender.x);
  if (dist > spec.range) return false;
  if (!spec.both) {
    const facingRight = defender.x > attacker.x;
    if ((facingRight && attacker.facing < 0) || (!facingRight && attacker.facing > 0)) return false;
  }
  if (Math.abs(attacker.footY - defender.footY) > (spec.hop ? 170 : 110)) return false; // too far apart vertically (different platform)
  resolveHit(attacker, defender, spec, defender.x >= attacker.x ? 1 : -1, (attacker.x + defender.x) / 2, (attacker.footY + defender.footY) / 2 - 90);
  return true;
}

// Damage, knockback, block chip and juice for any hit: melee, projectile or bolt.
function resolveHit(attacker, defender, spec, dirAway, hx, hy) {
  let dmg = rand(spec.dmg[0], spec.dmg[1]) * attacker.sheet.pow;
  const blocked = defender.blocking && canAct(defender) && !defender.airborne;

  if (blocked) {
    dmg *= BLOCK_CHIP;
    defender.vx = dirAway * 90;
    defender.hitstunT = 150;
    shakeT = 60;
    sfx.block();
  } else if (spec.stun) {
    // swap-style move: no damage, just a stagger
    defender.hitstunT = spec.stun;
    defender.action = null;
    defender.blocking = false;
    dmg = 0;
    sfx.punch();
  } else {
    defender.percent = clamp(defender.percent + dmg, 0, MAX_PERCENT);
    const launch = (spec.kbBase + defender.percent * spec.kbGrowth) / defender.sheet.weight;
    const ang = defender.airborne ? spec.angle : Math.max(spec.angle, 0.26); // spikes only work on airborne targets
    defender.vx = dirAway * Math.cos(ang) * launch;
    defender.vy = -Math.sin(ang) * launch;
    defender.airborne = true;
    defender.hitstunT = clamp(90 + launch * 0.55, 90, 1100);
    defender.action = null;
    defender.blocking = false;
    shakeT = 120;
    (sfx[spec.sfx === "kick" ? "kick" : spec.sfx === "punch" || !spec.sfx ? "punch" : spec.sfx] || sfx.punch)();
  }

  defender.flashT = 120;
  sparks.push({ x: hx, y: hy, t: blocked ? 140 : 220, blocked });
  spawnBurst(hx, hy, blocked ? "#9a86b8" : defender.color, blocked ? 5 : 10, 60, blocked ? 100 : 220, blocked ? 250 : 400);
  popups.push({
    x: defender.x, y: hy - 40,
    text: blocked ? "blocked" : spec.stun ? "swapped!" : "+" + Math.round(dmg) + "%",
    color: blocked ? "#9a86b8" : "#ffd23f",
    t: 600,
  });

  updateBars();
}

// ── specials: what happens when a move's startup ends ──────────────────
function beginAction(f, other) {
  const a = f.action, s = a.spec;
  a.began = true;
  if (s.lunge) f.vx = f.facing * s.lunge;
  if (s.hop) { f.vy = s.hop; f.airborne = true; }
  if (s.kind === "melee") {
    if (s.slot === "sp1" || s.slot === "sp2" || s.lunge || s.hop) (sfx[s.sfx] || sfx.whoosh)();
    if (s.both) spawnBurst(f.x, f.footY - 40, f.accent, 8, 80, s.range * 2, 260);
  } else if (s.kind === "proj") {
    (sfx[s.sfx] || sfx.whoosh)();
    const p = s.proj;
    projs.push({
      kind: p.kind, owner: f, spec: s, p,
      x: f.x + f.facing * 30,
      y: p.floor ? f.footY - p.size * 0.6 : f.footY - f.dims.leg - f.dims.torso * 0.75,
      vx: f.facing * p.speed, vy: p.vy || 0, t: 0, hit: false, back: false, rot: 0,
    });
  } else if (s.kind === "blink") {
    sfx.whoosh();
    spawnBurst(f.x, f.footY - 50, f.accent, 12, 40, 180, 360);
    if (s.mode === "behind") {
      const dir = other.x >= f.x ? 1 : -1; // we land on the far side of them
      f.x = clamp(other.x + dir * 58, ARENA_MIN - 20, ARENA_MAX + 20);
      f.facing = -dir;
      if (!other.airborne) { f.footY = other.footY; f.surface = other.surface; f.airborne = false; f.vy = 0; }
      spawnBurst(f.x, f.footY - 50, f.accent, 12, 40, 180, 360);
      meleeHit(f, other, { ...s, range: 200, both: true });
    } else {
      const fx = f.x, ox = other.x;
      f.x = clamp(ox, ARENA_MIN - 20, ARENA_MAX + 20);
      other.x = clamp(fx, ARENA_MIN - 20, ARENA_MAX + 20);
      f.facing = other.x > f.x ? 1 : -1;
      other.facing = f.x > other.x ? 1 : -1;
      spawnBurst(f.x, f.footY - 50, f.accent, 12, 40, 180, 360);
      spawnBurst(other.x, other.footY - 50, other.accent, 12, 40, 180, 360);
      resolveHit(f, other, s, 1, (f.x + other.x) / 2, f.footY - 90);
    }
  } else if (s.kind === "bolt") {
    sfx.cast();
    projs.push({ kind: "bolt", owner: f, spec: s, p: s.bolt, x: other.x, y: 0, t: 0, hit: false, locked: false });
  }
}

function updateProjs(dt) {
  const dtMs = dt * 1000;
  for (const q of projs) {
    q.t += dtMs;
    const owner = q.owner, target = otherOf(owner);
    if (q.kind === "bolt") {
      const b = q.p;
      if (q.t < b.warn - 260 && target.koT < 0) q.x = target.x; // tracks until the last quarter-second, then locks
      if (!q.hit && q.t >= b.warn && q.t < b.warn + b.strike && target.koT < 0 && Math.abs(target.x - q.x) < b.width) {
        q.hit = true;
        sfx.zap();
        resolveHit(owner, target, q.spec, target.x >= q.x ? 1 : -1, target.x, target.footY - 90);
      }
      if (q.t >= b.warn && !q.fired) { q.fired = true; sfx.zap(); shakeT = 90; spawnBurst(q.x, GROUND, owner.accent, 10, 60, 220, 300); }
      q.dead = q.t >= b.warn + b.strike + 120;
      continue;
    }
    const p = q.p;
    q.rot += dt * 14;
    if (q.kind === "boomerang") {
      if (!q.back && q.t > p.life * 0.45) { q.back = true; q.hit = false; }
      if (q.back) {
        q.vx = Math.sign(owner.x - q.x || 1) * p.speed * 1.05;
        q.vy = (owner.footY - owner.dims.leg - owner.dims.torso * 0.75 - q.y) * 3;
        if (Math.abs(owner.x - q.x) < 26) q.dead = true;
      }
    }
    if (p.grav) q.vy += p.grav * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    if (p.bounce && q.y > GROUND - p.size) { q.y = GROUND - p.size; q.vy = -Math.abs(q.vy) * 0.8; }
    if (q.t >= p.life || q.x < BLAST_LEFT || q.x > BLAST_RIGHT || q.y > H + 40) q.dead = true;
    if (!q.hit && !q.dead && target.koT < 0) {
      const top = target.footY - target.dims.leg - target.dims.torso - target.dims.head * 2;
      if (Math.abs(q.x - target.x) < 22 + p.size && q.y > top - p.size && q.y < target.footY + p.size) {
        q.hit = true;
        resolveHit(owner, target, q.spec, q.vx >= 0 ? 1 : -1, q.x, q.y);
        if (q.kind !== "boomerang" && q.kind !== "wave") q.dead = true;
        if (q.kind === "bomb") spawnBurst(q.x, q.y, owner.accent, 14, 80, 260, 400);
      }
    }
  }
  projs = projs.filter((q) => !q.dead);
}

function triggerRingOut(f, other) {
  if (!running || f.koT >= 0) return;
  f.koT = 0;
  spawnBurst(f.x, clamp(f.footY, -100, H + 100), f.color, 18, 90, 260, 650);
  sfx.ko();
  endBout(other.isPlayer);
}

// ── AI ─────────────────────────────────────────────────────────────────
// Which special (if any) makes sense at this distance? Melee specials need
// the target inside their reach (plus lunge distance); projectiles want some
// breathing room; blinks and bolts work at mid range.
function aiPickSpecial(f, target, dist) {
  const ok = [];
  for (const slot of ["sp1", "sp2"]) {
    const s = f.moves[slot];
    if (f.cd[slot] > 0) continue;
    let good = false;
    if (s.kind === "melee") good = dist <= s.range + s.lunge * 0.2;
    else if (s.kind === "proj") good = dist >= 160 && dist <= 560 && Math.abs(target.footY - f.footY) < 90;
    else if (s.kind === "blink") good = s.mode === "behind" ? dist >= 110 && dist <= 420 : dist >= 90 && dist <= 360;
    else if (s.kind === "bolt") good = dist <= 600;
    if (good) ok.push(slot);
  }
  return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
}

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

  // specials first: the AI uses its own moveset, more eagerly the harder it is
  if (!f.airborne && Math.random() < 0.25 + t * 0.5) {
    const sp = aiPickSpecial(f, target, dist);
    if (sp) { f.aiIntent = "idle"; tryAttack(f, sp); return; }
  }

  const { punch, kick } = f.moves;
  if (dist <= kick.range * 0.9) {
    const roll = Math.random();
    if (roll < aggression) {
      f.aiIntent = "idle";
      tryAttack(f, dist <= punch.range ? (Math.random() < 0.5 ? "punch" : "kick") : "kick");
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
  if (f.cd.sp1 > 0) f.cd.sp1 -= dtMs;
  if (f.cd.sp2 > 0) f.cd.sp2 -= dtMs;

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
    if (!a.began && a.t >= s.startup) beginAction(f, other);
    if (s.kind === "melee" && !a.hit && a.t >= s.startup && a.t < s.startup + s.active) {
      if (meleeHit(f, other, s)) a.hit = true; // checked every frame of the active window
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
    if (f.airborne) {
      // Air control only steers a normal jump arc — it must never be what
      // cancels a launch. While still tumbling above normal air speed
      // (fresh off a big hit, even post-hitstun), leave vx alone so
      // knockback actually carries to a blast zone instead of snapping
      // back the instant control returns or the AI decides to approach.
      if (f.moveDir && Math.abs(f.vx) < AIR_MOVE_SPEED * 1.5) {
        f.vx += (f.moveDir * AIR_MOVE_SPEED * f.sheet.spd - f.vx) * Math.min(1, 3 * dt);
      }
    } else {
      f.vx = f.moveDir * MOVE_SPEED * f.sheet.spd;
    }
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
// Poses are keyframes {aR,aL:[deg,len×arm], lR,lL:[deg,len×leg], raise:{R,L}, lean, drop, spin}
// where deg 0 = forward, 90 = down, -90 = up (mirrored by facing). An attack
// plays IDLE → A over the startup, A → B over the active frames, B → IDLE over
// the recovery. A leg that isn't "raised" is planted: its angle is kept but
// its length is solved so the foot stays on the floor.
const IDLE = { aR: [62, 0.66], aL: [118, 0.66], lR: [75, 1], lL: [105, 1], rR: 0, rL: 0, lean: 0, drop: 0, spin: 0 };
const ANIMS = {
  jab: { tip: ["aR"], A: { aR: [70, 0.5], aL: [-30, 0.7], lean: -4 }, B: { aR: [-5, 1.9], aL: [-40, 0.6], lean: 8 } },
  haymaker: { tip: ["aR"], A: { aR: [-160, 1.1], aL: [100, 0.6], lean: -12, drop: 6, lR: [55, 1], lL: [125, 1] }, B: { aR: [35, 1.6], aL: [100, 0.6], lean: 20, drop: 8, lR: [55, 1], lL: [125, 1] } },
  kick: { tip: ["lR"], A: { lR: [100, 1], rR: 1, aR: [120, 0.6], aL: [-40, 0.6], lean: -8 }, B: { lR: [-6, 1.6], rR: 1, aR: [120, 0.6], aL: [-50, 0.6], lean: -12 } },
  roundhouse: { tip: ["lR"], A: { lR: [135, 1], rR: 1, aR: [100, 0.6], aL: [-30, 0.7], lean: -6 }, B: { lR: [-35, 1.7], rR: 1, aR: [110, 0.8], aL: [140, 0.8], lean: -14 } },
  uppercut: { tip: ["aR"], A: { aR: [95, 0.7], aL: [-30, 0.6], drop: 14, lean: -6, lR: [60, 1], lL: [120, 1] }, B: { aR: [-85, 1.7], aL: [-30, 0.6], drop: -4, lean: 8 } },
  lunge: { tip: ["aR"], A: { aR: [110, 0.5], aL: [-20, 0.6], lean: -14, drop: 8, lR: [110, 1], lL: [70, 1] }, B: { aR: [-4, 1.8], aL: [-30, 0.6], lean: 22, drop: 6, lR: [40, 1], lL: [140, 1] } },
  dive: { tip: ["lR", "lL"], A: { aR: [-110, 1], aL: [-110, 1], lR: [100, 1], lL: [80, 1], rR: 1, rL: 1, drop: 18 }, B: { aR: [150, 1], aL: [170, 1], lR: [42, 1.5], lL: [30, 1.4], rR: 1, rL: 1, lean: 16 } },
  throw: { tip: [], A: { aR: [-140, 1], aL: [-30, 0.6], lean: -6 }, B: { aR: [0, 1.3], aL: [-30, 0.6], lean: 8 } },
  cast: { tip: [], A: { aR: [110, 0.5], aL: [110, 0.5], lean: -10 }, B: { aR: [-8, 1.1], aL: [8, 1.1], lean: 10 } },
  slam: { tip: [], A: { aR: [-100, 1.1], aL: [-80, 1.1], lean: -4 }, B: { aR: [70, 1.1], aL: [60, 1.1], drop: 22, lean: 14, lR: [50, 1], lL: [130, 1] } },
  nova: { tip: ["aR", "aL"], A: { aR: [110, 0.9], aL: [70, 0.9], drop: 8 }, B: { aR: [-40, 1.6], aL: [-140, 1.6], drop: -2, lR: [60, 1], lL: [120, 1] } },
  spin: { tip: ["aR", "aL"], A: { aR: [0, 1.3], aL: [180, 1.3], lR: [60, 1], lL: [120, 1], drop: 6 }, B: { aR: [0, 1.3], aL: [180, 1.3], lR: [60, 1], lL: [120, 1], drop: 6, spin: 900 } },
  vanish: { tip: [], A: { drop: 26, aR: [100, 0.6], aL: [80, 0.6], lean: -10 }, B: { drop: 0, aR: [-30, 0.7], aL: [-150, 0.7] } },
  summon: { tip: [], A: { aR: [-100, 1], aL: [-80, 1], lean: -4 }, B: { aR: [-90, 1.3], aL: [-90, 1.3], lean: 2, drop: -4 } },
};
const POSE_KEYS = Object.keys(IDLE);
const ease = (u) => u * u * (3 - 2 * u);
const withIdle = (p) => ({ ...IDLE, ...p });
function mixPose(a, b, u) {
  const out = {};
  for (const k of POSE_KEYS) {
    out[k] = Array.isArray(a[k]) ? [a[k][0] + (b[k][0] - a[k][0]) * u, a[k][1] + (b[k][1] - a[k][1]) * u] : a[k] + (b[k] - a[k]) * u;
  }
  return out;
}

// Where an attack is in its animation, as a keyframed pose.
function actionKeys(f) {
  const a = f.action, s = a.spec;
  const anim = ANIMS[s.anim] || ANIMS.jab;
  const A = withIdle(anim.A), B = withIdle(anim.B);
  const act = s.startup + s.active;
  if (a.t < s.startup) return mixPose(IDLE, A, ease(clamp(a.t / s.startup, 0, 1)));
  if (a.t < act) return mixPose(A, B, ease(clamp((a.t - s.startup) / s.active, 0, 1)));
  return mixPose(B, IDLE, ease(clamp((a.t - act) / s.recovery, 0, 1)));
}

const ray = (o, fw, deg, len) => ({ x: o.x + fw * Math.cos(deg * Math.PI / 180) * len, y: o.y + Math.sin(deg * Math.PI / 180) * len });

function pose(f, walkPhase) {
  const D = f.dims;
  const hip = { x: f.x, y: f.footY - D.leg };
  const shoulder = { x: hip.x, y: hip.y - D.torso };
  const head = { x: shoulder.x, y: shoulder.y - D.head - 2 };
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
    const q = actionKeys(f);
    const hipA = { x: hip.x, y: hip.y + q.drop };
    const shA = { x: hipA.x + fw * q.lean, y: hipA.y - D.torso };
    const headA = { x: shA.x + fw * q.lean * 0.3, y: shA.y - D.head - 2 };
    const leg = (key, raised) => {
      const [deg, len] = q[key];
      if (raised > 0.5) return ray(hipA, fw, deg, len * D.leg);
      const dy = f.footY - hipA.y; // planted foot: keep the angle, land on the floor
      return { x: hipA.x + fw * dy / Math.tan(deg * Math.PI / 180), y: f.footY };
    };
    return {
      hip: hipA, shoulder: shA, head: headA,
      legR: leg("lR", q.rR), legL: leg("lL", q.rL),
      armR: ray(shA, fw, q.aR[0] + q.spin, q.aR[1] * D.arm),
      armL: ray(shA, fw, q.aL[0] + q.spin, q.aL[1] * D.arm),
    };
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

// Class marker on the head: the quickest way to tell the classes apart.
function drawHat(f, h) {
  const r = f.dims.head, top = h.y - r, c = f.accent;
  ctx.save();
  ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 3;
  ctx.beginPath();
  switch (f.sheet.hat) {
    case "bandana":
      ctx.moveTo(h.x - r, h.y - r * 0.45); ctx.lineTo(h.x + r, h.y - r * 0.45);
      ctx.moveTo(h.x - f.facing * r, h.y - r * 0.45); ctx.lineTo(h.x - f.facing * (r + 12), h.y - r * 0.1);
      break;
    case "headband":
      ctx.moveTo(h.x - r, h.y - r * 0.4); ctx.lineTo(h.x + r, h.y - r * 0.4);
      ctx.moveTo(h.x - f.facing * r, h.y - r * 0.4); ctx.lineTo(h.x - f.facing * (r + 16), h.y - r * 0.9);
      ctx.moveTo(h.x - f.facing * r, h.y - r * 0.4); ctx.lineTo(h.x - f.facing * (r + 14), h.y + r * 0.1);
      break;
    case "wizard":
      ctx.moveTo(h.x - r * 1.15, top + 4); ctx.lineTo(h.x + r * 1.15, top + 4);
      ctx.lineTo(h.x + f.facing * 4, top - 28); ctx.closePath(); ctx.fill();
      break;
    case "topknot":
      ctx.arc(h.x, top - 5, 6, 0, Math.PI * 2); ctx.fill();
      break;
    case "feather":
      ctx.moveTo(h.x, top + 2); ctx.quadraticCurveTo(h.x - f.facing * 16, top - 14, h.x - f.facing * 6, top - 26);
      break;
    case "tophat":
      ctx.fillRect(h.x - r * 0.7, top - 20, r * 1.4, 22); ctx.fillRect(h.x - r * 1.1, top, r * 2.2, 4);
      break;
    case "spikes":
      ctx.moveTo(h.x - r * 0.8, top + 4); ctx.lineTo(h.x - r * 0.5, top - 14); ctx.lineTo(h.x - r * 0.1, top + 2);
      ctx.lineTo(h.x + r * 0.3, top - 18); ctx.lineTo(h.x + r * 0.6, top + 2); ctx.lineTo(h.x + r * 0.9, top - 10);
      break;
    default: break; // "gloves" are drawn on the hands
  }
  ctx.stroke();
  ctx.restore();
}

function drawFighter(f, walkPhase) {
  const p = pose(f, walkPhase);
  ctx.save();

  // blink moves fade the body out during the windup and back in after
  let alpha = 1;
  if (f.action && f.action.spec.kind === "blink") {
    const a = f.action, s = a.spec;
    alpha = a.t < s.startup ? 1 - 0.85 * (a.t / s.startup) : Math.min(1, 0.15 + ((a.t - s.startup) / 220) * 0.85);
  }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = f.color;
  ctx.fillStyle = f.color;
  ctx.lineWidth = f.dims.lw;
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
  ctx.globalAlpha = 0.25 * shrink * alpha;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(f.x, GROUND + 6, 26 * shrink, 6 * shrink, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // swing trails: the striking limb leaves a fading streak while the move is live
  const a = f.action;
  const live = a && a.spec.kind === "melee" && a.t >= a.spec.startup && a.t < a.spec.startup + a.spec.active + 80;
  const tips = live ? ANIMS[a.spec.anim].tip : [];
  for (const k of Object.keys(f.trails)) if (!tips.includes(k)) delete f.trails[k];
  for (const k of tips) {
    const key = { aR: "armR", aL: "armL", lR: "legR", lL: "legL" }[k];
    const tr = (f.trails[k] = f.trails[k] || []);
    tr.push({ x: p[key].x, y: p[key].y });
    if (tr.length > 8) tr.shift();
    ctx.save();
    ctx.strokeStyle = f.accent;
    ctx.lineCap = "round";
    for (let i = 1; i < tr.length; i++) {
      ctx.globalAlpha = (i / tr.length) * 0.7 * alpha;
      ctx.lineWidth = 2 + (i / tr.length) * 6;
      ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y); ctx.stroke();
    }
    ctx.restore();
  }

  // legs
  ctx.beginPath(); ctx.moveTo(p.hip.x, p.hip.y); ctx.lineTo(p.legL.x, p.legL.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p.hip.x, p.hip.y); ctx.lineTo(p.legR.x, p.legR.y); ctx.stroke();
  // torso
  ctx.beginPath(); ctx.moveTo(p.hip.x, p.hip.y); ctx.lineTo(p.shoulder.x, p.shoulder.y); ctx.stroke();
  // arms
  ctx.beginPath(); ctx.moveTo(p.shoulder.x, p.shoulder.y); ctx.lineTo(p.armL.x, p.armL.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p.shoulder.x, p.shoulder.y); ctx.lineTo(p.armR.x, p.armR.y); ctx.stroke();
  ctx.shadowBlur = 0;

  if (f.sheet.hat === "gloves") {
    ctx.fillStyle = f.accent;
    for (const h of [p.armL, p.armR]) { ctx.beginPath(); ctx.arc(h.x, h.y, 8, 0, Math.PI * 2); ctx.fill(); }
  }

  // head — moot's avatar, clipped into the circle
  const R = f.dims.head;
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.head.x, p.head.y, R, 0, Math.PI * 2);
  if (f.avatar && f.avatar.ready) {
    ctx.save();
    ctx.clip();
    ctx.drawImage(f.avatar.img, p.head.x - R, p.head.y - R, R * 2, R * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = f.color;
    ctx.fill();
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = f.color;
  ctx.stroke();
  ctx.restore();

  drawHat(f, p.head);

  ctx.restore();
}

// ── projectiles + lightning ────────────────────────────────────────────
function drawProjs() {
  for (const q of projs) {
    const c = q.owner.accent;
    ctx.save();
    if (q.kind === "bolt") {
      const b = q.p;
      if (q.t < b.warn) {
        // telegraph: a ring on the floor that tightens, then the column lights
        const u = q.t / b.warn;
        ctx.strokeStyle = c; ctx.globalAlpha = 0.35 + 0.5 * u; ctx.lineWidth = 3;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.ellipse(q.x, GROUND + 4, b.width * (1.4 - 0.4 * u), 8, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(q.x, GROUND); ctx.lineTo(q.x, 0); ctx.stroke();
      } else {
        ctx.strokeStyle = "#fff"; ctx.shadowColor = c; ctx.shadowBlur = 18; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(q.x, 0);
        for (let y = 30, i = 0; y < GROUND; y += 36, i++) ctx.lineTo(q.x + (i % 2 ? 18 : -18), y);
        ctx.lineTo(q.x, GROUND); ctx.stroke();
      }
    } else if (q.kind === "orb") {
      ctx.shadowColor = c; ctx.shadowBlur = 16; ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.p.size, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(q.x, q.y, q.p.size * 0.45, 0, Math.PI * 2); ctx.fill();
    } else if (q.kind === "star" || q.kind === "boomerang") {
      ctx.translate(q.x, q.y); ctx.rotate(q.rot * (q.kind === "star" ? 1.6 : 1));
      ctx.fillStyle = c; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      const n = q.kind === "star" ? 4 : 2, r = q.p.size;
      ctx.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const ang = (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? r * 0.35 : r * (q.kind === "star" ? 1.2 : 1.6);
        ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (q.kind === "wave") {
      ctx.strokeStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 12; ctx.lineWidth = 6; ctx.lineCap = "round";
      const d = Math.sign(q.vx) || 1;
      ctx.beginPath(); ctx.arc(q.x - d * 14, q.y, q.p.size * 1.4, d > 0 ? -1 : Math.PI - 1, d > 0 ? 1 : Math.PI + 1); ctx.stroke();
    } else if (q.kind === "shock") {
      ctx.fillStyle = c; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.ellipse(q.x, q.y + 4, q.p.size * 1.2, q.p.size * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(q.x - 14, q.y + 10); ctx.lineTo(q.x, q.y - q.p.size * 1.3); ctx.lineTo(q.x + 14, q.y + 10); ctx.closePath(); ctx.fill();
    } else if (q.kind === "bomb") {
      ctx.fillStyle = "#1b1428"; ctx.strokeStyle = c; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.p.size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(q.x + 6, q.y - q.p.size - 3, 3 + (Math.sin(q.rot * 3) + 1), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

// cooldown chips for the player's two specials, bottom-left of the arena
function drawHud() {
  ctx.save();
  ctx.font = "700 11px ui-monospace, monospace";
  ctx.textAlign = "left";
  [["sp1", 0], ["sp2", 1]].forEach(([slot, row]) => {
    const s = player.moves[slot], ready = player.cd[slot] <= 0;
    const y = H - 34 + row * 18, frac = ready ? 1 : 1 - player.cd[slot] / s.cd;
    ctx.globalAlpha = ready ? 0.95 : 0.55;
    ctx.fillStyle = "#2e2148"; ctx.fillRect(12, y, 120, 13);
    ctx.fillStyle = ready ? player.accent : "#6b5a8a"; ctx.fillRect(12, y, 120 * frac, 13);
    ctx.fillStyle = ready ? "#120b1c" : "#f3ecff";
    ctx.fillText(`${SLOT_KEYS[slot]} ${s.name}`, 17, y + 10);
  });
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
  drawProjs();
  drawParticles();
  drawSparksAndPopups(dt);
  drawHud();

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
  updateProjs(dt);
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
    sheet: characterFor(ladderData.self),
  });
  opp = makeFighter({
    x: W - 240, facingRight: false, isPlayer: false,
    name: shortHandle(rung.handle), avatar: rung.avatar, color: "#ff2e63",
    difficulty: rung.difficulty, sheet: characterFor(rung),
  });
  held.clear();
  projs = [];
  sparks = []; popups = []; particles = []; shakeT = 0;

  playerBarNameEl.textContent = `${player.name} · ${player.sheet.label}`;
  oppBarNameEl.textContent = `${opp.name} · ${opp.sheet.label}`;
  sp1NameEl.textContent = player.moves.sp1.name;
  sp2NameEl.textContent = player.moves.sp2.name;
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
    resultTitleEl.textContent = player.percent === 0 ? "FLAWLESS VICTORY" : "RING OUT — YOU WIN";
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

const statLine = (c) => `pow ${c.stats.pow} · spd ${c.stats.spd} · wgt ${c.stats.wgt}`;
function moveCol(title, m) {
  const c = characterFor(m);
  const col = document.createElement("div");
  col.className = "mv";
  const h = document.createElement("div");
  h.className = "mv-h";
  h.style.color = c.accent;
  h.textContent = `${title}: ${c.label}`;
  const st = document.createElement("div");
  st.className = "mv-s";
  st.textContent = statLine(c);
  col.append(h, st);
  for (const slot of ["punch", "kick", "sp1", "sp2"]) {
    const mv = c.moves[slot];
    const row = document.createElement("div");
    const kb = document.createElement("kbd");
    kb.textContent = SLOT_KEYS[slot];
    row.append(kb, " " + (mv.title || mv.name));
    col.appendChild(row);
  }
  return col;
}
function renderMoveList(you, them) {
  moveListEl.innerHTML = "";
  moveListEl.append(moveCol("you", you), moveCol("them", them));
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
  if (!rung.taunt) {
    // taunts are fetched one bout at a time, so a big cluster doesn't cost a feed request per account up front
    fetchHitTweet(rung.did, rung.handle)
      .catch(() => null)
      .then((t) => {
        rung.taunt = t || { text: "…", url: null, likeCount: 0 };
        if (ladderData && ladderData.ladder[rungIndex] === rung) tauntBubbleEl.textContent = rung.taunt.text;
      });
  }
  renderMoveList(ladderData.self, rung);
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
  shareCtx.fillText("simcluster-kombat.bisks.net", SW - 56, SH - 44);
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
  const shareText = `${text} — simcluster-kombat.bisks.net`;
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
      const file = new File([blob], "simcluster-kombat.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], text: lastShareText, title: "simcluster kombat" });
      } catch {}
    }, "image/png");
  };
}

// ── replay / reset ────────────────────────────────────────────────────
// ── roster: the whole simcluster is the cast ───────────────────────────
// Pick any of them (you, or a mutual) as your fighter; everyone else becomes
// the ladder, smallest follower count first, biggest last as the boss.
// Difficulty is log-scaled off follower counts relative to the fighter you
// picked — same curve as mootkombat's buildLadder.
function ladderFor(pickDid) {
  const all = [cast.self, ...cast.ladder];
  const me = all.find((m) => m.did === pickDid);
  const meLog = Math.log10((me.followersCount || 0) + 1);
  const rest = pickLadder(
    all
      .filter((m) => m.did !== pickDid)
      .sort((a, b) => (a.followersCount || 0) - (b.followersCount || 0)),
  )
    .map((m) => {
      const diff = Math.log10((m.followersCount || 0) + 1) - meLog;
      return { ...m, difficulty: Math.max(0, Math.min(1, (diff + 1) / 3)) };
    });
  return { self: me, ladder: rest, mootCount: cast.mootCount };
}

function showRoster() {
  rosterGridEl.innerHTML = "";
  const all = [cast.self, ...cast.ladder].sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0));
  all.forEach((m) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cell" + (m.did === cast.self.did ? " you" : "");
    const img = document.createElement("img");
    img.src = m.avatar || "";
    img.alt = "";
    img.onerror = () => (img.style.visibility = "hidden");
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = m.displayName || shortHandle(m.handle);
    const hd = document.createElement("span");
    hd.className = "hd";
    hd.textContent = shortHandle(m.handle) + (m.did === cast.self.did ? " (you)" : "");
    const c = characterFor(m);
    const cls = document.createElement("span");
    cls.className = "cls";
    cls.style.color = c.accent;
    cls.textContent = c.label;
    b.append(img, nm, hd, cls);
    b.addEventListener("click", () => pickFighter(m.did));
    rosterGridEl.appendChild(b);
  });
  game.classList.remove("on");
  victoryCard.classList.remove("on");
  defeatCard.classList.remove("on");
  rosterEl.classList.add("on");
  rosterEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function pickFighter(did) {
  ladderData = ladderFor(did);
  rungIndex = 0;
  retriesLeft = 1;
  cleared = 0;
  rosterEl.classList.remove("on");
  game.classList.add("on");
  showPrefight();
}

document.getElementById("rosterBack").addEventListener("click", backToStart);
document.getElementById("victoryRoster").addEventListener("click", showRoster);
document.getElementById("defeatRoster").addEventListener("click", showRoster);

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
  cast = null;
  rosterEl.classList.remove("on");
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
    cast = res;
    msg.className = "msg ok";
    msg.textContent = `simcluster loaded: you plus ${res.ladder.length} moots. choose your fighter.`;
    finder.style.display = "none";
    input.blur(); // keyboard controls (a/d/w/j/k/l/shift) shouldn't get eaten by the text field
    showRoster();
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
