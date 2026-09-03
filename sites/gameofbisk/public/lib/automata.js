// automata.js — the cellular-automaton engines. Every engine takes a flat
// Uint8Array of length cols*rows (row-major) and returns the next
// generation as a new flat array of the same shape, so app.js can swap
// engines without caring how each one represents its cells internally
// (life-like + elementary CA use 0/1; Brian's Brain uses 0/1/2). All grids
// wrap toroidally (edges connect to the opposite edge) — a bisk's pattern
// drifting off one side reappears on the other instead of just vanishing.

function idx(x, y, cols) {
  return y * cols + x;
}

function wrap(v, n) {
  return ((v % n) + n) % n;
}

// --- life-like outer-totalistic rules (Conway's Life, HighLife, Seeds, ...) --
// A cell is born if it's dead and its live-neighbor count is in `born`;
// stays alive if it's alive and its count is in `survive`. Every life-like
// preset (see LIFE_PRESETS below) is just a different pair of these sets.
export function lifeLikeStep(grid, cols, rows, born, survive) {
  const out = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          n += grid[idx(wrap(x + dx, cols), wrap(y + dy, rows), cols)];
        }
      }
      const alive = grid[idx(x, y, cols)] === 1;
      out[idx(x, y, cols)] = alive ? (survive.has(n) ? 1 : 0) : (born.has(n) ? 1 : 0);
    }
  }
  return out;
}

export const LIFE_PRESETS = {
  life: { label: "Conway's Life — B3/S23", born: new Set([3]), survive: new Set([2, 3]) },
  highlife: { label: "HighLife — B36/S23", born: new Set([3, 6]), survive: new Set([2, 3]) },
  seeds: { label: "Seeds — B2/S", born: new Set([2]), survive: new Set() },
  daynight: { label: "Day & Night — B3678/S34678", born: new Set([3, 6, 7, 8]), survive: new Set([3, 4, 6, 7, 8]) },
  maze: { label: "Maze — B3/S12345", born: new Set([3]), survive: new Set([1, 2, 3, 4, 5]) },
  replicator: { label: "Replicator — B1357/S1357", born: new Set([1, 3, 5, 7]), survive: new Set([1, 3, 5, 7]) },
};

// --- Brian's Brain (3-state: off / firing / dying) ---------------------
// An off cell fires if exactly 2 neighbors are firing. A firing cell always
// decays to dying next step; a dying cell always turns off. Values: 0 off,
// 1 firing, 2 dying.
export function brainStep(grid, cols, rows) {
  const out = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cur = grid[idx(x, y, cols)];
      if (cur === 1) { out[idx(x, y, cols)] = 2; continue; }
      if (cur === 2) { out[idx(x, y, cols)] = 0; continue; }
      let firing = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (grid[idx(wrap(x + dx, cols), wrap(y + dy, rows), cols)] === 1) firing++;
        }
      }
      out[idx(x, y, cols)] = firing === 2 ? 1 : 0;
    }
  }
  return out;
}

// --- Langton's Ant (a turmite) -------------------------------------------
// `grid` is the shared black/white board (0/1), mutated in place. `ants` is
// an array of {x, y, dir} (dir: 0=up, 1=right, 2=down, 3=left). Classic
// rule: on a white square, turn right, flip it black, step forward; on a
// black square, turn left, flip it white, step forward. Multiple ants share
// one board and can collide/interact through it.
const ANT_DX = [0, 1, 0, -1];
const ANT_DY = [-1, 0, 1, 0];

export function antStep(grid, cols, rows, ants) {
  for (const ant of ants) {
    const i = idx(ant.x, ant.y, cols);
    if (grid[i] === 0) {
      ant.dir = (ant.dir + 1) % 4; // white: turn right
      grid[i] = 1;
    } else {
      ant.dir = (ant.dir + 3) % 4; // black: turn left
      grid[i] = 0;
    }
    ant.x = wrap(ant.x + ANT_DX[ant.dir], cols);
    ant.y = wrap(ant.y + ANT_DY[ant.dir], rows);
  }
}

// --- Elementary 1D CA (Wolfram Rule 0-255), scrolling waterfall ---------
// `grid` here is read as `rows` independent rows of `cols` cells each — not
// a 2D neighborhood — because an elementary CA's neighborhood is 1D (a
// cell's next state depends only on itself and its two horizontal
// neighbors from the SAME row). Each step scrolls the whole grid up by one
// row and computes a fresh row at the bottom from the rule number applied
// to the old bottom row, so the bisk's seed row keeps generating new
// patterns forever instead of just filling the grid once and stopping.
export function elementaryStep(grid, cols, rows, ruleNumber) {
  const out = new Uint8Array(cols * rows);
  // scroll: row y becomes old row y+1
  for (let y = 0; y < rows - 1; y++) {
    out.set(grid.subarray((y + 1) * cols, (y + 2) * cols), y * cols);
  }
  const last = grid.subarray((rows - 1) * cols, rows * cols);
  const newRow = out.subarray((rows - 1) * cols, rows * cols);
  for (let x = 0; x < cols; x++) {
    const l = last[wrap(x - 1, cols)];
    const c = last[x];
    const r = last[wrap(x + 1, cols)];
    const pattern = (l << 2) | (c << 1) | r;
    newRow[x] = (ruleNumber >> pattern) & 1;
  }
  return out;
}
