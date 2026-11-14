// model.js — the whole parrot: a tokenizer, a vocabulary, and ONE linear layer
// followed by ONE softmax, trained by plain SGD on next-token prediction.
//
// The layer's input is four sparse blocks, concatenated:
//   block 0: one-hot of the previous token        (t-1)
//   block 1: one-hot of the token before that     (t-2)
//   block 2: one-hot of the one before that       (t-3)
//   block 3: bag-of-words (averaged) of up to BAG earlier tokens in the post
// so the weight matrix is (4 * V) x V plus a bias of V. Nothing hidden, nothing
// nonlinear except the softmax on the way out. Because every input is a one-hot
// (or an average of one-hots), "multiply by W" is just "add up a few rows of W",
// which is what the code does.
//
// Optional depth: pass `hidden: [128, 64]` and the single layer becomes an MLP.
// The sparse inputs then sum rows of an embedding-like first layer (rows x H0),
// tanh, any further dense tanh layers, and a final linear layer to the vocab,
// then the same softmax. `hidden: []` (the default) is the one-linear-layer parrot.
//
// Browser-safe and node-safe (no DOM) so tests/ can import it directly.

export const PAD = 0;   // "<s>": start of post, also the padding for short contexts
export const END = 1;   // "</s>": end of post
export const UNK = 2;   // "<unk>": anything outside the vocabulary
export const SPECIAL = ["<s>", "</s>", "<unk>"];

export const BLOCKS = 4;
// Bag window: how many tokens before the 3 positional ones feed the bag block.
// Product decision tied to speed: every bag token costs one extra V-wide row
// per example in both the forward and backward pass, so 6 keeps a training
// example at ~9 rows total.
export const BAG = 6;

// Vocabulary size ceiling. The weight matrix is 4*V*V float32s: V=1500 is 9M
// parameters = 36 MB, comfortable in a phone tab and trainable in under a
// minute; V=3000 would be 144 MB and 4x the compute per example.
export const MAX_VOCAB = 1500;
// A word has to show up this many times to earn a row; once-only words are
// mostly typos and handles, and a row the model sees once can't be learned.
export const MIN_COUNT = 2;
// Ceiling on total weights for any configuration: 64M float32s = 256 MB, about
// what a desktop tab will hold without the browser killing it (and a phone
// won't). Bigger contexts or vocabularies get their vocab trimmed to fit.
export const MAX_PARAMS = 64e6;

export const DEFAULTS = { ctx: 3, bag: BAG, hidden: [], maxVocab: MAX_VOCAB };

// Weights for a vocabulary of V words under cfg ({ctx, bag, hidden}).
export function paramCountFor(V, cfg = {}) {
  const { ctx = 3, hidden = [] } = cfg;
  const blocks = ctx + 1;
  if (!hidden.length) return blocks * V * V + V;
  let n = blocks * V * hidden[0] + hidden[0];
  for (let k = 1; k < hidden.length; k++) n += hidden[k - 1] * hidden[k] + hidden[k];
  return n + hidden[hidden.length - 1] * V + V;
}

// Largest vocab <= want whose configuration stays under MAX_PARAMS.
export function fitVocab(want, cfg = {}) {
  let V = want;
  while (V > 200 && paramCountFor(V, cfg) > MAX_PARAMS) V = Math.floor(V * 0.9);
  return V;
}

// Per-epoch learning-rate decay: 0.7 per epoch at the default 6 epochs, and the
// same overall fall-off (0.7^5) stretched across however many epochs you ask for.
export function decayFor(epochs) {
  return epochs <= 6 ? 0.7 : Math.pow(Math.pow(0.7, 5), 1 / (epochs - 1));
}

const URL_RE = /https?:\/\/\S+|\b[\w-]+(?:\.[\w-]+)+\/\S*/g;
const TOKEN_RE = /@[\w.-]*\w|#[\p{L}\p{N}_]+|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu;

