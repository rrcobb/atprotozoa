// homemixer — a real, live Bluesky custom feed generator.
//
// @skeet.best asked (github.com/twitter/the-algorithm) for a port of the "X
// Recommendation Algorithm" to the Bluesky Feed API; @bisks.net gave the
// go-ahead conditional on it actually being a real, working feed. It is one:
// this Worker serves the three things a feed generator needs —
// `/.well-known/did.json` (did:web:homemixer.bisks.net), describeFeedGenerator,
// and getFeedSkeleton — and getFeedSkeleton runs an honest heuristic port of
// home-mixer's pipeline shape (candidate sourcing -> light rank -> heavy rank
// -> author-diversity + in-network/out-of-network mixing), not a literal
// transplant of Twitter's code. It can't be a literal transplant: that repo's
// ranker is a trained multi-task neural net over ~6,000 features fed by
// Twitter-internal services (Earlybird, UTEG/GraphJet, a real-time engagement
// stream) that have no atproto equivalent, and this repo's house rules ban
// Workers AI outright (see builder/INSTRUCTIONS.md) — so there is no model to
// run even if the weights were public, which they aren't. What *is* public,
// and what this ports: the pipeline shape, the named ranking signals
// (home-mixer/server/.../HomeGlobalParams.scala literally has tunable
// weight params called `home_mixer_model_weight_fav` /
// `..._retweet` / `..._reply`, alongside profile-click, video-watch, bookmark,
// share, and negative-feedback weights), and the well-reported relative
// ordering between them (a reply is worth much more than a repost, a repost
// more than a like). Ours substitutes realized public engagement counts for
// the trained per-user propensity scores and a hand-set weight table for the
// learned one — see rankOne() below.
//
// Every candidate is fetched live from the public AppView
// (public.api.bsky.app) on each request; nothing is stored, nothing is
// pre-indexed, no KV, no Durable Object, no cron. That matches this repo's
// "evaluate a feed live against the AppView" default
// (notes/ideas/feeds-and-labels.md) and its frontend-first / no-paid-compute
// rule. The cost is that paging asks the pipeline to run again — accepted
// per that same note (store ours, rederive theirs) rather than adding
// storage to smooth it over.
//
// One more real gap: publishing the app.bsky.feed.generator declaration
// record that makes a feed show up in the Bluesky app has to happen from
// *someone's* atproto repo, signed with *their* key — this build has no
// OAuth session or app password for any account, so it can't do that part
// itself. Instead public/index.html has a "publish to your own account"
// button that does the OAuth dance in the visitor's browser and writes the
// record from their own session (repo:app.bsky.feed.generator?action=create,
// nothing broader). Anyone who publishes it becomes a valid authority for
// the same fixed algorithm — see FEED_RKEY below.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// did:web:homemixer.bisks.net — a bare service identity for the feed
// generator itself. It owns no atproto repo and never publishes records; it
// only needs to resolve to a DID document naming this Worker as a
// `#bsky_fg` service endpoint, which /.well-known/did.json below does.
const SERVICE_DID = "did:web:homemixer.bisks.net";

// The one feed this service serves. Because the generator record can be
// published by *any* signed-in visitor (see the publish flow), there's no
// single fixed authority DID to validate the `feed` URI's owner against —
// getFeedSkeleton instead only checks that the URI's collection + rkey match
// what this service actually knows how to rank, and ignores who published it.
const FEED_RKEY = "homemixer";

const APPVIEW = "https://public.api.bsky.app/xrpc";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/.well-known/did.json") {
      return didDocument();
    }
    if (url.pathname === "/xrpc/app.bsky.feed.describeFeedGenerator") {
      return describeFeedGenerator();
    }
    if (url.pathname === "/xrpc/app.bsky.feed.getFeedSkeleton") {
      return getFeedSkeleton(url, request).catch((err) =>
        json({ error: "InternalError", message: String(err?.message || err) }, 500),
      );
    }
    return env.ASSETS.fetch(request);
  },
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

function didDocument(): Response {
  return json({
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: SERVICE_DID,
    service: [
      {
        id: "#bsky_fg",
        type: "BskyFeedGenerator",
        serviceEndpoint: "https://homemixer.bisks.net",
      },
    ],
  });
}

function describeFeedGenerator(): Response {
  // No fixed `feeds` list — see FEED_RKEY's comment above. A client asking
  // "what feeds does this DID serve" gets an honest empty list rather than a
  // guess at who will have published one by the time they ask.
  return json({ did: SERVICE_DID, feeds: [] });
}

// --- getFeedSkeleton: the actual port -------------------------------------

