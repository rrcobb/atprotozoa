// Pure rules for Chess Chess Revolution — no DOM, so tests can import it.
// The chart is a real game (Morphy's Opera Game): every move is a note, and the
// lane is the kind of piece that moved. Captures add a second note in the
// neighbouring lane, so trades are chords.
export const LANES = [
  { name: "pawn", glyph: "♟", key: "d", color: "#e8b04a" },
  { name: "minor", glyph: "♞", key: "f", color: "#6fd48a" },
  { name: "rook", glyph: "♜", key: "j", color: "#5aa9e6" },
  { name: "royal", glyph: "♛", key: "k", color: "#d8584a" },
];
export const OPERA_GAME = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#".split(" ");
export const WINDOWS = { perfect: 0.05, great: 0.1, good: 0.17 }; // seconds either side of the beat
export const POINTS = { perfect: 300, great: 200, good: 100 };
export const LEAD = 2.2; // seconds of silence before the first note

export function laneOf(san) {
  const c = san[0];
  if (c === "N" || c === "B") return 1;
  if (c === "R" || c === "O") return 2;
  if (c === "Q" || c === "K") return 3;
  return 0;
}

export function buildChart(moves = OPERA_GAME, bpm = 120) {
  const beat = 60 / bpm, notes = [];
  moves.forEach((san, i) => {
    const t = LEAD + i * beat, lane = laneOf(san);
    notes.push({ t, lane, san, state: "wait" });
    if (san.includes("x")) notes.push({ t, lane: (lane + 1) % 4, san, state: "wait" });
  });
  return notes;
}

export function newSong(moves, bpm) {
  const notes = buildChart(moves, bpm);
  return { notes, score: 0, combo: 0, best: 0, counts: { perfect: 0, great: 0, good: 0, miss: 0 }, total: notes.length, last: null };
}

export function judge(dt) {
  const d = Math.abs(dt);
  return d <= WINDOWS.perfect ? "perfect" : d <= WINDOWS.great ? "great" : d <= WINDOWS.good ? "good" : null;
}

function credit(s, kind) {
  s.counts[kind]++;
  s.last = kind;
  if (kind === "miss") { s.combo = 0; return; }
  s.combo++;
  s.best = Math.max(s.best, s.combo);
  s.score += POINTS[kind] + Math.min(s.combo, 50) * 2; // combo bonus tops out at 50 so one streak can't swamp accuracy
}

// A press on `lane` at song time `t`: judges the nearest waiting note in that lane.
export function press(s, lane, t) {
  let hit = null;
  for (const n of s.notes) {
    if (n.lane !== lane || n.state !== "wait") continue;
    if (!judge(n.t - t)) continue;
    if (!hit || Math.abs(n.t - t) < Math.abs(hit.t - t)) hit = n;
  }
  if (!hit) return null;
  const kind = judge(hit.t - t);
  hit.state = kind;
  credit(s, kind);
  return kind;
}

// Notes that slid past the good window unhit are misses.
export function tick(s, t) {
  for (const n of s.notes) if (n.state === "wait" && t - n.t > WINDOWS.good) { n.state = "miss"; credit(s, "miss"); }
}

export function finished(s, t) {
  return s.notes.every((n) => n.state !== "wait") && t > s.notes[s.notes.length - 1].t;
}

export function accuracy(s) {
  const c = s.counts;
  return (c.perfect + c.great * 0.7 + c.good * 0.4) / s.total;
}

export function grade(s) {
  const a = accuracy(s);
  return a >= 0.95 ? "S" : a >= 0.85 ? "A" : a >= 0.7 ? "B" : a >= 0.5 ? "C" : "D";
}
