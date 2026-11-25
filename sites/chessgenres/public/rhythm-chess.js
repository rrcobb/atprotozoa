// A tiny legal-move chess engine for Chess Chess Revolution — no DOM, no deps.
// It exists so pasted games can be checked move by move, and so "random game"
// can play out a real, legal game to turn into a chart.
// Squares are 0..63: index = rank*8 + file, rank 0 = White's back rank.
const FILES = "abcdefgh";
const sqName = (i) => FILES[i & 7] + ((i >> 3) + 1);
const colorOf = (p) => (p === "." ? null : p === p.toUpperCase() ? "w" : "b");

export function startPosition() {
  const b = Array(64).fill(".");
  "RNBQKBNR".split("").forEach((p, f) => { b[f] = p; b[56 + f] = p.toLowerCase(); });
  for (let f = 0; f < 8; f++) { b[8 + f] = "P"; b[48 + f] = "p"; }
  return { b, turn: "w", castle: { K: true, Q: true, k: true, q: true }, ep: -1 };
}

const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const KG = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]], ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function attacked(b, sq, by) {
  const f = sq & 7, r = sq >> 3;
  const at = (ff, rr) => (ff < 0 || ff > 7 || rr < 0 || rr > 7 ? "." : b[rr * 8 + ff]);
  const own = (p) => (by === "w" ? p.toUpperCase() : p.toLowerCase());
  const pr = by === "w" ? r - 1 : r + 1;
  if (at(f - 1, pr) === own("p") || at(f + 1, pr) === own("p")) return true;
  for (const [df, dr] of KN) if (at(f + df, r + dr) === own("n")) return true;
  for (const [df, dr] of KG) if (at(f + df, r + dr) === own("k")) return true;
  for (const [dirs, kinds] of [[DIAG, "bq"], [ORTH, "rq"]]) {
    for (const [df, dr] of dirs) {
      for (let k = 1; k < 8; k++) {
        const p = at(f + df * k, r + dr * k);
        if (p === ".") continue;
        if (kinds.includes(p.toLowerCase()) && colorOf(p) === by) return true;
        break;
      }
    }
  }
  return false;
}

function pseudo(pos) {
  const { b, turn } = pos, out = [];
  const add = (from, to, extra = {}) => out.push({ from, to, piece: b[from], cap: b[to] !== "." ? b[to] : null, ...extra });
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (p === "." || colorOf(p) !== turn) continue;
    const f = i & 7, r = i >> 3, t = p.toLowerCase();
    const inb = (ff, rr) => ff >= 0 && ff < 8 && rr >= 0 && rr < 8;
    if (t === "p") {
      const d = turn === "w" ? 1 : -1, last = turn === "w" ? 7 : 0, start = turn === "w" ? 1 : 6;
      const push = (to, extra) => {
        if (to >> 3 === last) for (const pr of "QRBN") add(i, to, { ...extra, promo: pr }); else add(i, to, extra);
      };
      if (inb(f, r + d) && b[(r + d) * 8 + f] === ".") {
        push((r + d) * 8 + f);
        if (r === start && b[(r + 2 * d) * 8 + f] === ".") add(i, (r + 2 * d) * 8 + f, { dbl: true });
      }
      for (const df of [-1, 1]) {
        if (!inb(f + df, r + d)) continue;
        const to = (r + d) * 8 + f + df;
        if (b[to] !== "." && colorOf(b[to]) !== turn) push(to);
        else if (to === pos.ep) add(i, to, { ep: true, cap: turn === "w" ? "p" : "P" });
      }
    } else if (t === "n" || t === "k") {
      for (const [df, dr] of t === "n" ? KN : KG) {
        if (!inb(f + df, r + dr)) continue;
        const to = (r + dr) * 8 + f + df;
        if (colorOf(b[to]) !== turn) add(i, to);
      }
      if (t === "k") {
        const home = turn === "w" ? 4 : 60, opp = turn === "w" ? "b" : "w";
        if (i === home && !attacked(b, home, opp)) {
          const ks = turn === "w" ? "K" : "k", qs = turn === "w" ? "Q" : "q", rk = turn === "w" ? "R" : "r";
          if (pos.castle[ks] && b[home + 3] === rk && b[home + 1] === "." && b[home + 2] === "." && !attacked(b, home + 1, opp) && !attacked(b, home + 2, opp)) add(i, home + 2, { castle: "K" });
          if (pos.castle[qs] && b[home - 4] === rk && b[home - 1] === "." && b[home - 2] === "." && b[home - 3] === "." && !attacked(b, home - 1, opp) && !attacked(b, home - 2, opp)) add(i, home - 2, { castle: "Q" });
        }
      }
    } else {
      const dirs = t === "b" ? DIAG : t === "r" ? ORTH : [...DIAG, ...ORTH];
      for (const [df, dr] of dirs) {
        for (let k = 1; k < 8; k++) {
          const ff = f + df * k, rr = r + dr * k;
          if (!inb(ff, rr)) break;
          const to = rr * 8 + ff;
          if (b[to] === ".") { add(i, to); continue; }
          if (colorOf(b[to]) !== turn) add(i, to);
          break;
        }
      }
    }
  }
  return out;
}

