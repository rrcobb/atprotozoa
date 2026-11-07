// game.js — all of inference-clicker's rules, no DOM. The page (index.html)
// owns rendering; this file owns state, costs, production and the random
// events, so tests/game.test.mjs can drive it under node with a seeded rng.

import { CAST, RARITIES, charById, MAX_CHAR_LEVEL } from "./cast.js";

export const VERSION = 2;

// Offline earnings: a product decision, not a safety cap. The page is a PWA you
// close and reopen; eight hours is "a night's sleep or a work day" of idle
// income, and it earns at half rate because nobody is clicking or on call.
export const OFFLINE_CAP_SECONDS = 8 * 3600;
export const OFFLINE_EFFICIENCY = 0.5;

// tps = tokens per second at one unit of the tier.
export const GPUS = [
  { id: "t4", name: "T4", blurb: "16 GB of regret", cost: 15, tps: 0.5 },
  { id: "a10g", name: "A10G", blurb: "the workhorse nobody loves", cost: 100, tps: 4 },
  { id: "l40s", name: "L40S", blurb: "ada lovelace says hi", cost: 1100, tps: 32 },
  { id: "a100", name: "A100 40GB", blurb: "the one everyone trained on", cost: 12e3, tps: 260 },
  { id: "a100x", name: "A100 80GB", blurb: "twice the memory, same attitude", cost: 130e3, tps: 2200 },
  { id: "h100", name: "H100", blurb: "allocation by lottery", cost: 1.4e6, tps: 19e3 },
  { id: "h200", name: "H200", blurb: "an H100 with a bigger tank", cost: 15e6, tps: 165e3 },
  { id: "b200", name: "B200", blurb: "blackwell, liquid cooled", cost: 170e6, tps: 1.5e6 },
  { id: "gb300", name: "GB300 NVL72", blurb: "a rack that weighs a car", cost: 2e9, tps: 14e6 },
  { id: "rubin", name: "Rubin Ultra", blurb: "announced, shipped, already late", cost: 25e9, tps: 140e6 },
];
export const GPU_GROWTH = 1.15;

// weight = share of global demand; fail = chance per second of an incident.
export const REGIONS = [
  { id: "us-east-1", name: "us-east-1", place: "N. Virginia", weight: 1.0, fail: 0.0045, cost: 0 },
  { id: "us-west-2", name: "us-west-2", place: "Oregon", weight: 0.8, fail: 0.003, cost: 2500 },
  { id: "eu-west-1", name: "eu-west-1", place: "Ireland", weight: 0.9, fail: 0.003, cost: 25e3 },
  { id: "ap-northeast-1", name: "ap-northeast-1", place: "Tokyo", weight: 0.9, fail: 0.0035, cost: 250e3 },
  { id: "ap-south-1", name: "ap-south-1", place: "Mumbai", weight: 0.8, fail: 0.006, cost: 2.5e6 },
  { id: "sa-east-1", name: "sa-east-1", place: "São Paulo", weight: 0.6, fail: 0.007, cost: 25e6 },
  { id: "af-south-1", name: "af-south-1", place: "Cape Town", weight: 0.5, fail: 0.009, cost: 250e6 },
  { id: "me-central-1", name: "me-central-1", place: "UAE", weight: 0.5, fail: 0.005, cost: 2.5e9 },
];
export const MAX_REPLICAS = 4;
export const COVERAGE_PER_REGION = 0.12; // extra demand reached per additional region
export const BASE_FAILOVER = 0.6; // chance one replica takes over a failing region

