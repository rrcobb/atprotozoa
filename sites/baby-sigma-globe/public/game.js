"use strict";
// baby sigma globe — a tiny platformer RPG inside wikipedia. all state lives in the page.
const cv = document.getElementById("game");
const ctx = cv.getContext("2d");
const W = 800, H = 450, GY = 380;

// ---- input ----
const keys = {};
const pressed = {};
const MAP = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right",
  ArrowUp: "jump", w: "jump", W: "jump", " ": "jump", x: "mew", X: "mew", j: "mew", J: "mew",
  e: "talk", E: "talk", Enter: "talk" };
addEventListener("keydown", (e) => {
  const k = MAP[e.key]; if (!k) return;
  e.preventDefault();
  if (!keys[k]) pressed[k] = true;
  keys[k] = true;
});
addEventListener("keyup", (e) => { const k = MAP[e.key]; if (k) keys[k] = false; });
document.querySelectorAll("#pad button").forEach((b) => {
  const k = b.dataset.k;
  const down = (e) => { e.preventDefault(); if (!keys[k]) pressed[k] = true; keys[k] = true; b.classList.add("on"); };
  const up = (e) => { e.preventDefault(); keys[k] = false; b.classList.remove("on"); };
  b.addEventListener("pointerdown", down);
  b.addEventListener("pointerup", up);
  b.addEventListener("pointercancel", up);
  b.addEventListener("pointerleave", up);
});
cv.addEventListener("pointerdown", () => { pressed.talk = true; if (state === "title" || state === "dead" || state === "won") pressed.start = true; });

// ---- world ----
const ZONES = [
  { x: 0, name: "Stub Valley", sky: "#e8f1ff", ground: "#8fbf6a" },
  { x: 1400, name: "Citation Needed Swamp", sky: "#e4ecd6", ground: "#6d8f4e" },
  { x: 2800, name: "Edit War Fortress", sky: "#f1dede", ground: "#9a6a6a" },
  { x: 4200, name: "Deletion Discussion", sky: "#dcdcea", ground: "#6c6c88" },
];
const WORLD = 5300;
const grounds = [[0, 1000], [1100, 1900], [2000, 2900], [3000, 3700], [3800, WORLD]];
const plats = [];
grounds.forEach(([a, b]) => plats.push({ x: a, y: GY, w: b - a, h: 80, g: true }));
[[200, 300, 120], [380, 240, 110], [600, 300, 120], [820, 250, 100], [1000, 310, 100],
 [1250, 300, 120], [1450, 240, 110], [1650, 300, 100], [1850, 250, 120],
 [2100, 300, 120], [2300, 230, 110], [2500, 290, 120], [2700, 230, 100], [2930, 300, 80],
 [3150, 290, 110], [3350, 230, 100], [3560, 300, 100], [3720, 270, 90],
 [4000, 300, 120], [4350, 280, 100], [4550, 220, 100], [4750, 280, 100]]
  .forEach(([x, y, w]) => plats.push({ x, y, w, h: 14 }));

const citeSpots = [];
for (const p of plats) {
  if (p.g) continue;
  for (let i = 0; i < Math.max(1, Math.floor(p.w / 50)); i++) citeSpots.push({ x: p.x + 25 + i * 50, y: p.y - 28 });
}
[[500, GY - 30], [700, GY - 30], [1300, GY - 30], [1750, GY - 30], [2200, GY - 30], [2600, GY - 30], [3300, GY - 30], [3900, GY - 30]]
  .forEach(([x, y]) => citeSpots.push({ x, y }));

const NPCS = [
  { x: 120, name: "Friendly Editor", color: "#36c",
    quest: { kind: "cites", need: 5, ask: "Welcome, newcomer! This article is a stub. Bring me 5 [citations] and I'll bless your edits.", wait: "Still need citations. They hover over the floating platforms.", done: "Verifiable! Take this, you've gained +2 max HP.", reward: 2 } },
  { x: 1520 - 60, name: "Swamp Admin", color: "#14866d",
    quest: { kind: "kills", need: 4, ask: "Vandals are replacing pages with 'poop'. Mew at 4 of them. Stomping also works, it's called 'reverting'.", wait: "Four vandals. I'm counting.", done: "Reverted! Have a barnstar: +2 max HP.", reward: 2 } },
  { x: 2950, name: "Tired Arbitrator", color: "#b32424",
    quest: { kind: "cites", need: 12, ask: "The fortress is stuck in an edit war. Find 12 more [citations] and I'll rule in your favor.", wait: "Sources. Twelve. Reliable ones.", done: "Consensus reached. +3 max HP, go forth.", reward: 3 } },
  { x: 4260, name: "Ghost of a Stub", color: "#7a7a7a",
    quest: { kind: "none", ask: "Beyond lies the Deletionist. He says you are 'not notable'. You are a baby globe doing a sigma face. You are extremely notable. Mew at him.", wait: "Don't forget: stomp him when he lunges." } },
];
const CHECKPOINTS = [0, 1100, 2000, 3000, 3850];