export function play(pos, m) {
  const b = pos.b.slice(), castle = { ...pos.castle };
  b[m.to] = m.promo ? (pos.turn === "w" ? m.promo : m.promo.toLowerCase()) : b[m.from];
  b[m.from] = ".";
  if (m.ep) b[m.to + (pos.turn === "w" ? -8 : 8)] = ".";
  if (m.castle === "K") { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = "."; }
  if (m.castle === "Q") { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = "."; }
  if (m.piece === "K") { castle.K = false; castle.Q = false; }
  if (m.piece === "k") { castle.k = false; castle.q = false; }
  for (const sq of [m.from, m.to]) {
    if (sq === 0) castle.Q = false; if (sq === 7) castle.K = false;
    if (sq === 56) castle.q = false; if (sq === 63) castle.k = false;
  }
  const ep = m.dbl ? (m.from + m.to) / 2 : -1;
  return { b, turn: pos.turn === "w" ? "b" : "w", castle, ep };
}

const kingSq = (b, c) => b.indexOf(c === "w" ? "K" : "k");
export const inCheck = (pos) => attacked(pos.b, kingSq(pos.b, pos.turn), pos.turn === "w" ? "b" : "w");

export function legalMoves(pos) {
  const me = pos.turn, opp = me === "w" ? "b" : "w";
  return pseudo(pos).filter((m) => { const n = play(pos, m); return !attacked(n.b, kingSq(n.b, me), opp); });
}

export function sanOf(pos, m, legal = legalMoves(pos)) {
  let s;
  const t = m.piece.toUpperCase();
  if (m.castle) s = m.castle === "K" ? "O-O" : "O-O-O";
  else if (t === "P") {
    s = (m.cap ? FILES[m.from & 7] + "x" : "") + sqName(m.to) + (m.promo ? "=" + m.promo : "");
  } else {
    const rivals = legal.filter((o) => o !== m && o.piece === m.piece && o.to === m.to);
    let dis = "";
    if (rivals.length) {
      if (!rivals.some((o) => (o.from & 7) === (m.from & 7))) dis = FILES[m.from & 7];
      else if (!rivals.some((o) => o.from >> 3 === m.from >> 3)) dis = String((m.from >> 3) + 1);
      else dis = sqName(m.from);
    }
    s = t + dis + (m.cap ? "x" : "") + sqName(m.to);
  }
  const n = play(pos, m);
  if (inCheck(n)) s += legalMoves(n).length ? "+" : "#";
  return s;
}

const clean = (s) => s.replace(/[+#!?]/g, "").replace(/0/g, "O").replace(/=?([QRBN])$/, "=$1").replace(/(?<=\d)([QRBN])$/, "=$1");

// Play one SAN move from `pos`. Returns { pos, san } (san in canonical form with +/#) or null.
export function applySan(pos, san) {
  const want = clean(san.trim());
  const legal = legalMoves(pos);
  for (const m of legal) {
    const c = sanOf(pos, m, legal);
    if (clean(c) === want) return { pos: play(pos, m), san: c };
  }
  return null;
}

// Validate a list of SAN moves from the start. Returns { moves (canonical, up to
// the first illegal one), bad: index of the first illegal move or -1 }.
export function replay(moves) {
  let pos = startPosition();
  const out = [];
  for (let i = 0; i < moves.length; i++) {
    const r = applySan(pos, moves[i]);
    if (!r) return { moves: out, bad: i };
    out.push(r.san); pos = r.pos;
  }
  return { moves: out, bad: -1 };
}

// A random legal game that favours captures and checks, so charts have texture.
// It stops at checkmate/stalemate or after `maxPlies` (a chart longer than that
// is a marathon, not a song).
export function randomGame(rand = Math.random, maxPlies = 60) {
  let pos = startPosition();
  const out = [];
  while (out.length < maxPlies) {
    const legal = legalMoves(pos);
    if (!legal.length) break;
    const scored = legal.map((m) => {
      const san = sanOf(pos, m, legal);
      return { m, san, w: 1 + (m.cap ? 3 : 0) + (san.endsWith("+") ? 3 : 0) + (san.endsWith("#") ? 50 : 0) + (m.promo === "Q" ? 4 : 0) - (m.promo && m.promo !== "Q" ? 1 : 0) };
    });
    let x = rand() * scored.reduce((a, c) => a + c.w, 0), pick = scored[0];
    for (const c of scored) { x -= c.w; if (x <= 0) { pick = c; break; } }
    out.push(pick.san); pos = play(pos, pick.m);
  }
  return out;
}