export function tokenize(text) {
  const t = String(text || "").toLowerCase().replace(URL_RE, " ").replace(/’/g, "'");
  return t.match(TOKEN_RE) || [];
}

const NO_SPACE_BEFORE = new Set([",", ".", "!", "?", ";", ":", ")", "]", "…", "%", "'", "”"]);
const NO_SPACE_AFTER = new Set(["(", "[", "“"]);

export function detokenize(tokens) {
  let out = "";
  let prev = "";
  for (const tok of tokens) {
    if (out && !NO_SPACE_BEFORE.has(tok) && !NO_SPACE_AFTER.has(prev)) out += " ";
    out += tok;
    prev = tok;
  }
  return out;
}

// texts: array of post strings. Returns { vocab, index, counts, posts }.
// `posts` are Int32Array token-id sequences, already wrapped as <s> ... </s>.
export function buildCorpus(texts, { maxVocab = MAX_VOCAB } = {}) {
  const tokenized = [];
  const kept = [];
  const freq = new Map();
  for (const text of texts) {
    const toks = tokenize(text);
    if (toks.length < 2) continue; // a one-token post has nothing to predict from
    tokenized.push(toks);
    kept.push(String(text));
    for (const t of toks) freq.set(t, (freq.get(t) || 0) + 1);
  }
  const eligible = [...freq.entries()].filter(([, c]) => c >= MIN_COUNT).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const words = eligible.slice(0, maxVocab - SPECIAL.length).map(([w]) => w);
  const vocab = [...SPECIAL, ...words];
  const index = new Map(vocab.map((w, i) => [w, i]));
  const counts = new Float64Array(vocab.length);
  const posts = tokenized.map((toks) => {
    const ids = new Int32Array(toks.length + 2);
    ids[0] = PAD;
    for (let i = 0; i < toks.length; i++) ids[i + 1] = index.has(toks[i]) ? index.get(toks[i]) : UNK;
    ids[ids.length - 1] = END;
    for (let i = 1; i < ids.length; i++) counts[ids[i]]++;
    return ids;
  });
  return { vocab, index, counts, posts, texts: kept, distinct: freq.size };
}

export class Parrot {
  constructor(vocab, counts, { ctx = 3, bag = BAG, hidden = [], rand = Math.random } = {}) {
    this.vocab = vocab;
    this.V = vocab.length;
    this.counts = counts;
    this.ctx = ctx;
    this.bag = bag;
    this.hidden = hidden;
    this.blocks = ctx + 1;
    // scratch, reused across calls
    this.logits = new Float32Array(this.V);
    this.rows = new Int32Array(ctx + 2 * bag);
    this.wts = new Float32Array(ctx + 2 * bag);
    this.b = new Float32Array(this.V);
    if (!hidden.length) {
      this.W = new Float32Array(this.blocks * this.V * this.V);
    } else {
      const H = hidden, last = H[H.length - 1];
      // first layer: one row of H[0] per (block, word); small gaussian-ish init
      const init = (arr, scale) => { for (let i = 0; i < arr.length; i++) arr[i] = (rand() + rand() + rand() - 1.5) * scale; return arr; };
      this.E = init(new Float32Array(this.blocks * this.V * H[0]), 0.3);
      this.bh = H.map((h) => new Float32Array(h));
      this.Wh = [null];
      for (let k = 1; k < H.length; k++) this.Wh.push(init(new Float32Array(H[k - 1] * H[k]), 1.2 / Math.sqrt(H[k - 1])));
      this.Wo = init(new Float32Array(last * this.V), 0.1 / Math.sqrt(last));
      this.acts = H.map((h) => new Float32Array(h));
      this.da = H.map((h) => new Float32Array(h));
    }
    // Start the bias at the log unigram distribution, so epoch 1 begins from
    // "say common words" instead of uniform noise.
    const total = counts.reduce((a, c) => a + c, 0) + this.V;
    for (let j = 0; j < this.V; j++) this.b[j] = Math.log((counts[j] + 1) / total);
  }

