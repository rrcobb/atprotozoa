// model.js — the two models behind surprisal, pure JS, no DOM, no network.
//
//  1. A word-level trigram Markov model (interpolated, hashed count tables)
//     that says how many bits of surprise a post carries per word.
//  2. A ridge regression (plain SGD) that predicts how a post's likes compare
//     to what the same author usually gets, from style features, a hashed
//     bag of words, and the Markov surprisal of the post itself — so the
//     "is novelty good?" curve is learned from the corpus, not assumed.
//
// Tested by tests/model.test.mjs (node --test).

// --- tokenizer --------------------------------------------------------------

const TOKEN_RE = /https?:\/\/\S+|@[\w.-]+|#[\p{L}\p{N}_]+|[\p{L}\p{N}_'’-]+|\p{Extended_Pictographic}|[!?.,;:()"]/gu;

// -> [{ raw, t, start, end }] where `t` is the normalised model token.
export function tokenize(text) {
  const out = [];
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(text))) {
    const raw = m[0];
    let t;
    if (raw.startsWith("http")) t = "‹url›";
    else if (raw[0] === "@") t = "‹@›";
    else t = raw.toLowerCase();
    out.push({ raw, t, start: m.index, end: m.index + raw.length });
  }
  return out;
}

const isWord = (t) => /[\p{L}\p{N}]/u.test(t) || t === "‹url›" || t === "‹@›" || /\p{Extended_Pictographic}/u.test(t);

// --- markov -----------------------------------------------------------------

const BITS = 22; // 4M slots per table (16 MB each): hashed n-gram counts. Collisions only ever inflate a count slightly; a fixed-size table is a browser-memory limit, not a data cap — every post is counted.
const BOS = 0, EOS = 1;
// Fixed interpolation weights for trigram / bigram / unigram. Hand-picked, not tuned: Jelinek-Mercer with these is a standard starting point and the point of the site is the surprise, not perplexity records.
const L3 = 0.5, L2 = 0.35, L1 = 0.15;
const UNI_ALPHA = 0.1; // additive smoothing on unigrams; unseen words get alpha mass

function h2(a, b) {
  let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13;
  return h >>> (32 - BITS);
}
function h3(a, b, c) {
  let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b) ^ Math.imul(c + 1, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  return h >>> (32 - BITS);
}

export class Markov {
  constructor() {
    this.vocab = new Map([["<s>", BOS], ["</s>", EOS]]);
    this.uni = [0, 0];
    this.hist1 = [0, 0]; // how often each word was a one-word history
    this.bi = new Uint32Array(1 << BITS);
    this.tri = new Uint32Array(1 << BITS);
    this.hist2 = new Uint32Array(1 << BITS);
    this.total = 0;
    this.posts = 0;
  }

  // token strings -> ids; unseen words get -1 unless `grow`.
  ids(toks, grow) {
    const seq = [BOS, BOS];
    for (const t of toks) {
      let id = this.vocab.get(t);
      if (id === undefined) {
        if (grow) { id = this.uni.length; this.vocab.set(t, id); this.uni.push(0); this.hist1.push(0); }
        else id = -1;
      }
      seq.push(id);
    }
    seq.push(EOS);
    return seq;
  }

  _bump(seq, d) {
    for (let i = 2; i < seq.length; i++) {
      const pp = seq[i - 2], prev = seq[i - 1], w = seq[i];
      this.uni[w] += d;
      this.hist1[prev] += d;
      this.bi[h2(prev, w)] += d;
      this.tri[h3(pp, prev, w)] += d;
      this.hist2[h2(pp, prev)] += d;
      this.total += d;
    }
  }

  add(toks) {
    const seq = this.ids(toks, true);
    this._bump(seq, 1);
    this.posts++;
    return seq;
  }
  // inverse of add() for a post that is currently in the model (leave-one-out scoring)
  remove(seq) { this._bump(seq, -1); this.posts--; }
  restore(seq) { this._bump(seq, 1); this.posts++; }

