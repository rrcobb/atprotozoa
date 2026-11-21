import test from "node:test";
import assert from "node:assert";
import { generate, toText } from "../public/gen.js";

test("deterministic per seed", () => {
  assert.deepStrictEqual(generate(42), generate(42));
});
test("varies across seeds and fills every field", () => {
  const names = new Set();
  for (let s = 1; s < 200; s++) {
    const e = generate(s);
    names.add(e.name);
    for (const k of ["name", "setup", "twist", "verdict", "epistemic"]) assert.ok(e[k].length > 5, k);
    assert.strictEqual(new Set(e.tags).size, 3);
    assert.ok(e.credence >= 1 && e.credence <= 99);
  }
  assert.ok(names.size > 100);
  assert.ok(toText(generate(7)).includes(generate(7).name));
});
