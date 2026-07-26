// Change! — GamesCrafters' 14-point sliding board game.
// https://gamescrafters.berkeley.edu/games.php?game=change
//
// Board: 14 points laid out as 9 straight "rows" of 2-4 points each. Every
// point sits on exactly two rows. Each player has 3 pieces that start on
// their own 3-point "home" (blue on the left, red on the right) and slide
// forward only (blue: left->right, red: right->left) along either of the
// two rows through their current point, any distance, stopping before the
// first occupied point in the way (no jumping, no capturing, no turning
// corners mid-slide). Win by occupying all 3 of the opponent's home points,
// or by leaving the opponent with no legal move on their turn.
//
// Geometry + the worked "topmost red piece can move NW 1-2 or SW 1-2-3"
// example from the rules page were reverse-engineered from the page's own
// SVG diagrams to make sure this is a faithful port, not a guess.

export const POINTS = {
  A: { x: 40, y: 76 }, B: { x: 40, y: 148 }, C: { x: 40, y: 220 },
  D: { x: 120, y: 40 }, E: { x: 120, y: 112 }, F: { x: 120, y: 184 }, G: { x: 120, y: 256 },
  H: { x: 200, y: 76 }, I: { x: 200, y: 148 }, J: { x: 200, y: 220 }, K: { x: 200, y: 292 },
  L: { x: 280, y: 112 }, M: { x: 280, y: 184 }, N: { x: 280, y: 256 },
};

// Each row is ordered low-x -> high-x, i.e. blue's forward direction.
export const ROWS = [
  ["C", "G", "K"],
  ["K", "N"],
  ["B", "F", "J", "N"],
  ["B", "E", "H"],
  ["C", "F", "I", "L"],
  ["D", "H", "L"],
  ["A", "D"],
  ["A", "E", "I", "M"],
  ["G", "J", "M"],
];

export const HOME = { blue: ["A", "B", "C"], red: ["L", "M", "N"] };

// point -> [{row, idx}, {row, idx}]  (every point is on exactly 2 rows)
const POINT_ROWS = {};
for (const p of Object.keys(POINTS)) POINT_ROWS[p] = [];
ROWS.forEach((row, r) => row.forEach((p, i) => POINT_ROWS[p].push({ r, i })));

export function initialState() {
  return { blue: new Set(HOME.blue), red: new Set(HOME.red), turn: "blue" };
}

export function other(player) {
  return player === "blue" ? "red" : "blue";
}

function occupied(state) {
  const s = new Set(state.blue);
  for (const p of state.red) s.add(p);
  return s;
}

// All legal {from, to} moves for `player` in `state`.
export function legalMoves(state, player) {
  const occ = occupied(state);
  const dir = player === "blue" ? 1 : -1;
  const moves = [];
  for (const from of state[player]) {
    for (const { r, i } of POINT_ROWS[from]) {
      const row = ROWS[r];
      let idx = i + dir;
      while (idx >= 0 && idx < row.length) {
        const to = row[idx];
        if (occ.has(to)) break;
        moves.push({ from, to });
        idx += dir;
      }
    }
  }
  return moves;
}

export function applyMove(state, player, move) {
  const next = { blue: new Set(state.blue), red: new Set(state.red), turn: other(player) };
  next[player].delete(move.from);
  next[player].add(move.to);
  return next;
}

export function occupiesAllHome(state, player) {
  return HOME[other(player)].every((p) => state[player].has(p));
}

// Terminal check from the perspective of the player about to move: are they
// already trapped (no legal moves), meaning the *previous* mover already won?
export function isTrapped(state, player) {
  return legalMoves(state, player).length === 0;
}

function key(state, player) {
  return [...state.blue].sort().join("") + "|" + [...state.red].sort().join("") + "|" + player;
}

// Exhaustive memoized solve. No draws are possible (every move strictly
// increases blue's total x and strictly decreases red's total x, so the
// game is finite and always ends in a win for someone) — every position
// resolves to a WIN or LOSS for the player to move, plus the number of plies
// to reach that outcome under best play. `cache` may be reused across calls
// to solve the whole game once and reuse it for the rest of the match.
export function solve(state, player, cache = new Map()) {
  const k = key(state, player);
  const cached = cache.get(k);
  if (cached) return cached;

  const moves = legalMoves(state, player);
  if (moves.length === 0) {
    const result = { score: -1, plies: 0, move: null };
    cache.set(k, result);
    return result;
  }

  let best = null;
  for (const move of moves) {
    const next = applyMove(state, player, move);
    let candidate;
    if (occupiesAllHome(next, player)) {
      candidate = { score: 1, plies: 1, move };
    } else {
      const opp = other(player);
      const oppResult = solve(next, opp, cache);
      candidate = { score: -oppResult.score, plies: oppResult.plies + 1, move };
    }
    if (
      best === null ||
      candidate.score > best.score ||
      (candidate.score === best.score &&
        ((candidate.score === 1 && candidate.plies < best.plies) ||
          (candidate.score === -1 && candidate.plies > best.plies)))
    ) {
      best = candidate;
    }
  }
  cache.set(k, best);
  return best;
}
