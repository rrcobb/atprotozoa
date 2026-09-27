// Pure hold'em preflop logic: no DOM, importable from tests and the browser.

export const SUITS = [
  { id: "s", symbol: "♠", color: "black" }, // spades
  { id: "h", symbol: "♥", color: "red" }, // hearts
  { id: "d", symbol: "♦", color: "red" }, // diamonds
  { id: "c", symbol: "♣", color: "black" }, // clubs
];

const RANK_LABELS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export function rankLabel(rank) {
  return RANK_LABELS[rank - 2];
}

export function freshDeck() {
  const deck = [];
  for (let rank = 2; rank <= 14; rank++) {
    for (const suit of SUITS) deck.push({ rank, suit: suit.id });
  }
  return deck;
}

// Deals two distinct cards off a shuffled 52-card deck. `rng` defaults to
// Math.random; tests pass a seeded generator for determinism.
export function dealHand(rng = Math.random) {
  const deck = freshDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return [deck[0], deck[1]];
}

// The Chen formula: a well-known pen-and-paper score for two-card hand
// strength (Bill Chen, published in "The Mathematics of Poker"). We use it
// because it's the standard beginner heuristic for "is this hand worth
// playing," it needs no equity tables, and it's easy to sanity-check by hand
// (its own famous trivia: 7-2 offsuit, the worst starting hand, scores -1).
//
// Steps, in order:
//  1. Score the higher card: A=10, K=8, Q=7, J=6, else its rank/2.
//  2. Pair: double the score, floor of 5 (so 22 is worth 5, not 2) — except
//     55, which the formula special-cases to 6 rather than the usual floor.
//  3. Otherwise: +2 if suited.
//  4. Subtract for the gap between the cards (cards strictly between them):
//     0=+0, 1=-1, 2=-2, 3=-4, 4+=-5.
//  5. +1 "straight bonus" if the gap is 0 or 1 and both cards are below a
//     Queen (extra ways to make a straight with two low connected cards).
//  6. Round any half-point total up.
export function chenScore(rankA, rankB, suited) {
  const hi = Math.max(rankA, rankB);
  const lo = Math.min(rankA, rankB);
  const highCardPoints = hi === 14 ? 10 : hi === 13 ? 8 : hi === 12 ? 7 : hi === 11 ? 6 : hi / 2;

  let score = highCardPoints;
  if (hi === lo) {
    score = hi === 5 ? 6 : Math.max(score * 2, 5);
  } else {
    if (suited) score += 2;
    const gap = hi - lo - 1;
    if (gap === 1) score -= 1;
    else if (gap === 2) score -= 2;
    else if (gap === 3) score -= 4;
    else if (gap >= 4) score -= 5;
    if (gap <= 1 && hi < 12) score += 1;
  }
  return Math.ceil(score);
}

// No position, no action in front, no stack sizes — this game deliberately
// asks for only the first decision in isolation, so we use Chen's own
// position-agnostic guideline ("10+: play anywhere, 8-9: play/raise from
// most positions") collapsed to one line: 8 or higher is a stay, anything
// below is a fold.
export const STAY_THRESHOLD = 8;

export function correctDecision(card1, card2) {
  const suited = card1.suit === card2.suit;
  const score = chenScore(card1.rank, card2.rank, suited);
  return { score, decision: score >= STAY_THRESHOLD ? "stay" : "fold" };
}
