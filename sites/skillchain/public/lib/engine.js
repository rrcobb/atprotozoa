// engine.js — pure game rules for skillchain (no DOM, no network, node-testable).
//
// A ship is a hull (the standardized stat block) + a reactor (power plant) + a
// Markov chain of skills + swappable modules. The reactor sets how many skills
// the chain may hold, which skill families it can run, and how much power the
// skills and modules may draw in total. The hull sets which reactor sizes fit
// and how many module slots there are.

export const TICK_MS = 60_000; // one job tick = one minute of wall-clock time
export const START_CREDITS = 500;
export const MAX_ROUNDS = 40; // product decision: a duel is a skirmish, not a siege

export const REACTORS = {
  fission:     { label: "fission pile",       size: 0, output: 30,  slots: 4, tags: ["kinetic", "defense", "mining", "utility"], cost: 0 },
  fusion:      { label: "fusion core",        size: 1, output: 60,  slots: 5, tags: ["kinetic", "energy", "defense", "mining", "utility"], cost: 400 },
  antimatter:  { label: "antimatter cell",    size: 2, output: 110, slots: 7, tags: ["energy", "burst", "defense", "stealth", "utility"], cost: 1500 },
  singularity: { label: "singularity engine", size: 3, output: 200, slots: 9, tags: ["kinetic", "energy", "burst", "defense", "stealth", "mining", "utility"], cost: 6000 },
};

// Standard stat block: hp, shield, armor, speed, cargo (hold, in credits), acc.
export const HULLS = {
  frigate:      { label: "frigate",      maxReactor: 1, modSlots: 2, cost: 0,    stats: { hp: 90,  shield: 20, armor: 3, speed: 5, cargo: 120, acc: 0.75 } },
  cruiser:      { label: "cruiser",      maxReactor: 2, modSlots: 3, cost: 900,  stats: { hp: 160, shield: 40, armor: 6, speed: 3, cargo: 300, acc: 0.72 } },
  dreadnought:  { label: "dreadnought",  maxReactor: 3, modSlots: 4, cost: 4000, stats: { hp: 280, shield: 70, armor: 10, speed: 1, cargo: 800, acc: 0.70 } },
};

// tag -> family. yield is credits per tick; the rest are combat effects.
export const SKILLS = {
  strike:   { label: "strike",   tag: "kinetic", draw: 8,  yield: 0,  dmg: 14, hits: 1 },
  volley:   { label: "volley",   tag: "kinetic", draw: 14, yield: 0,  dmg: 8,  hits: 3 },
  beam:     { label: "beam",     tag: "energy",  draw: 12, yield: 0,  dmg: 18, hits: 1, pierce: true },
  torpedo:  { label: "torpedo",  tag: "burst",   draw: 22, yield: 0,  dmg: 40, hits: 1, acc: -0.15 },
  overload: { label: "overload", tag: "burst",   draw: 26, yield: 0,  dmg: 55, hits: 1, pierce: true, self: 12 },
  bulwark:  { label: "bulwark",  tag: "defense", draw: 8,  yield: 0,  shield: 16 },
  plate:    { label: "plate",    tag: "defense", draw: 10, yield: 0,  guard: true },
  repair:   { label: "repair",   tag: "defense", draw: 12, yield: 0,  heal: 18 },
  evade:    { label: "evade",    tag: "stealth", draw: 9,  yield: 0,  evade: true },
  cloak:    { label: "cloak",    tag: "stealth", draw: 16, yield: 0,  cloak: true },
  scan:     { label: "scan",     tag: "utility", draw: 5,  yield: 3,  aim: 0.12 },
  mine:     { label: "mine",     tag: "mining",  draw: 6,  yield: 9 },
  haul:     { label: "haul",     tag: "mining",  draw: 8,  yield: 14 },
  salvage:  { label: "salvage",  tag: "utility", draw: 10, yield: 18, heal: 4 },
};

