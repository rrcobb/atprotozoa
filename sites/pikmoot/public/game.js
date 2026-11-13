// pikmoot — a Pikmin-style game where every pikmin is one of a handle's moots.
// Everything runs in the browser; moots come from lib/moots.js (public AppView
// + Constellation). The map is seeded from the handle's DID so it's the same
// every time for the same person.

import { moots } from "./lib/moots.js";

const $ = (id) => document.getElementById(id);
const form = $("form"), input = $("handle"), msg = $("msg"), playBtn = $("play");
const gameEl = $("game"), cv = $("cv"), ctx = cv.getContext("2d");

// ── tuning ───────────────────────────────────────────────────────────────
const WORLD = { w: 2200, h: 1500 };
const ONION = { x: 1100, y: 750, r: 48 };
// Game-design limit, not a data limit: the original Pikmin caps the field at
// 100 and so do we, so the canvas stays smooth. Moots beyond that wait in the
// onion's reserve and sprout as treasure comes home, so every moot is used.
const FIELD_MAX = 100;
const START_SPROUTS = 30; // sprouts on the map at dawn (the rest are in reserve)
const DAY_SECONDS = 240; // length of a day: a product decision
const TREASURES = 5;
const SAFE_R = 150; // within this of the onion at dusk = made it home

const TYPES = [
  { key: "red", color: "#e0452f", atk: 2, speed: 1, carry: 1, throw: 1 },
  { key: "yellow", color: "#f0c020", atk: 1, speed: 1, carry: 1, throw: 1.6 },
  { key: "blue", color: "#2f6fe0", atk: 1, speed: 1.3, carry: 1, throw: 1 },
  { key: "purple", color: "#8e44ad", atk: 1.5, speed: 0.8, carry: 2, throw: 1 },
  { key: "white", color: "#f2f2f2", atk: 0.8, speed: 1.5, carry: 1, throw: 1 },
];
const TREASURE_POOL = ["🍒", "🔑", "🧸", "🎲", "💎", "📎", "☕", "🪙", "🧦", "🔋", "🍄", "🎧"];
const ENEMY_NAMES = ["reply guy", "quote dunker", "ratio goblin", "engagement farmer", "bot swarm", "main character"];

// ── helpers ──────────────────────────────────────────────────────────────
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const short = (h) => "@" + String(h).replace(/\.bsky\.social$/, "");

const imgs = new Map();
function avatarOf(url) {
  if (!url) return null;
  let im = imgs.get(url);
  if (!im) { im = new Image(); im.src = url; imgs.set(url, im); }
  return im.complete && im.naturalWidth ? im : null;
}

// ── state ────────────────────────────────────────────────────────────────
let G = null;
let lastHandle = "";
let raf = 0;
const keys = new Set();
const joy = { x: 0, y: 0, id: null };
const mouse = { x: 0, y: 0, over: false }; // world coords
let view = { w: 800, h: 500, dpr: 1 };

function spawnPikmin(profile, x, y, state) {
  const t = TYPES[hashStr(profile.did) % TYPES.length];
  return {
    p: profile, t, x, y, z: 0, state, // sprout | squad | idle | thrown | work | carry | dead
    ang: Math.random() * 6.28, rad: 28 + Math.random() * 40, // squad slot around captain
    xp: 0, cd: 0, owner: null, att: Math.random() * 6.28, tt: 0, from: null, to: null,
  };
}

