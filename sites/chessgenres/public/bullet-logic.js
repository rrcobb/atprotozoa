// Pure rules for Chess Bullet Hell — no DOM, so tests can import it.
// You are a lone king with a tiny hitbox. Enemy pieces shoot patterns shaped like
// their own moves: pawns aim, knights hop and fan, bishops fire diagonals, rooks
// rain straight lines. Three stages, each with a mid-boss and a boss whose attacks
// are named "spell cards" after chess ideas (Back-Rank Rain, Skewer, Zugzwang...).
export const W = 480, H = 640;
export const HIT_R = 3;        // the king's hitbox is the dot in his chest, not the sprite
export const GRAZE_R = 14;     // a bullet passing this close (once) scores and builds the multiplier
export const DEATHBOMB = 0.15; // seconds after a hit in which castling still saves you
export const MAX_POWER = 4;    // five firepower levels: 0..4
export const MAX_BOMBS = 6;    // a pocket of spare castles bigger than this trivialises the bosses
export const MAX_MULT = 3;     // the graze chain tops out at x3 so grazing can't snowball the score
export const EXTENDS = [30000, 90000, 180000]; // score thresholds that grant an extra life
export const KINDS = {
  pawn:   { hp: 3,   r: 14, glyph: "♟", pts: 100 },
  knight: { hp: 7,   r: 16, glyph: "♞", pts: 250 },
  bishop: { hp: 9,   r: 16, glyph: "♝", pts: 300 },
  rook:   { hp: 14,  r: 18, glyph: "♜", pts: 500 },
  queen:  { hp: 380, r: 42, glyph: "♛", pts: 10000 },
};
export const DIFFS = {
  easy:   { name: "easy",   speed: 0.8, dens: 0.75, lives: 5, bombs: 3, hp: 0.8 },
  normal: { name: "normal", speed: 1,   dens: 1,    lives: 3, bombs: 2, hp: 1 },
  hard:   { name: "hard",   speed: 1.2, dens: 1.3,  lives: 2, bombs: 1, hp: 1.2 },
};

// A boss has one or more spell cards. A card ends when hp falls to `until` (a fraction)
// or after `limit` seconds, whichever comes first.
export const BOSSES = {
  darkbishop: { name: "The Dark-Squared Bishop", kind: "bishop", hp: 110, r: 24, mid: true, pts: 3000,
    cards: [{ name: "Crossfire", until: 0, pat: "crossfire", limit: 30 }] },
  battery: { name: "The Rook Battery", kind: "rook", hp: 420, r: 30, pts: 12000,
    cards: [{ name: "Back-Rank Rain", until: 0.66, pat: "rain", limit: 32 }, { name: "Open File", until: 0.33, pat: "files", limit: 32 }, { name: "Castling Rush", until: 0, pat: "rush", limit: 40 }] },
  fork: { name: "Sir Fork", kind: "knight", hp: 150, r: 24, mid: true, pts: 4000,
    cards: [{ name: "Knight's Fork", until: 0, pat: "fork", limit: 30 }] },
  archbishop: { name: "The Archbishop", kind: "bishop", hp: 500, r: 32, pts: 15000,
    cards: [{ name: "Skewer", until: 0.66, pat: "skewer", limit: 32 }, { name: "Pin", until: 0.33, pat: "pin", limit: 32 }, { name: "Discovered Attack", until: 0, pat: "discovered", limit: 40 }] },
  doubled: { name: "Doubled Rooks", kind: "rook", hp: 180, r: 26, mid: true, pts: 5000,
    cards: [{ name: "Doubled Rooks", until: 0, pat: "doubled", limit: 30 }] },
  queen: { name: "The Giant Queen", kind: "queen", hp: 760, r: 42, pts: 30000,
    cards: [{ name: "Queen's Gambit", until: 0.75, pat: "gambit", limit: 30 }, { name: "Opposition", until: 0.5, pat: "ringgap", limit: 30 },
      { name: "Zugzwang", until: 0.25, pat: "zugzwang", limit: 30 }, { name: "Checkmate!", until: 0, pat: "mate", limit: 60 }] },
};

