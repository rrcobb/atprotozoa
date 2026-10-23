import test from "node:test";
import assert from "node:assert";
import { synthFart, PRESETS } from "../public/fart.js";

const SR = 22050;
// share of spectral energy in [lo,hi) Hz, plain DFT over the first 4096 samples
function band(x, lo, hi) {
  const W = 4096; let e = 0, tot = 0;
  for (let k = 1; k < W / 2; k++) {
    const f = (k * SR) / W; let re = 0, im = 0;
    for (let j = 0; j < W; j++) { re += x[j] * Math.cos((2 * Math.PI * k * j) / W); im -= x[j] * Math.sin((2 * Math.PI * k * j) / W); }
    const p = re * re + im * im; tot += p; if (f >= lo && f < hi) e += p;
  }
  return e / tot;
}

for (const name of Object.keys(PRESETS)) {
  test(name + ": finite, bounded, right length, not silent", () => {
    const x = synthFart(SR, name, 7);
    assert.equal(x.length, Math.floor(SR * PRESETS[name].dur));
    let pk = 0;
    for (const v of x) { assert.ok(Number.isFinite(v)); pk = Math.max(pk, Math.abs(v)); }
    assert.ok(pk > 0.5 && pk <= 0.9, "peak " + pk);
  });
  test(name + ": mostly low-frequency (reference centroid ~1 kHz)", () => {
    const x = synthFart(SR, name, 11);
    assert.ok(band(x, 20, 2500) > 0.85, "low band share " + band(x, 20, 2500));
  });
}

test("deterministic per seed, varied across seeds", () => {
  const a = synthFart(SR, "classic", 1), b = synthFart(SR, "classic", 1), c = synthFart(SR, "classic", 2);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});
