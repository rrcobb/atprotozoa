// Pure rules for Chess Bullet Hell — no DOM, so tests can import it.
// You are a lone king with a tiny hitbox. Enemy pieces shoot patterns shaped like
// their own moves: pawns aim, knights hop and fan, bishops fire diagonals, rooks
// rain straight lines. The giant queen waits at the end.
export const W = 480, H = 640;
export const HIT_R = 3;       // the king's hitbox is the dot in his chest, not the sprite
export const GRAZE_R = 14;    // a bullet passing this close (once) scores
export const BOSS_T = 56;     // seconds of wave script before the queen arrives
export const KINDS = {
  pawn:   { hp: 3,   r: 14, glyph: "♟", pts: 100 },
  knight: { hp: 7,   r: 16, glyph: "♞", pts: 250 },
  bishop: { hp: 9,   r: 16, glyph: "♝", pts: 300 },
  rook:   { hp: 14,  r: 18, glyph: "♜", pts: 500 },
  queen:  { hp: 380, r: 42, glyph: "♛", pts: 10000 },
};

export function buildScript() {
  const out = [];
  const row = (t, kind, xs, gap = 0) => xs.forEach((x, i) => out.push({ t: t + i * gap, kind, x }));
  row(1, "pawn", [120, 240, 360], 0.5);
  row(6, "pawn", [60, 150, 330, 420], 0.4);
  row(11, "knight", [100, 380], 1.2);
  row(15, "pawn", [80, 160, 240, 320, 400], 0.3);
  row(19, "bishop", [90, 390], 1.5);
  row(24, "knight", [240], 0);
  row(25, "pawn", [60, 420, 120, 360], 0.4);
  row(29, "rook", [70], 0);
  row(33, "bishop", [240], 0);
  row(34, "knight", [60, 420], 0.8);
  row(38, "rook", [410], 0);
  row(39, "pawn", [100, 200, 300, 380], 0.35);
  row(43, "bishop", [120, 360], 1);
  row(44, "knight", [240], 0);
  row(48, "rook", [70, 410], 2);
  row(51, "pawn", [60, 140, 220, 300, 380, 440], 0.25);
  return out.sort((a, b) => a.t - b.t);
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function newGame(seed = 1) {
  return {
    t: 0, rand: rng(seed), script: buildScript(), si: 0, bossIn: false,
    p: { x: W / 2, y: H - 70, inv: 0, fire: 0 },
    lives: 3, bombs: 2, score: 0, grazes: 0,
    bullets: [], shots: [], enemies: [],
    over: false, won: false,
  };
}

function shoot(s, x, y, ang, speed, r = 5) {
  s.bullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r, g: false });
}
const aimAt = (s, e) => Math.atan2(s.p.y - e.y, s.p.x - e.x);

export function spawn(s, kind, x) {
  const k = KINDS[kind];
  const e = { kind, x, y: kind === "queen" ? -60 : -24, hp: k.hp, max: k.hp, r: k.r, age: 0, f: 0.6, f2: 0, a: 0, vx: 0, hopT: 0, hop: null, leaving: false };
  if (kind === "bishop") e.vx = x < W / 2 ? 90 : -90;
  if (kind === "rook") e.vx = x < W / 2 ? 110 : -110;
  s.enemies.push(e);
  return e;
}

export function bossPhase(e) {
  const f = e.hp / e.max;
  return f > 0.66 ? 0 : f > 0.33 ? 1 : 2;
}