function newGame(res) {
  const rng = mulberry32(hashStr(res.did));
  const pool = res.pool.slice();
  for (let i = pool.length - 1; i > 0; i--) { // seeded shuffle
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const g = {
    res, rng, t: 0, over: false, whistle: 0,
    player: { x: ONION.x, y: ONION.y + 90, hp: 100, stun: 0, p: res.self, face: 1 },
    pk: [], enemies: [], treasures: [], texts: [], tufts: [], reserve: pool,
    stats: { delivered: 0, kills: 0, lost: [], plucked: 0 },
    hudAt: 0, total: pool.length,
  };
  G = g;

  const farFromOnion = (min) => {
    for (;;) {
      const x = 80 + rng() * (WORLD.w - 160), y = 80 + rng() * (WORLD.h - 160);
      if (Math.hypot(x - ONION.x, y - ONION.y) > min) return { x, y };
    }
  };
  for (let i = 0; i < 160; i++) g.tufts.push({ x: rng() * WORLD.w, y: rng() * WORLD.h, s: 4 + rng() * 6 });

  // dawn sprouts: a ring of 8 near the onion to get started, the rest scattered
  const first = Math.min(START_SPROUTS, g.reserve.length);
  for (let i = 0; i < first; i++) {
    const prof = g.reserve.pop();
    let x, y;
    if (i < 8) { const a = (i / 8) * 6.28 + 0.3; x = ONION.x + Math.cos(a) * 140; y = ONION.y + Math.sin(a) * 140; }
    else ({ x, y } = farFromOnion(260));
    g.pk.push(spawnPikmin(prof, x, y, "sprout"));
  }

  const names = ENEMY_NAMES.slice();
  const nEnemies = 6 + Math.floor(rng() * 3);
  for (let i = 0; i < nEnemies; i++) {
    const { x, y } = farFromOnion(380);
    const hp = 10 + Math.floor(rng() * 16);
    g.enemies.push({
      x, y, home: { x, y }, hp, maxhp: hp, r: 20 + hp * 0.7, name: names[Math.floor(rng() * names.length)],
      att: [], cd: 1, flash: 0, goal: { x, y }, hue: Math.floor(rng() * 40),
    });
  }
  const emojis = TREASURE_POOL.slice().sort(() => rng() - 0.5);
  for (let i = 0; i < TREASURES; i++) {
    const { x, y } = farFromOnion(300);
    const weight = [1, 2, 2, 3, 4, 5, 6][Math.floor(rng() * 7)];
    g.treasures.push({ x, y, weight, value: weight * 2, emoji: emojis[i], r: 13 + weight * 2.5, att: [], required: true, done: false });
  }
  return g;
}

// ── world actions ────────────────────────────────────────────────────────
function floatText(x, y, s, color = "#111") { G.texts.push({ x, y, s, color, life: 1.8 }); }

function detach(pk) {
  if (pk.owner) { pk.owner.att = pk.owner.att.filter((q) => q !== pk); pk.owner = null; }
}
function killPikmin(pk, why) {
  if (pk.state === "dead") return;
  detach(pk);
  pk.state = "dead";
  G.stats.lost.push(pk.p.handle);
  floatText(pk.x, pk.y - 14, `${short(pk.p.handle)} ${why}`, "#c0392b");
}
const alive = (pk) => pk.state !== "dead";
const inSquad = () => G.pk.filter((q) => q.state === "squad");

function throwPikmin(tx, ty) {
  const p = G.player;
  let best = null, bd = 1e9;
  for (const q of G.pk) if (q.state === "squad") { const d = dist(q, p); if (d < bd) { bd = d; best = q; } }
  if (!best) return floatText(p.x, p.y - 30, "no moots in your squad", "#6b6b6b");
  // aim assist: a click near an enemy or treasure lands on its centre
  for (const e of G.enemies) if (Math.hypot(e.x - tx, e.y - ty) < e.r + 22) { tx = e.x; ty = e.y; }
  for (const tr of G.treasures) if (!tr.done && Math.hypot(tr.x - tx, tr.y - ty) < tr.r + 22) { tx = tr.x; ty = tr.y; }
  const reach = 190 * best.t.throw;
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, reach / d);
  best.state = "thrown";
  best.from = { x: best.x, y: best.y };
  best.to = { x: clamp(p.x + dx * k, 10, WORLD.w - 10), y: clamp(p.y + dy * k, 10, WORLD.h - 10) };
  best.tt = 0;
}

function land(pk) {
  pk.z = 0; pk.x = pk.to.x; pk.y = pk.to.y;
  for (const e of G.enemies) {
    if (Math.hypot(e.x - pk.x, e.y - pk.y) < e.r + 10) {
      pk.state = "work"; pk.owner = e; e.att.push(pk); pk.att = Math.atan2(pk.y - e.y, pk.x - e.x); pk.cd = 0.3; return;
    }
  }
  for (const tr of G.treasures) {
    if (!tr.done && Math.hypot(tr.x - pk.x, tr.y - pk.y) < tr.r + 10) {
      pk.state = "carry"; pk.owner = tr; tr.att.push(pk); return;
    }
  }
  pk.state = "idle";
}

function whistle() {
  if (!G || G.over) return;
  G.whistle = 0.5;
  const p = G.player;
  for (const q of G.pk) {
    if ((q.state === "idle" || q.state === "work" || q.state === "carry") && dist(q, p) < 190) {
      detach(q); q.state = "squad";
    }
  }
}

