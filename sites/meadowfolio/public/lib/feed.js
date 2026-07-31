// feed.js — turn a Bluesky handle into a "portfolio": fetch a good chunk of
// its post history via the public AppView, then group posts into topics.
//
// Everything here reads Bluesky's PUBLIC AppView anonymously (api.bsky.app,
// CORS *, no auth): resolveHandle, getProfile, getAuthorFeed.
//
// resolveDid + tokenize/score copied from neighborhood/hood.js (which cribbed
// them from trigrams/unique.js). Copy, don't abstract.

const PUB = "https://public.api.bsky.app/xrpc";

// How many pages of history to page through. 100 posts/page; 12 pages ≈ up to
// ~1200 posts of top-level history, which is a satisfying "portfolio" without
// hammering the API for mega-accounts.
export const FEED_PAGES = 12;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Resolve a handle / URL / @mention / DID to a DID. Forgiving about paste
// formats — copied from hood.js resolveDid.
export async function resolveDid(actor) {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(
    `${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`,
  );
  if (!d.did) throw new Error(`couldn't resolve “${a}”`);
  return d.did;
}

export async function getProfile(did) {
  const p = await jget(
    `${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
  );
  return {
    did: p.did,
    handle: p.handle,
    displayName: p.displayName || p.handle,
    avatar: p.avatar || "",
    description: p.description || "",
    postsCount: p.postsCount || 0,
  };
}

// The rkey is the last path segment of the at:// URI. Build the bsky.app
// permalink so each portfolio entry links back to the original post.
function permalink(handle, uri) {
  const rkey = String(uri || "").split("/").pop();
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

// Page through getAuthorFeed (anonymous), collecting the account's own
// top-level posts (skip reposts + replies). Returns lightweight post objects.
// `onStep` reports progress; each page can hold up to 100 posts.
export async function authorPortfolio(did, handle, { onStep } = {}) {
  const posts = [];
  let cursor = "";
  for (let p = 0; p < FEED_PAGES; p++) {
    if (onStep) onStep(`fetching posts… (${posts.length} so far)`);
    const u = new URL(`${PUB}/app.bsky.feed.getAuthorFeed`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    u.searchParams.set("filter", "posts_no_replies");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const it of d.feed || []) {
      if (it.reason) continue; // skip reposts
      const rec = it.post && it.post.record;
      if (!rec || typeof rec.text !== "string" || !rec.text.trim()) continue;
      const tags = extractTags(rec);
      const classified = classifyEmbed(it.post && it.post.embed);
      posts.push({
        text: rec.text,
        createdAt: rec.createdAt || (it.post && it.post.indexedAt) || "",
        uri: it.post.uri,
        url: permalink(handle, it.post.uri),
        likes: (it.post && it.post.likeCount) || 0,
        reposts: (it.post && it.post.repostCount) || 0,
        replies: (it.post && it.post.replyCount) || 0,
        tags,
        kind: classified.kind,
        media: classified.media || [],
        link: classified.link || null,
      });
    }
    cursor = d.cursor;
    if (!cursor) break;
  }
  // newest first overall
  posts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return posts;
}

// Classify a hydrated post embed (the feed "view", not the raw record — the
// view resolves image/video blobs to fetchable URLs) into one of three
// buckets: "media" (photos/video), "link" (an external card or a quote post,
// which is structurally a link to another post), or "text" (goes through
// topic clustering below). recordWithMedia unwraps to whichever of its two
// halves actually has media; a quote with no media falls through to "text"
// only if it isn't a viewRecord (e.g. blocked/deleted quoted post).
export function classifyEmbed(embed) {
  if (!embed) return { kind: "text" };
  const t = embed.$type;
  if (t === "app.bsky.embed.images#view") {
    return {
      kind: "media",
      media: (embed.images || []).map((i) => ({ thumb: i.thumb, alt: i.alt || "" })),
    };
  }
  if (t === "app.bsky.embed.video#view") {
    return {
      kind: "media",
      media: [{ thumb: embed.thumbnail || "", alt: embed.alt || "", video: true }],
    };
  }
  if (t === "app.bsky.embed.recordWithMedia#view") {
    const inner = classifyEmbed(embed.media);
    if (inner.kind === "media") return inner;
    return classifyEmbed(
      embed.record ? { $type: "app.bsky.embed.record#view", record: embed.record } : null,
    );
  }
  if (t === "app.bsky.embed.external#view") {
    const e = embed.external || {};
    return {
      kind: "link",
      link: { uri: e.uri, title: e.title || e.uri, description: e.description || "", thumb: e.thumb || "" },
    };
  }
  if (t === "app.bsky.embed.record#view") {
    const r = embed.record;
    if (r && r.$type === "app.bsky.embed.record#viewRecord") {
      const author = r.author || {};
      const val = r.value || {};
      return {
        kind: "link",
        link: {
          uri: `https://bsky.app/profile/${author.handle}/post/${String(r.uri || "").split("/").pop()}`,
          title: `quoting @${author.handle || "?"}`,
          description: typeof val.text === "string" ? val.text.slice(0, 160) : "",
          thumb: author.avatar || "",
        },
      };
    }
    return { kind: "text" };
  }
  return { kind: "text" };
}

