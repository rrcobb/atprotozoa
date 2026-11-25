// Pure rules for the chess idle clicker — no DOM, so tests can import it.
// Each line manufactures one kind of piece. Machines make 1 piece/s each,
// finished pieces sell automatically for `value` gold, and gold buys more
// machines, speed upgrades and the next kind of piece.
export const GOAL_RATE = 1000;      // dragons per second that count as "done"
export const COST_GROWTH = 1.12;    // each machine bought makes the next dearer
// Long Corvid hard mode: a flock raids the vault on a timer, machines get dearer
// faster, and the dragon target is five times higher. Scarecrows blunt the raids.
export const HARD_GOAL_RATE = 5000;
export const HARD_COST_GROWTH = 1.15;
export const CROW_EVERY = 40;       // seconds between raids
export const CROW_THEFT = 0.3;      // share of gold carried off per raid
export const SCARE_FACTOR = 0.6;    // each scarecrow tier multiplies theft by this
export const MAX_SCARE = 6;
export const goalRate = (g) => (g.hard ? HARD_GOAL_RATE : GOAL_RATE);
export const theft = (g) => CROW_THEFT * SCARE_FACTOR ** g.scare;
export const scareCost = (tier) => 2000 * 10 ** tier;
export const MILESTONES = [25, 50, 100, 200, 400]; // owned counts that double a line
export const SYNERGY = 0.01; // each machine of the next line up adds 1% to the line below it

export const LINES = [
  { id: "pawn",   glyph: "♟", label: "pawn press",       cost: 15,     value: 1 },
  { id: "knight", glyph: "♞", label: "knight foundry",   cost: 300,    value: 12 },
  { id: "bishop", glyph: "♝", label: "bishop lathe",     cost: 6000,   value: 200 },
  { id: "rook",   glyph: "♜", label: "rook forge",       cost: 120000, value: 3500 },
  { id: "queen",  glyph: "♛", label: "queen atelier",    cost: 3e6,    value: 70000 },
  { id: "king",   glyph: "♚", label: "king mint",        cost: 5e8,   value: 1.6e6 },
  { id: "dragon", glyph: "🐉", label: "dragon assembler", cost: 1.5e10, value: 4e7 },
  // Past the goal: for people who keep going after the dragon.
  { id: "board",  glyph: "♜♞", label: "board forge",       cost: 6e12,   value: 1.2e9 },
  { id: "hall",   glyph: "🏛", label: "tournament hall",   cost: 3e14,   value: 6e10 },
];

export function newGame(hard = false) {
  return {
    gold: 0, total: 0, t: 0, won: false,
    hard, crow: 0, scare: 0, stolen: 0, raids: 0,
    owned: Object.fromEntries(LINES.map((l) => [l.id, 0])),
    made: Object.fromEntries(LINES.map((l) => [l.id, 0])),
    speed: Object.fromEntries(LINES.map((l) => [l.id, 0])), // doublings bought per line
    guild: 0, // global gold multiplier tiers (x1.5 each)
    // Permanent layer, kept when you ascend.
    crowns: 0, prestiges: 0, decree: { start: 0, thrift: 0, eyes: 0, stamp: 0 },
    ach: {}, clicks: 0, goldens: 0,
    // Per-run extras: foremen (auto-buyers), timed buffs.
    foreman: Object.fromEntries(LINES.map((l) => [l.id, 0])), frenzy: 0, slow: 0,
  };
}

const line = (id) => LINES.find((l) => l.id === id);
export const machineCost = (id, owned, hard = false, thrift = 0) => Math.ceil(line(id).cost * ((hard ? HARD_COST_GROWTH : COST_GROWTH) - 0.01 * thrift) ** owned);
export const speedCost = (id, tier) => line(id).cost * 25 * 6 ** tier;
export const guildCost = (tier) => 2000 * 12 ** tier;
export const guildMult = (g) => 1.5 ** g.guild;
export const CROWN_BONUS = 0.05;  // +5% gold per crown ever earned
export const ACH_BONUS = 0.02;    // +2% gold per achievement
export const FRENZY_MULT = 7;
export const MAX_FRENZY = 60;     // seconds; without a cap, catching every golden piece would make frenzy permanent
export const crownMult = (g) => 1 + CROWN_BONUS * g.crowns;
export const achCount = (g) => ACHIEVEMENTS.filter((a) => g.ach[a.id]).length;
export const achMult = (g) => 1 + ACH_BONUS * achCount(g);
// Everything that scales gold, not counting timed buffs.
export const goldMult = (g) => guildMult(g) * crownMult(g) * achMult(g);
export const buffMult = (g) => (g.frenzy > 0 ? FRENZY_MULT : 1) * (g.slow > 0 ? 0.5 : 1);
export const costOf = (g, id) => machineCost(id, g.owned[id], g.hard, g.decree.thrift);