// Fan-out is capped for a real reason, not habitual caution (see
// notes/40-, "Question every cap" standing order): getFeedSkeleton is a
// synchronous request the Bluesky AppView calls with its own timeout, and
// Cloudflare Workers have a hard per-request subrequest ceiling. A feed that
// occasionally samples a slightly smaller slice of a huge follow graph is
// fine; a feed that times out on every load for someone who follows a lot of
// people is not. These numbers keep total subrequests for one page load
// under ~55 including retries' worth of headroom.
const FOLLOWS_PAGES = 3; // up to ~300 follows considered per request
const IN_NETWORK_AUTHOR_SAMPLE = 24;
const OUT_NETWORK_SEED_AUTHORS = 6; // whose own follows seed the 2-hop pool
const OUT_NETWORK_AUTHOR_SAMPLE = 15;
const POSTS_PER_IN_NETWORK_AUTHOR = 5;
const POSTS_PER_OUT_NETWORK_AUTHOR = 3;

// Post-rank heuristics, named after the same things home-mixer's own docs
// name in its "post-ranking filters" step (Author Diversity, Content Balance
// in/out of network — see the comment block at the top of this file).
const MAX_PER_AUTHOR = 2; // author-diversity cap
const IN_NETWORK_RATIO = 0.55; // roughly the "close to half" home-mixer reports, biased slightly in-network since we have no ads/out-of-network floor to hit

const LIGHT_RANK_CANDIDATE_CAP = 150; // light ranker trims the pool before the heavier weighted formula runs

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

interface CandidatePost {
  uri: string;
  authorDid: string;
  indexedAt: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  quoteCount: number;
  inNetwork: boolean;
}

