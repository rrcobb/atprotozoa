// undergrow game rules — pure functions, no DOM, so tests can run them in node.

export const MAX_ENERGY = 10;
export const START_PLOTS = 8;
export const MAX_PLOTS = 24;

export const CROPS = {
  moss:   { name: "gutter moss",  icon: "🌿", seed: 3,  days: 2, sell: 9 },
  glow:   { name: "glowcap",      icon: "🍄", seed: 8,  days: 3, sell: 24 },
  bean:   { name: "pipe bean",    icon: "🫘", seed: 12, days: 4, sell: 38 },
  cheese: { name: "cheese bulb",  icon: "🧀", seed: 22, days: 5, sell: 66 },
  hollow: { name: "hollowroot",   icon: "🕳️", seed: 0,  days: 6, sell: 0, noSell: true },
};

export const NPCS = {
  pidge: { name: "Pidge",        kind: "pigeon",  icon: "🐦", where: "market", loves: "glow",   likes: ["bean"] },
  volt:  { name: "Volt",         kind: "raccoon", icon: "🦝", where: "wires",  loves: "bean",   likes: ["cheese"] },
  kess:  { name: "Kess",         kind: "crow",    icon: "🐦‍⬛", where: "market", loves: "cheese", likes: ["glow"] },
  tux:   { name: "Madame Tux",   kind: "cat",     icon: "🐈‍⬛", where: "stoop",  loves: "moss",   likes: ["glow"] },
  skit:  { name: "Brother Skitter", kind: "roach", icon: "🪳", where: "drain", loves: "hollow", likes: ["moss"] },
};

export const UPGRADES = {
  drip:   { name: "drip rig",       cost: 120, text: "watering is free: every planted plot is watered when you sleep." },
  plots:  { name: "extra planter row", cost: 90, text: "+4 plots (up to 24).", repeat: true },
  tonic:  { name: "battery tonic",  cost: 180, text: "+2 max energy, forever." },
  lamp:   { name: "grow lamp",      cost: 260, text: "crops ripen a day sooner (min 1)." },
};

export function newState() {
  return {
    v: 1, day: 1, coins: 20, energy: MAX_ENERGY, maxEnergy: MAX_ENERGY,
    seeds: { moss: 4 }, crops: {}, caps: 0, tool: "till",
    plots: Array.from({ length: START_PLOTS }, () => ({ tilled: false, crop: null, age: 0, watered: false })),
    friend: {}, talked: {}, gifted: {},
    up: { drip: false, tonic: false, lamp: false },
    cult: { stage: 0, offered: false, hollowDay: null, joined: false },
    stats: { harvested: 0, earned: 0, foraged: 0 },
    log: [],
  };
}

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
export const countCrops = (s) => sum(s.crops);

export function growDays(s, key) {
  const d = CROPS[key].days - (s.up.lamp ? 1 : 0);
  return Math.max(1, d);
}
export function ripe(s, plot) { return !!plot.crop && plot.age >= growDays(s, plot.crop); }

export function spend(s, n) { if (s.energy < n) return false; s.energy -= n; return true; }

export function actOnPlot(s, i, rng = Math.random) {
  const p = s.plots[i];
  if (!p) return { ok: false, msg: "no such plot." };
  const tool = s.tool;
  if (tool === "till") {
    if (p.tilled) return { ok: false, msg: "already tilled." };
    if (!spend(s, 1)) return { ok: false, msg: "too tired. sleep." };
    p.tilled = true; return { ok: true, msg: "turned the grit into something soft-ish." };
  }
  if (tool === "water") {
    if (!p.crop) return { ok: false, msg: "nothing planted there." };
    if (p.watered) return { ok: false, msg: "already damp." };
    if (!spend(s, 1)) return { ok: false, msg: "too tired. sleep." };
    p.watered = true; return { ok: true, msg: "a little condensate, a lot of hope." };
  }
  if (tool === "harvest") {
    if (!p.crop || !ripe(s, p)) return { ok: false, msg: "nothing ripe here." };
    if (!spend(s, 1)) return { ok: false, msg: "too tired. sleep." };
    const k = p.crop;
    s.crops[k] = (s.crops[k] || 0) + 1;
    s.stats.harvested++;
    let bonus = "";
    if (k !== "hollow" && rng() < 0.15) { s.crops[k]++; s.stats.harvested++; bonus = " (a bonus one, too!)"; }
    p.crop = null; p.age = 0; p.watered = false; p.tilled = true;
    return { ok: true, msg: `picked ${CROPS[k].name}${bonus}.` };
  }
  // otherwise tool is a seed key
  const k = tool;
  if (!CROPS[k]) return { ok: false, msg: "pick a tool." };
  if (!p.tilled) return { ok: false, msg: "till it first." };
  if (p.crop) return { ok: false, msg: "something's already growing." };
  if (!(s.seeds[k] > 0)) return { ok: false, msg: `out of ${CROPS[k].name} seeds.` };
  if (!spend(s, 1)) return { ok: false, msg: "too tired. sleep." };
  s.seeds[k]--; p.crop = k; p.age = 0; p.watered = false;
  return { ok: true, msg: `tucked in a ${CROPS[k].name}.` };
}

export const isSixthNight = (day) => day % 6 === 0;

export function priceOf(s, key, day = s.day) {
  const base = CROPS[key].sell;
  // deterministic wobble so the market moves but reloading can't reroll it
  const wob = 0.85 + (((day * 7 + key.length * 13) % 11) / 10) * 0.35;
  const cult = s.cult.joined ? 1.1 : 1;
  return Math.max(1, Math.round(base * wob * cult));
}

