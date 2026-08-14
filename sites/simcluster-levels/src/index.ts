// Served at the root of simcluster-levels.bisks.net — the review itself runs
// client-side against Bluesky's public AppView. The one thing that needed a
// server: shared links. A plain static site serves the same generic
// og:title/og:description/og:url for every `?h=<handle>` share, so
// link-unfurl caches (Bluesky's included) show one card forever no matter
// who shares their badge — same problem didscope hit, same fix: /s/<handle>
// is a real, distinct URL per person. The Worker resolves the handle,
// computes the same S-level report the client does, and stamps a
// personalized title/description/url onto the same page shell before
// serving it. See sites/didscope/src/index.ts (renderShare) — this is a
// direct port of that pattern, with cluster.js/levels.js's ranking logic
// (copied server-side, not shared) standing in for didscope's DID-char
// lookup.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PUB = "https://api.bsky.app/xrpc";
const GRAPH_PAGES = 12;
const MIN_POOL = 15;
const MAX_POOL = 120;

const TITLES = [
  "",
  "Intern (unpaid, unverified)",
  "New Grad, Still Excited",
  "Individual Contributor",
  "Senior, Technically",
  "Staff, On Paper",
  "Senior Staff (Bar Raiser Candidate)",
  "Principal, By Vibes",
  "Distinguished Lurker",
  "Bar Raiser Emeritus",
  "VP of the Timeline",
];

async function jget(url: string): Promise<any> {
  const r = await fetch(url, { cf: { cacheTtl: 60 } as unknown as Record<string, unknown> });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function resolveDid(actor: string): Promise<string> {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  if (a.startsWith("did:")) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve "${a}"`);
  return d.did;
}

type ThinProfile = { did: string; handle: string };
type FullProfile = ThinProfile & { displayName: string; followersCount: number; postsCount: number };

const thinProfile = (p: any): ThinProfile => ({ did: p.did, handle: p.handle });
const fullProfileOf = (p: any): FullProfile => ({
  did: p.did,
  handle: p.handle,
  displayName: p.displayName || p.handle,
  followersCount: p.followersCount || 0,
  postsCount: p.postsCount || 0,
});

async function graphAll(endpoint: string, key: string, did: string): Promise<ThinProfile[]> {
  const out: ThinProfile[] = [];
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const u = new URL(`${PUB}/${endpoint}`);
    u.searchParams.set("actor", did);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    let d: any;
    try {
      d = await jget(u.toString());
    } catch {
      break;
    }
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

async function hydrate(thin: ThinProfile[]): Promise<FullProfile[]> {
  const out: FullProfile[] = [];
  for (let i = 0; i < thin.length; i += 25) {
    const batch = thin.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.actor.getProfiles`);
    for (const t of batch) u.searchParams.append("actors", t.did);
    try {
      const d = await jget(u.toString());
      for (const p of d.profiles || []) out.push(fullProfileOf(p));
    } catch {
      // one batch failing shouldn't sink the whole report
    }
  }
  return out;
}

// Same mutuals-first, widen-to-follows-if-thin logic as public/lib/cluster.js
// buildCluster, trimmed to the fields the OG text needs (no avatar/bio).
async function buildReport(actor: string): Promise<{ handle: string; level: number; docReviews: number; poolSize: number }> {
  const did = await resolveDid(actor);
  const selfRaw = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  const self = fullProfileOf(selfRaw);

  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);

  const followerDids = new Set(followers.map((f) => f.did));
  const seen = new Set([did]);
  const mutuals: ThinProfile[] = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    mutuals.push(thinProfile(f));
  }

  let thin = mutuals.slice();
  if (thin.length < MIN_POOL) {
    for (const f of follows) {
      if (seen.has(f.did)) continue;
      seen.add(f.did);
      thin.push(thinProfile(f));
    }
  }
  thin = thin.slice(0, MAX_POOL);

  const pool = await hydrate(thin);
  const everyone = [self, ...pool].sort((a, b) => b.followersCount - a.followersCount);
  const n = everyone.length;
  const idx = everyone.findIndex((p) => p.did === self.did);
  const pct = n <= 1 ? 0 : idx / n;
  const level = Math.min(10, Math.max(1, 10 - Math.floor(pct * 10)));

  return { handle: self.handle, level, docReviews: mutuals.length, poolSize: pool.length + 1 };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Every replacement below is matched as a full tag or a fully-quoted
// attribute value, never bare text — bare "simcluster levels" is a substring
// of the <title> tag's own generic text, so replacing the page title first
// would leave the personalized string containing "simcluster levels" for a
// later bare-text split to then corrupt (the reverse of didscope's
// GENERIC_OG_URL_ATTR gotcha: there the bare URL was a prefix of the og:image
// URL; here the bare title is a substring of the page title).
const GENERIC_TITLE_TAG = "<title>simcluster levels — what's your S-number?</title>";
const GENERIC_OG_TITLE_ATTR = 'content="simcluster levels"'; // shared by og:title and twitter:title
const GENERIC_OG_DESC_ATTR =
  'content="corporate leveling-hell energy, applied to your SimCluster. type a handle, get a real S1-S10 badge ranked off real followersCount within your own mutuals, plus a field-notes writeup of the bureaucracy."';
const GENERIC_TWITTER_DESC_ATTR =
  'content="corporate leveling-hell energy, applied to your SimCluster. real S1-S10 badge, ranked off real followersCount."';
const GENERIC_OG_URL_ATTR = 'content="https://simcluster-levels.bisks.net/"';

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = decodeURIComponent(rawHandle || "").trim().replace(/^@/, "");
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    const report = await buildReport(handle);
    const title = TITLES[report.level];
    const who = "@" + report.handle;

    const pageTitle = `${who} is S${report.level} — simcluster levels`;
    const ogTitle = `${who} is S${report.level} (${title})`;
    const ogDesc = truncate(
      `${report.docReviews} doc reviews logged, ranked S${report.level} of ${report.poolSize} in ${who}'s SimCluster. the number is real, the bureaucracy is fake. probably.`,
      300,
    );
    const twitterDesc = truncate(`${who} ranked S${report.level} (${title}) in their own SimCluster.`, 200);
    const ogUrl = `https://simcluster-levels.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE_TAG).join(`<title>${esc(pageTitle)}</title>`)
      .split(GENERIC_OG_TITLE_ATTR).join(`content="${esc(ogTitle)}"`)
      .split(GENERIC_OG_DESC_ATTR).join(`content="${esc(ogDesc)}"`)
      .split(GENERIC_TWITTER_DESC_ATTR).join(`content="${esc(twitterDesc)}"`)
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve/rank server-side (typo, deleted account, too few
    // moots, rate limit) — still serve the live page so the link isn't dead;
    // the client script surfaces its own error for the same handle.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<handle> — the distinct, shareable, per-person URL. Every handle
    // gets its own og:title/description/url, so a link unfurler can't
    // collapse every share into one generic card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
