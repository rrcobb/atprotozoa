// rate.js — rate of change of banh mi posting, and what drove each jump or drop.
// Pure functions, no DOM, so they can be tested under node.

export const BIN = { day: 86400e3, week: 7 * 86400e3 };

// Post counts per bin starting at t0. The final bin is dropped when it hasn't finished
// yet (end > now): a half-elapsed bin always reads as a fake crash in the derivative.
export function series(posts, t0, now, bin) {
  const nb = Math.floor((now - t0) / bin); // only complete bins
  const count = new Array(Math.max(0, nb)).fill(0);
  for (const p of posts) {
    const i = Math.floor((p.createdAt - t0) / bin);
    if (i >= 0 && i < nb) count[i]++;
  }
  // d1[i] = change in posts/bin from the previous bin (velocity); d2[i] = change in d1 (acceleration)
  const d1 = count.map((c, i) => (i ? c - count[i - 1] : 0));
  const d2 = d1.map((d, i) => (i > 1 ? d - d1[i - 1] : 0));
  return { t0, bin, count, d1, d2 };
}

const median = (a) => {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Robust spread of d1 (median absolute deviation, scaled to sigma) so one giant spike
// doesn't inflate the yardstick it's judged by.
export function sigma(d1) {
  const m = median(d1);
  return (median(d1.map((d) => Math.abs(d - m))) * 1.4826) || 1;
}

// Is it steady background chatter or bursts? Share of all posts that landed in the
// busiest 5% of bins, and how many bins were statistical outliers (|z| > 3.5).
export function character(s) {
  const n = s.count.length;
  if (n < 3) return { verdict: "not enough history yet", baseline: median(s.count), burst: 0, outliers: 0 };
  const total = s.count.reduce((a, b) => a + b, 0) || 1;
  const top = s.count.slice().sort((a, b) => b - a).slice(0, Math.max(1, Math.ceil(n * 0.05)));
  const burst = top.reduce((a, b) => a + b, 0) / total;
  const sg = sigma(s.d1), md = median(s.d1);
  const outliers = s.d1.filter((d, i) => i && Math.abs(d - md) / sg > 3.5).length;
  const verdict = burst > 0.4 ? "mostly bursts: a few spikes carry the volume"
    : burst > 0.2 ? "background chatter with real spikes on top"
    : "a steady background of sandwich talk";
  return { verdict, baseline: median(s.count), burst, outliers };
}

// The biggest single-bin moves, ranked by |d1|. Returns {i, d1, z} for the top n.
export function jumps(s, n) {
  const sg = sigma(s.d1), md = median(s.d1);
  return s.d1.map((d, i) => ({ i, d1: d, z: (d - md) / sg }))
    .filter((j) => j.i > 0 && j.d1 !== 0)
    .sort((a, b) => Math.abs(b.d1) - Math.abs(a.d1))
    .slice(0, n);
}

// What was going on inside bin i: who posted most, how many were brand-new carriers,
// and whose accounts the in-bin links pointed at (the likely seeds of a cluster).
// model is buildModel()'s output.
export function explain(model, s, i) {
  const a = s.t0 + i * s.bin, b = a + s.bin;
  const posts = model.posts.filter((p) => p.createdAt >= a && p.createdAt < b);
  const by = new Map();
  for (const p of posts) by.set(p.did, (by.get(p.did) || 0) + 1);
  const nodeBy = new Map(model.nodes.map((n) => [n.did, n]));
  const fresh = model.nodes.filter((n) => n.first >= a && n.first < b).length;
  const posters = [...by].sort((x, y) => y[1] - x[1]).slice(0, 3)
    .map(([did, k]) => ({ did, handle: nodeBy.get(did).handle, n: k }));
  const inl = new Map();
  for (const e of model.edges) if (e.t >= a && e.t < b) inl.set(e.a, (inl.get(e.a) || 0) + 1);
  const seeds = [...inl].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([did, k]) => {
    const node = nodeBy.get(did);
    // their first post inside the bin, else their first post ever: the thing others were reacting to
    const post = node.posts.find((p) => p.createdAt >= a && p.createdAt < b) || node.posts[0];
    return { did, handle: node.handle, links: k, post };
  });
  const top = posters[0];
  return { a, b, total: posts.length, accounts: by.size, fresh, posters, seeds, topShare: top ? top.n / (posts.length || 1) : 0 };
}

// One sentence on why bin i moved. For a drop, the cause lives in the bin before it
// (what faded), so that bin is the one explained.
export function cause(model, s, j) {
  const up = j.d1 > 0;
  const e = explain(model, s, up ? j.i : j.i - 1);
  const bits = [];
  if (up) {
    bits.push(`${e.total} posts from ${e.accounts} account${e.accounts === 1 ? "" : "s"}, ${e.fresh} of them first-timers`);
  } else {
    bits.push(`the prior ${e.total}-post burst from ${e.accounts} account${e.accounts === 1 ? "" : "s"} didn't repeat`);
  }
  if (e.posters[0] && e.topShare >= 0.25 && e.total > 3) bits.push(`@${e.posters[0].handle} alone wrote ${Math.round(e.topShare * 100)}%`);
  if (e.seeds[0]) bits.push(`${e.seeds[0].links} link${e.seeds[0].links === 1 ? "" : "s"} point at @${e.seeds[0].handle}`);
  return { text: bits.join("; "), seed: e.seeds[0] || null, bin: e };
}
