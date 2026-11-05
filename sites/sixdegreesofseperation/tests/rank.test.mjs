import { test } from "node:test";
import assert from "node:assert";
import { rank } from "../public/lib/moots.js";

test("rank filters by threshold and sorts descending", () => {
  const m = new Map([
    ["a", new Set([1, 2, 3, 4, 5, 6])],
    ["b", new Set([1, 2, 3, 4, 5, 6, 7])],
    ["c", new Set([1, 2])],
  ]);
  assert.deepStrictEqual(rank(m, 6), [{ did: "b", count: 7 }, { did: "a", count: 6 }]);
  assert.deepStrictEqual(rank(m, 2, new Set(["b"])).map((r) => r.did), ["a", "c"]);
});
