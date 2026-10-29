// Pure rules for the chess idle clicker — no DOM, so tests can import it.
// Each line manufactures one kind of piece. Machines make 1 piece/s each,
// finished pieces sell automatically for `value` gold, and gold buys more
// machines, speed upgrades and the next kind of piece.
export const GOAL_RATE = 1000;      // dragons per second that count as "done"
export const COST_GROWTH = 1.12;    // each machine bought makes the next dearer
export const MILESTONES = [25, 50, 100, 200, 400]; // owned counts that double a line

export const LINES = [
  { id: "pawn",   glyph: "♟", label: "pawn press",       cost: 15,     value: 1 },
  { id: "knight", glyph: "♞", label: "knight foundry",   cost: 300,    value: 12 },
  { id: "bishop", glyph: "♝", label: "bishop lathe",     cost: 6000,   value: 200 },
  { id: "rook",   glyph: "♜", label: "rook forge",       cost: 120000, value: 3500 },
  { id: "queen",  glyph: "♛", label: "queen atelier",    cost: 3e6,    value: 70000 },
  { id: "king",   glyph: "♚", label: "king mint",        cost: 5e8,   value: 1.6e6 },
  { id: "dragon", glyph: "🐉", label: "dragon assembler", cost: 1.5e10, value: 4e7 },
];

export function newGame() {
  return {
    gold: 0, total: 0, t: 0, won: false,
    owned: Object.fromEntries(LINES.map((l) => [l.id, 0])),
    made: Object.fromEntries(LINES.map((l) => [l.id, 0])),
    speed: Object.fromEntries(LINES.map((l) => [l.id, 0])), // doublings bought per line
    guild: 0, // global gold multiplier tiers (x1.5 each)
  };
}

const line = (id) => LINES.find((l) => l.id === id);
export const machineCost = (id, owned) => Math.ceil(line(id).cost * COST_GROWTH ** owned);
export const speedCost = (id, tier) => line(id).cost * 25 * 6 ** tier;
export const guildCost = (tier) => 2000 * 12 ** tier;
export const guildMult = (g) => 1.5 ** g.guild;

export function milestoneMult(owned) {
  let m = 1;
  for (const n of MILESTONES) if (owned >= n) m *= 2;
  return m;
}
// Pieces per second one line produces.
export const lineRate = (g, id) => g.owned[id] * milestoneMult(g.owned[id]) * 2 ** g.speed[id];
export const goldPerSec = (g) => LINES.reduce((s, l) => s + lineRate(g, l.id) * l.value, 0) * guildMult(g);

// A line is on the board once you can nearly afford it, or already own it.
export function visible(g, i) {
  if (i === 0 || g.owned[LINES[i].id] > 0) return true;
  return g.owned[LINES[i - 1].id] > 0 && g.total >= LINES[i].cost / 4;
}

export function tick(g, dt) {
  if (dt <= 0) return;
  g.t += dt;
  let earned = 0;
  for (const l of LINES) {
    const n = lineRate(g, l.id) * dt;
    g.made[l.id] += n;
    earned += n * l.value;
  }
  earned *= guildMult(g);
  g.gold += earned; g.total += earned;
  if (lineRate(g, "dragon") >= GOAL_RATE) g.won = true;
}

// Stamping by hand makes pawns; it keeps up a little as the pawn press grows.
export function clickPower(g) {
  return (1 + g.owned.pawn * 0.1) * 2 ** g.speed.pawn;
}
export function click(g) {
  const n = clickPower(g);
  g.made.pawn += n;
  const e = n * line("pawn").value * guildMult(g);
  g.gold += e; g.total += e;
  return n;
}

// Buy up to n machines; returns how many were bought.
export function buyMachines(g, id, n) {
  let bought = 0;
  while (bought < n) {
    const c = machineCost(id, g.owned[id]);
    if (g.gold < c) break;
    g.gold -= c; g.owned[id]++; bought++;
  }
  return bought;
}
export const buyMax = (g, id) => buyMachines(g, id, Infinity);

export function buySpeed(g, id) {
  const c = speedCost(id, g.speed[id]);
  if (g.owned[id] < 1 || g.gold < c) return false;
  g.gold -= c; g.speed[id]++; return true;
}
export function buyGuild(g) {
  const c = guildCost(g.guild);
  if (g.gold < c) return false;
  g.gold -= c; g.guild++; return true;
}

// Count of fractional pieces made, for display.
export const fmt = (x) => {
  if (!isFinite(x)) return "∞";
  if (x < 1000) return x < 10 && x % 1 ? x.toFixed(1) : String(Math.floor(x));
  const s = ["K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
  const e = Math.min(s.length, Math.floor(Math.log10(x) / 3));
  return (x / 1000 ** e).toFixed(2) + s[e - 1];
};

export function save(g) { return JSON.stringify(g); }
export function load(text) {
  const base = newGame();
  try {
    const o = JSON.parse(text);
    if (!o || typeof o !== "object") return base;
    for (const k of ["gold", "total", "t", "guild"]) if (Number.isFinite(o[k])) base[k] = o[k];
    base.won = !!o.won;
    for (const l of LINES) for (const f of ["owned", "made", "speed"]) {
      if (o[f] && Number.isFinite(o[f][l.id])) base[f][l.id] = o[f][l.id];
    }
  } catch { /* corrupt save: start fresh */ }
  return base;
}