export const STAGES = [
  { name: "the opening", boss: "battery" },
  { name: "the middlegame", boss: "archbishop" },
  { name: "the endgame", boss: "queen" },
];

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Wave script for a stage: pieces enter at fixed times (x jittered a little so runs differ),
// the mid-boss arrives mid-stage and the stage boss ends it. Script time pauses while a boss lives.
export function buildScript(stage = 0, rand = () => 0.5) {
  const out = [];
  const j = () => (rand() - 0.5) * 36;
  const row = (t, kind, xs, gap = 0) => xs.forEach((x, i) => out.push({ t: t + i * gap, kind, x: Math.min(W - 30, Math.max(30, x + j())) }));
  if (stage === 0) {
    row(1, "pawn", [120, 240, 360], 0.5); row(6, "pawn", [60, 150, 330, 420], 0.4);
    row(11, "knight", [100, 380], 1.2); row(15, "pawn", [80, 160, 240, 320, 400], 0.3);
    row(19, "bishop", [90, 390], 1.5); out.push({ t: 24, boss: "darkbishop" });
    row(26, "pawn", [60, 420, 120, 360], 0.4); row(30, "rook", [70], 0);
    row(34, "knight", [60, 420], 0.8); row(38, "pawn", [100, 200, 300, 380], 0.35);
    out.push({ t: 43, boss: "battery" });
  } else if (stage === 1) {
    row(1, "knight", [100, 380], 0.8); row(5, "bishop", [90, 390], 1); row(9, "pawn", [60, 140, 220, 300, 380, 440], 0.25);
    row(13, "knight", [240, 120, 360], 1); row(18, "rook", [70, 410], 2); row(21, "bishop", [240], 0);
    out.push({ t: 25, boss: "fork" });
    row(27, "pawn", [80, 400, 160, 320, 240], 0.3); row(31, "bishop", [100, 380], 1.2); row(35, "knight", [60, 420, 240], 0.9);
    row(39, "rook", [240], 0); row(42, "pawn", [60, 120, 180, 240, 300, 360, 420], 0.2);
    out.push({ t: 47, boss: "archbishop" });
  } else {
    row(1, "rook", [70, 410], 1.5); row(4, "knight", [100, 240, 380], 0.7); row(9, "bishop", [90, 390, 240], 1);
    row(14, "pawn", [60, 140, 220, 300, 380, 440], 0.2); row(17, "rook", [240], 0); row(20, "knight", [60, 420], 0.5);
    out.push({ t: 25, boss: "doubled" });
    row(27, "bishop", [120, 360], 0.6); row(31, "knight", [80, 240, 400], 0.6); row(35, "rook", [70, 410], 1);
    row(38, "pawn", [100, 180, 260, 340, 420], 0.2); row(42, "bishop", [90, 390], 0.5);
    out.push({ t: 47, boss: "queen" });
  }
  return out.sort((a, b) => a.t - b.t);
}

// opts: { diff: "easy"|"normal"|"hard", stage: 0..2 to practise a later stage }
export function newGame(seed = 1, opts = {}) {
  const dif = DIFFS[opts.diff] || DIFFS.normal, stage = Math.min(STAGES.length - 1, Math.max(0, opts.stage || 0));
  const rand = rng(seed);
  return {
    t: 0, st: 0, rand, seed, dif, diffId: dif.name, stage, startStage: stage, script: buildScript(stage, rand), si: 0, phase: "play", clearT: 0,
    p: { x: W / 2, y: H - 70, inv: 1.5, fire: 0, dying: 0 },
    lives: dif.lives, bombs: dif.bombs, power: 0, mult: 1, multIdle: 0, score: 0, grazes: 0, nextExtend: 0, cardHit: false,
    bullets: [], shots: [], enemies: [], items: [], fx: [], banner: null, bossesDown: 0,
    over: false, won: false,
  };
}