// ---- state ----
let state = "title";
let P, cam, enemies, cites, shots, fx, dlg, stats, ticks, toast, boss, zoneName, zoneT;

function resetWorld() {
  P = { x: 60, y: GY - 30, w: 26, h: 28, vx: 0, vy: 0, face: 1, ground: false, hp: 5, max: 5, lvl: 1, xp: 0, inv: 0, mewT: 0, mewCd: 0, sx: 60 };
  cam = 0; shots = []; fx = []; dlg = null; ticks = 0; toast = null; zoneName = ""; zoneT = 0;
  stats = { cites: 0, kills: 0, time: 0 };
  cites = citeSpots.map((c) => ({ x: c.x, y: c.y, got: false }));
  enemies = [];
  const van = (x, a, b) => enemies.push({ t: "vandal", x, y: GY - 26, w: 26, h: 26, hp: 2, vx: 50, a, b, dir: 1 });
  [[420, 350, 560], [800, 700, 980], [1250, 1150, 1400], [1600, 1500, 1800], [1850, 1750, 1890],
   [2200, 2050, 2400], [2600, 2450, 2800], [3100, 3020, 3300], [3500, 3400, 3680], [4000, 3850, 4150]].forEach((v) => van(...v));
  [[900, 230], [1500, 200], [2350, 190], [2750, 180], [3450, 200], [4400, 200]].forEach(([x, y]) =>
    enemies.push({ t: "tag", x, y, y0: y, w: 54, h: 18, hp: 1, vx: 0, ph: x }));
  boss = { t: "boss", x: 5000, y: GY - 70, w: 60, h: 70, hp: 16, max: 16, cd: 2, vx: 0, dir: -1, active: false, state: 0, st: 0 };
  enemies.push(boss);
  NPCS.forEach((n) => { n.stage = 0; n.base = 0; });
  const sh = document.getElementById("share"); if (sh) sh.remove();
}

