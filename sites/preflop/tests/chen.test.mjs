import { test } from "node:test";
import assert from "node:assert/strict";
import { chenScore, correctDecision, STAY_THRESHOLD, dealHand, freshDeck, rankLabel } from "../public/lib/cards.js";

test("chenScore matches published Chen formula reference values", () => {
  assert.equal(chenScore(14, 14, false), 20); // AA
  assert.equal(chenScore(13, 13, false), 16); // KK
  assert.equal(chenScore(2, 2, false), 5); // 22, floored at 5
  assert.equal(chenScore(5, 5, false), 6); // 55, the formula's one special-cased pair
  assert.equal(chenScore(14, 13, true), 12); // AKs
  assert.equal(chenScore(14, 13, false), 10); // AKo
  assert.equal(chenScore(11, 10, true), 9); // JTs (gap 0, straight bonus)
  assert.equal(chenScore(7, 2, false), -1); // 7-2 offsuit, famously the worst hand
});

test("correctDecision uses the 8-point stay threshold", () => {
  assert.equal(STAY_THRESHOLD, 8);
  assert.deepEqual(
    correctDecision({ rank: 14, suit: "s" }, { rank: 13, suit: "s" }),
    { score: 12, decision: "stay" },
  );
  assert.deepEqual(
    correctDecision({ rank: 7, suit: "s" }, { rank: 2, suit: "h" }),
    { score: -1, decision: "fold" },
  );
});

test("dealHand returns two distinct cards from a 52-card deck", () => {
  const deck = freshDeck();
  assert.equal(deck.length, 52);
  for (let i = 0; i < 200; i++) {
    const [a, b] = dealHand();
    assert.notEqual(a.rank + a.suit, b.rank + b.suit);
  }
});

test("rankLabel covers 2 through ace", () => {
  assert.equal(rankLabel(2), "2");
  assert.equal(rankLabel(10), "10");
  assert.equal(rankLabel(11), "J");
  assert.equal(rankLabel(14), "A");
});
