// snubbed Worker — snubbed.bisks.net
//
// The real read runs entirely client-side (public/lib/bsky.js pages
// app.bsky.feed.getLikes to exhaustion for both posts — no bulk-download
// shortcut exists for "who liked this post," it's an AppView reverse index,
// not a listable collection on anyone's repo, so pagination there is the
// correct approach, not a workaround). The one thing that needs a server:
//
//   /s/<a>+<b> — a personalized OG share URL per post pair. A plain static
//   site serves the same index.html no matter what's in the query string, so
//   a link-unfurl cache (Bluesky's included) shows one generic card for
//   every share, forever. Resolve server-side, run a capped version of the
//   same likes read (good enough for a one-line teaser, not the full list),
//   stamp personalized og:title/og:description/og:url into the static shell.
//   Each side is a base64url-encoded AT-URI (a raw post URL has slashes in
//   it, which don't survive as a bare path segment).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const API = "https://public.api.bsky.app/xrpc/";

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

function b64urlDecode(s: string): string {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return atob(b64);
}

// Up to 5 pages (~500 likers) per side — plenty for a one-line teaser count;
// the live page does the exhaustive, uncapped read.
async function getLikerDids(uri: string): Promise<Set<string>> {
  const dids = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const params: Record<string, string> = { uri, limit: "100" };
    if (cursor) params.cursor = cursor;
    const data = await xrpc("app.bsky.feed.getLikes", params);
    for (const l of data.likes || []) {
      if (l && l.actor && l.actor.did) dids.add(l.actor.did);
    }
    cursor = data.cursor;
    if (!cursor || !(data.likes || []).length) break;
  }
  return dids;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "snubbed — who liked the reply but not you?";
const GENERIC_DESC =
  "Paste two Bluesky post links. snubbed pulls every liker of both, in full, and shows exactly who liked the second post but skipped the first.";
const GENERIC_OG_URL = "https://snubbed.bisks.net/";

async function renderShare(env: Env, request: Request, rawA: string, rawB: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  let uriA: string, uriB: string;
  try {
    uriA = b64urlDecode(rawA);
    uriB = b64urlDecode(rawB);
    if (!uriA.startsWith("at://") || !uriB.startsWith("at://")) throw new Error("bad uri");
  } catch (_) {
    return new Response(html, { headers: base.headers });
  }

  try {
    const [postsData, likersA, likersB] = await Promise.all([
      xrpc("app.bsky.feed.getPosts", { uris: uriA }).then((d) => d.posts && d.posts[0]).catch(() => null),
      getLikerDids(uriA).catch(() => new Set<string>()),
      getLikerDids(uriB).catch(() => new Set<string>()),
    ]);
    const postB = await xrpc("app.bsky.feed.getPosts", { uris: uriB }).then((d) => d.posts && d.posts[0]).catch(() => null);

    const snubCount = [...likersB].filter((did) => !likersA.has(did)).length;
    const handleA = (postsData && postsData.author && postsData.author.handle) || "someone";
    const handleB = (postB && postB.author && postB.author.handle) || "someone";

    const title = `snubbed: ${snubCount} liked @${handleB}'s post but not @${handleA}'s`;
    const desc = truncate(
      `${snubCount} ${snubCount === 1 ? "person" : "people"} liked @${handleB}'s post but skipped @${handleA}'s — the full, exhaustively-checked list is one click away.`,
      300
    );
    const ogUrl = `https://snubbed.bisks.net/s/${encodeURIComponent(rawA)}+${encodeURIComponent(rawB)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve server-side (deleted post, rate limit) — still serve
    // the live page; the client script surfaces its own error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<a>+<b> — the distinct, shareable, per-pair URL.
    const m = url.pathname.match(/^\/s\/([^/+]+)\+([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1], m[2]);

    return env.ASSETS.fetch(request);
  },
};
