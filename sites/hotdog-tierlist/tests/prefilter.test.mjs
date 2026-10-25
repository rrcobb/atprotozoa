import test from "node:test";
import assert from "node:assert";
import { warmFraction, isPlausible } from "../public/lib/prefilter.js";

const fill = (n, [r, g, b]) => Uint8ClampedArray.from({ length: n * 4 }, (_, i) => [r, g, b, 255][i % 4]);
// pixels: [[count, [r,g,b]], ...]
const mix = (parts) => {
  const out = [];
  for (const [n, [r, g, b]] of parts) for (let i = 0; i < n; i++) out.push(r, g, b, 255);
  return Uint8ClampedArray.from(out);
};
const SAUSAGE = [170, 80, 40], BUN = [210, 150, 80], MUSTARD = [235, 200, 30], KETCHUP = [200, 30, 20];
const SKIN = [220, 170, 140], WOOD = [150, 120, 90], GREEN = [60, 160, 60];

test("bun + sausage + mustard is plausible", () =>
  assert.ok(isPlausible(mix([[30, BUN], [20, SAUSAGE], [3, MUSTARD], [47, GREEN]]))));
test("bun + sausage + ketchup is plausible", () =>
  assert.ok(isPlausible(mix([[30, BUN], [20, SAUSAGE], [3, KETCHUP], [47, GREEN]]))));
test("frame mostly bun/sausage passes without condiment", () =>
  assert.ok(isPlausible(mix([[40, BUN], [20, SAUSAGE], [40, GREEN]]))));
test("a little bun with no condiment is rejected", () =>
  assert.ok(!isPlausible(mix([[10, BUN], [90, GREEN]]))));
test("skin tones are rejected", () => assert.ok(!isPlausible(fill(100, SKIN))));
test("muted wood is rejected", () => assert.ok(!isPlausible(fill(100, WOOD))));
test("condiment colour alone is rejected", () => assert.ok(!isPlausible(fill(100, MUSTARD))));
test("blue sky is rejected", () => assert.ok(!isPlausible(fill(100, [90, 150, 230]))));
test("grey screenshot is rejected", () => assert.ok(!isPlausible(fill(100, [128, 128, 128]))));
test("green foliage is rejected", () => assert.ok(!isPlausible(fill(100, GREEN))));
test("black is rejected", () => assert.ok(!isPlausible(fill(100, [5, 5, 5]))));
test("empty fails open", () => assert.ok(isPlausible(new Uint8ClampedArray(0))));
test("warmFraction sums both shares", () => assert.ok(warmFraction(fill(10, MUSTARD)) > 0.9));
