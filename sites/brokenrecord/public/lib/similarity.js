// similarity.js — the actual "did you post this before" engine. Runs
// entirely in the browser: no Workers AI, no external model, just lexical
// heuristics over the account's own post text. Copy, don't abstract.
//
// The brief: compare BOTH wording and meaning, so near-duplicates,
// paraphrases, repeated jokes, opinions, stories, and phrases can all match.
// Three signals, blended:
//   - character trigram Jaccard  — catches near-identical wording, typo
//     variants, word-order shuffles ("wording")
//   - word bigram Jaccard        — catches reused phrases/turns of speech
//     even when the rest of the post differs ("wording", coarser grain)
//   - TF-IDF cosine over content words — catches the same
//     topic/opinion/story retold in different words, since rare shared
//     words (not "the"/"just"/etc) count for more ("meaning", to the extent
//     pure lexical overlap can proxy for it without an embedding model)
//
// Two-phase API: buildIndex() does the expensive part once (preprocess +
// candidate-pair scoring); clusterAt(index, threshold) is cheap and can be
// re-run instantly whenever the UI's sensitivity slider moves.

const LINK_RE = /https?:\/\/\S+/gi;
// Bluesky post text sometimes embeds a link's display form with the scheme
// already stripped by the composer (e.g. quote-posting shows "bsky.app/
// profile/handle/post/xyz" as literal text, not just in the facet) — catches
// that plus bare "www.example.com" and "example.com/path" mentions. Needs a
// letter-only 2+ char TLD immediately after the last dot, so it doesn't eat
// "e.g." / "i.e." / version numbers like "4.5" (single letter or digits
// after the dot don't qualify).
const BARE_DOMAIN_RE = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi;

// Small, generic English stopword list — filtered out of the TF-IDF/content
// vocabulary (they'd otherwise swamp every doc's vector and candidate index
// with near-universal, non-discriminative tokens). Word BIGRAMS deliberately
// use unfiltered tokens below, so an exact reused phrase like "just saying"
// still matches even though both words are common on their own.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "is",
  "it", "its", "it's", "this", "that", "these", "those", "with", "as", "at",
  "by", "be", "been", "being", "was", "were", "are", "am", "i", "i'm", "im",
  "you", "your", "yours", "he", "she", "they", "we", "my", "me", "mine",
  "so", "just", "not", "no", "do", "did", "does", "if", "then", "than",
  "there", "here", "what", "when", "where", "who", "which", "how", "why",
  "have", "has", "had", "will", "would", "can", "could", "should", "up",
  "out", "about", "into", "from", "all", "any", "some", "one", "get", "got",
  "like", "really", "very", "much", "also", "still", "even", "back", "now",
]);

export function stripLinks(text) {
  return (text || "")
    .replace(LINK_RE, " ")
    .replace(BARE_DOMAIN_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}']*/gu) || []);
}

function charTrigrams(text) {
  const s = text.toLowerCase().replace(/\s+/g, " ");
  const out = new Set();
  for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
  if (!out.size && s) out.add(s); // very short posts: fall back to the whole string as one shingle
  return out;
}

