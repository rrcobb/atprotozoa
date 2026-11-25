// Pure rules for Chess Chess Revolution — no DOM, so tests can import it.
// Every move of a real game is a note; the lane is the kind of piece that moved.
// Captures are chords with the neighbouring lane, checks are hold notes, and
// checkmate is a four-lane finale. Songs are famous games; freeplay charts any
// pasted game or a random legal one (see rhythm-chess.js).
export const LANES = [
  { name: "pawn", glyph: "♟", key: "d", color: "#e8b04a" },
  { name: "minor", glyph: "♞", key: "f", color: "#6fd48a" },
  { name: "rook", glyph: "♜", key: "j", color: "#5aa9e6" },
  { name: "royal", glyph: "♛", key: "k", color: "#d8584a" },
];
export const OPERA_GAME = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#".split(" ");

// Real games, move lists checked for legality in tests (replay() in rhythm-chess.js).
export const SONGS = [
  { id: "fool", name: "Fool's Mate", by: "the fastest game", bpm: 100, stars: 1, moves: "f3 e5 g4 Qh4#" },
  { id: "scholar", name: "Scholar's Mate", by: "a beginner's trap", bpm: 110, stars: 1, moves: "e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#" },
  { id: "legal", name: "Légal's Mate", by: "Légal vs Saint Brie, 1750: sacrifice the queen", bpm: 112, stars: 2, moves: "e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#" },
  { id: "opera", name: "The Opera Game", by: "Morphy vs the Duke and the Count, 1858", bpm: 120, stars: 2, moves: OPERA_GAME.join(" ") },
  { id: "immortal", name: "The Immortal Game", by: "Anderssen vs Kieseritzky, 1851", bpm: 124, stars: 3, moves: "e4 e5 f4 exf4 Bc4 Qh4+ Kf1 b5 Bxb5 Nf6 Nf3 Qh6 d3 Nh5 Nh4 Qg5 Nf5 c6 g4 Nf6 Rg1 cxb5 h4 Qg6 h5 Qg5 Qf3 Ng8 Bxf4 Qf6 Nc3 Bc5 Nd5 Qxb2 Bd6 Bxg1 e5 Qxa1+ Ke2 Na6 Nxg7+ Kd8 Qf6+ Nxf6 Be7#" },
  { id: "evergreen", name: "The Evergreen Game", by: "Anderssen vs Dufresne, 1852", bpm: 128, stars: 3, moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d3 Qb3 Qf6 e5 Qg6 Re1 Nge7 Ba3 b5 Qxb5 Rb8 Qa4 Bb6 Nbd2 Bb7 Ne4 Qf5 Bxd3 Qh5 Nf6+ gxf6 exf6 Rg8 Rad1 Qxf3 Rxe7+ Nxe7 Qxd7+ Kxd7 Bf5+ Ke8 Bd7+ Kf8 Bxe7#" },
  { id: "century", name: "The Game of the Century", by: "D. Byrne vs 13-year-old Fischer, 1956", bpm: 132, stars: 4, moves: "Nf3 Nf6 c4 g6 Nc3 Bg7 d4 O-O Bf4 d5 Qb3 dxc4 Qxc4 c6 e4 Nbd7 Rd1 Nb6 Qc5 Bg4 Bg5 Na4 Qa3 Nxc3 bxc3 Nxe4 Bxe7 Qb6 Bc4 Nxc3 Bc5 Rfe8+ Kf1 Be6 Bxb6 Bxc4+ Kg1 Ne2+ Kf1 Nxd4+ Kg1 Ne2+ Kf1 Nc3+ Kg1 axb6 Qb4 Ra4 Qxb6 Nxd1 h3 Rxa2 Kh2 Nxf2 Re1 Rxe1 Qd8+ Bf8 Nxe1 Bd5 Nf3 Ne4 Qb8 b5 h4 h5 Ne5 Kg7 Kg1 Bc5+ Kf1 Ng3+ Ke1 Bb4+ Kd1 Bb3+ Kc1 Ne2+ Kb1 Nc3+ Kc1 Rc2#" },
].map((x) => ({ ...x, moves: x.moves.split(" ") }));

// scale on tempo, timing windows and fall time; whether captures chord and checks hold;
// whether running out of composure ends the song; `quiet` is the gap (in beats) after an ordinary move.
export const DIFFS = {
  easy:   { name: "easy",   tempo: 0.8,  win: 1.4,  fall: 2.0, chords: false, holds: false, fail: false, quiet: 1 },
  normal: { name: "normal", tempo: 1,    win: 1,    fall: 1.6, chords: true,  holds: true,  fail: true,  quiet: 1 },
  hard:   { name: "hard",   tempo: 1.2,  win: 0.85, fall: 1.3, chords: true,  holds: true,  fail: true,  quiet: 0.75 },
};
export const WINDOWS = { perfect: 0.05, great: 0.1, good: 0.17 }; // seconds either side of the beat
export const POINTS = { perfect: 300, great: 200, good: 100 };
export const LEAD = 2.2; // seconds of silence before the first note
export const HOLD_SLACK = 0.12; // letting go this early before the tail's end still counts

export function laneOf(san) {
  const c = san[0];
  if (c === "N" || c === "B") return 1;
  if (c === "R" || c === "O") return 2;
  if (c === "Q" || c === "K") return 3;
  return 0;
}

// opts: a bpm number (old style) or { bpm, diff }
export function buildChart(moves = OPERA_GAME, opts = 120) {
  if (typeof opts === "number") opts = { bpm: opts };
  const d = DIFFS[opts.diff] || DIFFS.normal, bpm = opts.bpm || 120;
  const beat = 60 / (bpm * d.tempo), notes = [];
  let t = LEAD;
  moves.forEach((san, i) => {
    const lane = laneOf(san), mate = san.endsWith("#"), check = san.endsWith("+"), cap = san.includes("x");
    const hold = check && d.holds;
    if (mate) for (let l = 0; l < 4; l++) notes.push({ t, lane: l, san, len: 0, state: "wait" });
    else {
      notes.push({ t, lane, san, len: hold ? beat : 0, state: "wait" });
      if (cap && d.chords) notes.push({ t, lane: (lane + 1) % 4, san, len: 0, state: "wait" });
    }
    // flurries after trades, breathing room after a held check
    t += beat * (hold ? 1.5 : cap || check ? 0.5 : d.quiet);
  });
  return notes;
}

export function newSong(moves, opts) {
  if (typeof opts === "number") opts = { bpm: opts };
  opts = opts || {};
  const d = DIFFS[opts.diff] || DIFFS.normal;
  const notes = buildChart(moves, opts);
  const end = Math.max(...notes.map((n) => n.t + n.len));
  return { notes, score: 0, combo: 0, best: 0, counts: { perfect: 0, great: 0, good: 0, miss: 0 }, drops: 0, holds: 0, total: notes.length,
    last: null, diff: d, diffId: opts.diff || "normal", hp: 100, failed: false, held: {}, end };
}

export function judge(dt, scale = 1) {
  const d = Math.abs(dt);
  return d <= WINDOWS.perfect * scale ? "perfect" : d <= WINDOWS.great * scale ? "great" : d <= WINDOWS.good * scale ? "good" : null;
}

export const multiplier = (combo) => Math.min(4, 1 + Math.floor(combo / 10)); // x4 tops out so one streak can't swamp accuracy

function composure(s, d) {
  s.hp = Math.min(100, Math.max(0, s.hp + d)); // a percentage meter
  if (s.diff.fail && s.hp <= 0) s.failed = true;
}

function credit(s, kind) {
  s.counts[kind]++;
  s.last = kind;
  if (kind === "miss") { s.combo = 0; composure(s, -9); return; }
  s.combo++;
  s.best = Math.max(s.best, s.combo);
  s.score += POINTS[kind] * multiplier(s.combo);
  composure(s, kind === "perfect" ? 2 : 1);
}

// A press on `lane` at song time `t`: judges the nearest waiting note in that lane.
export function press(s, lane, t) {
  if (s.failed) return null;
  let hit = null;
  for (const n of s.notes) {
    if (n.lane !== lane || n.state !== "wait") continue;
    if (!judge(n.t - t, s.diff.win)) continue;
    if (!hit || Math.abs(n.t - t) < Math.abs(hit.t - t)) hit = n;
  }
  if (!hit) return null;
  const kind = judge(hit.t - t, s.diff.win);
  hit.kind = kind; s.lastNote = hit; s.lastDt = hit.t - t; // lastDt > 0 means early
  hit.state = isHold(hit) ? "holding" : kind;
  if (isHold(hit)) s.held[lane] = hit;
  credit(s, kind);
  return kind;
}
const isHold = (n) => n.len > 0;

function finishHold(s, n) {
  n.state = "done"; delete s.held[n.lane];
  s.holds++; s.score += 150 * multiplier(s.combo);
}

// Letting go of `lane`. Returns "hold" for a clean tail, "drop" for letting go early, or null.
export function release(s, lane, t) {
  const n = s.held[lane];
  if (!n) return null;
  if (t >= n.t + n.len - HOLD_SLACK) { finishHold(s, n); return "hold"; }
  n.state = "drop"; delete s.held[lane];
  s.drops++; s.combo = 0; composure(s, -6);
  return "drop";
}

// Notes that slid past the good window unhit are misses; held tails that run out are finished.
export function tick(s, t) {
  for (const n of s.notes) {
    if (n.state === "wait" && t - n.t > WINDOWS.good * s.diff.win) { n.state = "miss"; credit(s, "miss"); }
    else if (n.state === "holding" && t >= n.t + n.len) finishHold(s, n);
  }
}

export function finished(s, t) {
  if (s.failed) return true;
  return s.notes.every((n) => n.state !== "wait" && n.state !== "holding") && t > s.end;
}

export function accuracy(s) {
  const c = s.counts;
  return Math.max(0, (c.perfect + c.great * 0.7 + c.good * 0.4 - s.drops * 0.3) / s.total);
}

export function grade(s) {
  const a = accuracy(s);
  return a >= 0.95 ? "S" : a >= 0.85 ? "A" : a >= 0.7 ? "B" : a >= 0.5 ? "C" : "D";
}

// "full combo" = nothing missed or dropped; "all perfect" = every note perfect.
export function badge(s) {
  if (s.failed) return "resigned";
  if (s.counts.perfect === s.total && !s.drops) return "all perfect";
  if (!s.counts.miss && !s.drops) return "full combo";
  return "";
}

// Taps against a metronome: the median of (tap - nearest click), in seconds.
// Positive = you tap late, so the game should read your presses that much earlier.
export function calibrate(clicks, taps) {
  const diffs = [];
  for (const tap of taps) {
    let best = null;
    for (const c of clicks) if (best === null || Math.abs(tap - c) < Math.abs(best)) best = tap - c;
    if (best !== null && Math.abs(best) < 0.35) diffs.push(best); // beyond 0.35s it's a different click, not latency
  }
  if (diffs.length < 3) return null;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

// Pull SAN tokens out of PGN-ish text: tags, comments, variations, move numbers, NAGs and results are dropped.
export function parseMoves(text) {
  let t = String(text || "");
  t = t.replace(/\[[^\]]*\]/g, " ").replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
  for (let i = 0; i < 8 && /\([^()]*\)/.test(t); i++) t = t.replace(/\([^()]*\)/g, " "); // nested variations, a few levels deep is plenty
  t = t.replace(/\$\d+/g, " ").replace(/1\/2-1\/2|1-0|0-1|\*/g, " ").replace(/\b\d+\.+/g, " ");
  return t.split(/\s+/).filter((x) => /^[A-Za-z0]/.test(x));
}
