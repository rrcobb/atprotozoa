// Pure rules for Chess City 2000 — no DOM, so tests can import it.
// 12x12 board, cells[r*N+c] is null or {type, pop}. Buildings influence the
// squares they could move to on an empty board (sliders aren't blocked).
export const N = 12;
export const GOAL = 2000;      // population needed to win
export const BANKRUPT = -300;  // money floor before the city folds
export const RAMPAGE_EVERY = 18; // months between giant-queen rampages

export const BUILD = {
  pawn:   { glyph: "♙", label: "house",       cost: 40,  upkeep: 0 },
  knight: { glyph: "♘", label: "shop",        cost: 80,  upkeep: 2 },
  bishop: { glyph: "♗", label: "park",        cost: 100, upkeep: 3 },
  rook:   { glyph: "♖", label: "factory",     cost: 120, upkeep: 0 },
  queen:  { glyph: "♕", label: "power plant", cost: 300, upkeep: 12 },
  king:   { glyph: "♔", label: "fire station", cost: 150, upkeep: 4 }, // shields its neighbours from disasters
};
export const TAX = [
  { label: "low",    income: 0.6, cap: 1.15 },
  { label: "normal", income: 1,   cap: 1 },
  { label: "high",   income: 1.5, cap: 0.8 },
];

const KN = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const DIAG = [[1,1],[1,-1],[-1,1],[-1,-1]];
const ORTH = [[1,0],[-1,0],[0,1],[0,-1]];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function reach(type, r, c) {
  const out = [];
  const inb = (a, b) => a >= 0 && b >= 0 && a < N && b < N;
  const slide = (dirs) => { for (const [dr, dc] of dirs) for (let k = 1; inb(r + dr*k, c + dc*k); k++) out.push([r + dr*k, c + dc*k]); };
  if (type === "knight") { for (const [dr, dc] of KN) if (inb(r + dr, c + dc)) out.push([r + dr, c + dc]); }
  else if (type === "king") { for (const [dr, dc] of DIAG.concat(ORTH)) if (inb(r + dr, c + dc)) out.push([r + dr, c + dc]); }
  else if (type === "bishop") slide(DIAG);
  else if (type === "rook") slide(ORTH);
  else if (type === "queen") slide(DIAG.concat(ORTH));
  return out;
}

// Terrain per square: 0 grass, 1 lake (can't build; houses beside it are happier), 2 ore (a factory on it earns extra).
// Seed 0 is a flat map. Any other seed makes the same map every time.
export function makeTerrain(seed) {
  const t = Array(N * N).fill(0);
  if (!seed) return t;
  const rng = mulberry32(seed);
  const lakes = 2 + Math.floor(rng() * 2);
  for (let l = 0; l < lakes; l++) {
    let r = Math.floor(rng() * N), c = Math.floor(rng() * N);
    const size = 4 + Math.floor(rng() * 6);
    for (let i = 0; i < size; i++) {
      t[r * N + c] = 1;
      const d = ORTH[Math.floor(rng() * 4)];
      r = Math.min(N - 1, Math.max(0, r + d[0])); c = Math.min(N - 1, Math.max(0, c + d[1]));
    }
  }
  for (let placed = 0, guard = 0; placed < 6 && guard < 200; guard++) {
    const i = Math.floor(rng() * N * N);
    if (t[i] === 0) { t[i] = 2; placed++; }
  }
  return t;
}

export function newCity(seed = 0) {
  return { money: 800, month: 0, cells: Array(N * N).fill(null), status: "playing", seed, terrain: makeTerrain(seed), tax: 1, omen: null, contract: null, done: 0 };
}

export const totalPop = (city) => city.cells.reduce((s, x) => s + (x ? x.pop || 0 : 0), 0);

