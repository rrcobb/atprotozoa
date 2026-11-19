// stats.js — pure word-counting + log-odds ranking (no DOM, testable in node).

const STOP = new Set(("a an and are as at be but by for from has have i i'm im in is it it's its me my of on or so that the " +
  "this to was we with you your not no do if just all can will about more up out get one com http https www bsky social " +
  "he she they his her their them our us what who when how than then there here also too very really").split(" "));

// Words + emoji from a profile's display name and bio. Each distinct token
// counts once per profile, so one bio shouting "cat cat cat" can't dominate.
export function tokens(text) {
  const clean = String(text || "").toLowerCase().replace(/https?:\/\/\S+/g, " ");
  const found = clean.match(/\p{L}[\p{L}\p{M}'’]*|\p{Extended_Pictographic}/gu) || [];
  const out = new Set();
  for (const t of found) {
    const w = t.replace(/['’]s$/, "");
    if (w.length < 2 && !/\p{Extended_Pictographic}/u.test(w)) continue;
    if (STOP.has(w)) continue;
    out.add(w);
  }
  return [...out];
}

export function newCounts() {
  return { cat: { n: 0, words: new Map() }, anime: { n: 0, words: new Map() } };
}

export function addProfile(counts, group, text) {
  const g = counts[group];
  g.n++;
  for (const w of tokens(text)) g.words.set(w, (g.words.get(w) || 0) + 1);
}

// Smoothed log-odds of a word appearing in profiles of one group vs the other.
// Positive = cat-leaning. `minTotal` is a display decision: a word seen in
// fewer than that many profiles overall is noise, not a trend.
export function rank(counts, { minTotal = 4, top = 15 } = {}) {
  const { cat, anime } = counts;
  const all = new Set([...cat.words.keys(), ...anime.words.keys()]);
  const rows = [];
  const a = 0.5; // additive smoothing
  for (const w of all) {
    const c = cat.words.get(w) || 0, n = anime.words.get(w) || 0;
    if (c + n < minTotal) continue;
    const lo = Math.log((c + a) / (cat.n - c + a)) - Math.log((n + a) / (anime.n - n + a));
    rows.push({ word: w, cat: c, anime: n, lo });
  }
  rows.sort((x, y) => y.lo - x.lo);
  return {
    cat: rows.filter((r) => r.lo > 0).slice(0, top),
    anime: rows.filter((r) => r.lo < 0).slice(-top).reverse(),
  };
}

// CLIP zero-shot: softmax over cosine similarities (CLIP's logit scale is 100).
export function classify(imageEmb, textEmbs) {
  const norm = (v) => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return v.map((x) => x / s); };
  const im = norm(imageEmb);
  const logits = textEmbs.map((t) => {
    const tn = norm(t); let d = 0;
    for (let i = 0; i < im.length; i++) d += im[i] * tn[i];
    return d * 100;
  });
  const m = Math.max(...logits);
  const ex = logits.map((l) => Math.exp(l - m));
  const z = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / z);
}
