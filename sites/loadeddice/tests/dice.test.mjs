import test from "node:test";
import assert from "node:assert";
import { N, buildDice, rollFace, rollSet, match, PICTURES } from "../public/lib/dice.js";

test("zero-weight faces never come up", () => {
  const die = buildDice([[0, 1, 0]]).colDice[0];
  for (let i = 0; i < 100; i++) assert.strictEqual(rollFace(die, i / 100), 1);
  assert.strictEqual(rollFace(die, 0), 1);
  assert.strictEqual(rollFace(die, 0.999999), 1);
});

test("rolling many times converges on the picture", () => {
  const pic = PICTURES.heart();
  assert.strictEqual(pic.length, N);
  const dice = buildDice(pic);
  const tally = new Array(N * N).fill(0);
  let s = 12345;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rolls = 200000;
  for (let i = 0; i < rolls; i++) { const { r, c } = rollSet(dice, rand); tally[r * N + c]++; }
  assert.ok(match(pic, tally, rolls) > 0.95);
});

test("empty picture rolls nothing", () => {
  const dice = buildDice(Array.from({ length: N }, () => Array(N).fill(0)));
  assert.strictEqual(rollSet(dice), null);
});

test("every preset has ink", () => {
  for (const [k, f] of Object.entries(PICTURES)) {
    const ink = f().flat().reduce((a, b) => a + b, 0);
    assert.ok(ink > 5, k);
  }
});