export function sellAll(s) {
  let total = 0, n = 0;
  for (const k of Object.keys(s.crops)) {
    if (CROPS[k].noSell || !s.crops[k]) continue;
    total += priceOf(s, k) * s.crops[k]; n += s.crops[k]; s.crops[k] = 0;
  }
  s.coins += total; s.stats.earned += total;
  return { total, n };
}

export function buySeed(s, key) {
  const c = CROPS[key];
  if (!c || c.noSell && !c.seed) return false;
  if (s.coins < c.seed) return false;
  s.coins -= c.seed; s.seeds[key] = (s.seeds[key] || 0) + 1; return true;
}

export function upgradeCost(s, key) {
  const u = UPGRADES[key];
  if (key === "plots") return u.cost + (s.plots.length - START_PLOTS) / 4 * 40;
  return u.cost;
}
export function canUpgrade(s, key) {
  if (key === "plots") return s.plots.length < MAX_PLOTS;
  return !s.up[key];
}
export function buyUpgrade(s, key) {
  if (!canUpgrade(s, key) || s.coins < upgradeCost(s, key)) return false;
  s.coins -= upgradeCost(s, key);
  if (key === "plots") for (let i = 0; i < 4; i++) s.plots.push({ tilled: false, crop: null, age: 0, watered: false });
  else s.up[key] = true;
  if (key === "tonic") s.maxEnergy += 2;
  return true;
}

export function hearts(s, id) { return Math.min(5, Math.floor((s.friend[id] || 0) / 10)); }

export function giftTo(s, id, crop) {
  const n = NPCS[id];
  if (s.gifted[id]) return { ok: false, msg: "they already got a gift today." };
  if (!(s.crops[crop] > 0)) return { ok: false, msg: "you don't have that." };
  s.crops[crop]--; s.gifted[id] = true;
  const pts = n.loves === crop ? 8 : n.likes.includes(crop) ? 5 : 2;
  s.friend[id] = (s.friend[id] || 0) + pts;
  return { ok: true, pts, tier: pts >= 8 ? "love" : pts >= 5 ? "like" : "meh" };
}

export function talk(s, id) {
  if (s.talked[id]) return false;
  s.talked[id] = true; s.friend[id] = (s.friend[id] || 0) + 2; return true;
}

// Dumpster diving. Hex-stamped bottlecaps only turn up from day 3, and only
// three are needed — they're what puts the Sixth House on your radar.
export function forage(s, rng = Math.random) {
  if (!spend(s, 1)) return { ok: false, msg: "too tired. sleep." };
  s.stats.foraged++;
  const r = rng();
  if (s.day >= 3 && s.caps < 3 && r < 0.14) {
    s.caps++;
    return { ok: true, kind: "cap", msg: `a bottlecap stamped with a six-sided sigil. (${s.caps}/3) it's warm.` };
  }
  if (r < 0.45) { const c = 1 + Math.floor(rng() * 5); s.coins += c; return { ok: true, kind: "coin", msg: `${c} loose credits between the cushions of a dumpster.` }; }
  if (r < 0.75) { s.seeds.moss = (s.seeds.moss || 0) + 1; return { ok: true, kind: "seed", msg: "a wrinkled packet of gutter moss spores." }; }
  if (r < 0.88) { s.seeds.glow = (s.seeds.glow || 0) + 1; return { ok: true, kind: "seed", msg: "a glowcap spore, still faintly lit." }; }
  return { ok: true, kind: "junk", msg: "nothing but a cold noodle. you eat it anyway." };
}

export function checkCultStage(s) {
  if (s.cult.stage === 0 && s.caps >= 3) { s.cult.stage = 1; return "the caps hum when you hold them together. somewhere low, a drain grate clicks open."; }
  return null;
}

// Stage 1 -> 2: bring six gutter moss to the drain.
export function offerMoss(s) {
  if (s.cult.stage !== 1) return { ok: false, msg: "" };
  if ((s.crops.moss || 0) < 6) return { ok: false, msg: "Skitter counts your moss. \"six,\" he says. \"always six.\"" };
  s.crops.moss -= 6; s.cult.stage = 2; s.seeds.hollow = (s.seeds.hollow || 0) + 1;
  return { ok: true, msg: "Skitter presses a seed into your paw. it is cold and very, very dark. hollowroot." };
}

// Stage 2 -> 3: offer a ripe hollowroot on a Sixth Night.
export function offerHollow(s) {
  if (s.cult.stage !== 2) return { ok: false, msg: "" };
  if (!(s.crops.hollow > 0)) return { ok: false, msg: "\"grow it,\" says Skitter. \"six days in the dark. bring it back.\"" };
  if (!isSixthNight(s.day)) return { ok: false, msg: "\"not tonight. the house only opens on a sixth night.\"" };
  s.crops.hollow--; s.cult.stage = 3; s.cult.joined = true;
  return { ok: true, msg: "the grate opens all the way. you are the Sixth Hand now." };
}

export function endDay(s, rng = Math.random) {
  const rain = rng() < 0.2;
  let grown = 0, dry = 0;
  for (const p of s.plots) {
    if (!p.crop) { p.watered = false; continue; }
    if (p.watered || s.up.drip || rain) { p.age++; grown++; } else dry++;
    p.watered = false;
  }
  s.day++; s.energy = s.maxEnergy; s.talked = {}; s.gifted = {};
  return { rain, grown, dry };
}