export const UPGRADES = [
  { id: "batching", group: "serving", name: "continuous batching", desc: "each click serves twice as many prompts", cost: 50, growth: 4, max: 12 },
  { id: "kvcache", group: "serving", name: "paged KV cache", desc: "+20% tokens/s per level", cost: 500, growth: 3, max: 15 },
  { id: "spec", group: "serving", name: "speculative decoding", desc: "×1.15 tokens/s per level", cost: 5e3, growth: 3.5, max: 15 },
  { id: "quant", group: "serving", name: "int4 quantization", desc: "×1.25 tokens/s per level", cost: 5e4, growth: 4, max: 10 },
  { id: "lb", group: "reliability", name: "smarter load balancer", desc: "+7% chance a replica takes over a failing region", cost: 2e3, growth: 5, max: 5 },
  { id: "oncall", group: "reliability", name: "on-call rotation", desc: "outages last 20% shorter per level", cost: 1e3, growth: 4, max: 6 },
  { id: "data", group: "research", name: "data curation", desc: "raises both ends of a new model's quality roll", cost: 2e4, growth: 3.5, max: 10 },
  { id: "evals", group: "research", name: "eval harness", desc: "auto-serve picks the best of the latest model and N previous", cost: 1e4, growth: 6, max: 5 },
  { id: "cluster", group: "research", name: "training cluster", desc: "training runs 20% faster per level", cost: 5e4, growth: 4, max: 8 },
];

const MODEL_NAMES = ["seed", "sprout", "lumen", "atlas", "cirrus", "orion", "nimbus", "vega", "helix", "quasar", "zenith", "apex", "onyx", "vertex", "halcyon", "meridian"];

export function modelName(gen) {
  return `${MODEL_NAMES[gen % MODEL_NAMES.length]}-${gen}`;
}

export function newState(now = Date.now()) {
  return {
    v: VERSION,
    tokens: 0,
    lifetime: 0,
    clicks: 0,
    savedAt: now,
    gpus: {},
    regions: { "us-east-1": { replicas: 0 } },
    upgrades: {},
    models: [{ id: "m0", gen: 0, name: modelName(0), q: 1 }],
    serving: "auto",
    training: null, // { gen, remaining, total }
    nextGen: 1,
    down: {}, // regionId -> seconds of outage left
    boost: 0, // seconds of viral demand left
    stats: { outages: 0, failovers: 0, viral: 0, regressions: 0 },
    ng: 0, // completed NG+ cycles
    chars: {}, // cast id -> copies pulled
    pulls: 0,
    pity: { sr: 0, ssr: 0 }, // pulls since the last epic-or-better / legendary
    ach: {}, // achievement id -> unlock time (ms)
  };
}

// Tolerant of saves from older/newer builds and of a hand-edited record.
export function loadState(raw, now = Date.now()) {
  const base = newState(now);
  let o;
  try { o = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return base; }
  if (!o || typeof o !== "object") return base;
  const num = (x, d) => (Number.isFinite(x) ? x : d);
  const s = { ...base };
  s.tokens = Math.max(0, num(o.tokens, 0));
  s.lifetime = Math.max(s.tokens, num(o.lifetime, 0));
  s.clicks = Math.max(0, num(o.clicks, 0));
  s.savedAt = num(o.savedAt, now);
  s.gpus = {};
  for (const g of GPUS) if (o.gpus && o.gpus[g.id] > 0) s.gpus[g.id] = Math.floor(o.gpus[g.id]);
  s.regions = {};
  for (const r of REGIONS) if (o.regions && o.regions[r.id]) s.regions[r.id] = { replicas: Math.min(MAX_REPLICAS, Math.max(0, Math.floor(num(o.regions[r.id].replicas, 0)))) };
  if (!s.regions["us-east-1"]) s.regions["us-east-1"] = { replicas: 0 };
  s.upgrades = {};
  for (const u of UPGRADES) if (o.upgrades && o.upgrades[u.id] > 0) s.upgrades[u.id] = Math.min(u.max, Math.floor(o.upgrades[u.id]));
  const models = Array.isArray(o.models) ? o.models.filter((m) => m && Number.isFinite(m.q) && Number.isFinite(m.gen)).map((m) => ({ id: String(m.id), gen: m.gen, name: String(m.name || modelName(m.gen)), q: m.q })) : [];
  s.models = models.length ? models : base.models;
  s.serving = typeof o.serving === "string" ? o.serving : "auto";
  s.nextGen = Math.max(num(o.nextGen, 1), Math.max(...s.models.map((m) => m.gen)) + 1);
  const t = o.training;
  s.training = t && Number.isFinite(t.remaining) && Number.isFinite(t.total) && Number.isFinite(t.gen) ? { gen: t.gen, remaining: t.remaining, total: t.total } : null;
  s.down = {};
  s.boost = 0;
  s.stats = { outages: num(o.stats?.outages, 0), failovers: num(o.stats?.failovers, 0), viral: num(o.stats?.viral, 0), regressions: num(o.stats?.regressions, 0) };
  s.ng = Math.max(0, Math.floor(num(o.ng, 0)));
  s.chars = {};
  for (const c of CAST) if (o.chars && o.chars[c.id] > 0) s.chars[c.id] = Math.floor(o.chars[c.id]);
  s.pulls = Math.max(0, Math.floor(num(o.pulls, 0)));
  s.pity = { sr: Math.max(0, Math.floor(num(o.pity?.sr, 0))), ssr: Math.max(0, Math.floor(num(o.pity?.ssr, 0))) };
  s.ach = {};
  for (const a of ACHIEVEMENTS) if (o.ach && Number.isFinite(o.ach[a.id])) s.ach[a.id] = o.ach[a.id];
  return s;
}

