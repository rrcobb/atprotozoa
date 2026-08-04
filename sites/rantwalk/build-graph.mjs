// Fetches @norvid-studies.bsky.social's post history from the public AppView
// and bakes it into public/data/graph.json: a topologically-sorted (by post
// time), weighted DAG where an edge i -> j (i earlier than j) exists when the
// two posts share vocabulary. The client plays a Wikipedia-speedrun-style
// game on top of it: start on one post, reach a target post later in the
// timeline by only ever clicking forward along edges.
//
// Rerun any time to refresh with newer posts:
//   node build-graph.mjs
import { writeFileSync } from "node:fs";

const ACTOR = "norvid-studies.bsky.social";
const MAX_PAGES = 25;
const MAX_NODES = 450; // keep the most recent N eligible posts
const TOP_K_EDGES = 6; // outgoing links kept per post, like a curated "see also" list
const MIN_TEXT_LEN = 12;
const MAX_DOC_FREQ_FRAC = 0.12; // terms commoner than this are treated as noise

const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are aren't as at be because been before being below " +
    "between both but by can't cannot could couldn't did didn't do does doesn't doing don't down during each few " +
    "for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself " +
    "him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself just let's me more most " +
    "mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't " +
    "she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then " +
    "there there's these they they'd they'll they're they've this those through to too under until up very was " +
    "wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's " +
    "whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves " +
    "im its like just really actually thing things one two also get got going go still even much many well " +
    "kind sort literally basically pretty gonna wanna kinda okay yeah yes no ok lol"
  ).split(/\s+/)
);

function tokenize(text) {
  const cleaned = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[a-z0-9.-]+/g, " ")
    .replace(/#(\w+)/g, " $1 $1 ") // hashtags are a strong signal, count them twice
    .replace(/[^a-z0-9'\s]/g, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

async function fetchAllPosts() {
  const posts = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL("https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed");
    url.searchParams.set("actor", ACTOR);
    url.searchParams.set("limit", "100");
    url.searchParams.set("filter", "posts_no_replies");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url);
    if (!res.ok) {
      console.error("fetch failed", res.status, await res.text());
      break;
    }
    const data = await res.json();
    for (const item of data.feed) {
      const post = item.post;
      if (!post || post.author?.handle !== ACTOR) continue;
      if (item.reason) continue; // repost
      const record = post.record;
      if (!record || record.$type !== "app.bsky.feed.post") continue;
      if (record.reply) continue;
      const text = (record.text || "").trim();
      if (text.length < MIN_TEXT_LEN) continue;
      posts.push({
        uri: post.uri,
        text,
        createdAt: record.createdAt,
        likeCount: post.likeCount || 0,
        repostCount: post.repostCount || 0,
        hasImage: !!(post.embed && /image/i.test(post.embed.$type || "")),
        isQuote: !!(record.embed && /record/i.test(record.embed.$type || "")),
      });
    }
    cursor = data.cursor;
    console.error(`page ${page + 1}: total ${posts.length}`);
    if (!cursor) break;
  }
  return posts;
}

function rkeyFromUri(uri) {
  return uri.split("/").pop();
}

async function fetchProfile() {
  const url = new URL("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile");
  url.searchParams.set("actor", ACTOR);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return { avatar: data.avatar || null, displayName: data.displayName || ACTOR };
}

async function main() {
  const profile = await fetchProfile();
  const all = await fetchAllPosts();
  all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  const trimmed = all.slice(Math.max(0, all.length - MAX_NODES));

  const nodes = trimmed.map((p, id) => ({
    id,
    uri: p.uri,
    url: `https://bsky.app/profile/${ACTOR}/post/${rkeyFromUri(p.uri)}`,
    text: p.text,
    createdAt: p.createdAt,
    likeCount: p.likeCount,
    repostCount: p.repostCount,
    hasImage: p.hasImage,
    isQuote: p.isQuote,
  }));

  const tokensById = nodes.map((n) => tokenize(n.text));

  // inverted index: term -> [node ids], skipping terms that are too common
  // to be a meaningful "link" (would make every post connect to every post).
  const postings = new Map();
  tokensById.forEach((toks, id) => {
    for (const t of new Set(toks)) {
      if (!postings.has(t)) postings.set(t, []);
      postings.get(t).push(id);
    }
  });
  const maxDocFreq = Math.max(4, Math.floor(nodes.length * MAX_DOC_FREQ_FRAC));
  for (const [t, ids] of postings) {
    if (ids.length < 2 || ids.length > maxDocFreq) postings.delete(t);
  }

  // pairScores[i] = Map<j, {score, kw: Map<term, idf>}> for j > i
  const pairScores = nodes.map(() => new Map());
  const N = nodes.length;
  for (const [term, ids] of postings) {
    const idf = Math.log(N / ids.length);
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const i = Math.min(ids[a], ids[b]);
        const j = Math.max(ids[a], ids[b]);
        let entry = pairScores[i].get(j);
        if (!entry) {
          entry = { score: 0, kw: [] };
          pairScores[i].set(j, entry);
        }
        entry.score += idf;
        entry.kw.push([term, idf]);
      }
    }
  }

  const edges = nodes.map((n, i) => {
    const candidates = [...pairScores[i].entries()]
      .map(([j, e]) => ({
        to: j,
        w: Math.round(e.score * 100) / 100,
        kw: e.kw
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([t]) => t),
      }))
      .sort((a, b) => b.w - a.w)
      .slice(0, TOP_K_EDGES);

    // never leave a dead end: if nothing shared enough vocabulary, still
    // link forward to the very next post in the timeline.
    if (candidates.length === 0 && i < N - 1) {
      candidates.push({ to: i + 1, w: 0, kw: [] });
    }
    return candidates;
  });

  const graph = {
    actor: ACTOR,
    displayName: profile?.displayName || ACTOR,
    avatar: profile?.avatar || null,
    generatedAt: new Date().toISOString(),
    count: N,
    nodes,
    edges,
  };

  writeFileSync(new URL("./public/data/graph.json", import.meta.url), JSON.stringify(graph));
  const avgEdges = edges.reduce((s, e) => s + e.length, 0) / N;
  console.error(`wrote graph.json: ${N} nodes, avg ${avgEdges.toFixed(2)} outgoing edges/node`);
}

main();
