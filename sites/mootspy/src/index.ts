// mootspy Worker — served at the root of mootspy.bisks.net. The game itself
// (resolving a handle's moots vs. decoys, running the grid) is entirely
// client-side in public/ — see public/lib/spy-data.js. This Worker has two
// jobs:
//
// 1. /img?u=<cdn.bsky.app avatar url> — a narrow CORS proxy for avatar
//    images. cdn.bsky.app sends no Access-Control-Allow-Origin header, so
//    drawing an avatar onto the share-card <canvas> taints it and
//    canvas.toBlob()/toDataURL() throw. Re-fetching the same bytes through
//    this Worker and adding an open CORS header fixes that. Locked down to
//    exactly cdn.bsky.app's avatar paths — copied from sites/beesky/src/index.ts.
//
// 2. /s/<handle> — a distinct, shareable URL per challenge (see
//    notes/45-sharing-and-virality.md, tier 4). The game's own share link is
//    "come guess THIS handle's moots" (?h=<handle> preloaded), so a generic
//    cached unfurl card would undersell every single share — this route
//    resolves the handle server-side and stamps a personalized
//    title/description onto the same static shell before serving it. Copy of
//    sites/beesky/src/index.ts's renderShare, trimmed to what mootspy needs.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const AVATAR_HOST = "cdn.bsky.app";
const AVATAR_PATH_RE = /^\/img\/avatar(_thumbnail)?\/plain\/did:[a-z0-9:%._-]+\/[a-z0-9]+(@[a-z]+)?$/i;

const PUB = "https://public.api.bsky.app/xrpc/";
const GRAPH_PAGES = 4; // bounded lower than the client's 12 — this only needs a headline count, not exhaustive moots

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(PUB + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

async function graphDids(endpoint: string, key: string, did: string): Promise<Set<string>> {
  const dids = new Set<string>();
  let cursor = "";
  for (let p = 0; p < GRAPH_PAGES; p++) {
    const params: Record<string, string> = { actor: did, limit: "100" };
    if (cursor) params.cursor = cursor;
    let d: any;
    try {
      d = await xrpc(endpoint, params);
    } catch {
      break;
    }
    for (const it of d[key] || []) dids.add(it.did);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return dids;
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    let did: string;
    if (handle.startsWith("did:")) {
      did = handle;
    } else {
      const r = await xrpc("com.atproto.identity.resolveHandle", { handle });
      did = r.did;
    }
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
    const who = "@" + (profile.handle || handle);

    const [follows, followers] = await Promise.all([
      graphDids("app.bsky.graph.getFollows", "follows", did),
      graphDids("app.bsky.graph.getFollowers", "followers", did),
    ]);
    let mootCount = 0;
    for (const d of follows) if (followers.has(d)) mootCount++;

    const title = `can you spot ${who}'s moots?`;
    const desc =
      mootCount > 0
        ? `${mootCount} of ${who}'s real mutuals are hiding in a grid of pfps, mixed in with people who aren't. guess by face alone.`
        : `guess which pfps in the grid are ${who}'s real mutuals — by face alone, no names shown until you lock it in.`;
    const url = `https://mootspy.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .replace(/<title>.*?<\/title>/, `<title>${esc(title)} — mootspy</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(url)}$2`)
      .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
      .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(desc)}$2`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  } catch {
    // couldn't resolve — fall through to the generic shell; the client-side
    // script surfaces its own "couldn't find that handle" error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

async function proxyAvatar(rawUrl: string | null): Promise<Response> {
  if (!rawUrl) return new Response("missing u", { status: 400 });
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || target.host !== AVATAR_HOST || !AVATAR_PATH_RE.test(target.pathname)) {
    return new Response("url not allowed", { status: 400 });
  }

  const upstream = await fetch(target.toString(), { cf: { cacheTtl: 86400, cacheEverything: true } as unknown as Record<string, unknown> });
  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") || "image/jpeg");
  headers.set("access-control-allow-origin", "*");
  // Avatar blobs are content-addressed (the CID is in the path) — safe to
  // cache hard.
  headers.set("cache-control", "public, max-age=604800, immutable");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/img") {
      return proxyAvatar(url.searchParams.get("u"));
    }

    const shareMatch = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (shareMatch) {
      return renderShare(env, request, shareMatch[1]);
    }

    return env.ASSETS.fetch(request);
  },
};