export const level = (s, id) => s.upgrades[id] || 0;
export const owned = (s, id) => s.gpus[id] || 0;

// --- cast perks, achievements and NG+ ------------------------------------------

export const charLevel = (s, id) => Math.min(MAX_CHAR_LEVEL, s.chars[id] || 0);
// Sum of one perk over everything pulled, level-scaled.
export function castSum(s, key) {
  let t = 0;
  for (const c of CAST) if (c.perk[key]) t += c.perk[key] * charLevel(s, c.id);
  return t;
}
export const achCount = (s) => Object.keys(s.ach).length;
export const achMult = (s) => 1 + 0.01 * achCount(s); // +1% tokens/s per trophy
export const ngMult = (s) => 1 + s.ng; // NG+: ×2, ×3, ... tokens/s and click power
export const ngCostMult = (s) => 1 + 0.25 * s.ng; // ...and everything costs more
export const ngOutageMult = (s) => 1 + 0.3 * s.ng; // ...and the regions are flakier
export const failMult = (s) => Math.max(0.25, 1 + castSum(s, "fail")) * ngOutageMult(s);

export function gpuCost(s, g) {
  return Math.ceil(g.cost * ngCostMult(s) * Math.pow(GPU_GROWTH, owned(s, g.id)));
}
export function upgradeCost(s, u) {
  return Math.ceil(u.cost * ngCostMult(s) * Math.pow(u.growth, level(s, u.id)));
}
export function replicaCost(s, r) {
  const have = s.regions[r.id]?.replicas || 0;
  return Math.ceil(Math.max(500, r.cost * 0.1) * ngCostMult(s) * Math.pow(4, have));
}
export function trainingCost(gen, s) {
  return Math.ceil(3000 * (s ? ngCostMult(s) : 1) * Math.pow(4, gen - 1));
}
export function trainingSeconds(s, gen) {
  const speed = Math.max(0.25, 1 + castSum(s, "train"));
  return (30 * Math.pow(1.25, gen - 1) * Math.pow(0.8, level(s, "cluster"))) / speed;
}
export const trend = (gen) => 1 + 0.5 * gen;
export function qualityRange(s) {
  const d = level(s, "data");
  return [0.7 + 0.05 * d, 1.15 + 0.03 * d];
}
export const failoverChance = (s) => Math.min(0.95, BASE_FAILOVER + 0.07 * level(s, "lb"));

export function servingModel(s) {
  const latest = s.models[s.models.length - 1];
  if (s.serving !== "auto") return s.models.find((m) => m.id === s.serving) || latest;
  const pool = s.models.slice(-(level(s, "evals") + 1));
  return pool.reduce((best, m) => (m.q >= best.q ? m : best), pool[0]);
}