function popSprouts(n) {
  // new sprouts rise around the onion from the reserve, up to the field cap
  const live = G.pk.filter(alive).length;
  n = Math.min(n, G.reserve.length, FIELD_MAX - live);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28, r = ONION.r + 40 + Math.random() * 50;
    G.pk.push(spawnPikmin(G.reserve.pop(), ONION.x + Math.cos(a) * r, ONION.y + Math.sin(a) * r, "sprout"));
  }
  return n;
}

function endDay(reason) {
  if (G.over) return;
  G.over = true;
  const everything = reason === "win";
  const saved = [], left = [];
  for (const q of G.pk) {
    if (q.state === "dead" || q.state === "sprout") continue;
    detach(q);
    if (everything || dist(q, ONION) < SAFE_R) saved.push(q); else left.push(q);
  }
  for (const q of left) G.stats.lost.push(q.p.handle);
  showSummary(reason, saved.length, left.length);
}

// ── update ───────────────────────────────────────────────────────────────
function update(dt) {
  const g = G, p = g.player;
  if (g.over) return;
  g.t += dt;
  g.whistle = Math.max(0, g.whistle - dt);
  p.stun = Math.max(0, p.stun - dt);

  // captain movement
  let mx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  let my = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  mx += joy.x; my += joy.y;
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  const sp = p.stun > 0 ? 40 : 160;
  p.x = clamp(p.x + mx * sp * dt, 12, WORLD.w - 12);
  p.y = clamp(p.y + my * sp * dt, 12, WORLD.h - 12);
  if (mx) p.face = mx > 0 ? 1 : -1;

  for (const q of g.pk) {
    switch (q.state) {
      case "sprout":
        if (dist(q, p) < 26) {
          q.state = "squad"; g.stats.plucked++;
          floatText(q.x, q.y - 14, short(q.p.handle), "#1f8a4c");
        }
        break;
      case "idle":
        if (dist(q, p) < 22) q.state = "squad";
        break;
      case "squad": {
        q.xp += dt * 0.2;
        q.ang += dt * 0.15;
        const tx = p.x + Math.cos(q.ang) * q.rad, ty = p.y + Math.sin(q.ang) * q.rad;
        const d = Math.hypot(tx - q.x, ty - q.y);
        if (d > 5) {
          const s = Math.min(d, 175 * q.t.speed * dt);
          q.x += ((tx - q.x) / d) * s; q.y += ((ty - q.y) / d) * s;
        }
        break;
      }
      case "thrown": {
        q.tt += dt / 0.55;
        const k = Math.min(1, q.tt);
        q.x = q.from.x + (q.to.x - q.from.x) * k;
        q.y = q.from.y + (q.to.y - q.from.y) * k;
        q.z = Math.sin(Math.PI * k) * 70;
        if (q.tt >= 1) land(q);
        break;
      }
      case "work": {
        const e = q.owner;
        q.xp += dt;
        q.cd -= dt;
        // stand on the enemy's rim, pushed slightly off its edge
        const tx = e.x + Math.cos(q.att) * (e.r - 4), ty = e.y + Math.sin(q.att) * (e.r - 4);
        q.x += (tx - q.x) * Math.min(1, 10 * dt); q.y += (ty - q.y) * Math.min(1, 10 * dt);
        if (q.cd <= 0) {
          q.cd = 0.7;
          const mature = q.xp > 40 ? 1.5 : q.xp > 15 ? 1.25 : 1;
          e.hp -= q.t.atk * mature; e.flash = 0.12;
        }
        break;
      }
      case "carry": {
        const tr = q.owner;
        q.xp += dt * 0.5;
        const i = tr.att.indexOf(q), n = tr.att.length;
        const a = (i / Math.max(1, n)) * 6.28;
        const tx = tr.x + Math.cos(a) * (tr.r + 3), ty = tr.y + Math.sin(a) * (tr.r + 3);
        q.x += (tx - q.x) * Math.min(1, 8 * dt); q.y += (ty - q.y) * Math.min(1, 8 * dt);
        break;
      }
    }
  }

  // treasures (and corpses) get hauled to the onion once enough moots hold on
  for (const tr of g.treasures) {
    if (tr.done) continue;
    const power = tr.att.reduce((s, q) => s + q.t.carry, 0);
    if (power >= tr.weight && tr.att.length) {
      const d = Math.hypot(ONION.x - tr.x, ONION.y - tr.y);
      const slowest = Math.min(...tr.att.map((q) => q.t.speed));
      const s = Math.min(d, (28 + 14 * Math.min(power - tr.weight, 4)) * slowest * dt);
      tr.x += ((ONION.x - tr.x) / d) * s; tr.y += ((ONION.y - tr.y) / d) * s;
      if (d < ONION.r) {
        tr.done = true;
        for (const q of tr.att) { q.owner = null; q.state = "idle"; }
        tr.att = [];
        if (tr.required) g.stats.delivered++;
        const n = popSprouts(tr.value);
        floatText(ONION.x, ONION.y - 70, `${tr.emoji} +${n} sprouts`, "#1f8a4c");
      }
    }
  }
  g.treasures = g.treasures.filter((tr) => !tr.done);

  // enemies
  for (const e of g.enemies) {
    e.flash = Math.max(0, e.flash - dt);
    e.cd -= dt;
    // target = nearest awake thing in aggro range (attached moots count)
    let tgt = null, td = 120 + e.r;
    const cand = [p, ...g.pk.filter((q) => q.state === "squad" || q.state === "work" || q.state === "idle" || q.state === "carry")];
    for (const c of cand) { const d = Math.hypot(c.x - e.x, c.y - e.y); if (d < td) { td = d; tgt = c; } }
    let gx, gy, spd;
    if (tgt) { gx = tgt.x; gy = tgt.y; spd = 52; }
    else {
      if (Math.hypot(e.goal.x - e.x, e.goal.y - e.y) < 8 || Math.random() < 0.004) {
        e.goal = { x: clamp(e.home.x + (Math.random() - 0.5) * 300, 40, WORLD.w - 40), y: clamp(e.home.y + (Math.random() - 0.5) * 300, 40, WORLD.h - 40) };
      }
      gx = e.goal.x; gy = e.goal.y; spd = 22;
    }
    const d = Math.hypot(gx - e.x, gy - e.y);
    if (d > e.r * 0.6) { e.x += ((gx - e.x) / d) * spd * dt; e.y += ((gy - e.y) / d) * spd * dt; }
    if (e.cd <= 0) {
      // chomp: an attached moot first, else whoever is in reach
      let victim = e.att.length ? e.att[Math.floor(Math.random() * e.att.length)] : null;
      if (!victim) {
        for (const c of g.pk) if ((c.state === "squad" || c.state === "idle" || c.state === "carry") && Math.hypot(c.x - e.x, c.y - e.y) < e.r + 12) { victim = c; break; }
      }
      if (victim) { e.cd = 1.1; killPikmin(victim, "got sent home"); }
      else if (Math.hypot(p.x - e.x, p.y - e.y) < e.r + 14) {
        e.cd = 1.2; p.hp -= 14; p.stun = 0.8; floatText(p.x, p.y - 26, "ow", "#c0392b");
        const dd = Math.hypot(p.x - e.x, p.y - e.y) || 1;
        p.x = clamp(p.x + ((p.x - e.x) / dd) * 40, 12, WORLD.w - 12);
        p.y = clamp(p.y + ((p.y - e.y) / dd) * 40, 12, WORLD.h - 12);
      } else e.cd = 0.2;
    }
  }
  // enemy deaths turn into carryable corpses
  for (const e of g.enemies) {
    if (e.hp > 0) continue;
    g.stats.kills++;
    const w = Math.max(1, Math.ceil(e.maxhp / 7));
    const corpse = { x: e.x, y: e.y, weight: w, value: Math.ceil(e.maxhp / 5), emoji: "🥩", r: Math.min(30, 10 + w * 3), att: [], required: false, done: false };
    for (const q of e.att) { q.owner = corpse; q.state = "carry"; corpse.att.push(q); }
    e.att = [];
    g.treasures.push(corpse);
    floatText(e.x, e.y - e.r, `${e.name} down`, "#1a5fd0");
  }
  g.enemies = g.enemies.filter((e) => e.hp > 0);

  g.pk = g.pk.filter((q) => q.state !== "dead");
  for (const t of g.texts) { t.life -= dt; t.y -= 18 * dt; }
  g.texts = g.texts.filter((t) => t.life > 0);

  if (p.hp <= 0) return endDay("ko");
  if (g.stats.delivered >= TREASURES) return endDay("win");
  if (g.t >= DAY_SECONDS) return endDay("dusk");
}