const need = (l) => 4 + l * 3;
function gainXp(n) {
  P.xp += n;
  while (P.xp >= need(P.lvl)) {
    P.xp -= need(P.lvl); P.lvl++; P.max++; P.hp = P.max;
    say("LEVEL UP! You are now level " + P.lvl + ". Jaw: more defined.");
  }
}
function say(t) { toast = { t, life: 2.6 }; }
function dmg() { return 1 + Math.floor(P.lvl / 3); }
function hurt(n, fromX) {
  if (P.inv > 0) return;
  P.hp -= n; P.inv = 1.1; P.vy = -300; P.vx = (P.x < fromX ? -1 : 1) * 200;
  if (P.hp <= 0) { state = "dead"; }
}
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ---- update ----
function update(dt) {
  ticks += dt; stats.time += dt;
  if (toast) { toast.life -= dt; if (toast.life <= 0) toast = null; }
  if (zoneT > 0) zoneT -= dt;

  if (dlg) {
    if (pressed.talk || pressed.jump) { dlg.i++; if (dlg.i >= dlg.lines.length) { if (dlg.after) dlg.after(); dlg = null; } }
    return;
  }

  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (P.inv > 0.7) { /* knockback */ } else P.vx = dir * 210;
  if (dir) P.face = dir;
  if (pressed.jump && P.ground) { P.vy = -640; P.ground = false; }
  if (!keys.jump && P.vy < -250) P.vy += 2200 * dt; // short hop
  P.vy += 1900 * dt;
  if (P.vy > 900) P.vy = 900;
  P.inv = Math.max(0, P.inv - dt);
  P.mewCd = Math.max(0, P.mewCd - dt);
  P.mewT = Math.max(0, P.mewT - dt);
  if (pressed.mew && P.mewCd <= 0) { P.mewT = 0.22; P.mewCd = 0.35; fx.push({ k: "mew", x: P.x + 13 + P.face * 40, y: P.y + 8, t: 0, f: P.face }); }

  // move + collide
  P.x += P.vx * dt;
  P.x = Math.max(0, Math.min(WORLD - P.w, P.x));
  for (const p of plats) {
    if (!p.g) continue;
    if (P.x + P.w > p.x && P.x < p.x + p.w && P.y + P.h > p.y + 6 && P.y < p.y + p.h) {
      if (P.vx > 0 || P.x < p.x) P.x = p.x - P.w; else P.x = p.x + p.w;
    }
  }
  P.y += P.vy * dt; P.ground = false;
  for (const p of plats) {
    if (P.x + P.w <= p.x || P.x >= p.x + p.w) continue;
    const prev = P.y - P.vy * dt + P.h;
    if (P.vy >= 0 && prev <= p.y + 1 && P.y + P.h >= p.y) { P.y = p.y - P.h; P.vy = 0; P.ground = true; }
  }
  if (P.y > H + 80) { // fell into the red link abyss
    P.hp -= 1; say("You fell into a red link.");
    if (P.hp <= 0) state = "dead";
    else { P.x = P.sx; P.y = GY - 60; P.vy = 0; P.inv = 1.2; }
  }
  for (const c of CHECKPOINTS) if (P.x > c + 40 && P.ground && c > P.sx) P.sx = c + 60;

  // zones
  let z = ZONES[0]; for (const q of ZONES) if (P.x >= q.x) z = q;
  if (z.name !== zoneName) { zoneName = z.name; zoneT = 2.6; }

  // citations
  for (const c of cites) if (!c.got && Math.abs(c.x - (P.x + 13)) < 20 && Math.abs(c.y - (P.y + 14)) < 24) {
    c.got = true; stats.cites++; gainXp(1); fx.push({ k: "pop", x: c.x, y: c.y, t: 0, s: "+1" });
  }

  // enemies
  const mewBox = P.mewT > 0 ? { x: P.face > 0 ? P.x + P.w : P.x - 62, y: P.y - 12, w: 62, h: P.h + 24 } : null;
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.t === "vandal") {
      e.x += e.vx * e.dir * dt;
      if (e.x < e.a) { e.x = e.a; e.dir = 1; } if (e.x + e.w > e.b) { e.x = e.b - e.w; e.dir = -1; }
    } else if (e.t === "tag") {
      e.ph += dt * 2; e.y = e.y0 + Math.sin(e.ph) * 24; e.x += Math.cos(e.ph * 0.6) * 30 * dt;
    } else if (e.t === "boss") updateBoss(e, dt);
    if (e.t === "boss" && !e.active) continue;
    if (mewBox && hit(mewBox, e) && !(e.hitT > ticks)) { e.hitT = ticks + 0.25; damage(e, dmg()); e.x += P.face * 12; }
    if (!e.dead && P.inv <= 0 && hit(P, e)) {
      if (P.vy > 100 && P.y + P.h - e.y < 18) { P.vy = -480; damage(e, 1 + (e.t === "boss" ? 1 : 0)); }
      else hurt(1, e.x + e.w / 2);
    }
  }
  for (const s of shots) {
    s.x += s.vx * dt; s.life -= dt;
    if (P.inv <= 0 && hit(P, { x: s.x - 10, y: s.y - 9, w: 20, h: 18 })) { hurt(1, s.x); s.life = 0; }
    if (mewBox && hit(mewBox, { x: s.x - 10, y: s.y - 9, w: 20, h: 18 })) { s.life = 0; fx.push({ k: "pop", x: s.x, y: s.y, t: 0, s: "reverted" }); }
  }
  shots = shots.filter((s) => s.life > 0);
  for (const f of fx) f.t += dt;
  fx = fx.filter((f) => f.t < 0.6);

  // npc prompt + talk
  P.near = null;
  for (const n of NPCS) if (Math.abs(n.x + 13 - (P.x + 13)) < 50) P.near = n;
  if (P.near && pressed.talk) talk(P.near);

  cam = Math.max(0, Math.min(WORLD - W, P.x - W / 2 + 30));
}

function damage(e, n) {
  e.hp -= n; fx.push({ k: "pop", x: e.x + e.w / 2, y: e.y, t: 0, s: "-" + n });
  if (e.hp <= 0) {
    e.dead = true; stats.kills++;
    if (e.t === "boss") { state = "won"; }
    else gainXp(e.t === "tag" ? 2 : 3);
  }
}

