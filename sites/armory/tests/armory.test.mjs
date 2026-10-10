import test from "node:test";
import assert from "node:assert";
import { buildArmory } from "../public/lib/armory.js";

test("999 unique grenades, stable across calls", () => {
  const a = buildArmory();
  assert.strictEqual(a.length, 999);
  assert.strictEqual(new Set(a.map((g) => g.text)).size, 999);
  assert.deepStrictEqual(a, buildArmory());
  assert.strictEqual(a[0].n, 1);
  assert.strictEqual(a[998].n, 999);
});
