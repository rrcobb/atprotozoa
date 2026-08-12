// hive-engine.js — the pure game logic for hivemind's bee: leveling, math
// problem generation, vocab quiz picking, badges, hunger decay. No DOM, no
// fetch, no Date.now() calls baked in (callers pass `now`/rng explicitly) so
// this same file runs unmodified in the browser and under plain node for
// testing. UMD-ish wrapper so `require("./hive-engine.js")` works in node
// and `window.HiveEngine` works in the browser — same pattern as
// sites/simcluster-twin's style-engine.js.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HiveEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // XP required is a growing curve (sqrt-shaped): early levels come fast,
  // later ones take real, sustained homework. Capped at level 30 ("queen
  // bee") — XP keeps counting past that for bragging rights, but the bee
  // itself stops growing new stages.
  var MAX_LEVEL = 30;

  function levelForXp(xp) {
    var lvl = 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 10));
    return Math.min(MAX_LEVEL, lvl);
  }

  function xpForLevel(level) {
    // inverse of levelForXp's floor(sqrt(xp/10)) — xp at which `level` is
    // first reached
    var steps = Math.max(0, level - 1);
    return Math.ceil(steps * steps * 10);
  }

  function levelProgress(xp) {
    var level = levelForXp(xp);
    if (level >= MAX_LEVEL) return { level: level, into: 0, span: 0, frac: 1 };
    var floor = xpForLevel(level);
    var ceil = xpForLevel(level + 1);
    var span = Math.max(1, ceil - floor);
    var into = Math.max(0, xp - floor);
    return { level: level, into: into, span: span, frac: Math.min(1, into / span) };
  }

  var TITLES = [
    [1, "larva"],
    [3, "hatchling"],
    [6, "worker bee"],
    [10, "forager"],
    [15, "scout"],
    [20, "elder bee"],
    [25, "royal guard"],
    [30, "queen bee"],
  ];
  function titleForLevel(level) {
    var t = TITLES[0][1];
    for (var i = 0; i < TITLES.length; i++) {
      if (level >= TITLES[i][0]) t = TITLES[i][1];
    }
    return t;
  }

  // ---- rng ------------------------------------------------------------
  // mulberry32 — small, seedable, good enough for picking quiz questions and
  // distractors. Callers that don't care about reproducibility can pass
  // Math.random directly.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function shuffle(arr, rng) {
    var out = arr.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  // ---- math problems ----------------------------------------------------
  // Difficulty bucket by level — see sites/hivemind's README-ish comment in
  // app.js for the reasoning. Bucket 1: add/sub within 20. Bucket 2: times
  // tables + add/sub within 100. Bucket 3: two-step arithmetic, round
  // percentages. Bucket 4: one-variable equations, order of operations.
  // Bucket 5: like-denominator fractions, bigger two-step equations.
  function mathBucket(level) {
    if (level < 5) return 1;
    if (level < 10) return 2;
    if (level < 16) return 3;
    if (level < 24) return 4;
    return 5;
  }

  function randInt(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  function distractorsFor(answer, rng, spread) {
    var seen = new Set([answer]);
    var out = [];
    var guard = 0;
    while (out.length < 3 && guard < 50) {
      guard++;
      var delta = randInt(rng, -spread, spread);
      if (delta === 0) continue;
      var cand = answer + delta;
      if (seen.has(cand)) continue;
      seen.add(cand);
      out.push(cand);
    }
    // pathological case (tiny spread): pad with answer+1, answer+2, ...
    var pad = 1;
    while (out.length < 3) {
      var cand2 = answer + pad;
      if (!seen.has(cand2)) {
        seen.add(cand2);
        out.push(cand2);
      }
      pad++;
    }
    return out;
  }

  function makeChoiceProblem(prompt, answer, rng, spread) {
    var choices = shuffle(distractorsFor(answer, rng, spread).concat([answer]), rng);
    return { prompt: prompt, answer: answer, choices: choices };
  }

  function generateMathProblem(level, rng) {
    rng = rng || Math.random;
    var bucket = mathBucket(level);

    if (bucket === 1) {
      var a = randInt(rng, 1, 20);
      var b = randInt(rng, 1, 20);
      if (rng() < 0.5) {
        return makeChoiceProblem(a + " + " + b + " = ?", a + b, rng, 5);
      }
      if (b > a) { var t = a; a = b; b = t; }
      return makeChoiceProblem(a + " − " + b + " = ?", a - b, rng, 5);
    }

    if (bucket === 2) {
      if (rng() < 0.5) {
        var x = randInt(rng, 2, 12);
        var y = randInt(rng, 2, 12);
        return makeChoiceProblem(x + " × " + y + " = ?", x * y, rng, 12);
      }
      var p = randInt(rng, 1, 100);
      var q = randInt(rng, 1, 100 - p);
      return makeChoiceProblem(p + " + " + q + " = ?", p + q, rng, 10);
    }

    if (bucket === 3) {
      if (rng() < 0.5) {
        var m = randInt(rng, 2, 9);
        var n = randInt(rng, 2, 9);
        var k = randInt(rng, 2, 9);
        return makeChoiceProblem(m + " × " + n + " + " + k + " = ?", m * n + k, rng, 8);
      }
      var whole = pick([20, 40, 50, 60, 80, 100, 120, 200], rng);
      var pct = pick([10, 20, 25, 50, 75], rng);
      return makeChoiceProblem(pct + "% of " + whole + " = ?", (whole * pct) / 100, rng, Math.max(5, whole / 10));
    }

    if (bucket === 4) {
      if (rng() < 0.5) {
        var xv = randInt(rng, 2, 20);
        var add = randInt(rng, 1, 30);
        var sum = xv + add;
        return makeChoiceProblem("x + " + add + " = " + sum + ", x = ?", xv, rng, 6);
      }
      var d1 = randInt(rng, 2, 12);
      var d2 = randInt(rng, 2, 12);
      var d3 = randInt(rng, 2, 12);
      return makeChoiceProblem(d1 + " + " + d2 + " × " + d3 + " = ?", d1 + d2 * d3, rng, 10);
    }

    // bucket 5
    if (rng() < 0.5) {
      var denom = pick([3, 4, 5, 6, 8, 10], rng);
      var n1 = randInt(rng, 1, denom - 1);
      var n2 = randInt(rng, 1, denom - 1);
      return makeChoiceProblem(n1 + "/" + denom + " + " + n2 + "/" + denom + " = ?/" + denom, n1 + n2, rng, 4);
    }
    var xv2 = randInt(rng, 3, 25);
    var mul = randInt(rng, 2, 6);
    var add2 = randInt(rng, 1, 20);
    var total = xv2 * mul + add2;
    return makeChoiceProblem(mul + "x + " + add2 + " = " + total + ", x = ?", xv2, rng, 6);
  }

  // ---- vocab quiz ---------------------------------------------------------
  // Word difficulty gates open as the bee levels up — tier N unlocks around
  // level 6*(N-1)+1, so a level-1 bee only ever sees tier-1 words and a
  // level-25 bee is drawing from the full pool.
  function maxTierForLevel(level) {
    return Math.min(5, 1 + Math.floor((level - 1) / 6));
  }

  function pickVocabQuestion(words, level, seenWords, rng) {
    rng = rng || Math.random;
    if (!words || words.length === 0) return null;
    var maxTier = maxTierForLevel(level);
    var pool = words.filter(function (w) { return w.tier <= maxTier; });
    if (pool.length === 0) pool = words;

    var seen = seenWords || [];
    var fresh = pool.filter(function (w) { return seen.indexOf(w.word) === -1; });
    var candidates = fresh.length > 0 ? fresh : pool;
    var target = pick(candidates, rng);

    var sameTier = pool.filter(function (w) { return w.word !== target.word; });
    var distractorPool = sameTier.length >= 3 ? sameTier : pool.filter(function (w) { return w.word !== target.word; });
    var picked = shuffle(distractorPool, rng).slice(0, 3);
    // pathological case: fewer than 3 other words in the whole pool
    while (picked.length < 3 && words.length > picked.length + 1) {
      var extra = pick(words, rng);
      if (extra.word !== target.word && picked.indexOf(extra) === -1) picked.push(extra);
    }

    var choices = shuffle(picked.map(function (w) { return w.definition; }).concat([target.definition]), rng);
    return { word: target.word, definition: target.definition, choices: choices, isNew: fresh.indexOf(target) !== -1 };
  }

  // ---- hunger -------------------------------------------------------------
  var HUNGER_MAX = 100;
  var HUNGER_DECAY_PER_MS = 100 / (8 * 60 * 60 * 1000); // fully decays over ~8h untouched

  function decayedHunger(hunger, lastFedAt, now) {
    if (lastFedAt == null) return hunger;
    var elapsed = Math.max(0, now - lastFedAt);
    return Math.max(0, hunger - elapsed * HUNGER_DECAY_PER_MS);
  }

  function moodFor(hunger) {
    if (hunger > 60) return "happy";
    if (hunger > 25) return "content";
    return "sluggish";
  }

  // ---- badges ---------------------------------------------------------
  var BADGE_DEFS = [
    { id: "first-sting", name: "first sting", desc: "answer your first question", test: function (s) { return s.mathSolved + s.wordsLearned >= 1; } },
    { id: "wordsmith-10", name: "wordsmith", desc: "learn 10 words", test: function (s) { return s.wordsLearned >= 10; } },
    { id: "wordsmith-25", name: "lexicographer", desc: "learn 25 words", test: function (s) { return s.wordsLearned >= 25; } },
    { id: "mathwhiz-10", name: "math whiz", desc: "solve 10 problems", test: function (s) { return s.mathSolved >= 10; } },
    { id: "mathwhiz-25", name: "calculator", desc: "solve 25 problems", test: function (s) { return s.mathSolved >= 25; } },
    { id: "streak-5", name: "on a roll", desc: "hit a streak of 5", test: function (s) { return s.bestStreak >= 5; } },
    { id: "streak-10", name: "unstoppable", desc: "hit a streak of 10", test: function (s) { return s.bestStreak >= 10; } },
    { id: "century", name: "veteran", desc: "reach level 10", test: function (s) { return s.level >= 10; } },
    { id: "elder", name: "elder bee", desc: "reach level 20", test: function (s) { return s.level >= 20; } },
    { id: "queenbee", name: "queen bee", desc: "reach level 30, the top of the hive", test: function (s) { return s.level >= 30; } },
  ];

  function computeBadges(state) {
    var out = [];
    for (var i = 0; i < BADGE_DEFS.length; i++) {
      if (BADGE_DEFS[i].test(state)) out.push(BADGE_DEFS[i].id);
    }
    return out;
  }

  return {
    MAX_LEVEL: MAX_LEVEL,
    HUNGER_MAX: HUNGER_MAX,
    levelForXp: levelForXp,
    xpForLevel: xpForLevel,
    levelProgress: levelProgress,
    titleForLevel: titleForLevel,
    mathBucket: mathBucket,
    maxTierForLevel: maxTierForLevel,
    generateMathProblem: generateMathProblem,
    pickVocabQuestion: pickVocabQuestion,
    decayedHunger: decayedHunger,
    moodFor: moodFor,
    BADGE_DEFS: BADGE_DEFS,
    computeBadges: computeBadges,
    mulberry32: mulberry32,
    shuffle: shuffle,
  };
});