function updateBoss(e, dt) {
  if (!e.active) { if (P.x > 4750) { e.active = true; say("The Deletionist: 'This article does not meet notability guidelines.'"); } return; }
  e.cd -= dt;
  const ground = GY - e.h;
  if (e.state === 0) { // pace and throw {{delete}} tags
    e.x += Math.sign(P.x - e.x) * 60 * dt;
    if (e.cd <= 0) {
      shots.push({ x: e.x, y: GY - 30 - (Math.random() < 0.5 ? 0 : 40), vx: P.x < e.x ? -230 : 230, life: 4 });
      e.cd = 1.4;
      if (Math.random() < 0.4) { e.state = 1; e.st = 0; e.vy = -620; e.vx = Math.sign(P.x - e.x) * 260; }
    }
  } else { // lunge: leap at the player, stompable on the way down
    e.st += dt; e.vy += 1900 * dt; e.y += e.vy * dt; e.x += e.vx * dt;
    if (e.y >= ground) { e.y = ground; e.state = 0; e.vx = 0; e.cd = 1.0; }
  }
  if (e.state === 0) e.y = ground;
  e.x = Math.max(4750, Math.min(WORLD - e.w, e.x));
}

function talk(n) {
  const q = n.quest;
  const prog = q.kind === "cites" ? stats.cites - n.base : q.kind === "kills" ? stats.kills - n.base : 0;
  if (q.kind === "none") { dlg = { name: n.name, lines: [q.ask], i: 0 }; return; }
  if (n.stage === 0) {
    dlg = { name: n.name, lines: [q.ask], i: 0, after: () => { n.stage = 1; n.base = q.kind === "cites" ? stats.cites : stats.kills; } };
  } else if (n.stage === 1) {
    if (prog >= q.need) {
      dlg = { name: n.name, lines: [q.done], i: 0, after: () => { n.stage = 2; P.max += q.reward; P.hp = P.max; say("Quest complete! +" + q.reward + " max HP"); } };
    } else dlg = { name: n.name, lines: [q.wait + " (" + Math.max(0, prog) + "/" + q.need + ")"], i: 0 };
  } else dlg = { name: n.name, lines: ["Thanks again, you absolute unit of a globe."], i: 0 };
}

// ---- drawing ----
function globe(x, y, r, face, t, mewing, blink) {
  ctx.save(); ctx.translate(x, y); ctx.scale(face, 1);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.save(); ctx.clip();
  ctx.fillStyle = "#f2f2f2"; ctx.fillRect(-r, -r, r * 2, r * 2);
  // puzzle-piece patches with glyphs, like the wikipedia logo
  const gl = ["W", "Ω", "あ", "Ж", "ك", "文", "A", "ñ"];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * 6.283;
    ctx.fillStyle = i % 2 ? "#d9d9d9" : "#c4c4c4";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * 1.2, a, a + 6.283 / 8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#8a8a8a"; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = "#777"; ctx.font = (r * 0.38) + "px serif"; ctx.textAlign = "center";
    ctx.fillText(gl[i], Math.cos(a + 0.4) * r * 0.78, Math.sin(a + 0.4) * r * 0.78 + r * 0.13);
  }
  // smooth baby face disc over the puzzle
  ctx.fillStyle = "#f7e1d0"; ctx.beginPath(); ctx.ellipse(0, r * 0.12, r * 0.82, r * 0.74, 0, 0, 7); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#444"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
  // baby curl
  ctx.strokeStyle = "#555"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(1, -r - 2, 3.5, 3.4, 6.5); ctx.stroke();
  // cheeks
  ctx.fillStyle = "rgba(240,120,120,.45)"; ctx.beginPath(); ctx.arc(-r * 0.52, r * 0.3, r * 0.14, 0, 7); ctx.arc(r * 0.52, r * 0.3, r * 0.14, 0, 7); ctx.fill();
  // half-lidded sigma eyes
  for (const s of [-1, 1]) {
    const ex = s * r * 0.34, ey = -r * 0.02;
    if (blink) { ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex - r * .17, ey); ctx.lineTo(ex + r * .17, ey); ctx.stroke(); continue; }
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(ex, ey + r * .04, r * .17, r * .1, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(ex + r * .05, ey + r * .05, r * .075, 0, 7); ctx.fill();
    ctx.fillStyle = "#f7e1d0"; ctx.fillRect(ex - r * .2, ey - r * .1, r * .4, r * .1 + 0.5); // heavy lid
    ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex - r * .2, ey + 0.5); ctx.lineTo(ex + r * .2, ey + 0.5); ctx.stroke();
    // brows: one raised
    ctx.beginPath(); ctx.moveTo(ex - r * .2, ey - r * (s < 0 ? .2 : .12)); ctx.lineTo(ex + r * .2, ey - r * (s < 0 ? .3 : .18)); ctx.stroke();
  }
  // mouth: small flat smirk
  ctx.strokeStyle = "#7a3b3b"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-r * .16, r * .5); ctx.lineTo(r * .1, r * .5); ctx.lineTo(r * .2, r * .44); ctx.stroke();
  // jawline (the mewing)
  ctx.strokeStyle = mewing ? "#36c" : "rgba(80,60,60,.55)"; ctx.lineWidth = mewing ? 2.4 : 1.3;
  ctx.beginPath(); ctx.moveTo(-r * .78, r * .22); ctx.lineTo(-r * .42, r * .72); ctx.lineTo(r * .42, r * .72); ctx.lineTo(r * .78, r * .22); ctx.stroke();
  ctx.restore();
}