const fx = (s, type, v) => { if (s.fx.length < 64) s.fx.push({ type, v }); }; // 64: a frame's worth of sounds; the UI drains it every frame

function shoot(s, x, y, ang, speed, r = 5, extra) {
  const v = speed * s.dif.speed;
  s.bullets.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r, g: false, age: 0, ...extra });
}
const aimAt = (s, e) => Math.atan2(s.p.y - e.y, s.p.x - e.x);
const cd = (s, base) => base / s.dif.dens; // cooldowns shrink on harder levels
const ring = (s, x, y, n, off, speed, skip, r) => {
  for (let k = 0; k < n; k++) { const a = off + (k * Math.PI * 2) / n; if (!skip || skip(a)) shoot(s, x, y, a, speed, r); }
};
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export function spawn(s, kind, x) {
  const k = KINDS[kind];
  const e = { kind, x, y: kind === "queen" ? -60 : -24, hp: Math.ceil(k.hp * s.dif.hp), max: 0, r: k.r, age: 0, f: 0.6, f2: 0, a: 0, vx: 0, hopT: 0, hop: null, boss: false };
  e.max = e.hp;
  if (kind === "bishop") e.vx = x < W / 2 ? 90 : -90;
  if (kind === "rook") e.vx = x < W / 2 ? 110 : -110;
  s.enemies.push(e);
  return e;
}

export function spawnBoss(s, id) {
  const d = BOSSES[id], hp = Math.ceil(d.hp * s.dif.hp);
  const e = { kind: d.kind, boss: id, def: d, x: W / 2, y: -60, hp, max: hp, r: d.r, age: 0, f: 1.2, f2: 1, a: 0, vx: 0, ci: -1, cardT: 0, gx: W / 2, tx: W / 2, moving: false, disc: 0, dx: 0, warn: null, stream: null, arrived: false, hop: null };
  s.enemies.push(e);
  startCard(s, e, 0);
  return e;
}

// which spell card a boss is on (0-based); ordinary pieces are always 0
export function bossPhase(e) { return e.ci > 0 ? e.ci : 0; }

function startCard(s, e, i) {
  e.ci = i; e.cardT = 0; e.f = 1.2; e.f2 = 1; e.a = 0; e.warn = null; e.stream = null; e.disc = 0; e.moving = false;
  if (i > 0) s.bullets.length = 0; // a broken card wipes the screen
  s.cardHit = false;
  s.banner = { text: e.def.cards[i].name, t: 2.2, kind: "card" };
  fx(s, "card", i);
}

function endCardBonus(s, e) {
  if (s.cardHit) return;
  const bonus = 3000 * (e.ci + 1);
  s.score += bonus; s.banner = { text: `spell bonus +${bonus}`, t: 2, kind: "bonus" }; fx(s, "bonus", bonus);
}

function advanceCard(s, e) {
  endCardBonus(s, e);
  const next = e.ci + 1;
  if (next < e.def.cards.length) startCard(s, e, next);
}