export function availability(s) {
  let all = 0, up = 0;
  for (const r of REGIONS) {
    if (!s.regions[r.id]) continue;
    all += r.weight;
    if (!(s.down[r.id] > 0)) up += r.weight;
  }
  return all ? up / all : 0;
}

export function rawCapacity(s) {
  let t = 0;
  for (const g of GPUS) t += owned(s, g.id) * g.tps;
  return t;
}

export function globalMult(s) {
  return ngMult(s) * achMult(s) * (1 + castSum(s, "tps")) * (1 + 0.2 * level(s, "kvcache")) * Math.pow(1.15, level(s, "spec")) * Math.pow(1.25, level(s, "quant"));
}

export function coverage(s) {
  return 1 + COVERAGE_PER_REGION * (Object.keys(s.regions).length - 1);
}

// tokens/second right now, with outages, training drain and viral boost applied.
export function tps(s, { ignoreEvents = false } = {}) {
  let t = rawCapacity(s) * servingModel(s).q * globalMult(s) * coverage(s);
  if (!ignoreEvents) {
    t *= availability(s);
    if (s.training) t *= 0.7; // a slice of the fleet is busy training
    if (s.boost > 0) t *= 2.5;
  }
  return t;
}

export function clickPower(s) {
  return Math.pow(2, level(s, "batching")) * servingModel(s).q * (1 + 0.2 * level(s, "kvcache")) * ngMult(s) * (1 + castSum(s, "click")) + 0.05 * tps(s);
}

export function click(s) {
  const p = clickPower(s);
  s.tokens += p;
  s.lifetime += p;
  s.clicks++;
  return p;
}

function spend(s, c) {
  if (s.tokens < c) return false;
  s.tokens -= c;
  return true;
}

export function buyGpu(s, id) {
  const g = GPUS.find((x) => x.id === id);
  if (!g || !spend(s, gpuCost(s, g))) return false;
  s.gpus[id] = owned(s, id) + 1;
  return true;
}
export function buyUpgrade(s, id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || level(s, id) >= u.max || !spend(s, upgradeCost(s, u))) return false;
  s.upgrades[id] = level(s, id) + 1;
  return true;
}
export function buyRegion(s, id) {
  const r = REGIONS.find((x) => x.id === id);
  if (!r || s.regions[id] || !spend(s, Math.ceil(r.cost * ngCostMult(s)))) return false;
  s.regions[id] = { replicas: 0 };
  return true;
}
export function buyReplica(s, id) {
  const r = REGIONS.find((x) => x.id === id);
  const reg = s.regions[id];
  if (!r || !reg || reg.replicas >= MAX_REPLICAS || !spend(s, replicaCost(s, r))) return false;
  reg.replicas++;
  return true;
}
export function startTraining(s) {
  if (s.training) return false;
  const gen = s.nextGen;
  if (!spend(s, trainingCost(gen, s))) return false;
  const total = trainingSeconds(s, gen);
  s.training = { gen, remaining: total, total };
  return true;
}
export function setServing(s, id) {
  if (id !== "auto" && !s.models.some((m) => m.id === id)) return false;
  s.serving = id;
  return true;
}

function finishTraining(s, rng) {
  const { gen } = s.training;
  const [lo, hi] = qualityRange(s);
  const q = Math.round(trend(gen) * (lo + rng() * (hi - lo)) * 100) / 100;
  const prevBest = Math.max(...s.models.map((m) => m.q));
  const prevLatest = s.models[s.models.length - 1];
  const m = { id: `m${gen}`, gen, name: modelName(gen), q };
  s.models.push(m);
  s.nextGen = gen + 1;
  s.training = null;
  if (q < prevLatest.q) s.stats.regressions++;
  const verdict = q < prevLatest.q ? "worse than the last one. it happens." : q > prevBest ? "a new best." : "better than the last one, short of the best.";
  return { kind: q < prevLatest.q ? "bad" : "good", text: `${m.name} finished training: ${q.toFixed(2)}× — ${verdict}` };
}

