import test from "node:test";
import assert from "node:assert";
import { warmFraction, isPlausible } from "../public/lib/prefilter.js";

const fill = (n, [r, g, b]) => Uint8ClampedArray.from({ length: n * 4 }, (_, i) => [r, g, b, 255][i % 4]);

test("tan bun colour is plausible", () => assert.ok(isPlausible(fill(100, [200, 150, 90]))));
test("mustard yellow counts", () => assert.ok(warmFraction(fill(10, [230, 190, 30])) > 0.9));
test("blue sky is rejected", () => assert.ok(!isPlausible(fill(100, [90, 150, 230]))));
test("grey screenshot is rejected", () => assert.ok(!isPlausible(fill(100, [128, 128, 128]))));
test("green foliage is rejected", () => assert.ok(!isPlausible(fill(100, [60, 160, 60]))));
test("black is rejected", () => assert.ok(!isPlausible(fill(100, [5, 5, 5]))));
test("empty fails open", () => assert.ok(isPlausible(new Uint8ClampedArray(0))));