  prob(pp, p, w) {
    const V = this.uni.length;
    const c = w >= 0 ? this.uni[w] : 0;
    const p1 = (c + UNI_ALPHA) / (this.total + UNI_ALPHA * (V + 1));
    let num = L1 * p1, den = L1;
    if (w >= 0 && p >= 0) {
      const hc = this.hist1[p];
      if (hc > 0) { num += L2 * Math.min(1, this.bi[h2(p, w)] / hc); den += L2; }
      if (pp >= 0) {
        const h2c = this.hist2[h2(pp, p)];
        if (h2c > 0) { num += L3 * Math.min(1, this.tri[h3(pp, p, w)] / h2c); den += L3; }
      }
    } else if (p >= 0) {
      // unseen word after a known word: the history was seen, the continuation wasn't
      const hc = this.hist1[p];
      if (hc > 0) den += L2;
      if (pp >= 0 && this.hist2[h2(pp, p)] > 0) den += L3;
    }
    return num / den;
  }

  // Bits of surprise per token. The final entry (end of post) is dropped so the
  // number is per word; returns null for an empty post.
  surprisalOfSeq(seq) {
    const bits = [];
    for (let i = 2; i < seq.length - 1; i++) {
      bits.push(-Math.log2(this.prob(seq[i - 2], seq[i - 1], seq[i])));
    }
    if (!bits.length) return null;
    let sum = 0, oov = 0;
    for (let i = 0; i < bits.length; i++) { sum += bits[i]; if (seq[i + 2] < 0 || this.uni[seq[i + 2]] === 0) oov++; }
    return { bits, mean: sum / bits.length, oov: oov / bits.length };
  }

  surprisal(toks) {
    return this.surprisalOfSeq(this.ids(toks, false));
  }
}

// --- features ---------------------------------------------------------------

const N_BINS = 8;
const BOW = 2048;
export const DENSE_NAMES = [
  "length", "word count", "question", "exclamation", "link", "mentions", "hashtags", "emoji",
  "capitals", "all lowercase", "digits", "newline", "avg word length", "surprisal", "surprisal²", "unseen words",
];
const ND = DENSE_NAMES.length;
export const DIM = ND + N_BINS + BOW;

function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function denseFeatures(text, toks, sur) {
  const letters = text.replace(/[^\p{L}]/gu, "");
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  const words = toks.filter((t) => /[\p{L}\p{N}]/u.test(t.raw) && t.t[0] !== "‹");
  const s = sur ? sur.mean : 0;
  return [
    Math.log1p(text.length),
    Math.log1p(toks.length),
    /\?/.test(text) ? 1 : 0,
    /!/.test(text) ? 1 : 0,
    toks.some((t) => t.t === "‹url›") ? 1 : 0,
    Math.min(5, toks.filter((t) => t.t === "‹@›").length),
    Math.min(5, toks.filter((t) => t.raw[0] === "#").length),
    Math.min(5, toks.filter((t) => /\p{Extended_Pictographic}/u.test(t.raw)).length),
    letters.length ? upper / letters.length : 0,
    letters.length && text === text.toLowerCase() ? 1 : 0,
    /\d/.test(text) ? 1 : 0,
    /\n/.test(text) ? 1 : 0,
    words.length ? words.reduce((a, t) => a + t.raw.length, 0) / words.length : 0,
    s,
    s * s,
    sur ? sur.oov : 0,
  ];
}

function binOf(s, edges) {
  let b = 0;
  while (b < edges.length && s > edges[b]) b++;
  return b;
}

// -> { idx: number[], val: number[] } with dense features standardised by `norm`.
function sparseVec(text, toks, sur, norm, edges) {
  const d = denseFeatures(text, toks, sur);
  const idx = [], val = [];
  for (let i = 0; i < ND; i++) {
    idx.push(i);
    val.push(norm ? (d[i] - norm.mean[i]) / norm.sd[i] : d[i]);
  }
  if (sur && edges) { idx.push(ND + binOf(sur.mean, edges)); val.push(1); }
  const uniq = new Set(toks.map((t) => t.t).filter(isWord));
  const sc = uniq.size ? 1 / Math.sqrt(uniq.size) : 0;
  for (const t of uniq) { idx.push(ND + N_BINS + (strHash(t) % BOW)); val.push(sc); }
  return { idx, val, dense: d };
}

// --- regression -------------------------------------------------------------

function dot(w, b, v) {
  let s = b;
  for (let i = 0; i < v.idx.length; i++) s += w[v.idx[i]] * v.val[i];
  return s;
}

