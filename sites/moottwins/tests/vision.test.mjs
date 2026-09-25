// Unit tests for public/lib/vision.js's hammingDistance and
// dominantColorShare — the numbers every "how similar are these two pfps"
// and "is this even a real photo" decision is built on. No DOM/canvas
// needed here: hammingDistance is a plain array comparison, and
// dominantColorShare takes a flat RGBA array so it's testable the same way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hammingDistance, dominantColorShare } from "../public/lib/vision.js";

// Build a flat RGBA array for an n x n grid, [r,g,b] for every pixel.
function pixels(n, pick) {
  const data = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const [r, g, b] = pick(i);
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  return data;
}

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

test("dominantColorShare is 1 for a single flat color", () => {
  const n = 16;
  const data = pixels(n, () => [40, 120, 200]);
  assert.equal(dominantColorShare(data, n), 1);
});

test("dominantColorShare is high for an icon on a flat background", () => {
  const n = 16;
  // ~12% of pixels (a small centered icon) differ sharply from the rest.
  const data = pixels(n, (i) => (i % 8 === 0 ? [255, 255, 255] : [30, 30, 30]));
  assert.ok(dominantColorShare(data, n) > 0.8);
});

test("dominantColorShare is low across a gradient with no dominant bucket", () => {
  const n = 16;
  const data = pixels(n, (i) => {
    const x = i % n, y = Math.floor(i / n);
    return [(x * 255) / n, (y * 255) / n, ((x + y) * 255) / (2 * n)];
  });
  assert.ok(dominantColorShare(data, n) < 0.3);
});