function wordBigrams(tokens) {
  const out = new Set();
  if (tokens.length < 2) {
    for (const t of tokens) out.add(t);
    return out;
  }
  for (let i = 0; i < tokens.length - 1; i++) out.add(tokens[i] + " " + tokens[i + 1]);
  return out;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function sparseCosine(vecA, normA, vecB, normB) {
  if (!normA || !normB) return 0;
  const [small, big] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
  let dot = 0;
  for (const [tok, w] of small) {
    const w2 = big.get(tok);
    if (w2) dot += w * w2;
  }
  return dot / (normA * normB);
}

// Weighted blend of the three signals above, 0-100.
export function scorePair(a, b) {
  const trigramJ = jaccard(a.trigrams, b.trigrams);
  const bigramJ = jaccard(a.bigrams, b.bigrams);
  const cosine = sparseCosine(a.tfidf, a.norm, b.tfidf, b.norm);
  const raw = 100 * (0.3 * trigramJ + 0.3 * bigramJ + 0.4 * cosine);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

const MIN_CANDIDATE_SCORE = 20; // floor below which a pair isn't worth keeping at all
const MAX_PAIRS_STORED = 25000; // safety cap on how many pairs we hold in memory for reclustering
const HARD_CANDIDATE_CAP = 400000; // bail out of candidate generation past this many pairs (pathological vocab overlap)
const YIELD_EVERY = 4000;

function sleep0() {
  return new Promise((r) => setTimeout(r, 0));
}

// posts: [{ uri, text, createdAt }]. Returns { posts, pairs, skippedEmpty,
// totalRaw, truncated } — `posts` only includes non-empty-after-cleanup
// posts (dropped ones don't get indices, so pair.i/pair.j always refer into
// this filtered array).
export async function buildIndex(rawPosts, onProgress) {
  const posts = [];
  let skippedEmpty = 0;

  for (const raw of rawPosts) {
    const clean = stripLinks(raw.text || "");
    if (!clean) {
      skippedEmpty++;
      continue;
    }
    const toks = tokenize(clean);
    const content = toks.filter((t) => t.length > 1 && !STOPWORDS.has(t));
    posts.push({
      uri: raw.uri,
      createdAt: raw.createdAt,
      text: raw.text,
      cleanText: clean,
      trigrams: charTrigrams(clean),
      bigrams: wordBigrams(toks),
      contentTokens: content,
      contentSet: new Set(content),
    });
  }

  if (onProgress) onProgress(`comparing ${posts.length} posts (${skippedEmpty} empty or link-only skipped)...`);
  if (posts.length < 2) return { posts, pairs: [], skippedEmpty, totalRaw: rawPosts.length, truncated: false };

  // Document frequency, for TF-IDF and for capping which tokens are cheap
  // enough to use in the candidate index below.
  const df = new Map();
  for (const p of posts) {
    for (const t of p.contentSet) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = posts.length;

  for (const p of posts) {
    const tf = new Map();
    for (const t of p.contentTokens) tf.set(t, (tf.get(t) || 0) + 1);
    const vec = new Map();
    let normSq = 0;
    for (const [t, c] of tf) {
      const idf = Math.log(1 + N / (df.get(t) || 1));
      const w = (1 + Math.log(c)) * idf;
      vec.set(t, w);
      normSq += w * w;
    }
    p.tfidf = vec;
    p.norm = Math.sqrt(normSq) || 1;
  }

  // Candidate generation: only compare posts that share at least one content
  // token, via an inverted index — full O(n^2) is wasteful for any account
  // with more than a few hundred posts. Tokens that appear in a huge share
  // of posts (generic slang, not filtered by the stopword list) are skipped
  // here — they're nearly free in TF-IDF weight anyway, and every post that
  // uses one would otherwise pair with every other, exploding candidate
  // count for no discriminative benefit.
  const maxDf = Math.min(80, Math.max(15, Math.floor(N * 0.02)));
  const inverted = new Map();
  posts.forEach((p, i) => {
    for (const t of p.contentSet) {
      if ((df.get(t) || 0) > maxDf) continue;
      let arr = inverted.get(t);
      if (!arr) inverted.set(t, (arr = []));
      arr.push(i);
    }
  });

  const candidates = new Set();
  let truncated = false;
  let genCount = 0;
  outer: for (const idxs of inverted.values()) {
    if (idxs.length < 2) continue;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const i = idxs[a] < idxs[b] ? idxs[a] : idxs[b];
        const j = idxs[a] < idxs[b] ? idxs[b] : idxs[a];
        candidates.add(i * 1000000 + j);
        genCount++;
        if (candidates.size >= HARD_CANDIDATE_CAP) {
          truncated = true;
          break outer;
        }
        if (genCount % YIELD_EVERY === 0) {
          if (onProgress) onProgress(`indexing candidate matches... ${candidates.size} found so far`);
          await sleep0();
        }
      }
    }
  }

  const pairs = [];
  let scored = 0;
  for (const key of candidates) {
    const i = Math.floor(key / 1000000);
    const j = key % 1000000;
    const score = scorePair(posts[i], posts[j]);
    if (score >= MIN_CANDIDATE_SCORE) pairs.push({ i, j, score });
    scored++;
    if (scored % YIELD_EVERY === 0) {
      if (onProgress) onProgress(`scoring candidate pairs... ${scored}/${candidates.size}`);
      await sleep0();
    }
  }

  pairs.sort((a, b) => b.score - a.score);
  const capped = pairs.length > MAX_PAIRS_STORED ? pairs.slice(0, MAX_PAIRS_STORED) : pairs;
  if (pairs.length > MAX_PAIRS_STORED) truncated = true;

  return { posts, pairs: capped, skippedEmpty, totalRaw: rawPosts.length, truncated };
}

// Union-find clustering at a given score threshold, so "A~B, A~C, B~C"
// collapses into one cluster instead of three separate pair results. Cheap
// (pairs are already scored) — safe to call on every slider move.
export function clusterAt(index, threshold) {
  const { posts, pairs } = index;
  const parent = posts.map((_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  const edges = pairs.filter((p) => p.score >= threshold);
  for (const e of edges) union(e.i, e.j);

  const members = new Map(); // root -> [postIndex,...]
  const inAnEdge = new Set();
  for (const e of edges) {
    inAnEdge.add(e.i);
    inAnEdge.add(e.j);
  }
  for (const i of inAnEdge) {
    const r = find(i);
    if (!members.has(r)) members.set(r, []);
    members.get(r).push(i);
  }

  const edgesByRoot = new Map();
  for (const e of edges) {
    const r = find(e.i);
    if (!edgesByRoot.has(r)) edgesByRoot.set(r, []);
    edgesByRoot.get(r).push(e);
  }

  const clusters = [];
  for (const [root, idxs] of members) {
    if (idxs.length < 2) continue;
    const es = edgesByRoot.get(root) || [];
    let best = es[0];
    for (const e of es) if (e.score > best.score) best = e;

    const pairIdxs = new Set([best.i, best.j]);
    const others = idxs
      .filter((i) => !pairIdxs.has(i))
      .map((i) => ({
        post: posts[i],
        score: Math.max(scorePair(posts[i], posts[best.i]), scorePair(posts[i], posts[best.j])),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    clusters.push({
      size: idxs.length,
      strongestScore: best.score,
      pair: [posts[best.i], posts[best.j]],
      others,
    });
  }

  clusters.sort((a, b) => b.strongestScore - a.strongestScore);
  return clusters;
}