// Per-square influence: how many powered / parks / shops / factories reach it, whether it's beside a lake or shielded.
export function analyze(city) {
  const inf = Array.from({ length: N * N }, () => ({ power: 0, parks: 0, shops: 0, factories: 0, lake: 0, shield: 0 }));
  city.cells.forEach((b, i) => {
    if (!b || b.type === "pawn") return;
    const key = { queen: "power", bishop: "parks", knight: "shops", rook: "factories", king: "shield" }[b.type];
    for (const [r, c] of reach(b.type, Math.floor(i / N), i % N)) inf[r * N + c][key]++;
    if (b.type === "king") inf[i].shield++;
  });
  const terrain = city.terrain || [];
  for (let i = 0; i < N * N; i++) if (terrain[i] === 1) for (const [r, c] of reach("king", Math.floor(i / N), i % N)) inf[r * N + c].lake = 1;
  return inf;
}

// Happiness multiplier and population ceiling for a house given its influence.
export function houseScore(i) {
  const s = 1 + 0.4 * Math.min(i.parks, 2) + 0.25 * Math.min(i.shops, 2) - 0.5 * Math.min(i.factories, 2) + (i.lake ? 0.2 : 0);
  return Math.min(2.2, Math.max(0.2, s));
}
export const houseCap = (i, tax = 1) => (i.power ? Math.round(24 * houseScore(i) * TAX[tax].cap) : 0);

export function place(city, type, idx) {
  const def = BUILD[type];
  if (!def || city.cells[idx] || city.money < def.cost || (city.terrain && city.terrain[idx] === 1)) return false;
  city.money -= def.cost;
  city.cells[idx] = { type, pop: 0 };
  return true;
}

export function bulldoze(city, idx) {
  if (!city.cells[idx]) return false;
  city.cells[idx] = null;
  return true;
}

// --- disasters: telegraphed one month ahead --------------------------------
export const DISASTERS = {
  queen:  { label: "giant queen",  how: "tramples a whole rank or file" },
  bishop: { label: "giant bishop", how: "cuts down a diagonal" },
  knight: { label: "giant knight", how: "stomps an L-shaped scatter of squares" },
};
export function newOmen(rng) {
  const kinds = Object.keys(DISASTERS);
  const kind = kinds[Math.floor(rng() * kinds.length) % kinds.length];
  const o = { kind };
  if (kind === "queen") { o.row = rng() < 0.5; o.k = Math.floor(rng() * N); }
  else if (kind === "bishop") { o.anti = rng() < 0.5; o.k = Math.floor(rng() * (2 * N - 1)); }
  else { o.r = Math.floor(rng() * N); o.c = Math.floor(rng() * N); }
  return o;
}
// Squares an omen will hit.
export function omenSquares(o) {
  const out = [];
  if (o.kind === "queen") for (let j = 0; j < N; j++) out.push(o.row ? o.k * N + j : j * N + o.k);
  else if (o.kind === "bishop") for (let r = 0; r < N; r++) { const c = o.anti ? o.k - r : r + (o.k - (N - 1)); if (c >= 0 && c < N) out.push(r * N + c); }
  else { out.push(o.r * N + o.c); for (const [r, c] of reach("knight", o.r, o.c)) out.push(r * N + c); }
  return out;
}
export const omenName = (o) => {
  const d = DISASTERS[o.kind];
  const where = o.kind === "queen" ? (o.row ? "rank " + (N - o.k) : "file " + String.fromCharCode(97 + o.k))
    : o.kind === "bishop" ? "the highlighted diagonal" : `around ${String.fromCharCode(97 + o.c)}${N - o.r}`;
  return `a ${d.label} ${d.how} (${where})`;
};

