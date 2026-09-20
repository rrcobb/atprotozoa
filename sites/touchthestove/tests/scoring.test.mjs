import { test } from "node:test";
import assert from "node:assert/strict";
import { multiplierForCombo } from "../public/lib/scoring.js";

test("no combo (or a broken streak) pays the base rate", () => {
  assert.equal(multiplierForCombo(0), 1);
  assert.equal(multiplierForCombo(-3), 1);
});

test("multiplier steps up every 3 touches in the combo window", () => {
  assert.equal(multiplierForCombo(1), 1);
  assert.equal(multiplierForCombo(3), 1);
  assert.equal(multiplierForCombo(4), 2);
  assert.equal(multiplierForCombo(6), 2);
  assert.equal(multiplierForCombo(7), 3);
});

test("multiplier caps at ×10 so a very long streak can't run away", () => {
  assert.equal(multiplierForCombo(28), 10);
  assert.equal(multiplierForCombo(1000), 10);
});
