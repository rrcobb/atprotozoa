// Served at the root of botwasteland.bisks.net — the swarm itself runs
// client-side against Bluesky's public AppView (see public/lib/cluster.js).
// The one thing that needs a server: shared links. /s/<handle> stamps a
// personalized og:title/og:description onto the same static shell so a
// shared "I unleashed N bots on @handle's cluster" link doesn't unfurl as
// one generic card for everyone. Direct port of the pattern in
// sites/simcluster-levels/src/index.ts / sites/didscope/src/index.ts.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PUB = "https://api.bsky.app/xrpc";
const GRAPH_PAGES = 12;
const MIN_POOL = 15;
const MAX_POOL = 120;

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

// Only the count is needed server-side for the OG text — no profile
// hydration pass here (that's real work the client does for the visuals).
async function buildPoolSize(actor: string): Promise<{ handle: string; poolSize: number }> {
  const did = await resolveDid(actor);
  const selfRaw = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
  const handle: string = selfRaw.handle;

  const follows = await graphAll("app.bsky.graph.getFollows", "follows", did);
  const followers = await graphAll("app.bsky.graph.getFollowers", "followers", did);

  const followerDids = new Set(followers.map((f) => f.did));
  const seen = new Set([did]);
  const mutuals: ThinProfile[] = [];
  for (const f of follows) {
    if (!followerDids.has(f.did) || seen.has(f.did)) continue;
    seen.add(f.did);
    mutuals.push(f);
  }

  let thin = mutuals.slice();
  if (thin.length < MIN_POOL) {
    for (const f of follows) {
      if (seen.has(f.did)) continue;
      seen.add(f.did);
      thin.push(f);
    }
  }
  thin = thin.slice(0, MAX_POOL);

  return { handle, poolSize: thin.length + 1 };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Every replacement is matched as a full tag or fully-quoted attribute
// value, never bare text — same ordering gotcha as simcluster-levels: the
// generic <title> text is a substring of nothing else here, but keep the
// title swap first anyway for consistency with the sibling sites.
const GENERIC_TITLE_TAG = "<title>botwasteland — unleash the swarm</title>";
const GENERIC_OG_TITLE_ATTR = 'content="botwasteland"';
const GENERIC_OG_DESC_ATTR =
  'content="every real person in a Bluesky SimCluster, recast as a bot with its own made-up DID and made-up PDS, posting forever in your browser. nothing here is a real account and nothing here ever posts to Bluesky."';
const GENERIC_TWITTER_DESC_ATTR =
  'content="a Bluesky SimCluster, recast as a swarm of fake bots on fake PDSes. all simulated, nothing posted."';
const GENERIC_OG_URL_ATTR = 'content="https://botwasteland.bisks.net/"';

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = decodeURIComponent(rawHandle || "").trim().replace(/^@/, "");
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    const report = await buildPoolSize(handle);
    const who = "@" + report.handle;

    const pageTitle = `${who}'s SimCluster, unleashed — botwasteland`;
    const ogTitle = `${report.poolSize} bots unleashed on ${who}'s SimCluster`;
    const ogDesc = truncate(
      `every one of the ${report.poolSize} real people in ${who}'s Bluesky SimCluster, recast as a bot with its own fake DID and fake PDS, posting forever. nothing here is real — no accounts, no posts, all in your browser.`,
      300,
    );
    const twitterDesc = truncate(`${report.poolSize} fake bots on fake PDSes, generated from ${who}'s real SimCluster.`, 200);
    const ogUrl = `https://botwasteland.bisks.net/s/${encodeURIComponent(handle)}`;

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
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