function pearson(a, b) {
  const n = a.length;
  if (n < 3) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// posts: [{ uri, text, likes, a }] where `a` is an author key (string).
// Resolves to a Trained model. Every post is used: ~10% (by uri hash) is held
// out of the first fit to measure honest accuracy, then folded back into the
// Markov counts.
export async function train(posts, { onProgress = () => {}, epochs = 8 } = {}) {
  const prog = (m) => onProgress(m);
  prog("tokenising…");
  const rows = [];
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    rows.push({ p, toks: tokenize(p.text), hold: strHash(p.uri) % 10 === 0 });
    if (i % 4000 === 3999) { prog(`tokenising… ${i + 1}/${posts.length}`); await tick(); }
  }
  const trainRows = rows.filter((r) => !r.hold);
  const holdRows = rows.filter((r) => r.hold);
  if (trainRows.length < 20) throw new Error("not enough posts to learn from yet");

  const markov = new Markov();
  prog("counting n-grams…");
  for (let i = 0; i < trainRows.length; i++) {
    trainRows[i].seq = markov.add(trainRows[i].toks.map((t) => t.t));
    if (i % 4000 === 3999) { prog(`counting n-grams… ${i + 1}/${trainRows.length}`); await tick(); }
  }

  // Leave-one-out surprisal for training posts: pull the post out of the
  // counts, score it, put it back — so a trained-on post isn't unrealistically
  // unsurprising compared with a brand-new one.
  prog("scoring surprisal…");
  for (let i = 0; i < trainRows.length; i++) {
    const r = trainRows[i];
    markov.remove(r.seq);
    r.sur = markov.surprisalOfSeq(r.seq);
    markov.restore(r.seq);
    if (i % 3000 === 2999) { prog(`scoring surprisal… ${i + 1}/${trainRows.length}`); await tick(); }
  }
  for (const r of holdRows) r.sur = markov.surprisal(r.toks.map((t) => t.t));

  const usable = (r) => r.sur && r.toks.length > 0;
  const tr = trainRows.filter(usable), ho = holdRows.filter(usable);

  // Target: log likes relative to the author's own typical post, so the model
  // learns what makes a post land rather than who has the followers.
  const all = tr.concat(ho);
  const logs = all.map((r) => Math.log1p(r.p.likes));
  const globalMean = logs.reduce((a, b) => a + b, 0) / logs.length;
  const byAuthor = new Map();
  for (const r of tr) {
    const a = byAuthor.get(r.p.a) || { s: 0, n: 0 };
    a.s += Math.log1p(r.p.likes); a.n++;
    byAuthor.set(r.p.a, a);
  }
  const SHRINK = 3; // authors with few posts are pulled toward the global mean (3 pseudo-posts)
  const authorMean = (a) => {
    const e = byAuthor.get(a);
    return e ? (e.s + SHRINK * globalMean) / (e.n + SHRINK) : globalMean;
  };
  for (const r of all) r.y = Math.log1p(r.p.likes) - authorMean(r.p.a);

  const sorted = Float32Array.from(tr.map((r) => r.sur.mean)).sort();
  const edges = [];
  for (let k = 1; k < N_BINS; k++) edges.push(sorted[Math.floor((k / N_BINS) * sorted.length)]);

  // standardise dense features on the training set
  const D = tr.map((r) => denseFeatures(r.p.text, r.toks, r.sur));
  const mean = new Array(ND).fill(0), sd = new Array(ND).fill(0);
  for (const d of D) for (let i = 0; i < ND; i++) mean[i] += d[i];
  for (let i = 0; i < ND; i++) mean[i] /= D.length;
  for (const d of D) for (let i = 0; i < ND; i++) sd[i] += (d[i] - mean[i]) ** 2;
  for (let i = 0; i < ND; i++) sd[i] = Math.sqrt(sd[i] / D.length) || 1;
  const norm = { mean, sd };

  prog("fitting regression…");
  const xs = tr.map((r) => sparseVec(r.p.text, r.toks, r.sur, norm, edges));
  const w = new Float64Array(DIM);
  let b = 0;
  const order = Array.from({ length: xs.length }, (_, i) => i);
  const L2REG = 1e-4;
  for (let ep = 0; ep < epochs; ep++) {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const lr = 0.02 / (1 + ep);
    for (let k = 0; k < order.length; k++) {
      const v = xs[order[k]];
      let err = dot(w, b, v) - tr[order[k]].y;
      if (err > 3) err = 3; else if (err < -3) err = -3; // clip so one viral outlier can't wreck an SGD step
      b -= lr * err;
      for (let i = 0; i < v.idx.length; i++) {
        const j = v.idx[i];
        w[j] -= lr * (err * v.val[i] + L2REG * w[j]);
      }
      if (k % 20000 === 19999) await tick();
    }
    prog(`fitting regression… epoch ${ep + 1}/${epochs}`);
    await tick();
  }

  // honest accuracy on the held-out posts
  const hx = ho.map((r) => sparseVec(r.p.text, r.toks, r.sur, norm, edges));
  const pred = hx.map((v) => dot(w, b, v));
  const truth = ho.map((r) => r.y);
  const r = pearson(pred, truth);
  const meanY = truth.reduce((a, c) => a + c, 0) / (truth.length || 1);
  const rmse = Math.sqrt(pred.reduce((a, p, i) => a + (p - truth[i]) ** 2, 0) / (pred.length || 1));
  const baseRmse = Math.sqrt(truth.reduce((a, t) => a + (t - meanY) ** 2, 0) / (truth.length || 1));

  // novelty curve: mean actual residual per surprisal bin, across everything
  const curve = Array.from({ length: N_BINS }, () => ({ s: 0, n: 0, sur: 0 }));
  for (const rr of all) { const bi = binOf(rr.sur.mean, edges); curve[bi].s += rr.y; curve[bi].sur += rr.sur.mean; curve[bi].n++; }
  const noveltyCurve = curve.map((c) => ({ n: c.n, surprisal: c.n ? c.sur / c.n : 0, lift: c.n ? Math.exp(c.s / c.n) : 1 }));

  // fold the held-out posts into the counts for gameplay
  for (const rr of holdRows) markov.add(rr.toks.map((t) => t.t));

  const feat = DENSE_NAMES.map((name, i) => ({ name, weight: w[i] }));
  const authors = new Set(all.map((x) => x.p.a)).size;

  return new Trained({
    markov, w, b, norm, edges, sorted, globalMean,
    stats: { posts: rows.length, trainPosts: tr.length, holdout: ho.length, authors, r, rmse, baseRmse, noveltyCurve, feat },
  });
}