// ── drawing ──────────────────────────────────────────────────────────────
function resize() {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  view = { w: r.width, h: r.height, dpr };
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
}
window.addEventListener("resize", () => { if (G) resize(); });

function cam() {
  const p = G.player;
  return {
    x: clamp(p.x - view.w / 2, 0, Math.max(0, WORLD.w - view.w)),
    y: clamp(p.y - view.h / 2, 0, Math.max(0, WORLD.h - view.h)),
  };
}

function drawFace(im, x, y, r, fallback, tint) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.clip();
  if (im) ctx.drawImage(im, x - r, y - r, r * 2, r * 2);
  else { ctx.fillStyle = tint; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.fillStyle = "#fff"; ctx.font = `bold ${r * 1.3}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText((fallback || "?")[0].toUpperCase(), x, y + 1); }
  ctx.restore();
}

function drawTop(x, y, q) {
  // leaf → bud → flower as a moot gains experience
  const stage = q.xp > 40 ? 2 : q.xp > 15 ? 1 : 0;
  ctx.strokeStyle = "#2f7a2f"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 7); ctx.stroke();
  if (stage === 0) {
    ctx.fillStyle = "#4cb04c"; ctx.beginPath(); ctx.ellipse(x + 3, y - 8, 4.5, 2.2, -0.5, 0, 6.28); ctx.fill();
  } else if (stage === 1) {
    ctx.fillStyle = q.t.color; ctx.beginPath(); ctx.arc(x, y - 9, 3.2, 0, 6.28); ctx.fill();
  } else {
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 3.4, y - 9 + Math.sin(a) * 3.4, 2.2, 0, 6.28); ctx.fill(); }
    ctx.fillStyle = q.t.color; ctx.beginPath(); ctx.arc(x, y - 9, 2, 0, 6.28); ctx.fill();
  }
}

function drawPikmin(q, c) {
  const x = q.x - c.x, y = q.y - c.y - q.z;
  ctx.fillStyle = "#0003";
  ctx.beginPath(); ctx.ellipse(q.x - c.x, q.y - c.y + 6, 7, 3, 0, 0, 6.28); ctx.fill();
  if (q.state === "sprout") {
    ctx.fillStyle = "#6b4a2b"; ctx.beginPath(); ctx.ellipse(x, y + 4, 8, 3.5, 0, 0, 6.28); ctx.fill();
    ctx.strokeStyle = "#2f7a2f"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y + 3); ctx.lineTo(x, y - 6); ctx.stroke();
    ctx.fillStyle = q.t.color; ctx.beginPath(); ctx.ellipse(x - 3, y - 7, 4, 2.2, 0.5, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 3, y - 7, 4, 2.2, -0.5, 0, 6.28); ctx.fill();
    return;
  }
  ctx.fillStyle = q.t.color; ctx.strokeStyle = "#0008"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.28); ctx.fill(); ctx.stroke();
  drawFace(avatarOf(q.p.avatar), x, y - 0.5, 5.6, q.p.displayName, q.t.color);
  drawTop(x, y - 7, q);
}

function draw() {
  const g = G, c = cam(), p = g.player;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = "#4d7a3a"; ctx.fillRect(0, 0, view.w, view.h);
  // ground
  ctx.fillStyle = "#8fc46a"; ctx.fillRect(-c.x, -c.y, WORLD.w, WORLD.h);
  ctx.fillStyle = "#7fb55a";
  for (let gx = 0; gx < WORLD.w; gx += 200) for (let gy = 0; gy < WORLD.h; gy += 200) {
    if (((gx + gy) / 200) % 2 === 0) ctx.fillRect(gx - c.x, gy - c.y, 200, 200);
  }
  ctx.strokeStyle = "#5e9a3f"; ctx.lineWidth = 1.5;
  for (const t of g.tufts) {
    const x = t.x - c.x, y = t.y - c.y;
    if (x < -20 || y < -20 || x > view.w + 20 || y > view.h + 20) continue;
    ctx.beginPath(); ctx.moveTo(x - t.s / 2, y); ctx.lineTo(x - t.s / 3, y - t.s); ctx.moveTo(x, y); ctx.lineTo(x, y - t.s * 1.3); ctx.moveTo(x + t.s / 2, y); ctx.lineTo(x + t.s / 3, y - t.s); ctx.stroke();
  }
  // safe zone + onion
  ctx.setLineDash([6, 8]); ctx.strokeStyle = "#ffffff99"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(ONION.x - c.x, ONION.y - c.y, SAFE_R, 0, 6.28); ctx.stroke(); ctx.setLineDash([]);
  const ox = ONION.x - c.x, oy = ONION.y - c.y;
  ctx.fillStyle = "#0003"; ctx.beginPath(); ctx.ellipse(ox, oy + 30, 56, 18, 0, 0, 6.28); ctx.fill();
  ctx.strokeStyle = "#444"; ctx.lineWidth = 6; ctx.lineCap = "round";
  for (const dx of [-30, 0, 30]) { ctx.beginPath(); ctx.moveTo(ox + dx * 0.6, oy + 8); ctx.lineTo(ox + dx * 1.3, oy + 34); ctx.stroke(); }
  ctx.lineCap = "butt";
  const grd = ctx.createRadialGradient(ox - 14, oy - 18, 6, ox, oy, 52);
  grd.addColorStop(0, "#fff7b0"); grd.addColorStop(1, "#e0a400");
  ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(ox, oy - 4, 46, 38, 0, 0, 6.28); ctx.fill();
  ctx.strokeStyle = "#7a5a00"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#111"; ctx.font = "11px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("ONION", ox, oy - 4);

  // treasures
  for (const tr of g.treasures) {
    const x = tr.x - c.x, y = tr.y - c.y;
    ctx.fillStyle = "#0003"; ctx.beginPath(); ctx.ellipse(x, y + tr.r * 0.7, tr.r, tr.r * 0.4, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = tr.required ? "#fff8dc" : "#f3d6d0"; ctx.strokeStyle = tr.required ? "#c9a227" : "#a05a4a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, tr.r, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#111"; ctx.font = `${Math.round(tr.r * 1.1)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(tr.emoji, x, y + 1);
    // weight badge: how many carry-power it needs
    const have = tr.att.reduce((s, q) => s + q.t.carry, 0);
    ctx.fillStyle = have >= tr.weight ? "#1f8a4c" : "#111";
    ctx.beginPath(); ctx.arc(x + tr.r * 0.7, y - tr.r * 0.7, 9, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px ui-monospace, monospace";
    ctx.fillText(String(tr.weight), x + tr.r * 0.7, y - tr.r * 0.7 + 1);
  }

  // enemies
  for (const e of g.enemies) {
    const x = e.x - c.x, y = e.y - c.y;
    ctx.fillStyle = "#0003"; ctx.beginPath(); ctx.ellipse(x, y + e.r * 0.8, e.r, e.r * 0.4, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = e.flash > 0 ? "#fff" : `hsl(${e.hue}, 60%, 42%)`;
    ctx.strokeStyle = "#3a1a1a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, e.r, e.r * 0.85, 0, 0, 6.28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#f6e9c8";
    for (let i = 0; i < 5; i++) { const a = i * 1.26 + 0.4; ctx.beginPath(); ctx.arc(x + Math.cos(a) * e.r * 0.55, y + Math.sin(a) * e.r * 0.45, e.r * 0.11, 0, 6.28); ctx.fill(); }
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x - e.r * 0.3, y - e.r * 0.15, e.r * 0.2, 0, 6.28); ctx.arc(x + e.r * 0.3, y - e.r * 0.15, e.r * 0.2, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(x - e.r * 0.27, y - e.r * 0.12, e.r * 0.09, 0, 6.28); ctx.arc(x + e.r * 0.33, y - e.r * 0.12, e.r * 0.09, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#111"; ctx.font = "10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText(e.name, x, y - e.r - 10);
    if (e.hp < e.maxhp) { ctx.fillStyle = "#0006"; ctx.fillRect(x - 20, y - e.r - 8, 40, 4); ctx.fillStyle = "#c0392b"; ctx.fillRect(x - 20, y - e.r - 8, 40 * Math.max(0, e.hp / e.maxhp), 4); }
  }

  // moots + captain, y-sorted
  const list = g.pk.filter(alive).map((q) => ({ y: q.y, f: () => drawPikmin(q, c) }));
  list.push({ y: p.y, f: () => {
    const x = p.x - c.x, y = p.y - c.y;
    ctx.fillStyle = "#0003"; ctx.beginPath(); ctx.ellipse(x, y + 12, 11, 4, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = p.stun > 0 ? "#c0392b" : "#fff"; ctx.beginPath(); ctx.arc(x, y, 13.5, 0, 6.28); ctx.fill();
    drawFace(avatarOf(p.p.avatar), x, y, 11.5, p.p.displayName, "#1a5fd0");
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - 13); ctx.lineTo(x, y - 20); ctx.stroke();
    ctx.fillStyle = "#e0452f"; ctx.beginPath(); ctx.arc(x, y - 21, 3, 0, 6.28); ctx.fill();
  } });
  list.sort((a, b) => a.y - b.y).forEach((o) => o.f());

  // whistle ring
  if (g.whistle > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${g.whistle * 1.6})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x - c.x, p.y - c.y, 190 * (1 - g.whistle / 0.5) + 10, 0, 6.28); ctx.stroke();
  }
  // reticle + hover name
  if (mouse.over) {
    const mx = mouse.x - c.x, my = mouse.y - c.y;
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mx, my, 9, 0, 6.28); ctx.moveTo(mx - 14, my); ctx.lineTo(mx + 14, my); ctx.moveTo(mx, my - 14); ctx.lineTo(mx, my + 14); ctx.stroke();
    let hv = null, hd = 18;
    for (const q of g.pk) { const d = Math.hypot(q.x - mouse.x, q.y - mouse.y); if (d < hd) { hd = d; hv = q; } }
    if (hv) {
      const s = `${hv.p.displayName} ${short(hv.p.handle)} · ${hv.t.key}`;
      ctx.font = "11px ui-monospace, monospace"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      const w = ctx.measureText(s).width + 10;
      ctx.fillStyle = "#111d"; ctx.fillRect(mx + 12, my - 24, w, 18);
      ctx.fillStyle = "#fff"; ctx.fillText(s, mx + 17, my - 11);
    }
  }
  // floating texts
  ctx.font = "bold 12px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  for (const t of g.texts) {
    ctx.globalAlpha = Math.min(1, t.life);
    ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.strokeText(t.s, t.x - c.x, t.y - c.y);
    ctx.fillStyle = t.color; ctx.fillText(t.s, t.x - c.x, t.y - c.y);
  }
  ctx.globalAlpha = 1;
  // dusk tint over the last quarter of the day
  const dusk = clamp((g.t / DAY_SECONDS - 0.7) / 0.3, 0, 1);
  if (dusk > 0) { ctx.fillStyle = `rgba(20,20,70,${dusk * 0.45})`; ctx.fillRect(0, 0, view.w, view.h); }
}

