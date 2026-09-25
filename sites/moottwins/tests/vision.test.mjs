// Unit tests for public/lib/vision.js's hammingDistance — the number every
// "how similar are these two pfps" ranking is built on. No DOM/canvas needed
// here since hammingDistance is a plain array comparison.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hammingDistance } from "../public/lib/vision.js";

test("hammingDistance is 0 for identical hashes", () => {
  const h = [1, 0, 1, 1, 0, 0, 1, 0];
  assert.equal(hammingDistance(h, h.slice()), 0);
});

test("hammingDistance counts every differing bit", () => {
  const a = [1, 0, 1, 0, 1, 0, 1, 0];
  const b = [0, 0, 1, 1, 1, 0, 0, 0];
  // differs at indices 0, 3, 6 -> 3 bits
  assert.equal(hammingDistance(a, b), 3);
});

test("hammingDistance is symmetric", () => {
  const a = [1, 1, 0, 0, 1, 1, 0, 0];
  const b = [0, 1, 0, 1, 1, 0, 0, 1];
  assert.equal(hammingDistance(a, b), hammingDistance(b, a));
});

test("hammingDistance is maximal for fully inverted hashes", () => {
  const a = new Array(64).fill(1);
  const b = new Array(64).fill(0);
  assert.equal(hammingDistance(a, b), 64);
});