function runBoss(s, e, dt) {
  const card = e.def.cards[e.ci], p = s.p;
  e.cardT += dt;
  // approach, then sway by default; some cards move the boss themselves
  if (!e.arrived) { e.y += 70 * dt; if (e.y >= 105) { e.y = 105; e.arrived = true; } return; }
  e.f -= dt; e.f2 -= dt;
  const sway = () => { e.x = W / 2 + Math.sin(e.age * 0.6) * 130; };
  const pat = card.pat;
  if (pat === "crossfire") {
    sway();
    if (e.f <= 0) { e.f = cd(s, 0.11); const w = Math.sin(e.age * 0.9) * 0.45; shoot(s, e.x, e.y, Math.PI / 4 + w, 170); shoot(s, e.x, e.y, (3 * Math.PI) / 4 - w, 170); }
    if (e.f2 <= 0) { e.f2 = cd(s, 1.5); for (const d of [-0.25, 0, 0.25]) shoot(s, e.x, e.y, aimAt(s, e) + d, 190); }
  } else if (pat === "fork") {
    if (e.moving) {
      const dx = e.tx - e.x; e.x += Math.sign(dx) * Math.min(Math.abs(dx), 520 * dt);
      if (Math.abs(e.tx - e.x) < 2) {
        e.moving = false; e.f = cd(s, 1.1);
        const a = aimAt(s, e);
        for (const side of [-0.5, 0.5]) for (let k = -2; k <= 2; k++) shoot(s, e.x, e.y, a + side + k * 0.12, 150);
        shoot(s, e.x, e.y, a, 210);
      }
    } else if (e.f <= 0) { e.tx = 60 + s.rand() * (W - 120); e.moving = true; e.y = e.y > 130 ? 100 : 150; }
    if (e.f2 <= 0) { e.f2 = cd(s, 2); ring(s, e.x, e.y, 10, e.a += 0.3, 110); }
  } else if (pat === "doubled") {
    e.x = W / 2 + Math.sin(e.age * 0.7) * 150;
    if (e.f <= 0) { e.f = cd(s, 0.13); shoot(s, e.x - 90, e.y + 10, Math.PI / 2, 230, 4); shoot(s, e.x + 90, e.y + 10, Math.PI / 2, 230, 4); }
    if (e.f2 <= 0) { e.f2 = cd(s, 1.2); shoot(s, e.x, e.y, aimAt(s, e), 200, 6); }
  } else if (pat === "rain") {
    e.x = W / 2 + Math.sin(e.age * 0.5) * 100;
    if (e.f <= 0) {
      e.f = cd(s, 0.8); e.gx = Math.min(W - 90, Math.max(90, e.gx + (s.rand() - 0.5) * 220));
      for (let x = 15; x < W; x += 30) if (Math.abs(x - e.gx) > 52) shoot(s, x, -6, Math.PI / 2, 120, 5);
    }
    if (e.f2 <= 0) { e.f2 = cd(s, 1.6); shoot(s, e.x, e.y, aimAt(s, e), 170, 6); }
  } else if (pat === "files") {
    e.x += (Math.min(W - 60, Math.max(60, p.x)) - e.x) * Math.min(1, dt * 1.5);
    if (e.warn) {
      e.warn.t -= dt;
      if (e.warn.t <= 0) { e.stream = { x: e.warn.x, t: 1 }; e.warn = null; }
    } else if (e.stream) {
      e.stream.t -= dt;
      if (e.f <= 0) { e.f = cd(s, 0.045); shoot(s, e.stream.x, -6, Math.PI / 2, 330, 5); shoot(s, e.stream.x + 34, -6, Math.PI / 2, 330, 3); shoot(s, e.stream.x - 34, -6, Math.PI / 2, 330, 3); }
      if (e.stream.t <= 0) { e.stream = null; e.f2 = cd(s, 0.3); }
    } else if (e.f2 <= 0) e.warn = { x: Math.min(W - 40, Math.max(40, p.x)), t: 0.85 };
    if (e.cardT % 2.2 < dt) ring(s, e.x, e.y, 12, e.a += 0.2, 100);
  } else if (pat === "rush") {
    e.x = W / 2 + Math.sin(e.age * 1.1) * (W / 2 - 60);
    if (e.f <= 0) { e.f = cd(s, 0.17); for (const d of [-0.28, 0, 0.28]) shoot(s, e.x, e.y + 14, Math.PI / 2 + d, 230, 4); }
    if (e.f2 <= 0) { e.f2 = cd(s, 1.4); shoot(s, e.x, e.y, aimAt(s, e), 230, 7); }
  } else if (pat === "skewer") {
    sway();
    if (e.f <= 0) { e.f = cd(s, 0.07); const a = Math.PI / 2 + Math.sin(e.age * 0.8) * 1.15; shoot(s, e.x, e.y, a, 175); shoot(s, e.x, e.y, Math.PI - a, 175); }
    if (e.f2 <= 0) { e.f2 = cd(s, 2.2); ring(s, e.x, e.y, 14, e.a += 0.4, 105); }
  } else if (pat === "pin") {
    sway();
    if (e.f <= 0) { e.f = cd(s, 0.9); const a = aimAt(s, e); for (let k = 0; k < 6; k++) shoot(s, e.x, e.y, a, 120 + k * 22, 4); }
    if (e.f2 <= 0) { e.f2 = cd(s, 0.16); e.a += 0.22; for (const q of [1, 3, 5, 7]) shoot(s, e.x, e.y, e.a + (q * Math.PI) / 4, 125); }
  } else if (pat === "discovered") {
    sway();
    if (e.f <= 0) { e.f = cd(s, 2.4); ring(s, e.x, e.y, 16, 0, 85, null, 6); e.disc = 0.85; e.dx = e.x; }
    if (e.disc > 0) { e.disc -= dt; if (e.disc <= 0) ring(s, e.dx, e.y, 16, Math.PI / 16, 190, null, 4); } // the second ring was hiding behind the first
    if (e.f2 <= 0) { e.f2 = cd(s, 0.7); shoot(s, e.x, e.y, aimAt(s, e), 190); }
  } else if (pat === "gambit") {
    sway();
    if (e.f <= 0) { e.f = cd(s, 0.1); e.a += 0.31; for (let k = 0; k < 3; k++) shoot(s, e.x, e.y, e.a + (k * Math.PI * 2) / 3, 140); }
    if (e.f2 <= 0) { e.f2 = cd(s, 0.32); shoot(s, 20 + s.rand() * (W - 40), -6, Math.PI / 2, 105, 8); } // a storm of pawns
  } else if (pat === "ringgap") {
    sway();
    if (e.f2 <= 0) { // a ring with a gap aimed at the king: slip through the hole
      e.f2 = cd(s, 1.1); const gap = aimAt(s, e);
      ring(s, e.x, e.y, 20, 0, 125, (a) => angDiff(a, gap) > 0.4);
    }
    if (e.f <= 0) { e.f = cd(s, 0.5); shoot(s, e.x, e.y, aimAt(s, e), 190); }
  } else if (pat === "zugzwang") {
    sway();
    if (e.f2 <= 0) {
      e.f2 = cd(s, 2.6);
      // the ring freezes mid-air, then every bullet turns on the king at once
      for (let k = 0; k < 24; k++) shoot(s, e.x, e.y, (k * Math.PI * 2) / 24, 90, 5, { pause: [0.7, 1.4], re: 160 * s.dif.speed });
    }
    if (e.f <= 0) { e.f = cd(s, 0.6); shoot(s, e.x, e.y, aimAt(s, e), 160, 5); }
  } else if (pat === "mate") {
    sway();
    if (e.f <= 0) { e.f = cd(s, 0.14); e.a += 0.27; for (let k = 0; k < 5; k++) shoot(s, e.x, e.y, e.a + (k * Math.PI * 2) / 5, 140); }
    if (e.f2 <= 0) { e.f2 = cd(s, 1.8); ring(s, e.x, e.y, 24, e.a, 110); }
  }
  // a card that is never beaten times out into the next one
  if (card.limit && e.cardT > card.limit && e.ci < e.def.cards.length - 1) {
    e.hp = Math.min(e.hp, Math.floor(e.max * card.until));
    advanceCard(s, e);
  }
}