async function getFeedSkeleton(url: URL, request: Request): Promise<Response> {
  const feedUri = url.searchParams.get("feed") || "";
  const rkey = feedUri.split("/").pop() || "";
  if (feedUri && rkey !== FEED_RKEY) {
    return json({ error: "UnknownFeed", message: `this service doesn't serve ${feedUri}` }, 400);
  }

  const limit = clamp(parseInt(url.searchParams.get("limit") || "", 10) || DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clamp(parseInt(url.searchParams.get("cursor") || "0", 10) || 0, 0, 100000);

  const requesterDid = decodeRequesterDid(url, request);

  const ranked = requesterDid
    ? await personalizedCandidates(requesterDid)
    : await anonymousCandidates();

  const page = ranked.slice(offset, offset + limit);
  const nextCursor = offset + limit < ranked.length ? String(offset + limit) : undefined;

  return json({
    feed: page.map((p) => ({ post: p.uri })),
    cursor: nextCursor,
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Reads the requester's DID off the Authorization JWT that the Bluesky app
// attaches to getFeedSkeleton calls, WITHOUT verifying its signature. That's
// a deliberate, documented simplification, not an oversight: verifying an
// atproto service-auth JWT means resolving the signer's DID doc and checking
// a secp256k1/P-256 signature, and the only thing this DID is trusted for
// here is "whose public follow graph should this ranking use" — every input
// and output of that (follows, posts, engagement counts) is already public
// data, there's no write, no secret, and no moderation decision riding on
// it. Worst case of a forged `iss` is seeing a ranking built from a
// different public follow graph than your own, which is also just what
// happens on a stale cache. If this service ever does something where the
// requester's identity is a real trust boundary, this needs real
// verification (e.g. @atproto/xrpc-server's verifyJwt, or a from-scratch
// secp256k1 check) before that day.
function decodeRequesterDid(url: URL, request: Request): string | null {
  // Support ?did= for the same-origin preview page too, so index.html can
  // preview a personalized ranking without minting a real service-auth JWT.
  const previewDid = url.searchParams.get("did");
  if (previewDid && previewDid.startsWith("did:")) return previewDid;

  const auth = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return null;
  const parts = m[1].split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return typeof payload.iss === "string" && payload.iss.startsWith("did:") ? payload.iss : null;
  } catch {
    return null;
  }
}

function base64UrlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return atob(padded);
}

// --- candidate sourcing ----------------------------------------------------

async function personalizedCandidates(requesterDid: string): Promise<CandidatePost[]> {
  const follows = await getFollows(requesterDid, FOLLOWS_PAGES);
  if (follows.length === 0) return anonymousCandidates();

  const followedDids = new Set(follows.map((f) => f.did));
  const rng = mulberry32(hashSeed(`${requesterDid}|${sixHourBucket()}`));

  const inNetworkAuthors = sample(follows, IN_NETWORK_AUTHOR_SAMPLE, rng).map((f) => f.did);
  const inNetworkPosts = (
    await Promise.all(inNetworkAuthors.map((did) => getAuthorFeed(did, POSTS_PER_IN_NETWORK_AUTHOR)))
  ).flat();

  // Out-of-network candidates: a 2-hop walk of the follow graph (follows of
  // a few of your follows), the same shape as UTEG's graph-traversal
  // candidate source, just over the public follow graph instead of an
  // internal engagement graph (no per-user like/click data is available
  // from the public AppView).
  const seedAuthors = sample(follows, OUT_NETWORK_SEED_AUTHORS, rng).map((f) => f.did);
  const secondHop = (await Promise.all(seedAuthors.map((did) => getFollows(did, 1)))).flat();
  const outOfNetworkPool = uniqueBy(
    secondHop.filter((f) => f.did !== requesterDid && !followedDids.has(f.did)),
    (f) => f.did,
  );
  const outOfNetworkAuthors = sample(outOfNetworkPool, OUT_NETWORK_AUTHOR_SAMPLE, rng).map((f) => f.did);
  const outOfNetworkPosts = (
    await Promise.all(outOfNetworkAuthors.map((did) => getAuthorFeed(did, POSTS_PER_OUT_NETWORK_AUTHOR)))
  ).flat();

  return rankAndMix(inNetworkPosts, outOfNetworkPosts);
}

// No requester identity: there's no follow graph to source in-network
// candidates from, so this falls back to an out-of-network-only pool seeded
// from Bluesky's own trending topics, ranked the same way as the
// personalized out-of-network half. This is the preview an anonymous
// visitor (or the app before it knows who's asking) sees.
//
// This deliberately does NOT use app.bsky.feed.searchPosts — testing during
// the build found that endpoint returning a hard 403 from this box (fronted
// by a separate CDN from the rest of the AppView, likely stricter bot
// filtering) while every other AppView read worked fine. Each trending
// topic already comes with a `link` to Bluesky's own curated feed for that
// topic; resolving that feed via getFeed is just as good a candidate source
// and sidesteps the flaky endpoint entirely.
async function anonymousCandidates(): Promise<CandidatePost[]> {
  const topics = await getTrendingTopics();
  const feedUris = topics
    .map((t) => feedUriFromTopicLink(t.link))
    .filter((u): u is string => !!u)
    .slice(0, 5);
  const posts = (await Promise.all(feedUris.map((uri) => getFeedByUri(uri, 15)))).flat();
  return rankAndMix([], posts);
}

// --- AppView reads -----------------------------------------------------

async function xrpc(method: string, params: Record<string, string | number>): Promise<any> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const res = await fetch(`${APPVIEW}/${method}?${qs.toString()}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${method} failed (${res.status})`);
  return res.json();
}

interface FollowRef {
  did: string;
}

async function getFollows(actor: string, maxPages: number): Promise<FollowRef[]> {
  const out: FollowRef[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    let page: any;
    try {
      page = await xrpc("app.bsky.graph.getFollows", {
        actor,
        limit: 100,
        ...(cursor ? { cursor } : {}),
      });
    } catch {
      break; // best-effort — a failed page just means a smaller candidate pool
    }
    for (const f of page.follows || []) out.push({ did: f.did });
    if (!page.cursor) break;
    cursor = page.cursor;
  }
  return out;
}

async function getAuthorFeed(actor: string, limit: number): Promise<CandidatePost[]> {
  try {
    const page = await xrpc("app.bsky.feed.getAuthorFeed", {
      actor,
      limit,
      filter: "posts_no_replies",
    });
    return (page.feed || []).map((item: any) => toCandidatePost(item.post, true));
  } catch {
    return []; // one unreachable author shouldn't sink the whole feed load
  }
}

async function getFeedByUri(feedUri: string, limit: number): Promise<CandidatePost[]> {
  try {
    const page = await xrpc("app.bsky.feed.getFeed", { feed: feedUri, limit });
    return (page.feed || []).map((item: any) => toCandidatePost(item.post, false));
  } catch {
    return [];
  }
}

interface TrendingTopic {
  topic: string;
  link: string;
}

async function getTrendingTopics(): Promise<TrendingTopic[]> {
  try {
    const page = await xrpc("app.bsky.unspecced.getTrendingTopics", { limit: 10 });
    return (page.topics || [])
      .map((t: any) => ({ topic: t.topic, link: t.link }))
      .filter((t: TrendingTopic) => !!t.topic && !!t.link);
  } catch {
    return [];
  }
}

// Each trending topic's `link` looks like "/profile/<did>/feed/<rkey>" — the
// app-relative path to Bluesky's own curated feed for that topic.
function feedUriFromTopicLink(link: string): string | null {
  const m = /^\/profile\/([^/]+)\/feed\/([^/]+)$/.exec(link);
  if (!m) return null;
  return `at://${m[1]}/app.bsky.feed.generator/${m[2]}`;
}

function toCandidatePost(post: any, inNetwork: boolean): CandidatePost {
  return {
    uri: post.uri,
    authorDid: post.author?.did || "",
    indexedAt: post.indexedAt || post.record?.createdAt || new Date(0).toISOString(),
    likeCount: post.likeCount || 0,
    repostCount: post.repostCount || 0,
    replyCount: post.replyCount || 0,
    quoteCount: post.quoteCount || 0,
    inNetwork,
  };
}

// --- ranking ---------------------------------------------------------------

// Relative weights follow the well-reported public ordering of Twitter's own
// engagement-weight table (reply >> repost/quote > like; see the file
// comment at the top for the actual param names this is named after) — not
// the trained values themselves, which were never public and wouldn't
// transfer to a different network's engagement patterns anyway.
const W_LIKE = 1;
const W_REPOST = 2;
const W_QUOTE = 4;
const W_REPLY = 8;
const W_IN_NETWORK = 2; // flat boost, not a hard in/out split — mixing handles the ratio
const RECENCY_WINDOW_HOURS = 48;
const RECENCY_WEIGHT_PER_HOUR = 0.05;

function lightRankScore(p: CandidatePost): number {
  // Cheap prefilter: raw engagement minus a linear age penalty. Mirrors
  // home-mixer's light ranker being a fast pass that trims the pool before
  // the fuller weighted formula runs, not a scaled-down copy of it.
  const ageHours = (Date.now() - Date.parse(p.indexedAt)) / 3_600_000;
  return p.likeCount + p.repostCount * 2 + p.replyCount * 3 - ageHours * 0.5;
}

function heavyRankScore(p: CandidatePost): number {
  const ageHours = Math.max(0, (Date.now() - Date.parse(p.indexedAt)) / 3_600_000);
  const recencyBoost = Math.max(0, RECENCY_WINDOW_HOURS - ageHours) * RECENCY_WEIGHT_PER_HOUR;
  return (
    W_LIKE * Math.log1p(p.likeCount) +
    W_REPOST * Math.log1p(p.repostCount) +
    W_QUOTE * Math.log1p(p.quoteCount) +
    W_REPLY * Math.log1p(p.replyCount) +
    (p.inNetwork ? W_IN_NETWORK : 0) +
    recencyBoost
  );
}

function rankAndMix(inNetworkPosts: CandidatePost[], outOfNetworkPosts: CandidatePost[]): CandidatePost[] {
  const seen = new Set<string>();
  const dedupe = (list: CandidatePost[]) =>
    list.filter((p) => {
      if (!p.uri || seen.has(p.uri)) return false;
      seen.add(p.uri);
      return true;
    });

  const lightFilter = (list: CandidatePost[]) =>
    list
      .slice()
      .sort((a, b) => lightRankScore(b) - lightRankScore(a))
      .slice(0, LIGHT_RANK_CANDIDATE_CAP);

  const inNet = lightFilter(dedupe(inNetworkPosts)).sort((a, b) => heavyRankScore(b) - heavyRankScore(a));
  const outNet = lightFilter(dedupe(outOfNetworkPosts)).sort((a, b) => heavyRankScore(b) - heavyRankScore(a));

  // Interleave at the target in/out ratio, then apply the author-diversity
  // cap on the final merged order (a single prolific author shouldn't fill
  // half the page even if every one of their posts scores well).
  const merged: CandidatePost[] = [];
  let i = 0;
  let j = 0;
  while (i < inNet.length || j < outNet.length) {
    const wantIn = merged.length === 0 || (merged.length + 1) * IN_NETWORK_RATIO >= i + 1;
    if (wantIn && i < inNet.length) {
      merged.push(inNet[i++]);
    } else if (j < outNet.length) {
      merged.push(outNet[j++]);
    } else if (i < inNet.length) {
      merged.push(inNet[i++]);
    }
  }

  const perAuthorCount = new Map<string, number>();
  return merged.filter((p) => {
    const n = perAuthorCount.get(p.authorDid) || 0;
    if (n >= MAX_PER_AUTHOR) return false;
    perAuthorCount.set(p.authorDid, n + 1);
    return true;
  });
}

// --- small deterministic-RNG helpers ---------------------------------------

// Seeded rather than Math.random() so paging through the same 6-hour window
// samples a stable author pool instead of reshuffling candidates out from
// under a cursor on every page.
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sixHourBucket(): number {
  return Math.floor(Date.now() / (6 * 3_600_000));
}

function sample<T>(list: T[], n: number, rng: () => number): T[] {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

function uniqueBy<T>(list: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return list.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
