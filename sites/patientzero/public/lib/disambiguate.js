// disambiguate.js — lightweight, no-AI sense clustering for ambiguous phrases.
//
// fieldleveltech.org asked (2026-08-21) for vector embeddings to disambiguate
// "too many hits" — their example: "NPC" the video-game term vs "NPC" the
// political meme (claiming your opponents are P-zombies) getting lumped into
// one outbreak, smearing patient zero across two unrelated conversations.
// builder/INSTRUCTIONS.md's Cloudflare cost wall bans Workers AI outright (no
// embeddings, no model inference), so this reaches the same goal — split a
// phrase's hits into distinct senses — without a model: it's plain keyword
// co-occurrence. Words that recur across a subset of posts but not the rest
// make good cluster seeds (a game NPC discussion co-occurs with "character",
// "boss", "quest"; the political meme co-occurs with "libs", "conservative",
// "brained"). Cheap, explainable, entirely client-side, zero API calls.
//
// This is a heuristic, not real disambiguation — it can split a single genuine
// sense into two if an unrelated topic happens to trend alongside it, and it
// can miss a real split if the two senses share too much vocabulary. Treat its
// output as "possible senses to try," not ground truth (same spirit as the
// hitLimit/foundBaseline confidence caveats in search.js).

const STOPWORDS = new Set(
  `a an the this that these those is are was were be been being have has had
   do does did will would shall should may might must can could
   i me my mine you your yours he him his she her hers it its we us our
   they them their and or but if then so because as of to in on at by for
   with about against between into through during before after above below
   from up down out off over under again further not no nor only own same
   too very just also like even still what which who whom am
   im ive youre youve hes shes its were weve theyre theyve dont doesnt
   didnt isnt arent wasnt werent havent hasnt hadnt wont wouldnt cant
   couldnt shouldnt neednt lets rt via new one get got go going know
   think said say says post posts thing things people someone something
   everyone anybody everybody here there when where why how all any both
   each more most other some such than s t d ll m re ve y http https www
   com bsky twitter x`
    .trim()
    .split(/\s+/),
);

const MIN_TOTAL_FOR_CLUSTERING = 20; // below this, a keyword split is just noise
const MIN_TERM_LEN = 3;
const MIN_DF = 3; // a candidate term must show up in at least this many posts
const MAX_DF_FRACTION = 0.5; // ...but not in more than half of them (too common to discriminate)
const MIN_CLUSTER_FRACTION = 0.12; // a real sense needs at least this share of total posts
const MIN_CLUSTER_SIZE = 5; // ...and at least this many, for tiny total counts
const MAX_SENSES = 3; // cap on distinct real senses (plus an optional "other" bucket)
const LABEL_TERMS = 3; // how many top co-occurring words label a sense

export function tokenize(text) {
  return (
    (text || "")
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[@#][a-z0-9_.-]+/g, " ")
      .match(/[a-z0-9']+/g) || []
  );
}

// The set of non-stopword, non-phrase words in a post — the "context bag"
// this whole scheme clusters on. Exported for tests.
export function signalTokens(text, phraseTokens) {
  const out = new Set();
  for (const t of tokenize(text)) {
    if (t.length < MIN_TERM_LEN) continue;
    if (STOPWORDS.has(t)) continue;
    if (phraseTokens.has(t)) continue;
    out.add(t);
  }
  return out;
}

// Cluster `posts` (already filtered to ones that contain `phrase`, any order
// — cluster order is preserved) into candidate senses. Returns:
//   { clustered: false }                              — no meaningful split found
//   { clustered: true, senses: [{ label, terms, posts }], leftover: [posts] }
// `label` is a human-readable "term1, term2, term3" string; `terms` is the
// raw array it was built from. `leftover` is whatever didn't clearly fit any
// sense — still part of "all cases," just not confidently bucketed.
export function clusterPosts(posts, phrase) {
  if (!posts || posts.length < MIN_TOTAL_FOR_CLUSTERING) return { clustered: false };

  const phraseTokens = new Set(tokenize(phrase));
  const bags = posts.map((p) => signalTokens(p?.record?.text || "", phraseTokens));

  const df = new Map();
  for (const bag of bags) for (const t of bag) df.set(t, (df.get(t) || 0) + 1);

  const total = posts.length;
  const maxDf = Math.max(MIN_DF, Math.floor(total * MAX_DF_FRACTION));
  const minClusterSize = Math.max(MIN_CLUSTER_SIZE, Math.ceil(total * MIN_CLUSTER_FRACTION));

  const candidateTerms = [...df.entries()]
    .filter(([, c]) => c >= MIN_DF && c <= maxDf)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  const assigned = new Array(posts.length).fill(-1);
  const rawClusters = []; // [{ seed, indices }]

  for (const term of candidateTerms) {
    if (rawClusters.length >= MAX_SENSES) break;
    const indices = [];
    for (let i = 0; i < posts.length; i++) {
      if (assigned[i] !== -1) continue;
      if (bags[i].has(term)) indices.push(i);
    }
    if (indices.length < minClusterSize) continue;
    const ci = rawClusters.length;
    for (const i of indices) assigned[i] = ci;
    rawClusters.push({ seed: term, indices });
  }

  if (rawClusters.length < 2) return { clustered: false };

  const senses = rawClusters.map((c) => {
    const termFreq = new Map();
    for (const i of c.indices) {
      for (const t of bags[i]) termFreq.set(t, (termFreq.get(t) || 0) + 1);
    }
    const terms = [...termFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, LABEL_TERMS)
      .map(([t]) => t);
    return {
      label: terms.length ? terms.join(", ") : c.seed,
      terms,
      posts: c.indices.map((i) => posts[i]),
    };
  });

  const leftover = [];
  for (let i = 0; i < posts.length; i++) {
    if (assigned[i] === -1) leftover.push(posts[i]);
  }

  return { clustered: true, senses, leftover };
}