function runEnemy(s, e, dt) {
  e.age += dt;
  if (e.boss) return runBoss(s, e, dt);
  e.f -= dt;
  if (e.kind === "pawn") {
    e.y += 80 * dt;
    if (e.f <= 0 && e.y > 0 && e.y < H * 0.7) { e.f = cd(s, 1.5); shoot(s, e.x, e.y, aimAt(s, e), 160); }
  } else if (e.kind === "knight") {
    if (e.hop) {
      e.hopT += dt / 0.25;
      const u = Math.min(1, e.hopT);
      e.x = e.hop.x0 + (e.hop.x1 - e.hop.x0) * u; e.y = e.hop.y0 + (e.hop.y1 - e.hop.y0) * u;
      if (u >= 1) { e.hop = null; e.f = cd(s, 1.0); const a = aimAt(s, e); for (const d of [-0.3, 0, 0.3]) shoot(s, e.x, e.y, a + d, 170); }
    } else if (e.f <= 0) {
      // an L: one square one way, two the other; always forward so knights eventually leave
      const long = s.rand() < 0.5, sx = s.rand() < 0.5 ? -1 : 1;
      const dx = (long ? 2 : 1) * 40 * sx, dy = (long ? 1 : 2) * 40;
      e.hop = { x0: e.x, y0: e.y, x1: Math.min(W - 24, Math.max(24, e.x + dx)), y1: e.y + dy }; e.hopT = 0;
    }
  } else if (e.kind === "bishop") {
    e.x += e.vx * dt; e.y += 55 * dt;
    if (e.x < 20 || e.x > W - 20) { e.vx = -e.vx; e.x = Math.min(W - 20, Math.max(20, e.x)); }
    if (e.f <= 0 && e.y > 0) { e.f = cd(s, 1.8); for (const a of [1, 3, 5, 7]) shoot(s, e.x, e.y, (a * Math.PI) / 4, 130); }
  } else if (e.kind === "rook") {
    if (e.age > 11) e.y -= 150 * dt;                  // retreats after a while
    else if (e.y < 90) e.y += 100 * dt;
    else { e.x += e.vx * dt; if (e.x < 24 || e.x > W - 24) { e.vx = -e.vx; e.x = Math.min(W - 24, Math.max(24, e.x)); } }
    if (e.f <= 0 && e.y > 0) { e.f = cd(s, 0.3); shoot(s, e.x, e.y + 14, Math.PI / 2, 210, 4); }
  } else if (e.kind === "queen") { // the old lone queen, kept for practice and tests: one spell card
    if (e.y < 110) e.y += 60 * dt; else e.x = W / 2 + Math.sin(e.age * 0.6) * 130;
    if (e.f <= 0 && e.y >= 110) { e.f = cd(s, 0.12); e.a += 0.33; for (let k = 0; k < 3; k++) shoot(s, e.x, e.y, e.a + (k * Math.PI * 2) / 3, 150); }
  }
}