function drawBg() {
  let z = ZONES[0], zi = 0; ZONES.forEach((q, i) => { if (cam + W / 2 >= q.x) { z = q; zi = i; } });
  ctx.fillStyle = z.sky; ctx.fillRect(0, 0, W, H);
  // parallax "article text" lines
  ctx.fillStyle = "rgba(0,0,0,.05)";
  for (let i = 0; i < 40; i++) { const x = ((i * 137 - cam * 0.3) % 1000 + 1000) % 1000 - 100; ctx.fillRect(x, 60 + (i % 7) * 40, 60 + (i * 31) % 120, 6); }
  // blue links in the sky
  ctx.fillStyle = "rgba(51,102,204,.22)";
  for (let i = 0; i < 14; i++) { const x = ((i * 211 - cam * 0.5) % 1100 + 1100) % 1100 - 150; ctx.fillRect(x, 40 + (i * 53) % 220, 50 + (i * 17) % 60, 5); }
  return z;
}

function draw() {
  const z = drawBg();
  ctx.save(); ctx.translate(-Math.round(cam), 0);
  for (const p of plats) {
    if (p.x + p.w < cam - 10 || p.x > cam + W + 10) continue;
    const zz = [...ZONES].reverse().find((q) => p.x >= q.x) || ZONES[0];
    ctx.fillStyle = p.g ? zz.ground : "#fff"; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = "#3a3a3a"; ctx.lineWidth = 2; ctx.strokeRect(p.x, p.y, p.w, p.h);
    if (p.g) { ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(p.x, p.y + 16, p.w, p.h - 16); }
  }
  // pits: red links
  ctx.fillStyle = "#c33"; ctx.font = "13px sans-serif"; ctx.textAlign = "center";
  for (let i = 0; i < grounds.length - 1; i++) ctx.fillText("red link", (grounds[i][1] + grounds[i + 1][0]) / 2, H - 14);
  // citations
  ctx.font = "bold 12px sans-serif";
  for (const c of cites) if (!c.got) {
    const bob = Math.sin(ticks * 4 + c.x) * 3;
    ctx.fillStyle = "#fff"; ctx.fillRect(c.x - 10, c.y - 9 + bob, 20, 18);
    ctx.strokeStyle = "#36c"; ctx.lineWidth = 1.5; ctx.strokeRect(c.x - 10, c.y - 9 + bob, 20, 18);
    ctx.fillStyle = "#36c"; ctx.textAlign = "center"; ctx.fillText("[1]", c.x, c.y + 4 + bob);
  }
  // npcs
  for (const n of NPCS) {
    ctx.fillStyle = n.color; ctx.fillRect(n.x, GY - 34, 26, 34);
    ctx.fillStyle = "#fff"; ctx.fillRect(n.x + 5, GY - 26, 5, 5); ctx.fillRect(n.x + 16, GY - 26, 5, 5);
    ctx.fillStyle = "#000"; ctx.fillRect(n.x + 7, GY - 25, 2, 3); ctx.fillRect(n.x + 18, GY - 25, 2, 3);
    ctx.fillStyle = "#222"; ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.fillText(n.name, n.x + 13, GY - 42);
    const open = n.quest.kind !== "none" && n.stage < 2;
    if (open) { ctx.fillStyle = "#e8b100"; ctx.font = "bold 18px sans-serif"; ctx.fillText(n.stage === 0 ? "!" : "?", n.x + 13, GY - 54 + Math.sin(ticks * 5) * 2); }
  }
  // enemies
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.t === "vandal") {
      ctx.fillStyle = "#9a2d8f"; ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = "#fff"; ctx.fillRect(e.x + 5, e.y + 7, 6, 6); ctx.fillRect(e.x + 15, e.y + 7, 6, 6);
      ctx.fillStyle = "#000"; ctx.fillRect(e.x + 7, e.y + 9, 3, 3); ctx.fillRect(e.x + 17, e.y + 9, 3, 3);
      ctx.fillRect(e.x + 6, e.y + 18, 14, 2);
      ctx.fillStyle = "#222"; ctx.font = "9px sans-serif"; ctx.textAlign = "center"; ctx.fillText("vandal", e.x + 13, e.y - 4);
    } else if (e.t === "tag") {
      ctx.fillStyle = "#fff3b8"; ctx.fillRect(e.x, e.y, e.w, e.h); ctx.strokeStyle = "#a55858"; ctx.lineWidth = 1.5; ctx.strokeRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = "#36c"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.fillText("[citation needed]", e.x + e.w / 2, e.y + 12);
    } else if (e.t === "boss" && (e.active || e.x < cam + W)) {
      ctx.fillStyle = "#2b2b3d"; ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = "#c33"; ctx.fillRect(e.x + 10, e.y + 18, 12, 8); ctx.fillRect(e.x + 38, e.y + 18, 12, 8);
      ctx.fillRect(e.x + 14, e.y + 46, 32, 4);
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.fillText("{{delete}}", e.x + 30, e.y + 10);
      ctx.fillStyle = "#222"; ctx.fillText("The Deletionist", e.x + 30, e.y - 14);
      ctx.fillStyle = "#900"; ctx.fillRect(e.x - 4, e.y - 10, 68, 5); ctx.fillStyle = "#2a2"; ctx.fillRect(e.x - 4, e.y - 10, 68 * Math.max(0, e.hp) / e.max, 5);
    }
  }
  for (const s of shots) { ctx.fillStyle = "#c33"; ctx.fillRect(s.x - 10, s.y - 9, 20, 18); ctx.fillStyle = "#fff"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("✕", s.x, s.y + 4); }
  // player
  if (!(P.inv > 0 && Math.floor(ticks * 20) % 2)) globe(P.x + 13, P.y + 14, 16, P.face, ticks, P.mewT > 0, Math.floor(ticks * 1.1) % 4 === 0 && (ticks * 1.1) % 1 < 0.12);
  for (const f of fx) {
    if (f.k === "mew") {
      ctx.strokeStyle = "rgba(51,102,204," + (1 - f.t / 0.6) + ")"; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(f.x - f.f * 30 + f.f * f.t * 120, f.y + 10, 12 + i * 12, f.f > 0 ? -1 : 2.1, f.f > 0 ? 1 : 4.2); ctx.stroke(); }
      ctx.fillStyle = "#36c"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText("mew", f.x + f.f * f.t * 90, f.y - 14 - f.t * 20);
    } else { ctx.fillStyle = "rgba(30,30,30," + (1 - f.t / 0.6) + ")"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText(f.s, f.x, f.y - f.t * 40); }
  }
  if (P.near && !dlg) { ctx.fillStyle = "#222"; ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("[E] talk", P.near.x + 13, GY - 74); }
  ctx.restore();

  // hud
  ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.fillRect(8, 8, 232, 52); ctx.strokeStyle = "#a2a9b1"; ctx.lineWidth = 1; ctx.strokeRect(8.5, 8.5, 232, 52);
  ctx.fillStyle = "#202122"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("Lv " + P.lvl + "   HP " + Math.max(0, P.hp) + "/" + P.max + "   [" + stats.cites + "] cited", 16, 26);
  ctx.fillStyle = "#c33"; for (let i = 0; i < P.max; i++) { ctx.globalAlpha = i < P.hp ? 1 : 0.2; ctx.fillRect(16 + i * 11, 33, 9, 8); } ctx.globalAlpha = 1;
  ctx.fillStyle = "#dde"; ctx.fillRect(16, 46, 216, 6); ctx.fillStyle = "#36c"; ctx.fillRect(16, 46, 216 * P.xp / need(P.lvl), 6);
  if (zoneT > 0) { ctx.globalAlpha = Math.min(1, zoneT); ctx.fillStyle = "#202122"; ctx.font = "26px Georgia, serif"; ctx.textAlign = "center"; ctx.fillText(zoneName, W / 2, 70); ctx.globalAlpha = 1; }
  if (toast) { ctx.fillStyle = "rgba(32,33,34,.88)"; ctx.fillRect(W / 2 - 280, 92, 560, 28); ctx.fillStyle = "#fff"; ctx.font = "13px sans-serif"; ctx.textAlign = "center"; ctx.fillText(toast.t, W / 2, 111); }
  if (dlg) {
    ctx.fillStyle = "rgba(255,255,255,.96)"; ctx.fillRect(40, 300, 720, 120); ctx.strokeStyle = "#202122"; ctx.lineWidth = 2; ctx.strokeRect(41, 301, 718, 118);
    ctx.fillStyle = "#36c"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "left"; ctx.fillText(dlg.name, 56, 324);
    ctx.fillStyle = "#202122"; ctx.font = "15px Georgia, serif"; wrap(dlg.lines[dlg.i], 56, 348, 688, 20);
    ctx.fillStyle = "#72777d"; ctx.font = "11px sans-serif"; ctx.textAlign = "right"; ctx.fillText("[E] / jump to continue", 746, 410);
  }
}
function wrap(t, x, y, w, lh) {
  let line = "";
  for (const word of t.split(" ")) {
    const test = line + word + " ";
    if (ctx.measureText(test).width > w && line) { ctx.fillText(line, x, y); line = word + " "; y += lh; } else line = test;
  }
  ctx.fillText(line, x, y);
}