// Advance the simulation by dt seconds (callers pass ≤ ~1). Returns log events.
export function step(s, dt, rng = Math.random) {
  const events = [];
  for (const r of REGIONS) {
    const reg = s.regions[r.id];
    if (!reg) continue;
    if (s.down[r.id] > 0) {
      s.down[r.id] -= dt;
      if (s.down[r.id] <= 0) {
        delete s.down[r.id];
        events.push({ kind: "good", text: `${r.name} (${r.place}) is back.` });
      }
      continue;
    }
    if (rng() < r.fail * dt * failMult(s)) {
      let absorbed = false;
      for (let i = 0; i < reg.replicas && !absorbed; i++) absorbed = rng() < failoverChance(s);
      if (absorbed) {
        s.stats.failovers++;
        events.push({ kind: "good", text: `${r.name} fell over; a replica took the traffic. nobody noticed.` });
      } else {
        const secs = (15 + rng() * 30) * Math.pow(0.8, level(s, "oncall"));
        s.down[r.id] = secs;
        s.stats.outages++;
        events.push({ kind: "bad", text: `${r.name} (${r.place}) is down for ~${Math.ceil(secs)}s${reg.replicas ? " — every replica failed to take over" : " — no replicas"}.` });
      }
    }
  }
  if (s.boost > 0) {
    s.boost -= dt;
    if (s.boost <= 0) events.push({ kind: "info", text: "the viral post cooled off." });
  } else if (tps(s, { ignoreEvents: true }) > 0 && rng() < (dt / 240) * (1 + castSum(s, "viral"))) {
    s.boost = 20;
    s.stats.viral++;
    events.push({ kind: "good", text: "someone quote-posted you. demand ×2.5 for 20s." });
  }
  const earned = tps(s) * dt;
  s.tokens += earned;
  s.lifetime += earned;
  if (s.training) {
    s.training.remaining -= dt;
    if (s.training.remaining <= 0) events.push(finishTraining(s, rng));
  }
  events.push(...checkAchievements(s));
  return events;
}

// Catch up after the tab was closed. Returns { gained, seconds, events }.
export function offline(s, seconds, rng = Math.random) {
  const secs = Math.max(0, Math.min(seconds, OFFLINE_CAP_SECONDS));
  s.down = {};
  s.boost = 0;
  const events = [];
  if (s.training && secs >= s.training.remaining) {
    events.push(finishTraining(s, rng));
  } else if (s.training) {
    s.training.remaining -= secs;
  }
  const gained = tps(s, { ignoreEvents: true }) * secs * OFFLINE_EFFICIENCY;
  s.tokens += gained;
  s.lifetime += gained;
  events.push(...checkAchievements(s));
  return { gained, seconds: secs, events };
}

const SUFFIX = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
export function fmt(n) {
  if (!Number.isFinite(n)) return "∞";
  if (n < 0) return "-" + fmt(-n);
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(2) : n < 100 && n % 1 ? n.toFixed(1) : String(Math.floor(n));
  const i = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(n) / 3));
  const v = n / Math.pow(1000, i);
  return (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0)) + SUFFIX[i];
}

// The PDS record. atproto records can't hold floats (DAG-CBOR), so the game
// state travels as one JSON string next to two integers for display.
export const COLLECTION = "net.bisks.inferenceclicker.save";
export function toRecord(s, now = Date.now()) {
  s.savedAt = now;
  return {
    $type: COLLECTION,
    version: VERSION,
    savedAt: new Date(now).toISOString(),
    lifetimeTokens: Math.min(Number.MAX_SAFE_INTEGER, Math.floor(s.lifetime)), // integer-only, clamped to a safe int
    models: s.models.length,
    ng: s.ng,
    data: JSON.stringify(s),
  };
}
// "Furthest along": an NG+ cycle outranks any amount of lifetime in an earlier one.
export const progress = (s) => s.ng * 1e18 + s.lifetime;
export function fromRecord(rec) {
  if (!rec || typeof rec.data !== "string") return null;
  return loadState(rec.data);
}

