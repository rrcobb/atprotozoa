import { test } from "node:test";
import assert from "node:assert";
import { parseCount, breakdown, fmtCount, countFromLog, compare, VOLUME_REFS, physical } from "../public/lib/clips.js";

test("parses the usual spellings", () => {
  assert.equal(parseCount("1,000,000"), 1000000n);
  assert.equal(parseCount("1e12"), 10n ** 12n);
  assert.equal(parseCount("1.5e9"), 1500000000n);
  assert.equal(parseCount("5k"), 5000n);
  assert.equal(parseCount("3 billion"), 3n * 10n ** 9n);
  assert.equal(parseCount("2^64-1"), 18446744073709551615n);
  assert.equal(parseCount("a googol"), 10n ** 100n);
  assert.equal(parseCount("0"), 0n);
  assert.equal(parseCount("  42 "), 42n);
});
test("rejects junk", () => {
  assert.equal(parseCount("banana"), null);
  assert.equal(parseCount(""), null);
  assert.equal(parseCount("-5"), null);
  assert.equal(parseCount("1e999999"), null);
});
test("breakdown sums back to the count", () => {
  for (const c of [1n, 99n, 100n, 123456789n, 10n ** 15n + 7n, 10n ** 30n]) {
    const sum = breakdown(c).reduce((a, r) => a + r.n * r.tier.size, 0n);
    assert.equal(sum, c);
  }
  assert.equal(breakdown(250n)[0].tier.id, "box");
});
test("formatting and comparisons", () => {
  assert.equal(fmtCount(1234567n), "1,234,567");
  assert.match(fmtCount(10n ** 40n), /10\^40/);
  assert.equal(countFromLog(3), 1000n);
  const c = compare(physical(10n ** 20n).logVolM3, VOLUME_REFS);
  assert.ok(c.ratio > 0);
});