function panel(title, lines, hint) {
  ctx.fillStyle = "rgba(246,246,246,.94)"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#202122"; ctx.textAlign = "center"; ctx.font = "34px Georgia, serif"; ctx.fillText(title, W / 2, 150);
  ctx.fillStyle = "#a2a9b1"; ctx.fillRect(150, 162, 500, 1);
  ctx.font = "15px Georgia, serif"; ctx.fillStyle = "#54595d";
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 198 + i * 24));
  ctx.fillStyle = "#36c"; ctx.font = "bold 14px sans-serif"; ctx.fillText(hint, W / 2, 380);
}

// ---- main loop ----
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (state === "play") { update(dt); draw(); }
  else {
    if (!P) resetWorld();
    ticks += dt; draw();
    if (state === "title") {
      panel("Baby sigma globe", ["From Wikipedia, the free platformer.", "You are the baby puzzle globe. Your jaw is defined.", "Collect [citations], mew at vandals, reach the Deletion Discussion."], "press Enter / tap to start");
      globe(W / 2, 100, 40, 1, ticks, true, false);
    } else if (state === "dead") panel("Speedily deleted", ["You reached level " + P.lvl + " with " + stats.cites + " citations and " + stats.kills + " reverts.", "Your article was nominated for deletion under criterion G1."], "press Enter / tap to restart");
    else if (state === "won") {
      panel("Featured article!", ["The Deletionist has been closed as KEEP.", "Level " + P.lvl + ", " + stats.cites + " citations, " + stats.kills + " reverts, " + Math.round(stats.time) + "s.", "The globe is notable. The jaw is immaculate."], "Enter / tap to play again");
      globe(W / 2, 100, 40, 1, ticks, true, false);
      shareLink();
    }
    if (pressed.talk || pressed.start || pressed.jump) { resetWorld(); state = "play"; }
  }
  for (const k in pressed) pressed[k] = false;
  requestAnimationFrame(frame);
}
function shareLink() {
  let a = document.getElementById("share");
  if (a) return;
  a = document.createElement("a"); a.id = "share"; a.textContent = "post this win to Bluesky →";
  const txt = "I closed the Deletion Discussion as a baby sigma globe (level " + P.lvl + ", " + stats.cites + " citations) https://baby-sigma-globe.bisks.net/";
  a.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(txt); a.target = "_blank"; a.rel = "noopener";
  a.style.cssText = "display:inline-block;margin:8px 0;font:14px sans-serif;color:#36c";
  document.getElementById("wrap").after(a);
}
resetWorld();
requestAnimationFrame(frame);
