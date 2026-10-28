// Pure rules for Chess Balatro — no DOM, so tests can import it.
// A 32-card deck (a full set: 16 white, 16 black). Play up to 5 pieces as a
// "hand", scored as (base chips + piece chips) x mult, then jokers tweak it.
export const HAND_SIZE = 8;
export const MAX_PLAY = 5;
export const HANDS = 4;
export const DISCARDS = 3;
export const MAX_JOKERS = 5;
export const ANTES = 5;

export const CHIPS = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 4 };
export const GLYPH = { // outline glyphs for white, solid for black
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};
export const NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

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

// Jokers. fx(ctx) returns {chips, mult, xmult} additions. ctx has: scoring (not
// debuffed scoring pieces), played (all played pieces), hand (name),
// firstHand, discardsLeft.
const count = (cs, t) => cs.filter((c) => c.t === t).length;
export const JOKERS = [
  { id: "fianchetto", name: "Fianchetto", text: "+15 chips per scoring bishop", fx: (x) => ({ chips: 15 * count(x.scoring, "b") }) },
  { id: "enpassant", name: "En Passant", text: "+3 mult per scoring pawn", fx: (x) => ({ mult: 3 * count(x.scoring, "p") }) },
  { id: "fork", name: "The Fork", text: "+6 mult if a knight is played", fx: (x) => ({ mult: count(x.played, "n") ? 6 : 0 }) },
  { id: "castling", name: "Castling", text: "x2 if a rook and a king are played", fx: (x) => (count(x.played, "r") && count(x.played, "k") ? { xmult: 2 } : {}) },
  { id: "tempo", name: "Tempo", text: "+30 chips", fx: () => ({ chips: 30 }) },
  { id: "gambit", name: "Gambit", text: "+12 mult if you play 2 pieces or fewer", fx: (x) => ({ mult: x.played.length <= 2 ? 12 : 0 }) },
  { id: "book", name: "Opening Book", text: "x1.5 on the first hand of a round", fx: (x) => (x.firstHand ? { xmult: 1.5 } : {}) },
  { id: "mate", name: "Scholar's Mate", text: "x2 if a queen and a bishop are played", fx: (x) => (count(x.played, "q") && count(x.played, "b") ? { xmult: 2 } : {}) },
  { id: "stalemate", name: "Stalemate", text: "+5 mult per unused discard", fx: (x) => ({ mult: 5 * x.discardsLeft }) },
  { id: "rank", name: "Heavy Pieces", text: "+20 chips per scoring rook or queen", fx: (x) => ({ chips: 20 * (count(x.scoring, "r") + count(x.scoring, "q")) }) },
];

export const BASE_TARGET = [100, 300, 800, 2000, 5000];
export const BLINDS = [
  { name: "small blind", x: 1 },
  { name: "big blind", x: 1.5 },
  { name: "boss blind", x: 2 },
];
// Each boss debuffs one piece type: it scores no chips and triggers no joker.
export const BOSSES = [
  { name: "the Pawn Wall", t: "p" }, { name: "the Bishop's Curse", t: "b" }, { name: "the Knight Rider", t: "n" },
  { name: "the Rook Lift", t: "r" }, { name: "the Giant Queen", t: "q" },
];
export const targetFor = (ante, blind) => Math.round(BASE_TARGET[ante] * BLINDS[blind].x);

export function score(played, jokers = [], opts = {}) {
  const cl = classify(played);
  if (!cl) return null;
  const debuff = opts.debuff || null;
  const live = (cs) => cs.filter((c) => c.t !== debuff);
  const base = HAND_TYPES[cl.name];
  const scoring = live(cl.scoring);
  let chips = base.chips + scoring.reduce((s, c) => s + CHIPS[c.t], 0);
  let mult = base.mult, xmult = 1;
  const ctx = { scoring, played: live(played), hand: cl.name, firstHand: !!opts.firstHand, discardsLeft: opts.discardsLeft || 0 };
  for (const j of jokers) {
    const r = j.fx(ctx);
    chips += r.chips || 0; mult += r.mult || 0; xmult *= r.xmult || 1;
  }
  return { hand: cl.name, scoring: cl.scoring, chips, mult: Math.round(mult * xmult * 100) / 100, total: Math.floor(chips * mult * xmult) };
}

export function newRun(rng = Math.random) {
  return { ante: 0, blind: 0, jokers: [], status: "playing", round: null, rng };
}

export function startRound(run) {
  const deck = shuffle(newDeck(), run.rng);
  const boss = run.blind === 2 ? BOSSES[run.ante] : null;
  run.round = { deck, hand: deck.splice(0, HAND_SIZE), score: 0, hands: HANDS, discards: DISCARDS, target: targetFor(run.ante, run.blind), debuff: boss ? boss.t : null, played: 0, last: null };
  run.status = "playing";
}

const refill = (r) => { while (r.hand.length < HAND_SIZE && r.deck.length) r.hand.push(r.deck.shift()); };

// ids: card ids from the current hand. Returns the score result, or null if illegal.
export function play(run, ids) {
  const r = run.round;
  if (run.status !== "playing" || r.hands <= 0 || !ids.length || ids.length > MAX_PLAY) return null;
  const cards = r.hand.filter((c) => ids.includes(c.id));
  if (cards.length !== ids.length) return null;
  const res = score(cards, run.jokers, { debuff: r.debuff, firstHand: r.played === 0, discardsLeft: r.discards });
  r.hand = r.hand.filter((c) => !ids.includes(c.id));
  r.score += res.total; r.hands--; r.played++; r.last = res;
  refill(r);
  if (r.score >= r.target) run.status = "cleared";
  else if (r.hands <= 0 || !r.hand.length) run.status = "failed";
  return res;
}

export function discard(run, ids) {
  const r = run.round;
  if (run.status !== "playing" || r.discards <= 0 || !ids.length || ids.length > MAX_PLAY) return false;
  const cards = r.hand.filter((c) => ids.includes(c.id));
  if (cards.length !== ids.length) return false;
  r.hand = r.hand.filter((c) => !ids.includes(c.id));
  r.discards--;
  refill(r);
  if (!r.hand.length) run.status = "failed";
  return true;
}

export function jokerChoices(run, rng = Math.random) {
  const owned = new Set(run.jokers.map((j) => j.id));
  return shuffle(JOKERS.filter((j) => !owned.has(j.id)), rng).slice(0, 3);
}

// After a cleared blind: take a joker (or null to skip), then move on.
export function advance(run, joker) {
  if (joker && run.jokers.length < MAX_JOKERS) run.jokers.push(joker);
  run.blind++;
  if (run.blind > 2) { run.blind = 0; run.ante++; }
  if (run.ante >= ANTES) { run.status = "won"; run.round = null; return; }
  startRound(run);
}
