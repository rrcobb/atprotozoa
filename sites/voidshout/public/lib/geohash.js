// geohash.js — standard base32 geohash encoding, used to turn an arbitrary
// map-click lat/lng into a stable Place id (see mappicker.js). No decoding
// needed anywhere in this app; encode is the only direction a Place picker
// requires.

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Encodes lat/lng to a base32 geohash string of the given character
 *  length. Standard interleaved-bit algorithm. */
export function encodeGeohash(lat, lng, precision) {
  let latRange = [-90, 90];
  let lngRange = [-180, 180];
  let hash = "";
  let bit = 0;
  let ch = 0;
  let evenBit = true; // longitude first, per convention
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngRange[0] + lngRange[1]) / 2;
      if (lng >= mid) { ch |= 1 << (4 - bit); lngRange[0] = mid; } else { lngRange[1] = mid; }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (lat >= mid) { ch |= 1 << (4 - bit); latRange[0] = mid; } else { latRange[1] = mid; }
    }
    evenBit = !evenBit;
    if (bit < 4) {
      bit++;
    } else {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

// A Place is a real point someone picked, not a grid cell — but the id
// still needs to be stable so two people who tap "close enough to the same
// spot" land on the same Place instead of each minting their own. 6 chars
// is ~0.61km x 1.22km at the equator: tight enough that a real city block
// doesn't get glued to its neighbor, coarse enough that a slightly-off
// re-tap of the same spot round-trips to the same id.
export const PLACE_GEOHASH_PRECISION = 6;

/** Builds the Place `id` for a map-picked lat/lng — prefixed so it can
 *  never collide with a curated PLACES id (those are plain words like
 *  "tokyo") and so the UI can recognize "this Place came from a map tap"
 *  at a glance. */
export function geohashPlaceId(lat, lng) {
  return `geo:${encodeGeohash(lat, lng, PLACE_GEOHASH_PRECISION)}`;
}