// Pull explicit hashtags: from facet features and from raw "#word" in text.
function extractTags(rec) {
  const out = new Set();
  for (const f of rec.facets || []) {
    for (const feat of f.features || []) {
      if (feat.$type === "app.bsky.richtext.facet#tag" && feat.tag) {
        out.add(feat.tag.toLowerCase());
      }
    }
  }
  for (const m of String(rec.text).matchAll(/#(\p{L}[\p{L}\p{N}_]{1,30})/gu)) {
    out.add(m[1].toLowerCase());
  }
  return [...out];
}

// ── topic grouping ──────────────────────────────────────────────────────────
// Two strategies, in order of preference:
//   1. Hashtags — if the account uses them, they ARE the topics.
//   2. Keyword clustering — pick the account's most distinctive content words
//      and assign each post to its strongest keyword. Lightweight, no NLP.

const STOP = new Set(
  (
    "a an and are as at be been but by for from had has have he her his i in " +
    "is it its me my no not of on or our so that the their them then they this to up us was we were " +
    "what when who will with you your just like get got out about into over more all can do if im dont " +
    "youre they re ve ll s t m d re now new one two get see got know think really thing things " +
    "very much many some any way ways lot lots feel feels felt going gonna wanna kinda sorta " +
    "people time day days today good great big long make made makes want need never always " +
    "still even also back down off here there where why how than too own yeah yes okay ok " +
    "would could should might must let lets us we're it's that's don't can't " +
    // generic filler that surfaced as noisy anchors during testing — words that
    // recur everywhere but name no topic
    "post posts posting say says said take takes took last first next which while " +
    "because being been having does doing done something someone anything everything " +
    "nothing well actually probably maybe pretty quite bit little kind sort part " +
    "thing stuff whole real true actual sure though although however anyway " +
    "com net org www http https bsky app html thread reply repost mine yours ours " +
    "day week month year hour minute ago soon later tonight tomorrow yesterday " +
    "guy guys man men woman women person folks everyone anyone someone " +
    "use used using makes making thought thinks knew known felt seems seem looks look " +
    "come comes came goes went gets getting keep keeps kept give gives gave " +
    "isnt arent wasnt werent didnt doesnt havent hasnt wont cant couldnt wouldnt shouldnt " +
    "gonna wanna gotta lemme thats whats heres theres hes shes im ive id ill youve youd " +
    // comparatives, degree words, and contraction fragments that read as anchors
    // but name no topic
    "better best worse worst more most less least only just even ever every each " +
    "these those them this that here there where when what which who whom whose why how " +
    "without within into onto upon among across around through during before after " +
    "did didn don doesn isn aren wasn weren hasn haven won wouldn couldn shouldn " +
    "right left same different another other others both either neither " +
    "again always often sometimes usually rarely never once twice"
  ).split(/\s+/),
);

// Lowercase, drop URLs / @handles / #-marks, split on any non-letter/number
// run. Copied from hood.js tokenize.
export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[\w.-]+/g, " ")
    .replace(/[#]/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t && t.length >= 3 && !STOP.has(t));
}

// Assign posts to topics. Returns [{ topic, kind, posts:[...] }, ...] sorted by
// size, each topic's posts newest-first. `kind` is "hashtag" or "keyword".
export function groupByTopic(posts) {
  // Strategy 1: hashtags, if the account actually uses them meaningfully.
  const tagCount = new Map();
  for (const p of posts) {
    for (const t of p.tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  }
  const usableTags = [...tagCount.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  const taggedShare =
    posts.filter((p) => p.tags.length).length / Math.max(posts.length, 1);

  if (usableTags.length >= 2 && taggedShare >= 0.25) {
    return groupByHashtag(posts, usableTags);
  }
  return groupByKeyword(posts);
}

function groupByHashtag(posts, tags) {
  const rank = new Map(tags.map((t, i) => [t, i]));
  const buckets = new Map();
  const untagged = [];
  for (const p of posts) {
    // pick the post's highest-ranked (most common) tag as its topic
    let best = null,
      bestRank = Infinity;
    for (const t of p.tags) {
      if (rank.has(t) && rank.get(t) < bestRank) {
        best = t;
        bestRank = rank.get(t);
      }
    }
    if (best == null) untagged.push(p);
    else (buckets.get(best) || buckets.set(best, []).get(best)).push(p);
  }
  return finalize(buckets, "hashtag", untagged);
}

function groupByKeyword(posts) {
  // Score each content word by df (document frequency) across the corpus, then
  // pick a pool of topic anchors. A post joins its MOST DISTINCTIVE anchor (the
  // rarest word it shares with the pool) — that word names a specific topic,
  // whereas the most-common anchor would clump everything into one blob.
  const df = new Map();
  const postToks = new Map();
  for (const p of posts) {
    const toks = new Set(tokenize(p.text));
    postToks.set(p, toks);
    for (const t of toks) df.set(t, (df.get(t) || 0) + 1);
  }
  const total = posts.length;
  // A good topic anchor recurs (df >= 3) but isn't near-universal (< 35% of
  // posts — those are just the account's habitual words, not a topic). Take a
  // generous pool so most posts find a home and "other" stays small.
  const anchors = new Map(
    [...df.entries()]
      .filter(([, n]) => n >= 3 && n / total < 0.35)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24),
  );

  const buckets = new Map();
  const misc = [];
  for (const p of posts) {
    const toks = postToks.get(p);
    // pick the anchor with the SMALLEST df (most distinctive) that this post
    // contains; ties broken by longer word (usually the more specific one).
    let best = null,
      bestDf = Infinity;
    for (const w of toks) {
      if (!anchors.has(w)) continue;
      const d = anchors.get(w);
      if (d < bestDf || (d === bestDf && best && w.length > best.length)) {
        best = w;
        bestDf = d;
      }
    }
    if (best == null) misc.push(p);
    else (buckets.get(best) || buckets.set(best, []).get(best)).push(p);
  }
  return finalize(buckets, "keyword", misc);
}

// Sort each bucket newest-first, order topics by size, append a leftover
// "everything else" bucket last if it holds anything. That name is used
// verbatim as a topic label and won't collide with a real anchor word.
function finalize(buckets, kind, leftover) {
  const groups = [...buckets.entries()]
    .map(([topic, posts]) => {
      posts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return { topic, kind, posts };
    })
    .filter((g) => g.posts.length >= 2) // singletons aren't a topic
    .sort((a, b) => b.posts.length - a.posts.length);

  // posts that fell out of tiny (single-post) buckets rejoin the leftover
  const kept = new Set(groups.flatMap((g) => g.posts));
  const rest = [
    ...leftover,
    ...[...buckets.values()].flat().filter((p) => !kept.has(p)),
  ];
  if (rest.length) {
    rest.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    groups.push({ topic: "everything else", kind, posts: rest });
  }
  return groups;
}
