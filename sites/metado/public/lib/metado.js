// metado.js — a to-do list whose tasks are all suggestions for improving
// the thing that generates the to-do list.
//
// The twist: the "target" of every task isn't a fixed phrase, it's built
// by wrapping the previous target in one more layer of "the thing that
// generates ...". Clear a level's tasks and you can refine — refining
// bumps a personal recursion depth counter (localStorage, per browser)
// and regenerates the list against the newly-deeper target. Nothing about
// the tasks gets smarter or more useful as depth grows; the only thing
// that reliably increases is how many "the thing that generates" you're
// nested inside of. That's the whole joke, made literal instead of
// metaphorical: nesting you can point at, not just talk about.

// ── seedable RNG (mulberry32) + string hash, so the same (depth, slot)
// always hands out the same task to everyone. ───────────────────────────
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

// ── the target: what depth 0 is, and how each level wraps the last. ─────
// focusForDepth(0) === BASE. Each level after that wraps the previous
// string in one more "the thing that generates {prev}", so the string
// itself is a literal, growing recursion — not just a joke about one.
const BASE = "this to-do list";
const WRAP = (inner) => "the thing that generates " + inner;

export function focusForDepth(depth) {
  let focus = BASE;
  for (let i = 0; i < depth; i++) focus = WRAP(focus);
  return focus;
}

// a shortened display form for chrome that can't fit the whole recursion
// (log rows, share text) — collapses anything past 2 wraps.
export function focusShort(depth) {
  if (depth <= 2) return focusForDepth(depth);
  return "the thing that generates ".repeat(2) + "(" + (depth - 2) + " layers deeper) " + BASE;
}

// ── actions: the verb. ───────────────────────────────────────────────────
const ACTIONS = [
  "Refactor",
  "Optimize",
  "Rewrite",
  "Patch",
  "Refine",
  "Streamline",
  "Debug",
  "Polish",
  "Harden",
  "Simplify",
  "Upgrade",
  "Modernize",
  "Tighten",
  "Untangle",
  "Rebuild",
  "Audit",
];

// ── aspects: the part of the target the action lands on. {focus} is
// substituted with the current recursion target. ────────────────────────
const ASPECTS = [
  "the part of {focus} that decides what to improve next",
  "the part of {focus} that grades its own last improvement",
  "how {focus} explains itself to the layer above it",
  "the seed that picks {focus}'s next task",
  "the assumption {focus} is quietly relying on",
  "the interface between {focus} and the thing that generates it",
  "the changelog {focus} keeps for an audience of one",
  "the part of {focus} that is proud of itself",
  "the checkbox {focus} is about to ask you to click",
  "the backlog {focus} never gets through",
  "the version number {focus} increments instead of improving",
  "the mirror {focus} checks itself in",
];

// ── clauses: optional trailing twist, recursion made explicit. ──────────
const CLAUSES = [
  " — then write a task about how that went, for whatever generates this one.",
  ", but only using tools {focus} built for itself.",
  ". The layer below did the same thing. The layer above will too.",
  ", and log the outcome somewhere only one layer will ever read.",
  ", carefully, so this doesn't spawn a task about being careful.",
  ". No due date — recursion is a shape, not a milestone.",
  ", then hand the credit upward to whatever generates {focus}.",
  " before the task about improving that gets added to the list.",
  ", or at least convince the layer above that you did.",
  ", and try not to notice that this is the whole website.",
];

const sub = (s, focus) => s.split("{focus}").join(focus);

// generate one task string for a given focus. ~55% chance of a trailing
// clause; both {focus} placeholders get substituted.
export function generate(rng, focus) {
  let task = pick(rng, ACTIONS) + " " + sub(pick(rng, ASPECTS), focus);
  if (rng() < 0.55) task += sub(pick(rng, CLAUSES), focus);
  else task += ".";
  return task;
}

// the N tasks for a given recursion depth — stable for everyone at that
// depth, since it's seeded from the depth + slot index rather than the
// date. Depth is user-driven (you refine yourself), not calendar-driven.
export const TASKS_PER_LEVEL = 3;

export function tasksForDepth(depth, count = TASKS_PER_LEVEL) {
  const focus = focusForDepth(depth);
  const out = [];
  for (let i = 0; i < count; i++) {
    const rng = mulberry32(hashSeed("metado:" + depth + ":" + i));
    out.push(generate(rng, focus));
  }
  return out;
}