function drop(s, x, y, type, vx = 0) { s.items.push({ x, y, type, vx, vy: -90 }); }

function kill(s, e) {
  const k = KINDS[e.kind], pts = e.boss ? e.def.pts : k.pts;
  s.score += Math.round(pts * s.mult);
  fx(s, e.boss ? "bossdown" : "kill", e.kind);
  if (e.boss) {
    s.bossesDown++;
    endCardBonus(s, e);
    s.bullets.length = 0;
    for (let i = 0; i < 8; i++) drop(s, e.x, e.y, "gem", (i - 3.5) * 28);
    drop(s, e.x - 20, e.y, "power"); drop(s, e.x + 20, e.y, "bomb");
    if (!e.def.mid) { s.phase = "clear"; s.clearT = 3; s.banner = { text: `stage ${s.stage + 1} clear`, t: 3, kind: "clear" }; }
    else s.banner = { text: "mid-boss down", t: 1.5, kind: "bonus" };
    return;
  }
  const r = s.rand();
  if (e.kind === "rook") drop(s, e.x, e.y, r < 0.5 ? "bomb" : "power");
  else if (r < (e.kind === "pawn" ? 0.2 : 0.4)) drop(s, e.x, e.y, "power");
  else drop(s, e.x, e.y, "gem");
}

function hurt(s, e, d) {
  if (e.hp <= 0 || (e.boss && !e.arrived)) return; // bosses can't be hurt while they slide in
  e.hp -= d;
  if (e.hp <= 0) return kill(s, e);
  if (e.boss) {
    const card = e.def.cards[e.ci];
    if (e.ci < e.def.cards.length - 1 && e.hp / e.max <= card.until) advanceCard(s, e);
  }
}

