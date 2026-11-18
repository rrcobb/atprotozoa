import test from "node:test";
import assert from "node:assert";
import { dominates, paretoFront, paretoRanks, yearlyCost } from "../public/pareto.js";

const M = [{ key: "prem", dir: "min" }, { key: "av", dir: "max" }];
const A = { prem: 300, av: 60 }, B = { prem: 500, av: 80 }, C = { prem: 600, av: 70 }, D = { prem: 300, av: 60 };

test("dominance", () => {
  assert.ok(dominates(B, C, M));
  assert.ok(!dominates(A, B, M));
  assert.ok(!dominates(A, D, M), "ties do not dominate");
});
test("front", () => {
  assert.deepStrictEqual(paretoFront([A, B, C], M), [A, B]);
});
test("ranks", () => {
  const r = paretoRanks([A, B, C], M);
  assert.strictEqual(r.get(A), 1);
  assert.strictEqual(r.get(C), 2);
});
test("yearly cost", () => {
  const p = { premium: 100, deductible: 1000, coinsurance: 20, oopMax: 3000 };
  assert.strictEqual(yearlyCost(p, 0), 1200);
  assert.strictEqual(yearlyCost(p, 500), 1700);
  assert.strictEqual(yearlyCost(p, 6000), 1200 + 1000 + 1000);
  assert.strictEqual(yearlyCost(p, 1e6), 1200 + 3000);
});
