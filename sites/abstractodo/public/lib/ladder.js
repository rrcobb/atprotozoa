// ladder.js — the abstraction ladder.
//
// Checking off the current rung never finishes anything: it hands you a
// more abstract version of it. Rung 0 is whatever you (or a starter) typed
// in as a literal task. Every rung after that ignores the literal text and
// climbs a fixed sequence of abstraction bands — practical skill, then
// systems/strategy, then meta/recursive, then philosophical, then the
// final approach — ending at a "singularity" screen at LADDER_END.
//
// Deterministic: generateNext(seed, level) is a pure function of (seed,
// level), seeded via mulberry32, so a given chain always produces the same
// ladder on reload (and is reproducible if the seed is ever shared).

export const LADDER_END = 21; // the rung that triggers the ending screen

export const STARTERS = [
  "organize desk",
  "reply to emails",
  "water the plants",
  "do the dishes",
  "fold the laundry",
  "walk the dog",
  "file the expense report",
  "clean out the inbox",
  "back up the laptop",
  "return the library books",
  "restock the fridge",
  "renew the parking permit",
  "vacuum the apartment",
  "pay the electric bill",
];

// band A: levels 1-3 — get practically better at this kind of thing
const BAND_A = [
  "improve your task management skills",
  "get better at organizing your space",
  "build a more reliable daily routine",
  "strengthen your follow-through",
  "get your life a little more in order",
  "develop better personal habits",
  "improve how you plan your day",
  "get more consistent about small chores",
  "tidy up your whole system, not just the one thing",
  "build a habit tracker for habits like this",
];

// band B: levels 4-7 — systematize / strategize
const BAND_B = [
  "optimize your self-improvement strategy",
  "design a system for managing your systems",
  "audit your productivity system's productivity",
  "professionalize your approach to self-improvement",
  "build a framework for building better frameworks",
  "streamline your streamlining process",
  "create a personal operating system, v2",
  "formalize your informal self-improvement process",
  "write a strategy document for your strategy documents",
  "benchmark your self-improvement against last quarter's self-improvement",
];

// band C: levels 8-12 — meta / recursive
const BAND_C = [
  "improve your process for improving your processes",
  "recursively refactor your self-improvement framework",
  "write a retrospective on your retrospectives",
  "optimize the optimizer that optimizes your optimizations",
  "hold a meeting about the meetings about your habits",
  "audit the audit of your self-improvement audits",
  "build a meta-framework for evaluating your frameworks",
  "improve your ability to evaluate your own improvement",
  "debug the debugging process you use to debug yourself",
  "version-control your personal growth plan",
];

// band D: levels 13-18 — philosophical / absurd
const BAND_D = [
  "question whether self-improvement itself needs improving",
  "achieve a stable fixed point of self-optimization",
  "reconcile the you that made this list with the you optimizing it",
  "become the kind of person who wouldn't need this list",
  "reflect on the epistemology of your own to-do list",
  "formalize the philosophy underlying your formalization",
  "resolve the paradox of optimizing your desire to optimize",
  "transcend the distinction between the task and the task about the task",
  "write a thesis on the metaphysics of getting things done",
  "achieve enlightenment regarding your own checkbox",
  "prove, formally, that this list converges",
  "contemplate the heat death of your to-do list",
];

// band E: levels 19-20 — the final approach
const BAND_E = [
  "optimize the concept of optimization itself",
  "recursively improve your ability to recursively improve",
  "become one with the ladder you're climbing",
];

function bandFor(level) {
  if (level <= 3) return BAND_A;
  if (level <= 7) return BAND_B;
  if (level <= 12) return BAND_C;
  if (level <= 18) return BAND_D;
  if (level <= 20) return BAND_E;
  return null; // level >= LADDER_END: no more rungs, show the ending
}

export function bandNameFor(level) {
  if (level <= 3) return "skills";
  if (level <= 7) return "systems";
  if (level <= 12) return "meta";
  if (level <= 18) return "philosophy";
  if (level <= 20) return "the final approach";
  return "the singularity";
}

// ── seedable RNG (mulberry32) + string hash — same recipe as recursivedo,
// so the same (seed, level) always hands out the same rung. ─────────────
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// A random starter, seeded so a fresh chain's suggestion is stable across
// re-renders of the same "not started yet" screen.
export function randomStarter(seed) {
  const rng = mulberry32(hashSeed("abstractodo:starter:" + seed));
  return pick(rng, STARTERS);
}

// The text shown for a given rung. level 0 is the literal starting task
// (whatever the chain was seeded with); level >= LADDER_END returns null
// (the ending screen owns that state instead).
export function textForLevel(seed, level, startTask) {
  if (level === 0) return startTask;
  const band = bandFor(level);
  if (!band) return null;
  const rng = mulberry32(hashSeed("abstractodo:" + seed + "#" + level));
  return pick(rng, band);
}

export function isEnding(level) {
  return level >= LADDER_END;
}