// --- gacha ------------------------------------------------------------------------

// Priced as ~15 minutes of current output (500 floor), so a pull stays a
// meaningful spend at every stage of the game. A ten-pull is nine pulls' price.
export const PULL_SECONDS = 900;
export const PULL_MIN_COST = 500;
export const SR_PITY = 10; // an epic or better at least this often
export const SSR_PITY = 60; // a legendary at least this often
export function pullCost(s, n = 1) {
  const one = Math.ceil(Math.max(PULL_MIN_COST, tps(s, { ignoreEvents: true }) * PULL_SECONDS));
  return n >= 10 ? one * 9 : one * n;
}

function pickWeighted(pool, rng) {
  const total = pool.reduce((t, r) => t + r.weight, 0);
  let x = rng() * total;
  for (const r of pool) { x -= r.weight; if (x < 0) return r; }
  return pool[pool.length - 1];
}

function rollOne(s, rng) {
  s.pity.sr++;
  s.pity.ssr++;
  let r;
  if (s.pity.ssr >= SSR_PITY) r = RARITIES[3];
  else if (s.pity.sr >= SR_PITY) r = pickWeighted(RARITIES.slice(2), rng);
  else r = pickWeighted(RARITIES, rng);
  if (r.id === "SSR") s.pity.ssr = 0;
  if (r.id === "SR" || r.id === "SSR") s.pity.sr = 0;
  const pool = CAST.filter((c) => c.rarity === r.id);
  const c = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  const had = s.chars[c.id] || 0;
  s.chars[c.id] = had + 1;
  s.pulls++;
  return { id: c.id, isNew: had === 0, level: Math.min(MAX_CHAR_LEVEL, had + 1), maxed: had >= MAX_CHAR_LEVEL };
}

// Returns the results, or null when it can't be afforded.
export function pull(s, n = 1, rng = Math.random) {
  const cost = pullCost(s, n);
  if (!spend(s, cost)) return null;
  const out = [];
  for (let i = 0; i < n; i++) out.push(rollOne(s, rng));
  return out;
}

// --- NG+ ----------------------------------------------------------------------------

// Reachable around the GB300 era: a product decision about when a run has told its story.
export const NG_THRESHOLD = 5e9;
export const ngReady = (s) => s.lifetime >= NG_THRESHOLD;

// Wipe the company, keep the people: cast, pity, trophies and lifetime stats carry over.
export function ngPlus(s, now = Date.now()) {
  if (!ngReady(s)) return false;
  const fresh = newState(now);
  fresh.ng = s.ng + 1;
  fresh.chars = s.chars;
  fresh.pulls = s.pulls;
  fresh.pity = s.pity;
  fresh.ach = s.ach;
  fresh.stats = s.stats;
  Object.assign(s, fresh);
  return true;
}

// --- achievements -------------------------------------------------------------------

const gpuTotal = (s) => GPUS.reduce((n, g) => n + owned(s, g.id), 0);
const castOwned = (s, f = () => true) => CAST.filter((c) => s.chars[c.id] && f(c)).length;

