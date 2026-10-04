// engine.js — the whole game as pure functions over one JSON-able state object.
// No DOM, no network, no Math.random: everything is derived from the run's
// seed and the day number, so reloading a day shows the same matters and the
// same dice (you can't re-roll your morning by refreshing), and the save is
// small enough to live in a single PDS record. Every number stored is an
// integer, because atproto records are DAG-CBOR and have no floats.

import {
  MATTERS, STANDING, AUDIT, FEAST_MATTER, FEASTS, POOLS, OMENS, WEATHER, MONTHS, SEASON_LETTER, SEASONS,
  IMPROVEMENTS, NIGHT_LINES, SKILLS,
} from "./content.js";

export const SCHEMA = 1;
export const START_YEAR = 1287;
export const DAYS_PER_MONTH = 28;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * 12;
export const BASE_DICE = 4;
export const MAX_WEARY = 8; // a 0-8 gauge, not a data limit
// The journal rides along in the save record. Records have a size ceiling, so
// the journal is a trailing window; the chronicle (one tiny entry per finished
// manor) and the running totals carry the long view.
export const JOURNAL_KEEP = 60;

// ---- seeded randomness -------------------------------------------------------

export function hash32(...parts) {
  let h = 2166136261;
  for (const ch of parts.join("|")) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return h >>> 0;
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
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fill = (s, slots) => s.replace(/\{(\w+)\}/g, (_, k) => (slots[k] !== undefined ? slots[k] : `{${k}}`));

// ---- calendar ----------------------------------------------------------------

export function dateOf(day) {
  const year = START_YEAR + Math.floor(day / DAYS_PER_YEAR);
  const doy = day % DAYS_PER_YEAR;
  const monthIdx = Math.floor(doy / DAYS_PER_MONTH);
  const dom = (doy % DAYS_PER_MONTH) + 1;
  const season = Math.floor(monthIdx / 3);
  const feast = FEASTS.find((f) => f[0] === monthIdx && f[1] === dom) || null;
  return {
    year, doy, monthIdx, dom, season,
    month: MONTHS[monthIdx],
    seasonName: SEASONS[season],
    letter: SEASON_LETTER[season],
    feast: feast ? { name: feast[2], kind: feast[3] } : null,
    label: `${dom} ${MONTHS[monthIdx]}, ${year}`,
  };
}

// ---- a new run: manor, cast, omen -------------------------------------------------

export function generateManor(seed) {
  const r = rng(hash32("manor", seed));
  const cast = [];
  const used = new Set();
  while (cast.length < 6) {
    const name = `${pick(r, POOLS.given)} ${pick(r, POOLS.byname)}`;
    if (used.has(name)) continue;
    used.add(name);
    cast.push({ name, trade: pick(r, POOLS.trade) });
  }
  return {
    name: `${pick(r, POOLS.manorA)} ${pick(r, POOLS.manorB)}`,
    lord: pick(r, POOLS.lordName),
    reeve: pick(r, POOLS.reeve),
    omen: pick(r, OMENS).id,
    cast,
  };
}

export function newState(seed, carry = {}) {
  const manor = generateManor(seed);
  return {
    v: SCHEMA,
    run: carry.run || 1,
    seed: seed >>> 0,
    manor,
    day: 0,
    coin: 30 + (carry.coin || 0),
    grain: 20,
    favor: 50,
    folk: 50,
    weary: 0,
    skills: carry.skills || { tally: { l: 0, x: 0 }, voice: { l: 0, x: 0 }, eye: { l: 0, x: 0 }, hands: { l: 0, x: 0 } },
    imp: Object.fromEntries(IMPROVEMENTS.map((i) => [i.id, 0])),
    today: { n: BASE_DICE, used: [], done: [] },
    totals: carry.totals || { days: 0, matters: 0, great: 0, setbacks: 0 },
    chronicle: carry.chronicle || [],
    journal: [{ d: 0, t: `You arrive at ${manor.name} as bailiff for ${manor.lord}. ${manor.reeve} hands you a ring of keys, and apologises in advance for several of them.` }],
    seen: 0,
  };
}

export const omenOf = (s) => OMENS.find((o) => o.id === s.manor.omen) || OMENS[0];
export const lordOf = (s) => s.manor.lord;

// ---- derived numbers ----------------------------------------------------------

export const prosperity = (s) => Object.values(s.imp).reduce((a, b) => a + b, 0);
// Coin and grain stakes grow with the estate, so bigger holdings mean bigger days.
export const stakes = (s) => 1 + Math.floor(prosperity(s) / 3);
export const skillBonus = (s, skill) => Math.floor(s.skills[skill].l / 2);
export const skillNeed = (level) => 3 * (level + 1);
export const poolSize = (s) =>
  Math.max(2, BASE_DICE + Math.floor(s.imp.desk / 2) - (s.weary >= 4 ? 1 : 0) - (s.weary >= 7 ? 1 : 0));
export function improvementCost(id, level) {
  const base = IMPROVEMENTS.find((i) => i.id === id).cost;
  return Math.ceil(base * Math.pow(1.55, level));
}
export const idleRate = (s) => 1 + s.imp.mill + s.imp.alehouse + s.imp.bridge; // pence per idle hour

// Risk band tables: effective die value (1-6) -> outcome band
// 0 setback · 1 muddled through · 2 well done · 3 a good day for the manor
export const BAND_TABLE = [
  [1, 2, 2, 2, 3, 3], // calm
  [0, 1, 1, 2, 2, 3], // tense
  [0, 0, 1, 1, 2, 3], // dire
];
export const effective = (die, bonus, push) => clamp(die + bonus + (push ? 1 : 0), 1, 6); // d6 scale
export const bandFor = (risk, eff) => BAND_TABLE[risk][eff - 1];

// ---- the day's plan --------------------------------------------------------------

function slotsFor(s, r) {
  const people = s.manor.cast.slice();
  const draw = () => {
    if (r() < 0.85 && people.length) return people.splice(Math.floor(r() * people.length), 1)[0].name;
    return `${pick(r, POOLS.given)} ${pick(r, POOLS.byname)}`;
  };
  return {
    a: draw(), b: draw(), c: draw(),
    an: pick(r, POOLS.animal), crop: pick(r, POOLS.crop), tool: pick(r, POOLS.tool), place: pick(r, POOLS.place),
    lord: s.manor.lord, reeve: s.manor.reeve,
  };
}

function instantiate(s, tpl, key, slots, extra = {}) {
  const sl = { ...slots, ...extra };
  let risk = tpl.risk;
  if (tpl.id === "ford" && s.imp.bridge > 0) risk = Math.max(0, risk - 1); // the bridge keeps your feet dry
  return {
    key, id: tpl.id, skill: tpl.skill, risk,
    title: fill(tpl.title, sl), text: fill(tpl.text, sl),
    out: tpl.out.map((o) => ({ t: fill(o[0], sl), fx: { c: o[1], g: o[2], l: o[3], f: o[4], w: o[5] } })),
  };
}

export function dayPlan(s) {
  const date = dateOf(s.day);
  const r = rng(hash32("day", s.seed, s.day));
  const [weatherText, weatherTag] = pick(r, WEATHER[date.letter]);
  // The hand size is fixed when the day begins (today.n), so pushing yourself
  // into weariness or building a desk mid-day never reshuffles the dice.
  const diceAll = Array.from({ length: s.today.n }, () => 1 + Math.floor(r() * 6));
  const omen = omenOf(s);
  const slots = slotsFor(s, r);

  const weights = MATTERS.map((t) => {
    if (!t.seasons.includes(date.letter)) return 0;
    let w = 1;
    for (const tag of t.tags) {
      if (omen.tags.includes(tag)) w += 2;
      if (tag === weatherTag) w += 2;
    }
    return w;
  });
  const want = diceAll.length + 1;
  const matters = [];
  const taken = new Set();
  while (matters.length < want) {
    const total = weights.reduce((a, w, i) => a + (taken.has(i) ? 0 : w), 0);
    if (total <= 0) break;
    let x = r() * total, idx = 0;
    for (; idx < MATTERS.length; idx++) {
      if (taken.has(idx)) continue;
      x -= weights[idx];
      if (x < 0) break;
    }
    taken.add(idx);
    matters.push(MATTERS[idx]);
  }
  const list = [];
  if (date.feast) {
    const tpl = date.feast.kind === "quarter" ? AUDIT : FEAST_MATTER;
    list.push(instantiate(s, tpl, "feast", slots, { feast: date.feast.name }));
  }
  matters.forEach((t, i) => list.push(instantiate(s, t, String(i), slots)));
  const standing = STANDING.map((t) => instantiate(s, t, t.id, slots));
  return { date, weatherText, weatherTag, dice: diceAll, matters: list, standing };
}

export const findMatter = (plan, key) => plan.matters.find((m) => m.key === key) || plan.standing.find((m) => m.key === key) || null;
export const isDone = (s, key) => s.today.done.some((d) => d.k === key);
export const diceLeft = (s, plan) => plan.dice.map((v, i) => ({ v, i })).filter((d) => !s.today.used.includes(d.i));

// ---- acting ----------------------------------------------------------------

function note(s, text) {
  s.journal.push({ d: s.day, t: text });
  if (s.journal.length > JOURNAL_KEEP) s.journal.splice(0, s.journal.length - JOURNAL_KEEP);
}

function addXp(s, skill, amount) {
  const sk = s.skills[skill];
  sk.x += amount;
  let up = 0;
  while (sk.x >= skillNeed(sk.l)) {
    sk.x -= skillNeed(sk.l);
    sk.l += 1;
    up += 1;
  }
  return up ? sk.l : 0;
}

// Spend die `dieIdx` (from today's pool) on matter `key`. Returns
// { state, result } or { error }. Pure: the input state is not modified.
export function resolve(state, key, dieIdx, push) {
  const s = structuredClone(state);
  const plan = dayPlan(s);
  const m = findMatter(plan, key);
  if (!m) return { error: "no such matter today" };
  const isStanding = plan.standing.some((x) => x.key === key);
  if (!isStanding && isDone(s, key)) return { error: "that one is already settled" };
  if (!(dieIdx in plan.dice) || s.today.used.includes(dieIdx)) return { error: "that die is spent" };
  if (push && s.weary >= MAX_WEARY) return { error: "you're too worn out to push" };

  const dieVal = plan.dice[dieIdx];
  const bonus = skillBonus(s, m.skill);
  const eff = effective(dieVal, bonus, push);
  const band = bandFor(m.risk, eff);
  const out = m.out[band];
  const k = stakes(s);
  const fx = { c: out.fx.c * k, g: out.fx.g * k, l: out.fx.l, f: out.fx.f, w: out.fx.w + (push ? 1 : 0) };

  s.coin = Math.max(0, s.coin + fx.c);
  s.grain = Math.max(0, s.grain + fx.g);
  s.favor = clamp(s.favor + fx.l, 0, 100); // 0-100 standing meters
  s.folk = clamp(s.folk + fx.f, 0, 100);
  s.weary = clamp(s.weary + fx.w, 0, MAX_WEARY);
  s.today.used.push(dieIdx);
  s.today.done.push({ k: key, d: dieIdx, v: eff, b: band });
  s.totals.matters += 1;
  if (band === 3) s.totals.great += 1;
  if (band === 0) s.totals.setbacks += 1;
  const levelUp = addXp(s, m.skill, band === 3 ? 2 : 1);
  note(s, `${m.title}: ${out.t}`);
  if (levelUp) note(s, `Your ${SKILLS[m.skill].name} grows to ${levelUp}.`);
  return { state: s, result: { band, dieVal, bonus, eff, push: !!push, text: out.t, fx, levelUp: levelUp ? { skill: m.skill, level: levelUp } : null } };
}

// Sunset: the estate does its quiet work, you sleep, the next day is dealt.
export function endDay(state) {
  const s = structuredClone(state);
  const date = dateOf(s.day);
  const omen = omenOf(s);
  const plan = dayPlan(s);
  const lines = [];

  const pence = Math.floor((3 + s.imp.mill * 2 + s.imp.alehouse * 2 + s.imp.bridge * 2) * (60 + s.favor) / 100);
  s.coin += pence;

  const harvestSeason = date.monthIdx >= 5 && date.monthIdx <= 7; // Aug-Oct
  let grain = s.imp.orchard;
  if (harvestSeason) grain += 6 + 2 * s.imp.plough + omen.grain;
  const eats = 1 + (date.season === 3 ? 2 : 0) + Math.floor(prosperity(s) / 4);
  const nextGrain = s.grain + grain - eats;
  if (nextGrain < 0) {
    s.grain = 0;
    s.folk = clamp(s.folk - 1, 0, 100);
    lines.push("The barn is bare and the village goes to bed hungry.");
  } else {
    s.grain = nextGrain;
  }

  // sleep: always one point of rest, plus whatever the common house gives
  s.weary = Math.max(0, s.weary - 1 - Math.floor(s.imp.commons / 2));

  if (s.day % 7 === 6) {
    const kindly = (s.imp.alehouse > 0 ? 1 : 0) + (s.imp.commons > 0 ? 1 : 0);
    if (kindly) {
      s.folk = clamp(s.folk + kindly, 0, 100);
      lines.push("Sunday: the alehouse is loud and the green is full.");
    }
  }

  s.totals.days += 1;
  const night = pick(rng(hash32("night", s.seed, s.day)), NIGHT_LINES[date.letter]);
  note(s, `${night} (+${pence}d from the estate${lines.length ? "; " + lines.join(" ") : ""})`);
  s.day += 1;
  s.today = { n: poolSize(s), used: [], done: [] };
  return { state: s, pence, unused: plan.dice.length - state.today.used.length };
}

export function buy(state, id) {
  const s = structuredClone(state);
  const imp = IMPROVEMENTS.find((i) => i.id === id);
  if (!imp) return { error: "unknown improvement" };
  const cost = improvementCost(id, s.imp[id]);
  if (s.coin < cost) return { error: `needs ${cost}d` };
  s.coin -= cost;
  s.imp[id] += 1;
  note(s, `${imp.name} ${s.imp[id] === 1 ? "built" : "improved to level " + s.imp[id]} for ${cost}d.`);
  return { state: s, cost };
}

export function grainPrice(s) {
  return dateOf(s.day).season === 3 || dateOf(s.day).season === 0 ? 3 : 2; // lean months pay more
}
export function sellGrain(state, n) {
  const s = structuredClone(state);
  n = Math.min(n, s.grain);
  if (n <= 0) return { error: "no grain to sell" };
  const got = n * grainPrice(s);
  s.grain -= n;
  s.coin += got;
  note(s, `Sold ${n} bushels at market for ${got}d.`);
  return { state: s, got, n };
}

// Idle dues: the tenants pay in whether or not you're watching. Hours are
// counted from the last time dues were collected and credited whole; the
// remainder carries over. There's no ceiling: a long absence earns a long ledger.
export function collectDues(state, nowMs) {
  const s = structuredClone(state);
  if (!s.seen) { s.seen = nowMs; return { state: s, hours: 0, pence: 0 }; }
  const hours = Math.floor((nowMs - s.seen) / 3600000);
  if (hours < 1) return { state: s, hours: 0, pence: 0 };
  const pence = hours * idleRate(s);
  s.coin += pence;
  s.seen += hours * 3600000;
  return { state: s, hours, pence };
}

export function retire(state, newSeed) {
  const s = structuredClone(state);
  const date = dateOf(s.day);
  const entry = {
    run: s.run, name: s.manor.name, lord: s.manor.lord, days: s.day, prosperity: prosperity(s),
    coin: s.coin, favor: s.favor, folk: s.folk, ended: date.label,
  };
  const chronicle = [...s.chronicle, entry];
  const next = newState(newSeed, { run: s.run + 1, skills: s.skills, totals: s.totals, chronicle, coin: Math.floor(s.coin / 4) });
  next.journal.unshift({ d: 0, t: `You leave ${s.manor.name} after ${s.day} days, with a bag of good memories and a quarter of your savings.` });
  return next;
}

// ---- helpers for the UI ---------------------------------------------------------

export function previewFor(s, m, die, push) {
  const bonus = skillBonus(s, m.skill);
  const eff = effective(die, bonus, push);
  return { eff, bonus, band: bandFor(m.risk, eff) };
}

export function shareText(s) {
  return `Day ${s.day} as bailiff of ${s.manor.name} (${dateOf(s.day).label}): ${s.coin}d in the strongbox, ${prosperity(s)} improvements, the village is ${s.folk >= 70 ? "fond of me" : s.folk >= 40 ? "tolerating me" : "muttering"}. bailiwick.bisks.net`;
}