export function bomb(s) {
  if (s.over || s.bombs <= 0 || s.phase !== "play") return false;
  s.bombs--; s.bullets.length = 0; s.p.dying = 0; s.p.inv = Math.max(s.p.inv, 1.5); s.cardHit = true;
  fx(s, "bomb");
  for (const e of s.enemies) hurt(s, e, e.boss ? 10 : 15);
  return true;
}

function loseLife(s) {
  const p = s.p;
  s.lives--; p.dying = 0; p.inv = 2.5; s.cardHit = true; s.mult = 1; fx(s, "hurt");
  if (s.power > 0) { s.power--; drop(s, p.x, p.y - 20, "power"); }
  s.bullets = s.bullets.filter((o) => Math.hypot(o.x - p.x, o.y - p.y) > 90);
  if (s.lives <= 0) s.over = true;
}

const FIRE = [
  [[-7, 0], [7, 0]],
  [[-10, -35], [0, 0], [10, 35]],
  [[-13, -70], [-4, 0], [4, 0], [13, 70]],
  [[-15, -110], [-8, -35], [0, 0], [8, 35], [15, 110]],
  [[-18, -150], [-11, -70], [-4, -15], [4, 15], [11, 70], [18, 150]],
];

// input: { mx, my } (-1..1 each) or { tx, ty } to glide toward a point; { focus } slows the king.
export function step(s, dt, input = {}) {
  if (s.over) return;
  s.t += dt;
  const p = s.p, speed = (input.focus ? 110 : 230) * dt;
  if (input.tx !== undefined) {
    const dx = input.tx - p.x, dy = input.ty - p.y, d = Math.hypot(dx, dy);
    if (d > 0) { const m = Math.min(d, 420 * dt); p.x += (dx / d) * m; p.y += (dy / d) * m; }
  } else {
    let mx = input.mx || 0, my = input.my || 0; const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    p.x += mx * speed; p.y += my * speed;
  }
  p.x = Math.min(W - 10, Math.max(10, p.x)); p.y = Math.min(H - 10, Math.max(10, p.y));
  p.inv = Math.max(0, p.inv - dt);
  if (s.banner) { s.banner.t -= dt; if (s.banner.t <= 0) s.banner = null; }

  if (s.phase === "clear") { // breather between stages: the king keeps flying, the board is quiet
    s.clearT -= dt; s.bullets.length = 0;
    for (const b of s.shots) b.y -= 700 * dt;
    collect(s, dt);
    if (s.clearT <= 0) {
      if (s.stage >= STAGES.length - 1) { s.won = true; s.over = true; return; }
      s.score += 1000 * (s.stage + 1);
      s.stage++; s.script = buildScript(s.stage, s.rand); s.si = 0; s.st = 0; s.phase = "play"; s.enemies = []; s.shots = [];
      s.bombs = Math.max(s.bombs, s.dif.bombs); p.inv = 2;
      s.banner = { text: `stage ${s.stage + 1}: ${STAGES[s.stage].name}`, t: 2.5, kind: "stage" };
    }
    return;
  }

  // the script's clock only runs while no boss is on the board
  if (!s.enemies.some((e) => e.boss)) s.st += dt;
  while (s.si < s.script.length && s.script[s.si].t <= s.st) {
    const q = s.script[s.si++];
    if (q.boss) spawnBoss(s, q.boss); else spawn(s, q.kind, q.x);
  }

  // the king shoots on his own; more power, more bolts, and focus tightens the spread
  p.fire -= dt;
  if (p.fire <= 0) {
    p.fire = 0.1;
    for (const [dx, vx] of FIRE[s.power]) s.shots.push({ x: p.x + dx * (input.focus ? 0.5 : 1), y: p.y - 12, vx: input.focus ? vx * 0.3 : vx });
  }
  for (const b of s.shots) { b.y -= 700 * dt; b.x += b.vx * dt; }
  s.shots = s.shots.filter((b) => b.y > -10);

  for (const e of s.enemies) runEnemy(s, e, dt);
  for (const b of s.shots) {
    for (const e of s.enemies) {
      if (e.hp > 0 && e.y > -10 && Math.abs(b.x - e.x) < e.r && Math.abs(b.y - e.y) < e.r) { hurt(s, e, 1); b.y = -99; break; }
    }
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0 && e.y < H + 40 && e.y > -120);
  if (s.phase === "clear") { s.enemies = []; return; }

  // graze chain decays when you stop dancing near bullets
  s.multIdle += dt;
  if (s.multIdle > 2 && s.mult > 1) s.mult = Math.max(1, s.mult - dt * 0.3);

  for (const b of s.bullets) {
    b.age += dt;
    let k = 1;
    if (b.pause) {
      if (b.age >= b.pause[0] && b.age < b.pause[1]) k = 0;
      else if (b.re && !b.turned && b.age >= b.pause[1]) { const a = Math.atan2(p.y - b.y, p.x - b.x); b.vx = Math.cos(a) * b.re; b.vy = Math.sin(a) * b.re; b.turned = true; }
    }
    b.x += b.vx * dt * k; b.y += b.vy * dt * k;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (!b.g && d < b.r + GRAZE_R) {
      b.g = true; s.grazes++; s.multIdle = 0; fx(s, "graze");
      s.score += Math.round(5 * s.mult); s.mult = Math.min(MAX_MULT, s.mult + 0.05);
    }
    if (p.inv <= 0 && p.dying <= 0 && d < b.r + HIT_R && !s.over) p.dying = DEATHBOMB;
  }
  s.bullets = s.bullets.filter((b) => b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);
  // touching an enemy hurts too
  if (!s.over && p.inv <= 0 && p.dying <= 0) {
    for (const e of s.enemies) if (e.y > 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.r * 0.7 + HIT_R) { p.dying = DEATHBOMB; break; }
  }
  if (p.dying > 0) { p.dying -= dt; if (p.dying <= 0) loseLife(s); } // castling inside this window cancels the hit (see bomb)

  collect(s, dt);
  while (s.nextExtend < EXTENDS.length && s.score >= EXTENDS[s.nextExtend]) { s.nextExtend++; s.lives++; fx(s, "extend"); s.banner = { text: "extra life!", t: 1.5, kind: "bonus" }; }
}