function runEnemy(s, e, dt) {
  e.age += dt; e.f -= dt;
  if (e.kind === "pawn") {
    e.y += 80 * dt;
    if (e.f <= 0 && e.y > 0 && e.y < H * 0.7) { e.f = 1.5; shoot(s, e.x, e.y, aimAt(s, e), 160); }
  } else if (e.kind === "knight") {
    if (e.hop) {
      e.hopT += dt / 0.25;
      const u = Math.min(1, e.hopT);
      e.x = e.hop.x0 + (e.hop.x1 - e.hop.x0) * u; e.y = e.hop.y0 + (e.hop.y1 - e.hop.y0) * u;
      if (u >= 1) { e.hop = null; e.f = 1.0; const a = aimAt(s, e); for (const d of [-0.3, 0, 0.3]) shoot(s, e.x, e.y, a + d, 170); }
    } else {
      if (e.f <= 0) {
        // an L: one square one way, two the other; always forward so knights eventually leave
        const long = s.rand() < 0.5, sx = s.rand() < 0.5 ? -1 : 1;
        const dx = (long ? 2 : 1) * 40 * sx, dy = (long ? 1 : 2) * 40;
        e.hop = { x0: e.x, y0: e.y, x1: Math.min(W - 24, Math.max(24, e.x + dx)), y1: e.y + dy }; e.hopT = 0;
      }
    }
  } else if (e.kind === "bishop") {
    e.x += e.vx * dt; e.y += 55 * dt;
    if (e.x < 20 || e.x > W - 20) { e.vx = -e.vx; e.x = Math.min(W - 20, Math.max(20, e.x)); }
    if (e.f <= 0 && e.y > 0) { e.f = 1.8; for (const a of [1, 3, 5, 7]) shoot(s, e.x, e.y, (a * Math.PI) / 4, 130); }
  } else if (e.kind === "rook") {
    if (e.age > 11) e.y -= 150 * dt;                  // retreats after a while
    else if (e.y < 90) e.y += 100 * dt;
    else { e.x += e.vx * dt; if (e.x < 24 || e.x > W - 24) { e.vx = -e.vx; e.x = Math.min(W - 24, Math.max(24, e.x)); } }
    if (e.f <= 0 && e.y > 0) { e.f = 0.3; shoot(s, e.x, e.y + 14, Math.PI / 2, 210, 4); }
  } else if (e.kind === "queen") {
    if (e.y < 110) e.y += 60 * dt;
    else {
      e.x = W / 2 + Math.sin(e.age * 0.6) * 130;
      const ph = bossPhase(e);
      e.f2 -= dt;
      if (ph === 0 && e.f <= 0) { e.f = 0.12; e.a += 0.33; for (let k = 0; k < 3; k++) shoot(s, e.x, e.y, e.a + (k * Math.PI * 2) / 3, 150); }
      if (ph === 1) {
        if (e.f2 <= 0) { // a ring with a gap aimed at the king: slip through the hole
          e.f2 = 1.1; const gap = aimAt(s, e);
          for (let k = 0; k < 20; k++) { const a = (k * Math.PI * 2) / 20; if (Math.abs(Math.atan2(Math.sin(a - gap), Math.cos(a - gap))) > 0.4) shoot(s, e.x, e.y, a, 125); }
        }
        if (e.f <= 0) { e.f = 0.5; shoot(s, e.x, e.y, aimAt(s, e), 190); }
      }
      if (ph === 2) {
        if (e.f <= 0) { e.f = 0.14; e.a += 0.27; for (let k = 0; k < 5; k++) shoot(s, e.x, e.y, e.a + (k * Math.PI * 2) / 5, 140); }
        if (e.f2 <= 0) { e.f2 = 1.8; for (let k = 0; k < 24; k++) shoot(s, e.x, e.y, (k * Math.PI * 2) / 24 + e.a, 110); }
      }
    }
  }
}

export function bomb(s) {
  if (s.over || s.bombs <= 0) return false;
  s.bombs--; s.bullets.length = 0; s.p.inv = Math.max(s.p.inv, 1.2);
  for (const e of s.enemies) hurt(s, e, 15);
  return true;
}

function hurt(s, e, d) {
  if (e.hp <= 0) return;
  e.hp -= d;
  if (e.hp <= 0) {
    s.score += KINDS[e.kind].pts;
    if (e.kind === "queen") { s.won = true; s.over = true; s.bullets.length = 0; }
  }
}

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

  // spawns
  while (s.si < s.script.length && s.script[s.si].t <= s.t) { const q = s.script[s.si++]; spawn(s, q.kind, q.x); }
  if (!s.bossIn && s.t >= BOSS_T) { s.bossIn = true; spawn(s, "queen", W / 2); }

  // the king shoots on his own: two pawn-bolts, faster when focused
  p.fire -= dt;
  if (p.fire <= 0) { p.fire = 0.1; s.shots.push({ x: p.x - 7, y: p.y - 12 }, { x: p.x + 7, y: p.y - 12 }); }
  for (const b of s.shots) b.y -= 700 * dt;
  s.shots = s.shots.filter((b) => b.y > -10);

  for (const e of s.enemies) runEnemy(s, e, dt);
  // player shots vs enemies
  for (const b of s.shots) {
    for (const e of s.enemies) {
      if (e.hp > 0 && e.y > -10 && Math.abs(b.x - e.x) < e.r && Math.abs(b.y - e.y) < e.r) { hurt(s, e, 1); b.y = -99; break; }
    }
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0 && e.y < H + 40 && e.y > -120);

  // bullets
  for (const b of s.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (!b.g && d < b.r + GRAZE_R) { b.g = true; s.grazes++; s.score += 5; }
    if (p.inv <= 0 && d < b.r + HIT_R && !s.over) {
      s.lives--; p.inv = 2; s.bullets = s.bullets.filter((o) => Math.hypot(o.x - p.x, o.y - p.y) > 90);
      if (s.lives <= 0) s.over = true;
      break;
    }
  }
  s.bullets = s.bullets.filter((b) => b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);
  // touching an enemy hurts too
  if (!s.over && p.inv <= 0) {
    for (const e of s.enemies) if (e.y > 0 && Math.hypot(e.x - p.x, e.y - p.y) < e.r * 0.7 + HIT_R) { s.lives--; p.inv = 2; if (s.lives <= 0) s.over = true; break; }
  }
}

export function result(s) {
  const bonus = s.won ? s.lives * 2000 : 0;
  return { total: s.score + bonus, won: s.won, grazes: s.grazes, lives: s.lives };
}
