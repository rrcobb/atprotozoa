// keywords.js — a rough, no-AI stand-in for "what is this post about". No
// model call (Workers AI is off the table for this repo) — just tokenize,
// drop stopwords, weight hashtags higher than plain words, then score each
// post's terms by tf-idf across the whole sampled set so generic words that
// show up in nearly every post ("just", "today", "really") sink to the
// bottom and the words that actually distinguish one post from another rise.

const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are aren't as at be because been before being below " +
    "between both but by can't cannot could couldn't did didn't do does doesn't doing don't down during each " +
    "few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers " +
    "herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself just let's " +
    "me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over " +
    "own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs " +
    "them themselves then there there's these they they'd they'll they're they've this those through to too " +
    "under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where " +
    "where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've " +
    "your yours yourself yourselves im ive dont didnt doesnt isnt arent im youre theyre gonna wanna kinda " +
    "yeah yep nah ok okay like just really actually literally still even also one two get got getting go " +
    "going went day today tonight time thing things people someone something anything everyone way lot lots " +
    "new good great bad big little back right now well much many know knows knew think thinks thought " +
    "want wants wanted make makes made said says say tell tells told see sees saw look looks looked " +
    "post posts posting posted thread threads reply replies replying account accounts bluesky bsky " +
    "likes liked liking favorite favorited favoriting " +
    "here's there's y'all yall gonna kinda sorta literally honestly basically probably maybe definitely"
  ).split(/\s+/),
);

// Strip URLs, @mentions, and markdown-ish punctuation, then split into
// lowercase word tokens (kept) and hashtag tokens (kept separately, without
// the leading #) — a hashtag is a much stronger topic signal than a plain
// word someone happened to use, so it's weighted higher downstream.
export function tokenize(text) {
  const raw = String(text || "");
  const hashtags = [];
  const hashtagRe = /#([a-z0-9_]{2,})/gi;
  let m;
  while ((m = hashtagRe.exec(raw))) hashtags.push(m[1].toLowerCase());

  const cleaned = raw
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[a-z0-9.-]+/gi, " ")
    .replace(/#[a-z0-9_]+/gi, " ")
    .replace(/[^a-z0-9'\s]/gi, " ")
    .toLowerCase();

  const words = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length >= 4 && w.length <= 20 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

  return { words, hashtags };
}

// Raw term counts for one post: hashtags count 3x a plain word, since a
// hashtag is a deliberate topic label and a plain word is just incidental
// vocabulary.
export function termCounts(text) {
  const { words, hashtags } = tokenize(text);
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  for (const h of hashtags) counts.set(h, (counts.get(h) || 0) + 3);
  return counts;
}

// Given termCounts per post (Map<uri, Map<term, count>>), compute a tf-idf
// score per (post, term) and return Map<uri, Array<[term, score]>> sorted
// descending, so the caller can take each post's top few terms as its
// "topic tags". idf downweights terms that show up in most posts (a
// recurring signoff, a common word the stoplist missed) — a term that's in
// every post carries ~0 distinguishing signal.
export function scorePostTerms(postCounts) {
  const n = postCounts.size;
  const df = new Map();
  for (const counts of postCounts.values()) {
    for (const term of counts.keys()) df.set(term, (df.get(term) || 0) + 1);
  }
  const scored = new Map();
  for (const [uri, counts] of postCounts) {
    const rows = [];
    for (const [term, tf] of counts) {
      const idf = Math.log((1 + n) / (1 + (df.get(term) || 0))) + 1;
      rows.push([term, tf * idf]);
    }
    rows.sort((a, b) => b[1] - a[1]);
    scored.set(uri, rows);
  }
  return scored;
}

// Top `n` topic tags for a post, score > 0 only.
export function topTags(scoredRows, n) {
  return (scoredRows || []).filter((r) => r[1] > 0).slice(0, n);
}
