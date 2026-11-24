import test from "node:test";
import assert from "node:assert";
import { summarize, daysSince } from "../public/lib/liveness.js";

test("all fresh followers", () => {
  const s = summarize([0, 0, 1], 3);
  assert.equal(s.live, 3);
  assert.ok(s.freshness > 0.97);
  assert.equal(s.buckets.reduce((a, b) => a + b.count, 0), 3);
});

test("never-active counts as a year and zero freshness", () => {
  const s = summarize([Infinity, 0], 2);
  assert.equal(s.mean, 182.5);
  assert.equal(s.live, 1);
  assert.equal(s.buckets[5].count, 1);
});

test("sampled live estimate scales to the real total", () => {
  const s = summarize([1, 100, 200, 300], 1000);
  assert.equal(s.liveEstimate, 250);
});

test("daysSince", () => {
  assert.equal(daysSince("2026-01-02T00:00:00Z", Date.parse("2026-01-04T00:00:00Z")), 2);
  assert.equal(daysSince("garbage"), Infinity);
});
