// Unit tests for public/lib/geohash.js — verifies encoding against known
// reference geohashes (Wikipedia's worked examples) so the map picker's
// Place ids are actually correct geohashes, not just plausible-looking
// strings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeGeohash, geohashPlaceId, PLACE_GEOHASH_PRECISION } from "../public/lib/geohash.js";

test("encodeGeohash matches the standard Wikipedia worked example", () => {
  assert.equal(encodeGeohash(57.64911, 10.40744, 11), "u4pruydqqvj");
});

test("encodeGeohash matches a second known reference value", () => {
  assert.equal(encodeGeohash(42.6, -5.6, 5), "ezs42");
});

test("encodeGeohash respects the requested precision length", () => {
  for (const precision of [1, 4, 6, 9]) {
    assert.equal(encodeGeohash(35.6762, 139.6503, precision).length, precision);
  }
});

test("geohashPlaceId is prefixed so it can never collide with a curated PLACES id", () => {
  const id = geohashPlaceId(35.6762, 139.6503);
  assert.ok(id.startsWith("geo:"));
  assert.equal(id, `geo:${encodeGeohash(35.6762, 139.6503, PLACE_GEOHASH_PRECISION)}`);
});

test("geohashPlaceId is stable for the same coordinates and differs for distant ones", () => {
  assert.equal(geohashPlaceId(48.8566, 2.3522), geohashPlaceId(48.8566, 2.3522));
  assert.notEqual(geohashPlaceId(48.8566, 2.3522), geohashPlaceId(-33.8688, 151.2093));
});
