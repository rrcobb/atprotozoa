// liveness.js — turn "days since each follower last did anything" into numbers.
// Pure functions, no DOM, so tests/liveness.test.mjs can call them under node.

export const DEFAULT_WINDOW = 30; // days; a follower is "live" if active within it
export const HORIZON = 365; // days; anything older (or never active) counts as a year — the display horizon, a product decision
export const HALF_LIFE = 30; // days; a follower last seen 30d ago is worth half of one seen today

export const BUCKETS = [
  { label: "today", max: 1 },
  { label: "this week", max: 7 },
  { label: "this month", max: 30 },
  { label: "3 months", max: 90 },
  { label: "this year", max: 365 },
  { label: "a year+ / never", max: Infinity },
];

export function daysSince(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, (now - t) / 86400000);
}

// days: one entry per successfully sampled follower (Infinity = never active).
// total: the account's real follower count, which can exceed days.length when sampled.
export function summarize(days, total, windowDays = DEFAULT_WINDOW) {
  const n = days.length;
  if (!n) return null;
  const capped = days.map((d) => Math.min(d, HORIZON));
  const live = days.filter((d) => d <= windowDays).length;
  const share = live / n;
  const sorted = [...capped].sort((a, b) => a - b);
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const mean = capped.reduce((a, b) => a + b, 0) / n;
  // Freshness is a 0..1 average of per-follower decay, so it is a rate, not a
  // sum: a big account isn't punished for having more dormant followers in
  // absolute terms, and one ancient account can't drag a mean far.
  const freshness = days.reduce((a, d) => a + (Number.isFinite(d) ? Math.pow(0.5, d / HALF_LIFE) : 0), 0) / n;
  const liveEstimate = Math.round(share * total);
  // Liveness index: freshness scaled by log10 of audience, saturating at a
  // million followers, so reach counts but with diminishing returns — a
  // product decision, picked so a 500-follower account that's all live
  // outscores a 5-million one that's mostly asleep.
  const index = 100 * freshness * Math.min(1, Math.log10(1 + total) / 6);
  const buckets = BUCKETS.map((b, i) => {
    const lo = i ? BUCKETS[i - 1].max : -1;
    return { label: b.label, count: days.filter((d) => d > lo && d <= b.max).length };
  });
  // d > lo with lo=-1 includes 0; the last bucket's max is Infinity so it also catches Infinity (Infinity <= Infinity)
  return { n, total, live, share, liveEstimate, mean, median, freshness, index, buckets, windowDays };
}
