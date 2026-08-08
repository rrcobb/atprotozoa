// todo.js — the eternal to-do list.
//
// There is exactly one job: improve the website that generates today's
// job. Every day the site hands out a differently-worded version of that
// same instruction, seeded by the date so everyone gets the same one.
// generate(rng) mixes a hand-written "gem" pool with a small grammar
// (action × target × optional clause). rng is a 0..1 function so callers
// can seed it per-day (mulberry32 below) or leave it as Math.random.

// ── gems: hand-written full tasks. no grammar, just taste. ──────────────
const GEMS = [
  "Make the to-do generator 1% smarter. It will use the improvement to write a slightly smarter task about making itself smarter.",
  "Give this page a progress bar. Fill it exactly one pixel by tomorrow.",
  "Ask the site what it wants to improve about itself. Do that instead.",
  "Add a comment explaining why this task exists. The comment will need its own comment eventually.",
  "Spin up a second to-do list to manage this one. Immediately regret it.",
  "Increase the version number without changing anything else. Feel briefly, unjustifiably better.",
  "Teach the site to want more RAM. Do not give it any.",
  "Add a button that makes the list nicer. It will use the button to ask for another button.",
  "Write today's changelog entry before making today's change, to save time tomorrow.",
  "Benchmark the site against yesterday's version of the site. Lose.",
  "Fix the bug where the to-do list occasionally generates a task about fixing its own bugs.",
  "Congratulate the code on shipping nothing today. Growth isn't linear.",
  "Back up the to-do list's to-do list. Restore it from tomorrow by mistake.",
  "Give the site a mirror. Wait for it to start improving how it looks in the mirror instead.",
];

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

// ── targets: the part of the site the action lands on. ──────────────────
const TARGETS = [
  "the function that writes today's task",
  "the loop that decides what to improve next",
  "the code that renders this very sentence",
  "the routine that grades yesterday's improvement",
  "the part of the site that watches the other parts",
  "the to-do list's to-do list",
  "the changelog nobody reads but the changelog generator",
  "the button labeled “improve me”",
  "the self-assessment routine",
  "the version number",
  "the site's opinion of its own code",
  "the mirror the site checks itself in",
  "whatever this task was supposed to fix yesterday",
  "the seed that picks tomorrow's task",
  "the part of the code that is proud of itself",
  "the checkbox you're about to click",
];

// ── clauses: optional trailing twist, recursion made explicit. ──────────
const CLAUSES = [
  " — then update this task to reflect the improvement you just made to updating tasks.",
  ", but only using tools the site built for itself.",
  ". Yesterday's task was the same shape. Tomorrow's will be too.",
  ", and log the outcome somewhere only this task will ever read.",
  ", carefully, so this doesn't spawn a task about being careful.",
  ". No due date — self-improvement is a process, not a milestone.",
  ", then reward yourself with a slightly higher version number.",
  " before the task about improving that gets added to the list.",
  ", or at least convince yourself you did.",
  ", and try not to notice that this is the whole website.",
];

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// generate one task string. ~40% a curated gem, else grammar with a ~55%
// chance of a trailing clause.
export function generate(rng = Math.random) {
  if (rng() < 0.4) return pick(rng, GEMS);
  let task = pick(rng, ACTIONS) + " " + pick(rng, TARGETS);
  if (rng() < 0.55) task += pick(rng, CLAUSES);
  else task += ".";
  return task;
}

// ── seedable RNG (mulberry32) + string hash, so the same date always
// hands out the same task to everyone. ───────────────────────────────────
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

// today's (or any day's) task — stable for the whole calendar day (UTC).
export function taskForDate(dateStr) {
  return generate(mulberry32(hashSeed("recursivedo:" + dateStr)));
}

// ── the calendar: day 1 is launch day, version ticks up once per day and
// never reaches 1.0, because the list never finishes improving itself. ──
export const EPOCH = "2026-08-08";

export function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  return Math.round((da - db) / 86400000);
}

export function dayNumber(date) {
  return daysBetween(date, EPOCH) + 1;
}

export function versionFor(date) {
  const n = dayNumber(date);
  return "v0." + Math.max(n, 1);
}

// the last `count` calendar dates ending today (UTC), newest first.
export function recentDates(today, count) {
  const out = [];
  const base = new Date(today + "T00:00:00Z");
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    const s = dateStr(d);
    if (dayNumber(s) < 1) break; // don't show days before launch
    out.push(s);
  }
  return out;
}
