// graycart — seeded RNG + small helpers. Everything about a cartridge
// (palette permutation, sprites, level, mechanic choice, params, sounds)
// derives from one seed, so a run is deterministic once it starts even
// though the seed itself is fresh random noise on every page load.
(function (global) {
  "use strict";

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function freshSeed() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0];
  }

  function makeRng(seed) {
    const next = mulberry32(seed);
    return {
      seed,
      float: () => next(),
      range: (lo, hi) => lo + next() * (hi - lo),
      int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
      bool: (p) => next() < (p === undefined ? 0.5 : p),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      shuffle: (arr) => {
        const out = arr.slice();
        for (let i = out.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
      },
    };
  }

  global.GC = global.GC || {};
  global.GC.mulberry32 = mulberry32;
  global.GC.freshSeed = freshSeed;
  global.GC.makeRng = makeRng;
})(window);
