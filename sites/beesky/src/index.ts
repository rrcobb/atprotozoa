// beesky Worker — mounted at bisks.net/beesky/
//
// Everything that computes the hive (resolving a handle's moots) and renders
// it (the three.js scene) runs client-side in public/ — see public/hive.js.
// This Worker has three jobs:
//
// 1. Strip the /beesky mount prefix before handing requests to the static
//    ASSETS binding, same as every path-mounted site (see the barebones
//    template in notes/40-new-site-playbook.md) — the assets directory has
//    no idea it isn't living at the domain root.
//
// 2. /img?u=<cdn.bsky.app avatar url> — a narrow CORS proxy for avatar
//    images. cdn.bsky.app sends no Access-Control-Allow-Origin header, so a
//    three.js TextureLoader with crossOrigin="anonymous" fails outright
//    (the browser blocks the load), and loading without crossOrigin taints
//    the WebGL canvas — which then throws when the share button tries
//    canvas.toBlob() for a screenshot. Re-fetching the same bytes through
//    this Worker and adding an open CORS header fixes both. Locked down to
//    exactly cdn.bsky.app's avatar paths so this can't become an open
//    image proxy for arbitrary URLs.
//
// 3. /s/<handle> — a distinct, shareable URL per hive (see
//    notes/45-sharing-and-virality.md, tier 4). A plain static page serves
//    the same og:title/description/url for every ?h= query variant, so link
//    unfurlers cache one generic card forever regardless of who shares it
//    (same issue notes/45 documents for didscope). This resolves the handle
//    and its moot count server-side and stamps personalized tags onto the
//    same page shell — copy of sites/didscope/src/index.ts's renderShare,
//    trimmed to what beesky needs.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/beesky";
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

async function graphDids(endpoint: string, key: string, did: string): Promise<{ dids: Set<string>; truncated: boolean }> {
  const dids = new Set<string>();
  let cursor = "";
  let truncated = false;
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
    if (p === GRAPH_PAGES - 1) truncated = true;
  }
  return { dids, truncated };
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "beesky — a 3D hive of your Bluesky mutuals";
const GENERIC_META_DESC =
  "Type a Bluesky handle and fly through a 3D honeycomb built from its moots — every mutual gets a hexagonal wax cell, your own glows gold at the centre.";
const GENERIC_OG_DESC =
  "Type a Bluesky handle. Every moot (mutual) becomes a hexagonal wax cell in a honeycomb you fly through — WASD + drag to look, click a cell to see who's home.";
const GENERIC_TWITTER_DESC =
  "Every moot becomes a hexagonal wax cell in a honeycomb you fly through. WASD + drag to look, click a cell to see who's home.";
const GENERIC_OG_URL = "https://bisks.net/beesky";

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
    for (const d of follows.dids) if (d !== did && followers.dids.has(d)) mootCount++;
    const approx = follows.truncated || followers.truncated;
    const countStr = `${mootCount}${approx ? "+" : ""}`;

    const title = `beesky: ${who}'s hive (${countStr} moot${mootCount === 1 && !approx ? "" : "s"})`;
    const desc = truncate(
      `${who}'s 3D honeycomb has ${countStr} moots so far — one hexagonal wax cell per mutual, their own cell glowing gold at the centre. Fly it with WASD, click a cell to see who's home.`,
      280,
    );
    const ogUrl = `https://bisks.net/beesky/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_META_DESC).join(esc(desc))
      .split(GENERIC_OG_DESC).join(esc(desc))
      .split(GENERIC_TWITTER_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // couldn't resolve the handle server-side (typo, deleted account, rate
    // limit) — still serve the live page so the link isn't dead; the client
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
  // cache hard, unlike the html/json below.
  headers.set("cache-control", "public, max-age=604800, immutable");
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    // Only strip when the prefix is actually present — on the subdomain
    // requests arrive without it, and an unconditional slice would chop
    // the front off short paths ("/app.js" -> "") so every asset would
    // silently serve index.html.
    if (url.pathname.startsWith(PREFIX + "/")) {
      url.pathname = url.pathname.slice(PREFIX.length) || "/";
    }

    if (url.pathname === "/img") {
      return proxyAvatar(url.searchParams.get("u"));
    }

    const shareMatch = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (shareMatch) {
      return renderShare(env, request, shareMatch[1]);
    }

    return env.ASSETS.fetch(new Request(url, request));
  },
};