export function milestoneMult(owned) {
  let m = 1;
  for (const n of MILESTONES) if (owned >= n) m *= 2;
  return m;
}
// Pieces per second one line produces.
export function synergy(g, id) {
  const i = LINES.findIndex((l) => l.id === id), up = LINES[i + 1];
  return up ? 1 + SYNERGY * g.owned[up.id] : 1;
}
export const lineRate = (g, id) => g.owned[id] * milestoneMult(g.owned[id]) * 2 ** g.speed[id] * synergy(g, id);
// Base income, before timed buffs (frenzy, inspector).
export const goldPerSec = (g) => LINES.reduce((s, l) => s + lineRate(g, l.id) * l.value, 0) * goldMult(g);
export const liveGps = (g) => goldPerSec(g) * buffMult(g);

// A line is on the board once you can nearly afford it, or already own it.
export function visible(g, i) {
  if (i === 0 || g.owned[LINES[i].id] > 0) return true;
  return g.owned[LINES[i - 1].id] > 0 && g.total >= LINES[i].cost / 4;
}

// Advances the factory; in hard mode the clock is cut at every raid so a long
// absence loses gold to each one. Returns how many raids happened.
export function tick(g, dt) {
  if (dt <= 0) return 0;
  let left = dt, raids = 0;
  while (left > 0) {
    let step = g.hard ? Math.min(left, CROW_EVERY - g.crow) : left;
    // buffs end mid-step, so cut the step where one expires
    for (const b of ["frenzy", "slow"]) if (g[b] > 0 && g[b] < step) step = g[b];
    g.t += step; left -= step;
    let earned = 0;
    for (const l of LINES) {
      const n = lineRate(g, l.id) * step;
      g.made[l.id] += n;
      earned += n * l.value;
    }
    earned *= goldMult(g) * buffMult(g);
    g.gold += earned; g.total += earned;
    g.frenzy = Math.max(0, g.frenzy - step); g.slow = Math.max(0, g.slow - step);
    if (g.hard) {
      g.crow += step;
      if (g.crow >= CROW_EVERY - 1e-9) {
        g.crow = 0;
        const lost = g.gold * theft(g);
        g.gold -= lost; g.stolen += lost; g.raids++; raids++;
      }
    }
  }
  if (lineRate(g, "dragon") >= goalRate(g)) g.won = true;
  return raids;
}

// Stamping by hand makes pawns; it keeps up a little as the pawn press grows.
// combo (1 to 3) is the hot-hands bonus from stamping quickly.
export function clickPower(g, combo = 1) {
  return (1 + g.owned.pawn * 0.1) * 2 ** g.speed.pawn * 2 ** g.decree.stamp * combo;
}
export function click(g, combo = 1) {
  const n = clickPower(g, combo);
  g.made.pawn += n; g.clicks++;
  const e = n * line("pawn").value * goldMult(g) * buffMult(g);
  g.gold += e; g.total += e;
  return n;
}

