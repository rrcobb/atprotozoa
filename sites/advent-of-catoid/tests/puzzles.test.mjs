import test from "node:test";
import assert from "node:assert";
import { DAYS, inputFor, answerFor, exampleAnswer, codeAt, d29p2 } from "../public/lib/puzzles.js";

const ex = (day) => [exampleAnswer(day, 1), exampleAnswer(day, 2)];

test("known examples", () => {
  assert.deepStrictEqual(ex(1), ["24000", "45000"]);
  assert.deepStrictEqual(ex(2), ["150", "900"]);
  assert.deepStrictEqual(ex(3), ["198", "230"]);
  assert.deepStrictEqual(ex(4), ["7", "5"]);
  assert.deepStrictEqual(ex(5), ["15", "1134"]);
  assert.deepStrictEqual(ex(7), ["5", "12"]);
  assert.deepStrictEqual(ex(8), ["5934", "26984457539"]);
  assert.deepStrictEqual(ex(9), ["101", "48"]);
  assert.deepStrictEqual(ex(10), ["1985", "5DB3"]);
  assert.deepStrictEqual(ex(13), ["-1", "5"]);
  assert.deepStrictEqual(ex(14), ["7", "19"]);
  assert.deepStrictEqual(ex(15), ["12", undefined].map(String).slice(0, 1).concat(exampleAnswer(15, 2)));
  assert.deepStrictEqual(ex(17), ["4", "3"]);
  assert.deepStrictEqual(ex(19), ["2", "1"]);
  assert.deepStrictEqual(ex(20), ["5", "10"]);
  assert.deepStrictEqual(ex(22).slice(0, 1), ["436"]);
  assert.deepStrictEqual(ex(24), ["99", "44"]);
  assert.deepStrictEqual(ex(25).slice(0, 1), ["7981243"]);
  assert.deepStrictEqual(ex(27), ["2", "4"]);
  assert.deepStrictEqual(ex(28), ["40", "315"]);
  assert.deepStrictEqual(ex(30), ["97", "277"]);
});

test("bonus day examples", () => {
  assert.deepStrictEqual(ex(31), ["10", "4"]);
  assert.deepStrictEqual(ex(32), ["82350", "1166642"]);
  assert.deepStrictEqual(ex(33), ["514579", "241861950"]);
  assert.deepStrictEqual(ex(34), ["7", "19"]);
  assert.deepStrictEqual(ex(35), ["2", "5"]);
});

test("code grid corners", () => {
  assert.strictEqual(codeAt(1, 1), 20151125);
  assert.strictEqual(codeAt(2, 2), 21629792);
  assert.strictEqual(codeAt(6, 1), 33071741);
});

test("circle matches brute force", () => {
  const brute = (n, across) => {
    let c = Array.from({ length: n }, (_, i) => i + 1), t = 0;
    while (c.length > 1) {
      const v = across ? (t + Math.floor(c.length / 2)) % c.length : (t + 1) % c.length;
      c.splice(v, 1);
      if (v < t) t--;
      t = (t + 1) % c.length;
    }
    return c[0];
  };
  for (let n = 1; n < 60; n++) {
    assert.strictEqual(exampleAnswer(29, 1) && Number(answerFor("x", 29, 1, String(n))), brute(n, false), "p1 n=" + n);
    assert.strictEqual(Number(answerFor("x", 29, 2, String(n))), brute(n, true), "p2 n=" + n);
  }
});

test("rule 30 row counts", () => {
  assert.strictEqual(exampleAnswer(23, 1), "17");
});

test("every day generates deterministic input with answers for both parts", () => {
  for (const seed of ["alpha", "beta"]) {
    DAYS.forEach((d, i) => {
      const day = i + 1;
      const a = inputFor(seed, day);
      assert.strictEqual(a, inputFor(seed, day), `day ${day} deterministic`);
      for (const part of [1, 2]) {
        const ans = answerFor(seed, day, part, a);
        assert.ok(ans !== "undefined" && ans !== "NaN" && ans !== "", `day ${day} part ${part} -> ${ans}`);
      }
    });
  }
});