  get paramCount() { return paramCountFor(this.V, this); }

  get describe() {
    return this.hidden.length ? `${this.hidden.length} hidden layer${this.hidden.length > 1 ? "s" : ""} (${this.hidden.join("→")}) + softmax` : "1 linear layer + softmax";
  }

  // Fill rows/wts for predicting position t of `seq` (seq[0] is <s>);
  // `extraBag` is an array of ids mixed into the bag (used to steer replies).
  features(seq, t, extraBag) {
    const V = this.V, rows = this.rows, wts = this.wts;
    let n = 0;
    const ctx = this.ctx, BAGN = this.bag, bagBlock = ctx;
    for (let k = 0; k < ctx; k++) {
      const id = t - 1 - k >= 0 ? seq[t - 1 - k] : PAD;
      rows[n] = k * V + id; wts[n] = 1; n++;
    }
    const bagStart = n;
    for (let i = t - ctx - 1; i >= 0 && n - bagStart < BAGN; i--) {
      if (seq[i] === PAD) break;
      rows[n] = bagBlock * V + seq[i]; n++;
    }
    if (extraBag) for (const id of extraBag.slice(0, BAGN)) { rows[n] = bagBlock * V + id; n++; }
    const nb = n - bagStart;
    for (let i = bagStart; i < n; i++) wts[i] = 1 / nb;
    return n;
  }

  forward(n) {
    const { V, b, logits, rows, wts } = this;
    logits.set(b);
    if (!this.hidden.length) {
      const W = this.W;
      for (let r = 0; r < n; r++) {
        const base = rows[r] * V, w = wts[r];
        for (let j = 0; j < V; j++) logits[j] += w * W[base + j];
      }
    } else {
      const { E, Wh, bh, acts, hidden, Wo } = this;
      const H0 = hidden[0], a0 = acts[0];
      a0.set(bh[0]);
      for (let r = 0; r < n; r++) {
        const base = rows[r] * H0, w = wts[r];
        for (let j = 0; j < H0; j++) a0[j] += w * E[base + j];
      }
      for (let j = 0; j < H0; j++) a0[j] = Math.tanh(a0[j]);
      for (let k = 1; k < hidden.length; k++) {
        const prev = acts[k - 1], a = acts[k], Hk = hidden[k], W = Wh[k];
        a.set(bh[k]);
        for (let i = 0; i < prev.length; i++) {
          const v = prev[i], base = i * Hk;
          for (let j = 0; j < Hk; j++) a[j] += v * W[base + j];
        }
        for (let j = 0; j < Hk; j++) a[j] = Math.tanh(a[j]);
      }
      const last = acts[acts.length - 1];
      for (let i = 0; i < last.length; i++) {
        const v = last[i], base = i * V;
        for (let j = 0; j < V; j++) logits[j] += v * Wo[base + j];
      }
    }
    let max = -Infinity;
    for (let j = 0; j < V; j++) if (logits[j] > max) max = logits[j];
    let sum = 0;
    for (let j = 0; j < V; j++) { const e = Math.exp(logits[j] - max); logits[j] = e; sum += e; }
    const inv = 1 / sum;
    for (let j = 0; j < V; j++) logits[j] *= inv;
    // logits now holds probabilities
  }

  // One SGD step on position t of seq. Returns the loss (nats) before the update.
  step(seq, t, lr) {
    const n = this.features(seq, t);
    this.forward(n);
    const { V, b, logits: p, rows, wts } = this;
    const target = seq[t];
    const loss = -Math.log(Math.max(p[target], 1e-12));
    p[target] -= 1; // p is now the gradient wrt the logits
    if (this.hidden.length) { this.backDeep(n, p, lr); return loss; }
    const W = this.W;
    for (let j = 0; j < V; j++) b[j] -= lr * p[j];
    for (let r = 0; r < n; r++) {
      const base = rows[r] * V, s = lr * wts[r];
      for (let j = 0; j < V; j++) W[base + j] -= s * p[j];
    }
    return loss;
  }