// --- contracts: a small optional goal for a cash reward ------------------
const CONTRACTS = [
  { id: "parks",   type: "bishop", label: "parks",        pay: 220, add: [2, 3] },
  { id: "shops",   type: "knight", label: "shops",        pay: 200, add: [2, 4] },
  { id: "factory", type: "rook",   label: "factories",    pay: 260, add: [1, 3] },
  { id: "guard",   type: "king",   label: "fire stations", pay: 240, add: [1, 2] },
];
export const countType = (city, type) => city.cells.filter((b) => b && b.type === type).length;
export function newContract(city, rng) {
  if (rng() < 0.3) { const need = totalPop(city) + 150 + Math.floor(rng() * 150); return { id: "pop", text: `reach ${need} people`, need, pay: 300, due: city.month + 30 }; }
  const d = CONTRACTS[Math.floor(rng() * CONTRACTS.length) % CONTRACTS.length];
  const n = d.add[0] + Math.floor(rng() * (d.add[1] - d.add[0] + 1)), need = countType(city, d.type) + n;
  return { id: d.id, type: d.type, text: `have ${need} ${d.label}`, need, pay: d.pay + (n - d.add[0]) * 60, due: city.month + 24 };
}
export const contractDone = (city, k) => (k.id === "pop" ? totalPop(city) >= k.need : countType(city, k.type) >= k.need);

export const cityScore = (city) => totalPop(city) + city.done * 50 + Math.floor(Math.max(0, city.money) / 20)
  + (city.status === "won" ? 1000 + Math.max(0, 400 - city.month) * 5 : 0);

// Advance one month. rng() -> [0,1). Returns a list of event strings.
// Also leaves city.lastIncome and city.lastLost (destroyed square indexes) for the UI.
export function tick(city, rng = Math.random) {
  const events = [];
  city.lastLost = [];
  if (city.status !== "playing") return events;
  city.month++;
  const inf = analyze(city);
  const tax = TAX[city.tax ?? 1];
  let income = 0;
  const bd = { homes: 0, shops: 0, factories: 0, upkeep: 0 };
  city.cells.forEach((b, i) => {
    if (!b) return;
    income -= BUILD[b.type].upkeep; bd.upkeep += BUILD[b.type].upkeep;
    if (b.type === "pawn") {
      const cap = houseCap(inf[i], city.tax ?? 1);
      b.pop = b.pop < cap ? Math.min(cap, b.pop + 3) : Math.max(cap, b.pop - 4);
      income += 0.12 * b.pop * tax.income; bd.homes += 0.12 * b.pop * tax.income;
    } else if (b.type === "knight" || b.type === "rook") {
      const homes = reach(b.type, Math.floor(i / N), i % N)
        .filter(([r, c]) => city.cells[r * N + c] && city.cells[r * N + c].type === "pawn" && city.cells[r * N + c].pop > 0).length;
      const earn = b.type === "knight" ? 5 * homes : 30 + 3 * homes + (city.terrain && city.terrain[i] === 2 ? 40 : 0); // shops sell to homes, factories employ them
      income += earn; bd[b.type === "knight" ? "shops" : "factories"] += earn;
    }
  });
  city.lastIncome = Math.round(income);
  city.lastBreakdown = { homes: Math.round(bd.homes), shops: Math.round(bd.shops), factories: Math.round(bd.factories), upkeep: bd.upkeep };
  city.money += city.lastIncome;
  // Disasters strike every RAMPAGE_EVERY months; the target is announced a month before.
  if (city.month % RAMPAGE_EVERY === RAMPAGE_EVERY - 1) {
    city.omen = newOmen(rng);
    events.push(`omen: next month ${omenName(city.omen)}. fire stations shield their neighbours.`);
  }
  if (city.month % RAMPAGE_EVERY === 0) {
    const o = city.omen || newOmen(rng);
    city.omen = null;
    let lost = 0, saved = 0;
    for (const idx of omenSquares(o)) {
      if (!city.cells[idx]) continue;
      if (inf[idx].shield) { saved++; continue; }
      if (rng() < 0.5) { city.cells[idx] = null; city.lastLost.push(idx); lost++; }
    }
    events.push(`${DISASTERS[o.kind].label} struck: ${lost} building${lost === 1 ? "" : "s"} flattened${saved ? `, ${saved} saved by fire stations` : ""}.`);
  }
  // Contracts: finish one for a bonus, miss the deadline and a new one appears.
  if (city.contract && contractDone(city, city.contract)) {
    city.money += city.contract.pay; city.done++;
    events.push(`contract done: ${city.contract.text}. +${city.contract.pay} funds.`);
    city.contract = null;
  } else if (city.contract && city.month > city.contract.due) {
    events.push(`contract expired: ${city.contract.text}.`);
    city.contract = null;
  }
  if (!city.contract && city.month >= 6) city.contract = newContract(city, rng);
  if (totalPop(city) >= GOAL) city.status = "won";
  else if (city.money < BANKRUPT) city.status = "lost";
  return events;
}