export const MODULES = {
  plating:    { label: "reinforced plating", draw: 6,  cost: 120, add: { hp: 40, speed: -1 } },
  boosters:   { label: "shield boosters",    draw: 8,  cost: 150, add: { shield: 30 } },
  hold:       { label: "cargo extension",    draw: 4,  cost: 100, add: { cargo: 60 } },
  burner:     { label: "afterburner",        draw: 10, cost: 180, add: { speed: 2 } },
  targeting:  { label: "targeting computer", draw: 7,  cost: 200, add: { acc: 0.1 } },
  nanites:    { label: "nanite swarm",       draw: 9,  cost: 250, add: { regen: 3 } },
  ablative:   { label: "ablative coating",   draw: 5,  cost: 160, add: { armor: 3 } },
};

export const MAX_WEIGHT = 9;

export function normalizeShip(raw) {
  const s = raw || {};
  const skills = Array.isArray(s.skills) ? s.skills.filter((x) => typeof x === "string") : [];
  const n = skills.length;
  const matrix = skills.map((_, i) =>
    skills.map((_, j) => {
      const v = Number(s.matrix?.[i]?.[j]);
      return Number.isFinite(v) ? Math.max(0, Math.min(MAX_WEIGHT, Math.round(v))) : 1;
    }),
  );
  return {
    name: String(s.name || "unnamed").slice(0, 40),
    hull: s.hull,
    reactor: s.reactor,
    skills,
    matrix: n ? matrix : [],
    mods: Array.isArray(s.mods) ? s.mods.filter((x) => typeof x === "string") : [],
    updatedAt: s.updatedAt || "",
  };
}

// Returns { ok, errors[], stats, draw, output }. Stats are always derived from
// the build — never trusted from a record — so a tampered record just fails here.
export function evaluate(ship) {
  const s = normalizeShip(ship);
  const errors = [];
  const hull = HULLS[s.hull];
  const reactor = REACTORS[s.reactor];
  if (!hull) errors.push(`unknown hull "${s.hull}"`);
  if (!reactor) errors.push(`unknown reactor "${s.reactor}"`);
  if (!hull || !reactor) return { ok: false, errors, stats: null, draw: 0, output: 0 };
  if (reactor.size > hull.maxReactor) errors.push(`${hull.label} hull can't mount a ${reactor.label}`);
  if (s.skills.length < 1) errors.push("chain needs at least one skill");
  if (s.skills.length > reactor.slots) errors.push(`${reactor.label} runs at most ${reactor.slots} skills`);
  if (new Set(s.skills).size !== s.skills.length) errors.push("a skill can only appear once in the chain");
  if (s.mods.length > hull.modSlots) errors.push(`${hull.label} has ${hull.modSlots} module slots`);
  let draw = 0;
  for (const id of s.skills) {
    const sk = SKILLS[id];
    if (!sk) { errors.push(`unknown skill "${id}"`); continue; }
    if (!reactor.tags.includes(sk.tag)) errors.push(`${reactor.label} can't run ${sk.tag} skills (${id})`);
    draw += sk.draw;
  }
  const stats = { ...hull.stats, regen: 0 };
  for (const id of s.mods) {
    const m = MODULES[id];
    if (!m) { errors.push(`unknown module "${id}"`); continue; }
    draw += m.draw;
    for (const [k, v] of Object.entries(m.add)) stats[k] = (stats[k] || 0) + v;
  }
  if (draw > reactor.output) errors.push(`draw ${draw} exceeds reactor output ${reactor.output}`);
  stats.speed = Math.max(0, stats.speed);
  stats.acc = Math.min(0.95, stats.acc);
  return { ok: errors.length === 0, errors, stats, draw, output: reactor.output };
}

export function shipValue(ship) {
  const s = normalizeShip(ship);
  return (HULLS[s.hull]?.cost || 0) + (REACTORS[s.reactor]?.cost || 0) +
    s.mods.reduce((a, id) => a + (MODULES[id]?.cost || 0), 0);
}

// Row-normalised transition matrix; an all-zero row falls back to uniform.
export function transitionMatrix(ship) {
  const { matrix } = normalizeShip(ship);
  return matrix.map((row) => {
    const sum = row.reduce((a, b) => a + b, 0);
    return row.map((w) => (sum ? w / sum : 1 / row.length));
  });
}