function collect(s, dt) {
  const p = s.p;
  for (const it of s.items) {
    it.vy = Math.min(70, it.vy + 260 * dt); it.y += it.vy * dt; it.x += (it.vx || 0) * dt; it.vx *= 0.96;
    if (p.y < H * 0.3 || it.type === "gem" && Math.hypot(p.x - it.x, p.y - it.y) < 80) { // pull in when the king flies high, or gems nearby
      const a = Math.atan2(p.y - it.y, p.x - it.x); it.x += Math.cos(a) * 300 * dt; it.y += Math.sin(a) * 300 * dt;
    }
    if (Math.hypot(p.x - it.x, p.y - it.y) < 22) {
      it.got = true; fx(s, "pickup", it.type);
      if (it.type === "power") { if (s.power < MAX_POWER) s.power++; else s.score += 500; }
      else if (it.type === "bomb") { if (s.bombs < MAX_BOMBS) s.bombs++; else s.score += 500; }
      else if (it.type === "life") s.lives++;
      else s.score += Math.round(100 * s.mult);
    }
  }
  s.items = s.items.filter((it) => !it.got && it.y < H + 20);
}

export function result(s) {
  const bonus = s.won ? s.lives * 2000 + s.bombs * 500 : 0;
  return { total: s.score + bonus, won: s.won, grazes: s.grazes, lives: s.lives, stage: s.stage + 1, bosses: s.bossesDown, diff: s.diffId, full: s.startStage === 0 };
}

// total score only counts as a record when you started from stage 1
export function isRecord(prev, r) { return r.full && r.total > (prev || 0); }
