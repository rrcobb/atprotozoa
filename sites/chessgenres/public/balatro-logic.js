// Pure rules for Chess Balatro — no DOM, so tests can import it.
// Your deck is a full chess set (32 pieces) that you reshape all run long.
// Play up to 5 pieces as a "hand": (base chips + piece chips) x mult, then
// jokers tweak it in order. Win blinds to earn money, spend it in the shop on
// jokers, hand-type upgrades and deck surgery. Eight antes, then endless.
export const HAND_SIZE = 8;
export const MAX_PLAY = 5;
export const HANDS = 4;
export const DISCARDS = 3;
// Slot caps keep every purchase a choice instead of "buy everything".
export const MAX_JOKERS = 5;
export const MAX_ITEMS = 2;
export const ANTES = 8;
export const START_MONEY = 4;
export const BLIND_REWARD = [3, 4, 5];
// Interest is $1 per $5 banked, capped so hoarding can't outrun spending forever.
export const INTEREST_CAP = 5;

export const CHIPS = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 4 };
export const GLYPH = { // outline glyphs for white, solid for black
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};
export const NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const LADDER = ["p", "n", "b", "r", "q"]; // what "promote" climbs

// ---- seeded randomness -------------------------------------------------
export function hashSeed(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function makeRng(seed) {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newDeck() {
  const d = [];
  let id = 0;
  for (const col of ["w", "b"]) {
    for (let i = 0; i < 8; i++) d.push({ id: id++, t: "p", col });
    for (const t of ["n", "n", "b", "b", "r", "r", "q", "k"]) d.push({ id: id++, t, col });
  }
  return d;
}

export function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const HAND_TYPES = {
  "five of a kind":  { chips: 140, mult: 14 },
  "five pawns":      { chips: 120, mult: 12 },
  "royal back rank": { chips: 100, mult: 8 },
  "four of a kind":  { chips: 60,  mult: 7 },
  "full house":      { chips: 40,  mult: 4 },
  "flush":           { chips: 35,  mult: 4 },
  "back rank":       { chips: 30,  mult: 4 },
  "three of a kind": { chips: 30,  mult: 3 },
  "two pair":        { chips: 20,  mult: 2 },
  "pair":            { chips: 10,  mult: 2 },
  "high card":       { chips: 5,   mult: 1 },
};
// Each upgrade level of a hand type adds a slice of its base.
export const levelBonus = (name) => {
  const b = HAND_TYPES[name];
  return { chips: Math.max(8, Math.round(b.chips * 0.3)), mult: Math.max(1, Math.round(b.mult * 0.25)) };
};
export function handStats(name, level = 1) {
  const b = HAND_TYPES[name], l = levelBonus(name), e = Math.max(0, level - 1);
  return { chips: b.chips + l.chips * e, mult: b.mult + l.mult * e };
}

// Which hand did these pieces make, and which of them score?
export function classify(cards) {
  if (!cards.length) return null;
  const by = {};
  for (const c of cards) (by[c.t] ||= []).push(c);
  const groups = Object.values(by).sort((a, b) => b.length - a.length);
  const n = cards.length;
  const sameColor = n === 5 && cards.every((c) => c.col === cards[0].col);
  const backRank = n === 5 && ["n", "b", "r", "q", "k"].every((t) => by[t]);
  const top = groups[0].length;
  let name, scoring = cards;
  if (top === 5 && cards[0].t === "p") name = "five pawns";
  else if (top === 5) name = "five of a kind";
  else if (backRank && sameColor) name = "royal back rank";
  else if (top === 4) { name = "four of a kind"; scoring = groups[0]; }
  else if (top === 3 && groups[1] && groups[1].length === 2) name = "full house";
  else if (sameColor) name = "flush";
  else if (backRank) name = "back rank";
  else if (top === 3) { name = "three of a kind"; scoring = groups[0]; }
  else if (top === 2 && groups[1] && groups[1].length === 2) { name = "two pair"; scoring = groups[0].concat(groups[1]); }
  else if (top === 2) { name = "pair"; scoring = groups[0]; }
  else { name = "high card"; scoring = [cards.reduce((a, b) => (CHIPS[b.t] > CHIPS[a.t] ? b : a))]; }
  return { name, scoring };
}

// ---- jokers ------------------------------------------------------------
// fx(ctx, joker) returns {chips, mult, xmult}. They apply left to right: chips
// add, mult adds, then xmult multiplies whatever mult exists at that moment, so
// order matters (put additive jokers before multiplicative ones).
// ctx: scoring/played (not debuffed), hand (name), firstHand, discardsLeft,
// discardsUsed, handsLeft (including this one), handsPlayed (earlier this
// round), held (cards left in hand), deckSize.
// mod: passive bonuses (hands, discards, handSize, interestCap). econ: $ per round.
// after(joker, ctx): runs once a hand is played, for jokers that grow.
const count = (cs, t) => cs.filter((c) => c.t === t).length;
const colour = (cs, col) => cs.filter((c) => c.col === col).length;
export const JOKERS = [
  { id: "fianchetto", name: "Fianchetto", cost: 4, text: "+15 chips per scoring bishop", fx: (x) => ({ chips: 15 * count(x.scoring, "b") }) },
  { id: "enpassant", name: "En Passant", cost: 4, text: "+3 mult per scoring pawn", fx: (x) => ({ mult: 3 * count(x.scoring, "p") }) },
  { id: "fork", name: "The Fork", cost: 4, text: "+6 mult if a knight is played", fx: (x) => ({ mult: count(x.played, "n") ? 6 : 0 }) },
  { id: "castling", name: "Castling", cost: 6, text: "x2 if a rook and a king are played", fx: (x) => (count(x.played, "r") && count(x.played, "k") ? { xmult: 2 } : {}) },
  { id: "tempo", name: "Tempo", cost: 3, text: "+30 chips", fx: () => ({ chips: 30 }) },
  { id: "gambit", name: "Gambit", cost: 4, text: "+12 mult if you play 2 pieces or fewer", fx: (x) => ({ mult: x.played.length <= 2 ? 12 : 0 }) },
  { id: "book", name: "Opening Book", cost: 5, text: "x1.5 on the first hand of a round", fx: (x) => (x.firstHand ? { xmult: 1.5 } : {}) },
  { id: "mate", name: "Scholar's Mate", cost: 6, text: "x2 if a queen and a bishop are played", fx: (x) => (count(x.played, "q") && count(x.played, "b") ? { xmult: 2 } : {}) },
  { id: "stalemate", name: "Stalemate", cost: 4, text: "+5 mult per unused discard", fx: (x) => ({ mult: 5 * x.discardsLeft }) },
  { id: "rank", name: "Heavy Pieces", cost: 4, text: "+20 chips per scoring rook or queen", fx: (x) => ({ chips: 20 * (count(x.scoring, "r") + count(x.scoring, "q")) }) },
  { id: "pawnstorm", name: "Pawn Storm", cost: 6, n: 0, text: "grows: +1 mult for every pawn you've played this run", fx: (x, j) => ({ mult: j.n }), after: (j, x) => { j.n += count(x.played, "p"); } },
  { id: "zugzwang", name: "Zugzwang", cost: 6, text: "x1.75 on the last hand of a round", fx: (x) => (x.handsLeft === 1 ? { xmult: 1.75 } : {}) },
  { id: "bishoppair", name: "Bishop Pair", cost: 5, text: "x1.5 if both bishops are played", fx: (x) => (count(x.played, "b") >= 2 ? { xmult: 1.5 } : {}) },
  { id: "zwischen", name: "Zwischenzug", cost: 3, text: "+60 chips on a high card", fx: (x) => ({ chips: x.hand === "high card" ? 60 : 0 }) },
  { id: "momentum", name: "Momentum", cost: 5, text: "+3 mult per hand already played this round", fx: (x) => ({ mult: 3 * x.handsPlayed }) },
  { id: "colortheory", name: "Colour Theory", cost: 5, text: "x1.5 if 2+ pieces are played and all share a colour", fx: (x) => (x.played.length >= 2 && (colour(x.played, "w") === 0 || colour(x.played, "b") === 0) ? { xmult: 1.5 } : {}) },
  { id: "yinyang", name: "Yin and Yang", cost: 6, text: "x2 if as many white as black pieces are played (2+)", fx: (x) => (x.played.length >= 2 && colour(x.played, "w") === colour(x.played, "b") ? { xmult: 2 } : {}) },
  { id: "marriage", name: "Royal Marriage", cost: 7, text: "x2.5 if a queen and a king are played", fx: (x) => (count(x.played, "q") && count(x.played, "k") ? { xmult: 2.5 } : {}) },
  { id: "sacrifice", name: "Exchange Sacrifice", cost: 5, text: "+4 mult per discard used this round", fx: (x) => ({ mult: 4 * x.discardsUsed }) },
  { id: "broker", name: "Pawn Broker", cost: 5, econ: 3, text: "+$3 at the end of every round", fx: () => ({}) },
  { id: "goldstd", name: "Gold Standard", cost: 6, mod: { interestCap: 5 }, text: "interest cap rises by $5", fx: () => ({}) },
  { id: "longdiag", name: "Long Diagonal", cost: 7, text: "x1.25 per scoring bishop", fx: (x) => ({ xmult: 1.25 ** count(x.scoring, "b") }) },
  { id: "openfile", name: "Open File", cost: 7, text: "x1.25 per scoring rook", fx: (x) => ({ xmult: 1.25 ** count(x.scoring, "r") }) },
  { id: "dark", name: "Dark Squares", cost: 4, text: "+3 mult per scoring black piece", fx: (x) => ({ mult: 3 * colour(x.scoring, "b") }) },
  { id: "light", name: "Light Squares", cost: 4, text: "+3 mult per scoring white piece", fx: (x) => ({ mult: 3 * colour(x.scoring, "w") }) },
  { id: "tablebase", name: "Tablebase", cost: 6, text: "x1.06 for every piece missing from your deck (below 32)", fx: (x) => ({ xmult: 1 + 0.06 * Math.max(0, 32 - x.deckSize) }) },
  { id: "increment", name: "Increment", cost: 8, mod: { hands: 1 }, text: "+1 hand every round", fx: () => ({}) },
  { id: "spareclock", name: "Spare Clock", cost: 6, mod: { discards: 1 }, text: "+1 discard every round", fx: () => ({}) },
  { id: "wideboard", name: "Wide Board", cost: 6, mod: { handSize: 1 }, text: "+1 hand size", fx: () => ({}) },
  { id: "underpromo", name: "Underpromotion", cost: 4, text: "+25 chips per scoring knight", fx: (x) => ({ chips: 25 * count(x.scoring, "n") }) },
  { id: "hanging", name: "Hanging Pieces", cost: 4, text: "+2 mult per piece still in your hand", fx: (x) => ({ mult: 2 * x.held }) },
];
export const sellValue = (j) => Math.max(1, Math.floor(j.cost / 2));
const cloneJoker = (def) => ({ ...def, n: def.n || 0 });

// ---- blinds and bosses -------------------------------------------------
export const BASE_TARGET = [100, 300, 800, 2000, 5000, 11000, 20000, 35000];
export const BLINDS = [
  { name: "small blind", x: 1 },
  { name: "big blind", x: 1.5 },
  { name: "boss blind", x: 2 },
];
// Boss rules. debuff/debuffCol: matching pieces score no chips and trigger no
// joker. setHands/setDiscards/handSize change the round. halve: playing fewer
// than 5 pieces halves the score. x: target multiplier (default 2). min: first ante it can appear.
export const BOSSES = [
  { id: "pawnwall", name: "the Pawn Wall", text: "every pawn is debuffed", debuff: "p" },
  { id: "bishop", name: "the Bishop's Curse", text: "every bishop is debuffed", debuff: "b" },
  { id: "knight", name: "the Knight Rider", text: "every knight is debuffed", debuff: "n" },
  { id: "rook", name: "the Rook Lift", text: "every rook is debuffed", debuff: "r" },
  { id: "queen", name: "the Giant Queen", text: "every queen is debuffed", debuff: "q" },
  { id: "eclipse", name: "the Eclipse", text: "every white piece is debuffed", debuffCol: "w", min: 1 },
  { id: "ink", name: "the Ink", text: "every black piece is debuffed", debuffCol: "b", min: 1 },
  { id: "fog", name: "the Fog", text: "hand size -2", handSize: -2 },
  { id: "clock", name: "the Iron Clock", text: "no discards this round", setDiscards: 0 },
  { id: "mass", name: "the Mass", text: "hands of fewer than 5 pieces score half", halve: true, min: 1 },
  { id: "needle", name: "the Needle", text: "you only get 1 hand (but the target is lower)", setHands: 1, x: 1, min: 2 },
];
export function targetFor(ante, blind, boss = null) {
  const base = ante < BASE_TARGET.length ? BASE_TARGET[ante] : Math.round(BASE_TARGET[BASE_TARGET.length - 1] * 2.2 ** (ante - BASE_TARGET.length + 1));
  const x = blind === 2 && boss && boss.x != null ? boss.x : BLINDS[blind].x;
  return Math.round(base * x);
}

const sumMods = (run, key) => run.jokers.reduce((s, j) => s + ((j.mod && j.mod[key]) || 0), 0);

export function score(played, jokers = [], opts = {}) {
  const cl = classify(played);
  if (!cl) return null;
  const debuff = opts.debuff || null, debuffCol = opts.debuffCol || null;
  const dead = (c) => c.t === debuff || c.col === debuffCol;
  const live = (cs) => cs.filter((c) => !dead(c));
  const hs = handStats(cl.name, (opts.levels && opts.levels[cl.name]) || 1);
  const scoring = live(cl.scoring);
  let chips = hs.chips, mult = hs.mult;
  const log = [{ k: "base", label: cl.name, chips, mult }];
  for (const c of cl.scoring) {
    if (dead(c)) { log.push({ k: "card", id: c.id, label: "debuffed", chips, mult, dead: true }); continue; }
    chips += CHIPS[c.t];
    log.push({ k: "card", id: c.id, label: `+${CHIPS[c.t]}`, chips, mult });
  }
  const ctx = {
    scoring, played: live(played), hand: cl.name, firstHand: !!opts.firstHand, discardsLeft: opts.discardsLeft || 0,
    discardsUsed: opts.discardsUsed || 0, handsLeft: opts.handsLeft ?? 4, handsPlayed: opts.handsPlayed || 0,
    held: Math.max(0, (opts.handCount || played.length) - played.length), deckSize: opts.deckSize ?? 32,
  };
  for (const j of jokers) {
    const r = j.fx(ctx, j);
    const dc = r.chips || 0, dm = r.mult || 0, xm = r.xmult || 1;
    if (!dc && !dm && xm === 1) continue;
    chips += dc; mult += dm; mult *= xm;
    const bits = [dc ? `+${dc} chips` : "", dm ? `+${dm} mult` : "", xm !== 1 ? `x${Math.round(xm * 100) / 100}` : ""].filter(Boolean);
    log.push({ k: "joker", id: j.id, label: `${j.name} ${bits.join(" ")}`, chips, mult: Math.round(mult * 100) / 100 });
  }
  mult = Math.round(mult * 100) / 100;
  let total = Math.floor(chips * mult);
  const halved = !!opts.halve && played.length < 5;
  if (halved) { total = Math.floor(total / 2); log.push({ k: "boss", label: "the Mass halves it", chips, mult }); }
  return { hand: cl.name, scoring: cl.scoring, chips, mult, total, log, halved, live: ctx.played };
}

// ---- run state ---------------------------------------------------------
// rngOrSeed: a function (tests) or a seed string/number. Same seed + same
// choices = same run, so friends can compare.
export function newRun(rngOrSeed = Math.random, seed = null) {
  const rng = typeof rngOrSeed === "function" ? rngOrSeed : makeRng(rngOrSeed);
  return {
    ante: 0, blind: 0, jokers: [], status: "playing", round: null, rng, seed: seed ?? (typeof rngOrSeed === "function" ? null : String(rngOrSeed)),
    money: START_MONEY, levels: {}, deck: newDeck(), nextId: 32, items: [], shop: null, bossesUsed: [], payout: null,
    endless: false, best: 0, handsPlayed: 0,
  };
}

export const currentBoss = (run) => (run.round && run.round.boss) || null;

function pickBoss(run) {
  let pool = BOSSES.filter((b) => !run.bossesUsed.includes(b.id) && (b.min || 0) <= run.ante);
  if (!pool.length) { run.bossesUsed = []; pool = BOSSES.filter((b) => (b.min || 0) <= run.ante); }
  const b = pool[Math.floor(run.rng() * pool.length)];
  run.bossesUsed.push(b.id);
  return b;
}

export function startRound(run) {
  const boss = run.blind === 2 ? pickBoss(run) : null;
  // The round's deck shares card objects with run.deck, so surgery sticks.
  const deck = shuffle(run.deck.slice(), run.rng);
  const handSize = Math.max(4, HAND_SIZE + sumMods(run, "handSize") + ((boss && boss.handSize) || 0));
  const hands = boss && boss.setHands != null ? boss.setHands : HANDS + sumMods(run, "hands");
  const discards = boss && boss.setDiscards != null ? boss.setDiscards : DISCARDS + sumMods(run, "discards");
  run.round = {
    deck, hand: deck.splice(0, handSize), handSize, score: 0, hands, discards, target: targetFor(run.ante, run.blind, boss),
    boss, debuff: boss && boss.debuff || null, debuffCol: boss && boss.debuffCol || null, halve: !!(boss && boss.halve),
    played: 0, discardsUsed: 0, last: null,
  };
  run.status = "playing";
  run.shop = null; run.payout = null;
}

const refill = (r) => { while (r.hand.length < r.handSize && r.deck.length) r.hand.push(r.deck.shift()); };

export function scoreOpts(run, handCount = 0) {
  const r = run.round;
  return { debuff: r.debuff, debuffCol: r.debuffCol, halve: r.halve, firstHand: r.played === 0, discardsLeft: r.discards, discardsUsed: r.discardsUsed,
    handsLeft: r.hands, handsPlayed: r.played, handCount: r.hand.length || handCount, deckSize: run.deck.length, levels: run.levels };
}

// Pays out a cleared blind and opens the shop.
function settle(run) {
  const r = run.round;
  const base = BLIND_REWARD[run.blind];
  const hands = r.hands; // $1 per hand you didn't need
  const cap = INTEREST_CAP + sumMods(run, "interestCap");
  const interest = Math.min(cap, Math.floor(run.money / 5));
  const econ = run.jokers.reduce((s, j) => s + (j.econ || 0), 0);
  run.payout = { base, hands, interest, econ, total: base + hands + interest + econ };
  run.money += run.payout.total;
  run.rerolls = 0;
  run.shop = makeShop(run);
  run.status = run.blind === 2 && run.ante === ANTES - 1 && !run.endless ? "won" : "shop";
}

// ids: card ids from the current hand. Returns the score result, or null if illegal.
export function play(run, ids) {
  const r = run.round;
  if (run.status !== "playing" || r.hands <= 0 || !ids.length || ids.length > MAX_PLAY) return null;
  const cards = r.hand.filter((c) => ids.includes(c.id));
  if (cards.length !== ids.length) return null;
  const res = score(cards, run.jokers, scoreOpts(run));
  r.hand = r.hand.filter((c) => !ids.includes(c.id));
  r.score += res.total; r.hands--; r.played++; r.last = res;
  run.handsPlayed++; run.best = Math.max(run.best, res.total);
  for (const j of run.jokers) if (j.after) j.after(j, { played: res.live, scoring: res.live });
  refill(r);
  if (r.score >= r.target) settle(run);
  else if (r.hands <= 0 || !r.hand.length) run.status = "failed";
  return res;
}

export function discard(run, ids) {
  const r = run.round;
  if (run.status !== "playing" || r.discards <= 0 || !ids.length || ids.length > MAX_PLAY) return false;
  const cards = r.hand.filter((c) => ids.includes(c.id));
  if (cards.length !== ids.length) return false;
  r.hand = r.hand.filter((c) => !ids.includes(c.id));
  r.discards--; r.discardsUsed++;
  refill(r);
  if (!r.hand.length) run.status = "failed";
  return true;
}

// ---- consumables: deck surgery on one selected piece --------------------
export const ITEMS = [
  { id: "promote", name: "Promotion", cost: 3, text: "raise 1 piece a rank for good (pawn, knight, bishop, rook, queen)", ok: (c) => LADDER.includes(c.t) && c.t !== "q" },
  { id: "flip", name: "Defection", cost: 2, text: "1 piece changes colour for good (flush fuel)", ok: () => true },
  { id: "clone", name: "Recruit", cost: 4, text: "add a copy of 1 piece to your deck", ok: () => true },
  { id: "purge", name: "Purge", cost: 3, text: "remove 1 piece from your deck for good (thins it, helps Tablebase)", ok: () => true },
];

// Applies items[idx] to the one selected card. Returns a message or null if illegal.
export function useItem(run, idx, ids) {
  const it = run.items[idx];
  const r = run.round;
  if (!it || run.status !== "playing" || ids.length !== 1) return null;
  const card = r.hand.find((c) => c.id === ids[0]);
  const def = ITEMS.find((d) => d.id === it.id);
  if (!card || !def.ok(card)) return null;
  let msg;
  if (it.id === "promote") { const from = card.t; card.t = LADDER[LADDER.indexOf(card.t) + 1]; msg = `${NAME[from]} promoted to ${NAME[card.t]}.`; }
  else if (it.id === "flip") { card.col = card.col === "w" ? "b" : "w"; msg = `${NAME[card.t]} defects.`; }
  else if (it.id === "clone") {
    if (run.deck.length >= 60) return null; // a deck this big stops being a deck
    const copy = { id: run.nextId++, t: card.t, col: card.col };
    run.deck.push(copy); r.deck.splice(Math.floor(run.rng() * (r.deck.length + 1)), 0, copy);
    msg = `a second ${NAME[card.t]} joins the deck.`;
  } else if (it.id === "purge") {
    if (run.deck.length <= 12) return null; // below 12 pieces rounds would run dry
    run.deck = run.deck.filter((c) => c !== card); r.hand = r.hand.filter((c) => c !== card);
    refill(r);
    msg = `${NAME[card.t]} removed from the deck.`;
  }
  run.items.splice(idx, 1);
  return msg;
}

// ---- shop --------------------------------------------------------------
export const rerollCost = (run) => 2 + (run.rerolls || 0);
export const levelCost = (run, name) => 3 + ((run.levels[name] || 1) - 1);

function jokerOffers(run) {
  const owned = new Set(run.jokers.map((j) => j.id));
  return shuffle(JOKERS.filter((j) => !owned.has(j.id)), run.rng).slice(0, 3).map((j) => ({ kind: "joker", joker: cloneJoker(j), price: j.cost }));
}
export function makeShop(run) {
  const names = ["pair", "two pair", "three of a kind", "full house", "flush", "back rank", "four of a kind", "high card"];
  const levels = shuffle(names, run.rng).slice(0, 2).map((name) => ({ kind: "level", name, price: levelCost(run, name) }));
  const items = shuffle(ITEMS.slice(), run.rng).slice(0, 2).map((it) => ({ kind: "item", item: it, price: it.cost }));
  return { jokers: jokerOffers(run), other: [...levels, ...items] };
}
export function reroll(run) {
  const c = rerollCost(run);
  if (run.status !== "shop" && run.status !== "won") return false;
  if (run.money < c) return false;
  run.money -= c; run.rerolls = (run.rerolls || 0) + 1;
  run.shop.jokers = jokerOffers(run);
  return true;
}
// null when you can buy it, otherwise why not.
export function whyNot(run, offer) {
  if (offer.sold) return "sold";
  if (run.money < offer.price) return "not enough money";
  if (offer.kind === "joker" && run.jokers.length >= MAX_JOKERS) return "joker slots full (sell one)";
  if (offer.kind === "item" && run.items.length >= MAX_ITEMS) return "item slots full";
  return null;
}
export function buy(run, offer) {
  if ((run.status !== "shop" && run.status !== "won") || whyNot(run, offer)) return false;
  run.money -= offer.price; offer.sold = true;
  if (offer.kind === "joker") run.jokers.push(offer.joker);
  else if (offer.kind === "item") run.items.push({ id: offer.item.id, name: offer.item.name, text: offer.item.text });
  else { run.levels[offer.name] = (run.levels[offer.name] || 1) + 1; offer.price = levelCost(run, offer.name); offer.sold = false; }
  return true;
}
export function sellJoker(run, idx) {
  const j = run.jokers[idx];
  if (!j || (run.status !== "shop" && run.status !== "won")) return false;
  run.money += sellValue(j); run.jokers.splice(idx, 1);
  return true;
}
export function moveJoker(run, idx, dir) {
  const to = idx + dir;
  if (!run.jokers[idx] || to < 0 || to >= run.jokers.length) return false;
  [run.jokers[idx], run.jokers[to]] = [run.jokers[to], run.jokers[idx]];
  return true;
}

// Leave the shop for the next blind. After the final ante you may keep going: endless.
export function advance(run) {
  if (run.status !== "shop" && run.status !== "won") return;
  if (run.status === "won") run.endless = true;
  run.blind++;
  if (run.blind > 2) { run.blind = 0; run.ante++; }
  startRound(run);
}