// Stationary distribution by power iteration on the lazy chain (0.5I + 0.5P),
// which has the same stationary vector as P but converges even for periodic chains.
export function stationary(ship) {
  const P = transitionMatrix(ship);
  const n = P.length;
  if (!n) return [];
  let pi = new Array(n).fill(1 / n);
  for (let it = 0; it < 2000; it++) {
    const next = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      next[i] += 0.5 * pi[i];
      for (let j = 0; j < n; j++) next[j] += 0.5 * pi[i] * P[i][j];
    }
    let d = 0;
    for (let i = 0; i < n; i++) d += Math.abs(next[i] - pi[i]);
    pi = next;
    if (d < 1e-12) break;
  }
  return pi;
}

// Long-run credits per tick of running the chain forever.
export function yieldPerTick(ship) {
  const s = normalizeShip(ship);
  const pi = stationary(s);
  return s.skills.reduce((a, id, i) => a + pi[i] * (SKILLS[id]?.yield || 0), 0);
}

// Credits sitting in the hold now: lazy, computed from elapsed time, bounded by the hold.
export function holdContents(ship, dockedAtMs, nowMs) {
  const ev = evaluate(ship);
  if (!ev.ok) return 0;
  const ticks = Math.max(0, (nowMs - dockedAtMs) / TICK_MS);
  return Math.floor(Math.min(ev.stats.cargo, yieldPerTick(ship) * ticks));
}

export function wallet(records, nowMs = Date.now()) {
  // records: [{ value: ship record }]; retired ships contribute docked credits but no value.
  let w = START_CREDITS;
  for (const r of records) {
    w += r.docked || 0;
    if (!r.retired) w -= shipValue(r);
  }
  return w;
}

// ---- seeded RNG ----------------------------------------------------------

export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The fields that define a ship in combat, in a fixed key order.
export function snapshot(ship) {
  const s = normalizeShip(ship);
  return { name: s.name, hull: s.hull, reactor: s.reactor, skills: s.skills, matrix: s.matrix, mods: s.mods, updatedAt: s.updatedAt };
}

export function duelSeed(a, b) {
  return hashSeed(JSON.stringify([snapshot(a), snapshot(b)]));
}

function pick(row, r) {
  let acc = 0;
  for (let j = 0; j < row.length; j++) {
    acc += row[j];
    if (r < acc) return j;
  }
  return row.length - 1;
}

function fighter(ship) {
  const ev = evaluate(ship);
  const s = normalizeShip(ship);
  return {
    name: s.name, skills: s.skills, P: transitionMatrix(s), st: ev.stats,
    hp: ev.stats.hp, shield: ev.stats.shield, state: 0,
    guard: false, evade: false, cloak: false, aim: 0,
  };
}

