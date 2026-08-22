// moottld Worker — moottld.bisks.net
//
// The whole census still runs client-side (public/index.html +
// public/lib/census.js do the real work, capped at ~4,000 follows/followers
// scanned per side). Two things needed a server:
//
// 1. /s/<handle> — shared links. A plain static site serves the *same*
//    index.html — same og:title/og:description — no matter whose handle is
//    in the URL, so Bluesky's link-unfurl cache would show one generic card
//    for every share, forever (same problem sites/didscope solved for
//    /s/<handle>). Fix: /s/<handle> is a real, distinct URL per person. The
//    Worker resolves the handle server-side, runs a smaller version of the
//    same follows ∩ followers census (capped tighter than the client — this
//    only has to produce a preview number, not the full report), and stamps
//    personalized og:title/og:description/og:url onto the same page shell
//    before handing it back. The client script then re-runs the full census
//    itself when the page loads (see the /s/<handle> path handling at the
//    bottom of index.html), so what's on screen always matches the live
//    data — the server-rendered numbers are only ever seen by link-unfurl
//    bots reading the HTML head.
//
// 2. /img?u=<cdn.bsky.app avatar url> — a narrow CORS proxy for the avatar
//    drawn into the client-generated share card. cdn.bsky.app sends no
//    Access-Control-Allow-Origin header, so drawing an avatar straight from
//    there taints the canvas and toBlob()/toDataURL() come back empty. See
//    proxyAvatar() below.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const AVATAR_HOST = "cdn.bsky.app";
const AVATAR_PATH_RE = /^\/img\/avatar(_thumbnail)?\/plain\/did:[a-z0-9:%._-]+\/[a-z0-9]+(@[a-z]+)?$/i;

const PUB = "https://public.api.bsky.app/xrpc";

// Much tighter than the client's 40-page cap: this only has to produce a
// plausible preview number fast enough for an unfurl bot's timeout, not a
// complete report.
const SHARE_GRAPH_PAGES = 6; // ≤ ~600 follows + ~600 followers per side

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${PUB}/${method}${qs ? "?" + qs : ""}`, {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

async function graphAll(endpoint: string, key: string, did: string): Promise<any[]> {
  const out: any[] = [];
  let cursor = "";
  for (let p = 0; p < SHARE_GRAPH_PAGES; p++) {
    const params: Record<string, string> = { actor: did, limit: "100" };
    if (cursor) params.cursor = cursor;
    let d: any;
    try {
      d = await xrpc(endpoint, params);
    } catch {
      break;
    }
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
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
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The static page's title/description/url are identical across every
// <title>/og:*/twitter:* tag, so one string-replace-all each is enough to
// personalize the whole head — no HTML parser needed. Matched as a full
// quoted attribute for the URL, not the bare string — the bare URL is also a
// prefix of the og:image URL ("…/og.png"), and a naive split/join corrupted
// that in an earlier site (see sites/didscope's GENERIC_OG_URL_ATTR note).
const GENERIC_TITLE = "moottld — census your mutuals' TLDs";
const GENERIC_DESC =
  "Turn your Bluesky mutuals into a census: unique TLDs and how many handles sit under each, segment counts, shortest/longest handles, average length. Enter any handle.";
const GENERIC_OG_URL_ATTR = 'content="https://moottld.bisks.net/"';

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
      graphAll("app.bsky.graph.getFollows", "follows", did),
      graphAll("app.bsky.graph.getFollowers", "followers", did),
    ]);
    const followerDids = new Set(followers.map((f: any) => f.did));
    const mutuals = follows.filter((f: any) => f.did !== did && followerDids.has(f.did));
    const validHandles = mutuals
      .map((m: any) => m.handle)
      .filter((h: string) => h && h !== "handle.invalid");
    const tlds = new Set(validHandles.map((h: string) => h.split(".").pop()));
    const avgLen = validHandles.length
      ? validHandles.reduce((a: number, h: string) => a + h.length, 0) / validHandles.length
      : 0;

    const title = `moottld: ${who}'s moot census`;
    const desc = truncate(
      `${mutuals.length} mutuals across ${tlds.size} unique TLD${tlds.size === 1 ? "" : "s"}, average handle length ${avgLen.toFixed(1)} chars. Enter any handle for the full breakdown.`,
      300,
    );
    const ogUrl = `https://moottld.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve the handle server-side (typo, deleted account, rate
    // limit) — still serve the live page so the link isn't dead; the client
    // script will surface its own "couldn't census that" error and the /s/
    // path handling in index.html will still try the full client-side run.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

// /img?u=<cdn.bsky.app avatar url> — a narrow same-origin CORS proxy for
// avatar images. cdn.bsky.app sends no Access-Control-Allow-Origin header, so
// drawing an avatar onto the client's share-card <canvas> taints it and
// canvas.toBlob()/toDataURL() come back empty. Re-fetching the same bytes
// through this Worker and adding an open CORS header fixes that. Locked down
// to exactly cdn.bsky.app's avatar paths — copied from
// sites/mootspy/src/index.ts (itself copied from sites/beesky).
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

  const upstream = await fetch(target.toString(), {
    cf: { cacheTtl: 86400, cacheEverything: true } as unknown as Record<string, unknown>,
  });
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

    // /s/<handle> — the distinct, shareable, per-person URL. Every handle
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached generic card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
