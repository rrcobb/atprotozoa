// Unit tests for public/lib/mnemonic.js's describePair — the rule-based
// logic that decides which visual trait (color, then brightness, then
// saturation, then highlight position, then just the names) is worth
// telling a human about for a given pair of avatars.
import { test } from "node:test";
import assert from "node:assert/strict";
import { describePair } from "../public/lib/mnemonic.js";

const person = (handle) => ({ handle, displayName: handle });
const feat = (h, s, l, quadrants = [128, 128, 128, 128]) => ({ hsl: { h, s, l }, quadrants });

test("leads with color when the two avatars are in different color families", () => {
  const a = person("alice"), b = person("bob");
  const red = feat(0, 70, 50);
  const blue = feat(220, 70, 50);
  const { mnemonic, lineA, lineB } = describePair(a, b, red, blue, 4);
  assert.match(lineA, /red/);
  assert.match(lineB, /blue/);
  assert.match(mnemonic, /alice/);
  assert.match(mnemonic, /bob/);
});

test("falls back to brightness when both avatars are the same color family", () => {
  const a = person("alice"), b = person("bob");
  const dark = feat(220, 70, 20);
  const bright = feat(220, 70, 78);
  const { mnemonic } = describePair(a, b, dark, bright, 4);
  assert.match(mnemonic, /dark|bright/);
});

test("falls all the way back to alphabetical names when nothing visual differs", () => {
  const a = person("zeta"), b = person("alpha");
  const same = feat(220, 40, 50);
  const { mnemonic } = describePair(a, b, same, same, 4);
  assert.match(mnemonic, /alpha before zeta/);
});

test("pct reflects the Hamming distance out of 64 bits", () => {
  const a = person("alice"), b = person("bob");
  const red = feat(0, 70, 50);
  const blue = feat(220, 70, 50);
  const { pct } = describePair(a, b, red, blue, 0);
  assert.equal(pct, 100);
  const { pct: pctHalf } = describePair(a, b, red, blue, 32);
  assert.equal(pctHalf, 50);
});