function hud() {
  const g = G;
  $("timebar").style.width = `${clamp(100 - (g.t / DAY_SECONDS) * 100, 0, 100)}%`;
  $("hpbar").style.width = `${clamp(g.player.hp, 0, 100)}%`;
  const sq = {}, field = g.pk.filter(alive);
  for (const q of field) if (q.state !== "sprout") sq[q.t.key] = (sq[q.t.key] || 0) + 1;
  const counts = TYPES.filter((t) => sq[t.key]).map((t) => `<span class="dot" style="background:${t.color}"></span>${sq[t.key]}`).join(" ");
  $("hudsquad").innerHTML = `moots ${counts || "0"}`;
  $("hudfield").textContent = `${field.filter((q) => q.state === "sprout").length} sprouts · ${g.reserve.length} in reserve`;
  $("hudtreasure").textContent = `treasure ${g.stats.delivered}/${TREASURES}`;
}

// ── summary ──────────────────────────────────────────────────────────────
const REASONS = {
  win: ["every treasure is home 🎉", "the whole crew made it back to the onion."],
  dusk: ["night falls", "anyone outside the dashed circle at dusk is left behind."],
  ko: ["the captain got knocked out", "the squad dragged them home. the day is over."],
  called: ["called it a day", "everyone near the onion is safe."],
};
function showSummary(reason, saved, left) {
  const st = G.stats, [title, lead] = REASONS[reason] || REASONS.called;
  $("sumtitle").textContent = title;
  $("sumlead").textContent = lead;
  const cell = (n, l) => `<div><b>${n}</b><span>${l}</span></div>`;
  $("sumstats").innerHTML = cell(`${st.delivered}/${TREASURES}`, "treasures") + cell(saved, "moots home") + cell(st.lost.length, "didn't make it") + cell(st.kills, "reply guys beaten");
  // every lost moot is named: there is no list cap to justify here
  $("sumlost").textContent = st.lost.length ? "didn't make it: " + st.lost.map(short).join(", ") : "nobody was left behind.";
  const text = `I led ${G.total} of ${short(G.res.handle)}'s moots into the field on pikmoot: ${st.delivered}/${TREASURES} treasures, ${saved} moots made it home.`;
  $("sumshare").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(`${text}\nhttps://pikmoot.bisks.net/?h=${encodeURIComponent(G.res.handle)}`);
  $("summary").hidden = false;
  $("endday").hidden = true;
  $("summary").scrollIntoView({ block: "nearest", behavior: "smooth" });
}

