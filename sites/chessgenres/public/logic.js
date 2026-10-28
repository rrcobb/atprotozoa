// Pure game rules for chess tower defense — no DOM, so tests can import it.
// Board is 8x8, [row, col] with row 0 at the top. Enemies walk PATH in order.
export const N = 8;

export const PATH = (() => {
  const p = [];
  for (let r = 0; r < N; r += 2) {
    const cols = (r / 2) % 2 === 0 ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
    for (const c of cols) p.push([r, c]);
    if (r + 2 < N) p.push([r + 1, cols[cols.length - 1]]); // connector down
  }
  return p;
})();

export const PIECES = {
  pawn:   { glyph: "♙", cost: 50,  dmg: 6,  cd: 0.5,  label: "pawn" },
  knight: { glyph: "♘", cost: 100, dmg: 14, cd: 0.8,  label: "knight" },
  bishop: { glyph: "♗", cost: 120, dmg: 12, cd: 0.6,  label: "bishop" },
  rook:   { glyph: "♖", cost: 160, dmg: 20, cd: 0.7,  label: "rook" },
  queen:  { glyph: "♕", cost: 350, dmg: 26, cd: 0.4,  label: "queen" },
};

const KN = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const DIAG = [[1,1],[1,-1],[-1,1],[-1,-1]];
const ORTH = [[1,0],[-1,0],[0,1],[0,-1]];

// Squares a piece "could move to" on an empty board (sliders are not blocked
// by other towers — towers are guards, not obstacles).
export function attackSquares(type, r, c) {
  const out = [];
  const inb = (a, b) => a >= 0 && b >= 0 && a < N && b < N;
  const slide = (dirs) => { for (const [dr, dc] of dirs) for (let k = 1; inb(r + dr*k, c + dc*k); k++) out.push([r + dr*k, c + dc*k]); };
  const step = (offs) => { for (const [dr, dc] of offs) if (inb(r + dr, c + dc)) out.push([r + dr, c + dc]); };
  if (type === "pawn") step(DIAG.concat(ORTH)); // pawns guard their immediate neighbours
  else if (type === "knight") step(KN);
  else if (type === "bishop") slide(DIAG);
  else if (type === "rook") slide(ORTH);
  else if (type === "queen") slide(DIAG.concat(ORTH));
  return out;
}

// Position along the path (float index) -> board coordinates (float).
export function pathPos(t) {
  const i = Math.min(Math.max(t, 0), PATH.length - 1);
  const a = Math.floor(i), b = Math.min(a + 1, PATH.length - 1), f = i - a;
  return [PATH[a][0] + (PATH[b][0] - PATH[a][0]) * f, PATH[a][1] + (PATH[b][1] - PATH[a][1]) * f];
}

export const WAVES = 10;

// A wave is a list of {at (seconds from wave start), kind}.
export const KINDS = {
  pawn:   { hp: 40,  speed: 1.2, reward: 6,  glyph: "♟", size: 0.5, leak: 1 },
  knight: { hp: 90,  speed: 1.9, reward: 10, glyph: "♞", size: 0.55, leak: 1 },
  bishop: { hp: 150, speed: 1.5, reward: 14, glyph: "♝", size: 0.58, leak: 2 },
  rook:   { hp: 320, speed: 0.9, reward: 24, glyph: "♜", size: 0.62, leak: 3 },
  boss:   { hp: 9000, speed: 0.45, reward: 0, glyph: "♛", size: 1.3, leak: 99 },
};

export function waveSpawns(w) {
  const s = [];
  const add = (n, kind, gap, start = 0) => { for (let i = 0; i < n; i++) s.push({ at: start + i * gap, kind }); };
  if (w === WAVES) {
    add(1, "boss", 1);
    add(14, "pawn", 1.4, 4);
    add(6, "knight", 2.5, 8);
    return s.sort((a, b) => a.at - b.at);
  }
  add(6 + w * 2, "pawn", Math.max(0.5, 1.1 - w * 0.05));
  if (w >= 2) add(w * 2, "knight", 1.2, 3);
  if (w >= 4) add(w - 2, "bishop", 1.6, 6);
  if (w >= 6) add(w - 4, "rook", 2.4, 8);
  return s.sort((a, b) => a.at - b.at);
}

// Enemy hp grows a little each wave so early towers stop being enough.
export const hpScale = (w) => 1 + (w - 1) * 0.18;

export function isPathSquare(r, c) { return PATH.some(([a, b]) => a === r && b === c); }