// Buy up to n machines; returns how many were bought.
export function buyMachines(g, id, n) {
  let bought = 0;
  while (bought < n) {
    const c = costOf(g, id);
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
export function buyScare(g) {
  const c = scareCost(g.scare);
  if (g.scare >= MAX_SCARE || g.gold < c) return false;
  g.gold -= c; g.scare++; return true;
}
export function buyGuild(g) {
  const c = guildCost(g.guild);
  if (g.gold < c) return false;
  g.gold -= c; g.guild++; return true;
}

// ---- foremen: automation you choose where to hire ----------------------------
// A foreman buys machines for one line. He only spends gold above FOREMAN_RESERVE
// times the next machine's price, so he never starves what you're saving for.
export const FOREMAN_RESERVE = 2;
export const foremanCost = (id) => line(id).cost * 40;
export function hireForeman(g, id) {
  const c = foremanCost(id);
  if (g.foreman[id] || g.owned[id] < 5 || g.gold < c) return false; // 5 machines first: you must know the job before you delegate it
  g.gold -= c; g.foreman[id] = 1; return true;
}
export function toggleForeman(g, id) { if (g.foreman[id]) g.foreman[id] = g.foreman[id] === 1 ? 2 : 1; return g.foreman[id] === 1; }
// 1 = working, 2 = off duty
export function automate(g) {
  let bought = 0;
  for (const l of LINES) {
    if (g.foreman[l.id] !== 1) continue;
    for (let i = 0; i < 100 && g.gold >= costOf(g, l.id) * FOREMAN_RESERVE; i++) { buyMachines(g, l.id, 1); bought++; }
  }
  return bought;
}
// Long gaps (offline) run in slices so foremen get to reinvest as the money comes in.
export function fastForward(g, seconds) {
  const slices = Math.min(600, Math.max(1, Math.ceil(seconds / 5)));
  let raids = 0;
  for (let i = 0; i < slices; i++) { raids += tick(g, seconds / slices); automate(g); }
  return raids;
}

// ---- ascension ---------------------------------------------------------------------
export const CROWN_DIVISOR = 1e10;
export const crownsFor = (total) => Math.floor(Math.sqrt(Math.max(0, total) / CROWN_DIVISOR));
export const pendingCrowns = (g) => crownsFor(g.total);
export function ascend(g) {
  const gain = pendingCrowns(g);
  if (gain < 1) return null;
  const keep = { crowns: g.crowns + gain, prestiges: g.prestiges + 1, decree: g.decree, ach: g.ach, clicks: g.clicks, goldens: g.goldens };
  const f = newGame(g.hard);
  Object.assign(f, keep);
  f.owned.pawn = 10 * g.decree.start; f.gold = g.decree.start ? 15 * g.decree.start : 0;
  f.won = g.won; // the dragon was already built once
  Object.assign(g, f);
  return gain;
}
// Decrees cost crowns and stay forever.
export const DECREES = [
  { id: "start", name: "Apprenticeship", text: "each level: start every run with 10 pawn presses and some gold" },
  { id: "thrift", name: "Frugal Guild", text: "each level: machines get 0.01 less expensive per purchase" },
  { id: "eyes", name: "Golden Eyes", text: "each level: golden pieces and offers come 25% sooner" },
  { id: "stamp", name: "Iron Stamp", text: "each level: hand stamping is twice as strong" },
];
export const MAX_DECREE = 3;
export const decreeCost = (level) => 3 * 2 ** level;
export function buyDecree(g, id) {
  const lv = g.decree[id];
  if (lv === undefined || lv >= MAX_DECREE || g.crowns - spentCrowns(g) < decreeCost(lv)) return false;
  g.decree[id]++; return true;
}
export const spentCrowns = (g) => Object.values(g.decree).reduce((s, lv) => { let c = 0; for (let i = 0; i < lv; i++) c += decreeCost(i); return s + c; }, 0);
export const freeCrowns = (g) => g.crowns - spentCrowns(g);

// ---- achievements ----------------------------------------------------------------------
export const ACHIEVEMENTS = [
  { id: "stamp100", name: "Pawn Pusher", text: "make 100 pawns", ok: (g) => g.made.pawn >= 100 },
  { id: "press25", name: "Press Operator", text: "own 25 pawn presses", ok: (g) => g.owned.pawn >= 25 },
  { id: "click300", name: "Sore Thumb", text: "stamp 300 times by hand", ok: (g) => g.clicks >= 300 },
  { id: "knight", name: "Cavalry", text: "own a knight foundry", ok: (g) => g.owned.knight >= 1 },
  { id: "bishop10", name: "Diagonal Thinker", text: "own 10 bishop lathes", ok: (g) => g.owned.bishop >= 10 },
  { id: "m1", name: "Millionaire", text: "earn 1 million gold in one run", ok: (g) => g.total >= 1e6 },
  { id: "m1e9", name: "Billionaire", text: "earn 1 billion gold in one run", ok: (g) => g.total >= 1e9 },
  { id: "m1e12", name: "Trillionaire", text: "earn 1 trillion gold in one run", ok: (g) => g.total >= 1e12 },
  { id: "guild3", name: "Guild Member", text: "buy 3 guild charters", ok: (g) => g.guild >= 3 },
  { id: "speed", name: "Overclocked", text: "buy 8 speed upgrades in total", ok: (g) => Object.values(g.speed).reduce((a, b) => a + b, 0) >= 8 },
  { id: "foreman", name: "Delegator", text: "hire 3 foremen", ok: (g) => Object.values(g.foreman).filter(Boolean).length >= 3 },
  { id: "gold5", name: "Golden Touch", text: "catch 5 golden pieces", ok: (g) => g.goldens >= 5 },
  { id: "milestone", name: "Centurion", text: "own 100 machines of one line", ok: (g) => LINES.some((l) => g.owned[l.id] >= 100) },
  { id: "dragon", name: "Dragon Born", text: "assemble your first dragon", ok: (g) => g.owned.dragon >= 1 },
  { id: "win", name: "Dragon Lord", text: "reach the dragon goal", ok: (g) => g.won },
  { id: "ascend", name: "Coronation", text: "ascend for the first time", ok: (g) => g.prestiges >= 1 },
  { id: "crow", name: "Crow Survivor", text: "survive 10 crow raids", ok: (g) => g.raids >= 10 },
  { id: "hall", name: "Grand Master", text: "build a tournament hall", ok: (g) => g.owned.hall >= 1 },
];
// Marks any newly earned achievements and returns them.
export function checkAchievements(g) {
  const out = [];
  for (const a of ACHIEVEMENTS) if (!g.ach[a.id] && a.ok(g)) { g.ach[a.id] = true; out.push(a); }
  return out;
}

// ---- random events -------------------------------------------------------------------------
// Golden pieces float across the floor; click one for a prize.
export const GOLDEN = [
  { kind: "knight", glyph: "♞", text: "frenzy" },
  { kind: "pawn", glyph: "♟", text: "bonus" },
];
export function claimGolden(g, kind) {
  g.goldens++;
  if (kind === "knight") { g.frenzy = Math.min(MAX_FRENZY, g.frenzy + 20); return `golden knight: everything makes ${FRENZY_MULT}x gold for 20 seconds!`; }
  const gain = liveGps(g) * 90 + 13;
  g.gold += gain; g.total += gain;
  return `golden pawn: a surprise order worth ${fmt(gain)} gold.`;
}
export const eventDelay = (g, rng = Math.random) => (45 + rng() * 60) * 0.75 ** g.decree.eyes;
// Offers need a yes or no. `rng` decides the coin flip.
export const OFFERS = [
  { kind: "merchant", text: (g) => `a merchant offers 5 minutes of your production for ${fmt(g.gold * 0.25)} gold (25% of your vault).`, yes: "buy it", no: "no thanks",
    ok: (g) => g.gold > 20 && liveGps(g) > 0 },
  { kind: "gambit", text: (g) => `a stranger proposes double or nothing on ${fmt(g.gold * 0.2)} gold.`, yes: "flip", no: "decline", ok: (g) => g.gold > 50 },
  { kind: "inspector", text: (g) => `the guild inspector wants ${fmt(g.gold * 0.1)} gold, or he'll slow the line for 30 seconds.`, yes: "pay", no: "refuse", ok: (g) => g.gold > 30 },
];
export function pickOffer(g, rng = Math.random) {
  const pool = OFFERS.filter((o) => o.ok(g));
  return pool.length ? pool[Math.floor(rng() * pool.length)].kind : null;
}
export function resolveOffer(g, kind, accept, rng = Math.random) {
  if (kind === "merchant") {
    if (!accept) return "the merchant shrugs and leaves.";
    const pay = g.gold * 0.25, gain = liveGps(g) * 300;
    g.gold += gain - pay; g.total += gain;
    return `deal: paid ${fmt(pay)}, received ${fmt(gain)} gold of stock.`;
  }
  if (kind === "gambit") {
    if (!accept) return "you decline. the stranger tips his hat.";
    const stake = g.gold * 0.2;
    if (rng() < 0.5) { g.gold += stake; g.total += stake; return `won! +${fmt(stake)} gold.`; }
    g.gold -= stake; return `lost ${fmt(stake)} gold.`;
  }
  if (accept) { g.gold -= g.gold * 0.1; return "you pay the inspector. he approves of the paperwork."; }
  g.slow = 30; return "you refuse. the line grinds at half speed for 30 seconds.";
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
    for (const k of ["gold", "total", "t", "guild", "crow", "scare", "stolen", "raids", "crowns", "prestiges", "clicks", "goldens", "frenzy", "slow"]) if (Number.isFinite(o[k])) base[k] = o[k];
    base.won = !!o.won; base.hard = !!o.hard;
    base.scare = Math.min(MAX_SCARE, Math.max(0, Math.floor(base.scare)));
    base.crow = Math.min(CROW_EVERY, Math.max(0, base.crow));
    base.frenzy = Math.min(MAX_FRENZY, Math.max(0, base.frenzy)); base.slow = Math.min(30, Math.max(0, base.slow));
    for (const l of LINES) for (const f of ["owned", "made", "speed", "foreman"]) {
      if (o[f] && Number.isFinite(o[f][l.id])) base[f][l.id] = o[f][l.id];
    }
    for (const d of DECREES) if (o.decree && Number.isFinite(o.decree[d.id])) base.decree[d.id] = Math.min(MAX_DECREE, Math.max(0, Math.floor(o.decree[d.id])));
    if (o.ach && typeof o.ach === "object") for (const a of ACHIEVEMENTS) if (o.ach[a.id]) base.ach[a.id] = true;
  } catch { /* corrupt save: start fresh */ }
  return base;
}