  // Backprop through the hidden stack; g is the gradient wrt the logits.
  backDeep(n, g, lr) {
    const { V, b, Wo, Wh, bh, E, acts, da, hidden, rows, wts } = this;
    const L = hidden.length - 1;
    const last = acts[L], dl = da[L];
    for (let i = 0; i < last.length; i++) {
      const base = i * V, v = last[i];
      let d = 0;
      for (let j = 0; j < V; j++) { d += Wo[base + j] * g[j]; Wo[base + j] -= lr * v * g[j]; }
      dl[i] = d;
    }
    for (let j = 0; j < V; j++) b[j] -= lr * g[j];
    for (let k = L; k >= 1; k--) {
      const a = acts[k], d = da[k], prev = acts[k - 1], dprev = da[k - 1], Hk = hidden[k], W = Wh[k];
      for (let j = 0; j < Hk; j++) { d[j] *= 1 - a[j] * a[j]; bh[k][j] -= lr * d[j]; }
      for (let i = 0; i < prev.length; i++) {
        const base = i * Hk, v = prev[i];
        let s = 0;
        for (let j = 0; j < Hk; j++) { s += W[base + j] * d[j]; W[base + j] -= lr * v * d[j]; }
        dprev[i] = s;
      }
    }
    const a0 = acts[0], d0 = da[0], H0 = hidden[0];
    for (let j = 0; j < H0; j++) { d0[j] *= 1 - a0[j] * a0[j]; bh[0][j] -= lr * d0[j]; }
    for (let r = 0; r < n; r++) {
      const base = rows[r] * H0, s = lr * wts[r];
      for (let j = 0; j < H0; j++) E[base + j] -= s * d0[j];
    }
  }

  // Mean loss per token over one post, no update.
  postLoss(seq) {
    let sum = 0;
    for (let t = 1; t < seq.length; t++) {
      const n = this.features(seq, t);
      this.forward(n);
      sum += -Math.log(Math.max(this.logits[seq[t]], 1e-12));
    }
    return sum / (seq.length - 1);
  }

  // Probabilities for the next token after `seq` (length t), optionally
  // steered by `extraBag`. Returns the shared scratch array.
  nextProbs(seq, extraBag) {
    const n = this.features(seq, seq.length, extraBag);
    this.forward(n);
    return this.logits;
  }

  // Sample a post. `prompt` is an array of ids the reply is about; they ride in
  // the bag block, the way earlier words of the same post would. rand is a
  // () => [0,1) so tests can seed it.
  generate(promptIds, { temperature = 0.8, topK = 40, maxTokens = 60, maxChars = 280, rand = Math.random } = {}) {
    const seq = [PAD];
    const bag = [...new Set(promptIds)].filter((id) => id > UNK)
      .sort((a, b) => this.counts[a] - this.counts[b]) // rarest first: the words that carry the topic
      .slice(0, this.bag);
    const seen = new Map();
    for (let step = 0; step < maxTokens; step++) {
      const probs = this.nextProbs(seq, bag);
      // candidate set: top-K by probability, never <s>/<unk>; </s> only once there's a body
      const cand = [];
      for (let j = 1; j < this.V; j++) {
        if (j === UNK) continue;
        if (j === END && seq.length < 4) continue;
        cand.push(j);
      }
      cand.sort((a, c) => probs[c] - probs[a]);
      const top = cand.slice(0, topK);
      const w = top.map((id) => {
        let x = Math.pow(Math.max(probs[id], 1e-12), 1 / temperature);
        const k = seen.get(id) || 0;
        if (k && id !== END) x /= 1 + 0.6 * k; // gentle repetition penalty
        return x;
      });
      let tot = 0; for (const x of w) tot += x;
      let r = rand() * tot, pick = top[top.length - 1];
      for (let i = 0; i < top.length; i++) { r -= w[i]; if (r <= 0) { pick = top[i]; break; } }
      if (pick === END) break;
      seq.push(pick);
      seen.set(pick, (seen.get(pick) || 0) + 1);
      if (detokenize(seq.slice(1).map((id) => this.vocab[id])).length >= maxChars) break;
    }
    return detokenize(seq.slice(1).map((id) => this.vocab[id]));
  }
}