// --- feedback for the player: what a build would do, and what's going wrong ---
const totalCap = (city) => { const inf = analyze(city); return city.cells.reduce((s, b, i) => s + (b && b.type === "pawn" ? houseCap(inf[i], city.tax ?? 1) : 0), 0); };
const inReach = (type, idx) => reach(type, Math.floor(idx / N), idx % N).map(([r, c]) => r * N + c);

// Preview of putting `type` on empty square idx: how many people the city can hold afterwards, and the monthly bill.
export function preview(city, type, idx) {
  const def = BUILD[type];
  if (!def || idx < 0 || city.cells[idx]) return null;
  if (city.terrain && city.terrain[idx] === 1) return { ok: false, text: "a lake: you can't build here.", reach: [], good: [], bad: [] };
  const before = totalCap(city);
  const trial = { ...city, cells: city.cells.slice() };
  trial.cells[idx] = { type, pop: 0 };
  const dCap = totalCap(trial) - before;
  const homes = (t) => inReach(t, idx).filter((j) => city.cells[j] && city.cells[j].type === "pawn");
  const rr = type === "pawn" || type === "king" ? [] : reach(type, Math.floor(idx / N), idx % N);
  const good = [], bad = [];
  let text;
  if (type === "pawn") {
    const p = analyze(city)[idx], cap = houseCap(p, city.tax ?? 1);
    text = cap ? `house here would hold up to ${cap} people (happiness ×${houseScore(p).toFixed(2)}).` : "house here has no power: nobody would move in. build a ♕ on its rank, file or diagonal first.";
    (cap ? good : bad).push(idx);
  } else if (type === "queen") {
    const h = homes("queen"), fresh = h.filter((j) => !analyze(city)[j].power);
    text = `power plant here reaches ${h.length} house${h.length === 1 ? "" : "s"}, ${fresh.length} newly powered (+${dCap} capacity). costs ${def.upkeep}/month.`;
    for (const j of h) (fresh.includes(j) ? good : []).push(j);
  } else if (type === "bishop" || type === "knight") {
    const h = homes(type), word = type === "bishop" ? "parks" : "shops";
    text = h.length ? `${def.label} here lifts ${h.length} house${h.length === 1 ? "" : "s"} (${dCap >= 0 ? "+" : ""}${dCap} capacity)${type === "knight" ? ", and sells ~" + 5 * h.length + "/month to them" : ""}. upkeep ${def.upkeep}/month.`
      : `no houses in reach: this ${def.label} would just cost ${def.upkeep}/month. ${word} need houses on their ${type === "bishop" ? "diagonals" : "knight jumps"}.`;
    (h.length ? good : bad).push(...h);
  } else if (type === "rook") {
    const h = homes("rook"), ore = city.terrain && city.terrain[idx] === 2;
    text = `factory here pays ~${30 + 3 * h.length + (ore ? 40 : 0)}/month${ore ? " (ore!)" : ""} but crowds ${h.length} house${h.length === 1 ? "" : "s"} on its rank and file (${dCap} capacity).`;
    bad.push(...h);
  } else {
    const around = [idx - 1, idx + 1, idx - N, idx + N, idx - N - 1, idx - N + 1, idx + N - 1, idx + N + 1].filter((j) => j >= 0 && j < N * N && Math.abs((j % N) - (idx % N)) <= 1 && city.cells[j]);
    text = `fire station here shields ${around.length} neighbouring building${around.length === 1 ? "" : "s"} from rampages. upkeep ${def.upkeep}/month.`;
    good.push(...around);
  }
  const afford = city.money >= def.cost;
  return { ok: afford, text: afford ? text : `can't afford (${def.cost}). ` + text, reach: rr, good, bad, dCap };
}