// ── loop ─────────────────────────────────────────────────────────────────
function loop(ts) {
  raf = requestAnimationFrame(loop);
  if (!G) return;
  const dt = Math.min(0.05, (ts - (loop.last || ts)) / 1000);
  loop.last = ts;
  update(dt);
  draw();
  if (ts - G.hudAt > 200) { G.hudAt = ts; hud(); }
}

// ── input ────────────────────────────────────────────────────────────────
function toWorld(ev) {
  const r = cv.getBoundingClientRect(), c = cam();
  return { x: ev.clientX - r.left + c.x, y: ev.clientY - r.top + c.y };
}
cv.addEventListener("pointermove", (ev) => { if (!G) return; Object.assign(mouse, toWorld(ev), { over: ev.pointerType === "mouse" }); });
cv.addEventListener("pointerleave", () => { mouse.over = false; });
cv.addEventListener("pointerdown", (ev) => {
  if (!G || G.over) return;
  const w = toWorld(ev);
  Object.assign(mouse, w, { over: ev.pointerType === "mouse" });
  throwPikmin(w.x, w.y);
});
window.addEventListener("keydown", (ev) => {
  if (!G || document.activeElement === input) return;
  const k = ev.key.toLowerCase();
  if (k === " ") { ev.preventDefault(); if (!ev.repeat) whistle(); return; }
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { ev.preventDefault(); keys.add(k); }
});
window.addEventListener("keyup", (ev) => keys.delete(ev.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());
$("whistle").addEventListener("click", whistle);
$("endday").addEventListener("click", () => G && endDay("called"));
$("again").addEventListener("click", () => start(lastHandle));

const joyEl = $("joy"), knob = $("joyknob");
function joyMove(ev) {
  const r = joyEl.getBoundingClientRect();
  let dx = (ev.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (ev.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const l = Math.hypot(dx, dy);
  if (l > 1) { dx /= l; dy /= l; }
  joy.x = dx; joy.y = dy;
  knob.style.transform = `translate(${dx * 30}px, ${dy * 30}px)`;
}
joyEl.addEventListener("pointerdown", (ev) => { joy.id = ev.pointerId; joyEl.setPointerCapture(ev.pointerId); joyMove(ev); ev.stopPropagation(); });
joyEl.addEventListener("pointermove", (ev) => { if (ev.pointerId === joy.id) joyMove(ev); });
const joyEnd = (ev) => { if (ev.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ""; };
joyEl.addEventListener("pointerup", joyEnd);
joyEl.addEventListener("pointercancel", joyEnd);
// the whistle button sits on top of the canvas; keep its taps from also throwing
$("whistle").addEventListener("pointerdown", (ev) => ev.stopPropagation());
$("endday").addEventListener("pointerdown", (ev) => ev.stopPropagation());

// ── boot ─────────────────────────────────────────────────────────────────
async function start(raw) {
  const h = (raw || "").trim().replace(/^@/, "");
  if (!h) { msg.textContent = "type a handle first."; msg.className = "msg err"; return; }
  lastHandle = h;
  playBtn.disabled = true; msg.className = "msg"; msg.textContent = "loading moots…";
  try {
    const res = await moots(h, { onStep: (s) => { msg.textContent = s; } });
    if (!res.pool.length) {
      msg.textContent = `@${res.handle} has no moots or follows to play with.`; msg.className = "msg err"; return;
    }
    keys.clear(); joy.x = joy.y = 0;
    newGame(res);
    $("summary").hidden = true; $("endday").hidden = false;
    gameEl.hidden = false;
    resize();
    msg.textContent = `${res.pool.length} ${res.kind === "moots" ? "moots" : "moots + follows"} for ${short(res.handle)}'s day. pluck the sprouts.`;
    history.replaceState(null, "", "?h=" + encodeURIComponent(res.handle));
    loop.last = 0;
    if (!raf) raf = requestAnimationFrame(loop);
  } catch (e) {
    msg.className = "msg err";
    msg.textContent = /HTTP 400|resolve/.test(String(e && e.message)) ? "couldn't find that handle. check the spelling?" : "couldn't load that: " + (e && e.message);
  } finally {
    playBtn.disabled = false;
  }
}
form.addEventListener("submit", (ev) => { ev.preventDefault(); start(input.value); });
const qh = new URLSearchParams(location.search).get("h");
if (qh) { input.value = qh; start(qh); }