export const ACHIEVEMENTS = [
  { id: "coldstart", name: "cold start", desc: "serve your first prompt", test: (s) => s.clicks >= 1 },
  { id: "clicks100", name: "carpal tunnel", desc: "100 clicks", test: (s) => s.clicks >= 100 },
  { id: "clicks1000", name: "repetitive strain inference", desc: "1,000 clicks", test: (s) => s.clicks >= 1000 },
  { id: "wcdonalds", name: "wcdonalds", desc: "rack your first GPU. it's wearing a disguise. nothing to see here", test: (s) => gpuTotal(s) >= 1 },
  { id: "fleet10", name: "a small fleet", desc: "10 GPUs", test: (s) => gpuTotal(s) >= 10 },
  { id: "fleet100", name: "hyperscaler-adjacent", desc: "100 GPUs", test: (s) => gpuTotal(s) >= 100 },
  { id: "h100", name: "won the lottery", desc: "get an H100 allocation", test: (s) => owned(s, "h100") >= 1 },
  { id: "rubin", name: "already late", desc: "rack a Rubin Ultra", test: (s) => owned(s, "rubin") >= 1 },
  { id: "served1k", name: "kilotoken", desc: "serve 1,000 tokens", test: (s) => s.lifetime >= 1e3 },
  { id: "served1m", name: "megatoken", desc: "serve a million tokens", test: (s) => s.lifetime >= 1e6 },
  { id: "served1b", name: "gigatoken", desc: "serve a billion tokens", test: (s) => s.lifetime >= 1e9 },
  { id: "served1t", name: "teratoken", desc: "serve a trillion tokens", test: (s) => s.lifetime >= 1e12 },
  { id: "region3", name: "multi-region", desc: "operate in three regions", test: (s) => Object.keys(s.regions).length >= 3 },
  { id: "regionall", name: "follow the sun", desc: "open every region", test: (s) => REGIONS.every((r) => s.regions[r.id]) },
  { id: "replicas", name: "belt and suspenders", desc: "fully replicate a region", test: (s) => Object.values(s.regions).some((r) => r.replicas >= MAX_REPLICAS) },
  { id: "outage10", name: "five nines, spiritually", desc: "suffer 10 outages", test: (s) => s.stats.outages >= 10 },
  { id: "outage50", name: "post-mortem enjoyer", desc: "suffer 50 outages", test: (s) => s.stats.outages >= 50 },
  { id: "failover5", name: "nobody noticed", desc: "5 failovers", test: (s) => s.stats.failovers >= 5 },
  { id: "viral3", name: "main character", desc: "go viral 3 times", test: (s) => s.stats.viral >= 3 },
  { id: "regress", name: "it happens", desc: "train a model that's worse than the last", test: (s) => s.stats.regressions >= 1 },
  { id: "zoo", name: "model zoo", desc: "train five models", test: (s) => s.models.length >= 6 },
  { id: "maxed", name: "maxed out", desc: "max any upgrade", test: (s) => UPGRADES.some((u) => level(s, u.id) >= u.max) },
  { id: "pull1", name: "gacha-curious", desc: "make your first pull", test: (s) => s.pulls >= 1 },
  { id: "pull50", name: "whale-adjacent", desc: "50 pulls", test: (s) => s.pulls >= 50 },
  { id: "legend", name: "legendary hire", desc: "pull a legendary", test: (s) => castOwned(s, (c) => c.rarity === "SSR") >= 1 },
  { id: "baddie", name: "bad crowd", desc: "pull a baddie", test: (s) => castOwned(s, (c) => c.bad) >= 1 },
  { id: "villain", name: "villain origin story", desc: "have three baddies on payroll", test: (s) => castOwned(s, (c) => c.bad) >= 3 },
  { id: "dupe", name: "constellations", desc: "pull the same person five times", test: (s) => CAST.some((c) => (s.chars[c.id] || 0) >= MAX_CHAR_LEVEL) },
  { id: "roster", name: "gotta pull 'em all", desc: "complete the roster", test: (s) => castOwned(s) >= CAST.length },
  { id: "ng1", name: "new game plus", desc: "start NG+", test: (s) => s.ng >= 1 },
  { id: "ng3", name: "groundhog day", desc: "start NG+3", test: (s) => s.ng >= 3 },
];

// Returns log events for anything newly unlocked.
export function checkAchievements(s, now = Date.now()) {
  const events = [];
  for (const a of ACHIEVEMENTS) {
    if (s.ach[a.id] || !a.test(s)) continue;
    s.ach[a.id] = now;
    events.push({ kind: "info", text: `🏆 achievement: ${a.name} (+1% tokens/s)` });
  }
  return events;
}