// What's working and what isn't, most urgent first. Each: {level: "bad"|"warn"|"good", text}.
export function advise(city) {
  const out = [], inf = analyze(city), tax = city.tax ?? 1;
  const houses = [];
  city.cells.forEach((b, i) => { if (b && b.type === "pawn") houses.push(i); });
  const count = (t) => countType(city, t);
  const dark = houses.filter((i) => !inf[i].power);
  const maxed = houses.filter((i) => inf[i].power && city.cells[i].pop >= houseCap(inf[i], tax));
  const smoggy = houses.filter((i) => inf[i].factories >= 2);
  const pop = totalPop(city);
  if (city.status !== "playing") return out;
  if (city.omen) out.push({ level: "bad", text: `${omenName(city.omen)} next month. fire stations (♔) protect their neighbours; the red squares are the target.` });
  const projected = city.money + (city.lastIncome || 0) * 3;
  if (city.money < 0) out.push({ level: "bad", text: `in debt (${city.money}). at ${BANKRUPT} the city folds. bulldoze money-losers or raise taxes.` });
  else if ((city.lastIncome ?? 0) < 0 && projected < 0) out.push({ level: "bad", text: `losing ${-city.lastIncome}/month and the funds run out within 3 months. cut upkeep or add houses and shops.` });
  if (!houses.length) out.push({ level: "warn", text: "no houses yet. start with a ♕ power plant, then ♙ houses on its rank, file or diagonal." });
  else if (!count("queen")) out.push({ level: "bad", text: "no power plant: no house can grow. place a ♕ in line with your houses." });
  if (dark.length && count("queen")) out.push({ level: "bad", text: `${dark.length} house${dark.length === 1 ? " is" : "s are"} unpowered (shown as "no power"). a ♕ must share a rank, file or diagonal with each.` });
  if (smoggy.length) out.push({ level: "warn", text: `${smoggy.length} house${smoggy.length === 1 ? " is" : "s are"} choked by 2+ factories. bulldoze one or add parks.` });
  if (houses.length >= 4 && !count("bishop") && pop >= 80) out.push({ level: "warn", text: "no parks. a ♗ on a house's diagonal raises how many people fit." });
  if (houses.length >= 4 && !count("knight") && pop >= 80) out.push({ level: "warn", text: "no shops. a ♘ a knight-jump from houses lifts happiness and pays 5 per house." });
  if (houses.length >= 5 && !count("rook") && (city.lastIncome ?? 0) < 25) out.push({ level: "warn", text: "income is thin. a ♖ factory pays 30+ a month (more on ◆ ore) but crowds nearby houses." });
  if (count("queen") && houses.length && houses.length < count("queen") * 3) out.push({ level: "warn", text: "power plants cost 12/month each and you have few houses to feed. build more houses in their lines." });
  if (maxed.length >= 2 && maxed.length === houses.filter((i) => inf[i].power).length) out.push({ level: "warn", text: "every powered house is full. add houses, or parks and shops to raise the cap." });
  if (!count("king") && city.month >= 10) out.push({ level: "warn", text: "no fire stations. rampages hit every " + RAMPAGE_EVERY + " months and flatten half of what they touch." });
  if (city.lastLost && city.lastLost.length) out.push({ level: "bad", text: `last rampage flattened ${city.lastLost.length}. rebuild, and put a ♔ near what matters.` });
  if (city.contract) out.push({ level: "good", text: `contract: ${city.contract.text} by month ${city.contract.due} for +${city.contract.pay}.` });
  if ((city.lastIncome ?? 0) > 0 && pop > 0) out.push({ level: "good", text: `earning +${city.lastIncome}/month. ${pop >= GOAL * 0.5 ? "over halfway" : GOAL - pop + " people to go"}.` });
  const order = { bad: 0, warn: 1, good: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