// Cross-entropy of the unigram model (the "say words at their base rate"
// parrot) over a set of posts: the number the real model has to beat.
export function unigramLoss(counts, posts) {
  const total = counts.reduce((a, c) => a + c, 0) + counts.length;
  let sum = 0, n = 0;
  for (const seq of posts) for (let t = 1; t < seq.length; t++) { sum += -Math.log((counts[seq[t]] + 1) / total); n++; }
  return n ? sum / n : 0;
}

// "Parrot score": the share of the unigram parrot's surprise this model has
// absorbed on posts it never trained on. 0 = no better than reciting word
// frequencies, 100 = predicts every next word perfectly.
export function parrotScore(modelLoss, baseLoss) {
  if (!(baseLoss > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - modelLoss / baseLoss))));
}

// Resumable trainer: call run(ms) repeatedly (yielding to the browser between
// calls) until it returns true. Posts are shuffled per epoch; per-post loss is
// recorded online during each epoch, and the last full epoch's numbers are
// what the histogram shows.
export class Trainer {
  constructor(model, trainPosts, { epochs = 6, budgetMs = 45000, lr0 = 0.1, decay = 0.7, rand = Math.random, now = () => Date.now() } = {}) {
    Object.assign(this, { model, posts: trainPosts, epochs, budgetMs, lr0, decay, rand, now });
    this.epoch = 0; this.cursor = 0; this.order = null;
    this.t0 = now(); this.epochStart = this.t0; this.lastEpochMs = 0;
    this.postLoss = new Float64Array(trainPosts.length);
    this.lastLoss = new Float64Array(trainPosts.length);
    this.epochLoss = 0; this.epochTokens = 0;
    this.history = []; // mean train loss per epoch
    this.done = false;
    this.examples = 0;
  }

  shuffle() {
    const o = Int32Array.from({ length: this.posts.length }, (_, i) => i);
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    this.order = o; this.cursor = 0;
  }

  get progress() { return this.order ? this.cursor / this.order.length : 0; }

  run(ms) {
    if (this.done) return true;
    const end = this.now() + ms;
    if (!this.order) { this.shuffle(); this.epochStart = this.now(); }
    const lr = this.lr0 * Math.pow(this.decay, this.epoch);
    while (this.now() < end) {
      if (this.cursor >= this.order.length) {
        // epoch finished
        this.lastEpochMs = this.now() - this.epochStart;
        this.history.push(this.epochLoss / this.epochTokens);
        this.lastLoss.set(this.postLoss);
        this.epoch++;
        this.epochLoss = 0; this.epochTokens = 0;
        const elapsed = this.now() - this.t0;
        // Stop at the epoch cap, or when another epoch of the same length
        // would blow the time budget (a stated product decision: the page
        // should be talking back within about a minute, whatever the corpus).
        if (this.epoch >= this.epochs || elapsed + this.lastEpochMs > this.budgetMs) { this.done = true; return true; }
        this.shuffle(); this.epochStart = this.now();
        return false;
      }
      const pi = this.order[this.cursor++];
      const seq = this.posts[pi];
      let s = 0;
      for (let t = 1; t < seq.length; t++) s += this.model.step(seq, t, lr);
      this.postLoss[pi] = s / (seq.length - 1);
      this.epochLoss += s; this.epochTokens += seq.length - 1;
      this.examples += seq.length - 1;
    }
    return false;
  }
}