export class Trained {
  constructor(o) { Object.assign(this, o); }

  // percentile (0..1) of a surprisal value among the corpus's own posts
  percentile(s) {
    const a = this.sorted;
    let lo = 0, hi = a.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < s) lo = mid + 1; else hi = mid; }
    return a.length ? lo / a.length : 0;
  }

  // Score a draft. `tokens` carry per-word surprisal for the heatmap.
  score(text) {
    const toks = tokenize(text);
    if (!toks.length) return null;
    const sur = this.markov.surprisal(toks.map((t) => t.t));
    if (!sur) return null;
    const v = sparseVec(text, toks, sur, this.norm, this.edges);
    const yhat = dot(this.w, this.b, v);
    const lift = Math.exp(yhat);
    const pct = this.percentile(sur.mean);
    // Credit starts above the corpus median surprise and is full at the 90th percentile.
    const credit = Math.max(0, Math.min(1, (pct - 0.5) / 0.4));
    // Mostly-unseen-words gibberish is surprising for the wrong reason.
    const gibberish = Math.max(0, Math.min(1, (sur.oov - 0.3) / 0.4));
    const points = Math.round(100 * lift * credit * (1 - gibberish));
    const predictedLikes = Math.max(0, Math.expm1(this.globalMean + yhat));
    return {
      toks: toks.map((t, i) => ({ ...t, bits: sur.bits[i] })),
      surprisal: sur.mean, oov: sur.oov, percentile: pct,
      lift, credit, gibberish, points, predictedLikes,
    };
  }

  // The "learnable" part: a submitted post joins the corpus, so saying it again
  // (or something close) is no longer surprising.
  learn(text) {
    const toks = tokenize(text);
    if (toks.length) this.markov.add(toks.map((t) => t.t));
  }
}