// Deterministic: same two builds -> same fight, for anyone who recomputes it.
export function simulateDuel(a, b, seed = duelSeed(a, b)) {
  const ea = evaluate(a), eb = evaluate(b);
  if (!ea.ok || !eb.ok) return { winner: null, rounds: 0, log: [], seed, error: "invalid build" };
  const rand = rng(seed);
  const F = [fighter(a), fighter(b)];
  const log = [];
  let round = 0;
  for (; round < MAX_ROUNDS && F[0].hp > 0 && F[1].hp > 0; round++) {
    // each ship draws its next skill from the Markov row of its current skill
    const used = F.map((f, i) => {
      if (round > 0) f.state = pick(f.P[f.state], rand());
      return SKILLS[f.skills[f.state]];
    });
    F.forEach((f) => { f.cloakNow = false; });
    const order = F[0].st.speed >= F[1].st.speed ? [0, 1] : [1, 0];
    for (const i of order) {
      const me = F[i], foe = F[1 - i], sk = used[i];
      if (me.hp <= 0) continue;
      const name = me.skills[me.state];
      let line = `r${round + 1} ${me.name} → ${name}`;
      if (sk.shield) { me.shield = Math.min(me.st.shield * 1.5, me.shield + sk.shield); line += ` (+${sk.shield} shield)`; }
      if (sk.heal) { me.hp = Math.min(me.st.hp, me.hp + sk.heal); line += ` (+${sk.heal} hp)`; }
      if (sk.guard) { me.guard = true; }
      if (sk.evade) { me.evade = true; }
      if (sk.cloak) { me.cloakNow = true; }
      if (sk.aim) { me.aim = sk.aim; }
      if (sk.dmg) {
        let dealt = 0, hits = 0;
        for (let h = 0; h < sk.hits; h++) {
          let acc = Math.min(0.97, Math.max(0.05, me.st.acc + (sk.acc || 0) + me.aim + (me.st.speed - foe.st.speed) * 0.02));
          if (foe.evade) acc *= 0.4;
          if (foe.cloakNow) acc = 0;
          if (rand() >= acc) continue;
          let d = sk.pierce ? sk.dmg : Math.max(sk.dmg * 0.2, sk.dmg - foe.st.armor);
          if (foe.guard) d *= 0.5;
          d = Math.round(d);
          const absorbed = Math.min(foe.shield, d);
          foe.shield -= absorbed;
          foe.hp -= d - absorbed;
          dealt += d; hits++;
        }
        if (sk.self) me.hp -= sk.self;
        line += hits ? ` hits ${hits}× for ${dealt}` : " misses";
        me.aim = 0;
        foe.guard = false; foe.evade = false; // consumed by being targeted
      }
      log.push(line);
    }
    for (const f of F) if (f.hp > 0 && f.st.regen) f.hp = Math.min(f.st.hp, f.hp + f.st.regen);
  }
  const frac = F.map((f) => Math.max(0, f.hp) / f.st.hp);
  let winner = "draw";
  if (F[0].hp <= 0 && F[1].hp <= 0) winner = frac[0] === frac[1] ? "draw" : frac[0] > frac[1] ? "a" : "b";
  else if (F[1].hp <= 0) winner = "a";
  else if (F[0].hp <= 0) winner = "b";
  else if (Math.abs(frac[0] - frac[1]) > 0.005) winner = frac[0] > frac[1] ? "a" : "b";
  return { winner, rounds: round, log, seed, hp: [Math.max(0, Math.round(F[0].hp)), Math.max(0, Math.round(F[1].hp))] };
}

// What changed between two versions of a ship record (for the lazy-diff view).
export function diffShips(prev, next) {
  if (!prev) return ["new ship"];
  const p = normalizeShip(prev), n = normalizeShip(next);
  const out = [];
  if (p.name !== n.name) out.push(`renamed ${p.name} → ${n.name}`);
  if (p.hull !== n.hull) out.push(`hull ${p.hull} → ${n.hull}`);
  if (p.reactor !== n.reactor) out.push(`reactor ${p.reactor} → ${n.reactor}`);
  const added = n.skills.filter((x) => !p.skills.includes(x));
  const gone = p.skills.filter((x) => !n.skills.includes(x));
  if (added.length) out.push(`+skills ${added.join(", ")}`);
  if (gone.length) out.push(`−skills ${gone.join(", ")}`);
  let cells = 0;
  for (const a of n.skills) for (const b of n.skills) {
    if (!p.skills.includes(a) || !p.skills.includes(b)) continue;
    const w0 = p.matrix[p.skills.indexOf(a)][p.skills.indexOf(b)];
    const w1 = n.matrix[n.skills.indexOf(a)][n.skills.indexOf(b)];
    if (w0 !== w1) cells++;
  }
  if (cells) out.push(`${cells} transition weight${cells === 1 ? "" : "s"} retuned`);
  const am = n.mods.filter((x) => !p.mods.includes(x)), gm = p.mods.filter((x) => !n.mods.includes(x));
  if (am.length) out.push(`+mods ${am.join(", ")}`);
  if (gm.length) out.push(`−mods ${gm.join(", ")}`);
  return out;
}
