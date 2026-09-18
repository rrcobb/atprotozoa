// dibs Worker — dibs.bisks.net
//
// The real work is entirely client-side (public/index.html + public/lib/
// search.js): page Bluesky search latest-first through sites/trigrams's open
// /api/search proxy until the cursor is genuinely exhausted, and report the
// oldest literal match as the first person to say the phrase.
//
// Two small server jobs, same shape as sites/patientzero/src/index.ts:
//
// 1. /api/avatar — cdn.bsky.app sends no Access-Control-Allow-Origin, so a
//    crossOrigin="anonymous" <img> fetch of an avatar always fails and the
//    share-card canvas would silently fall back to a plain placeholder. This
//    same-origin proxy lets the client draw a real avatar into the card
//    without tainting the canvas. Locked to cdn.bsky.app so it can't be used
//    as an open image proxy.
//
// 2. /s/<phrase> — a plain static site serves the same index.html (same
//    og:title/description/image) no matter what phrase is in the URL, so
//    Bluesky's link-unfurl cache would show one generic card for every
//    shared result, forever. This route is a real, distinct URL per phrase:
//    the Worker fetches one quick page of /api/search server-side for a
//    rough guess at who said it first, and stamps a personalized
//    og:title/og:description/og:url onto the same page shell before handing
//    it back. That's a guess, not the exhaustive client-side scan — a full
//    scan can take minutes, too slow for a Worker request building a link
//    preview. og:image stays the static public/og.png card; the real
//    per-result visual is the client's share-card canvas.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const AVATAR_HOST = "cdn.bsky.app";
const SEARCH_API = "https://trigrams.bisks.net/api/search";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

async function proxyAvatar(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get("u") || "";
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== AVATAR_HOST) {
    return new Response("host not allowed", { status: 400 });
  }
  const upstream = await fetch(parsed.toString());
  if (!upstream.ok || !upstream.body) {
    return new Response("upstream error", { status: 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=86400",
      "access-control-allow-origin": "*",
    },
  });
}

const GENERIC_TITLE = "dibs — find the first person to ever say a phrase";
const GENERIC_DESC =
  "Type a phrase and it pages Bluesky search all the way back to the beginning to find whoever said it first.";
// Matched with the closing quote so this can't also match the og:image tag's
// "https://dibs.bisks.net/og.png", which shares the same URL prefix.
const GENERIC_OG_URL = 'content="https://dibs.bisks.net/"';

async function renderShare(env: Env, request: Request, rawPhrase: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const phrase = decodeURIComponent(rawPhrase).trim();
  if (!phrase) return new Response(html, { headers: base.headers });

  try {
    const u = new URL(SEARCH_API);
    u.searchParams.set("q", phrase);
    u.searchParams.set("limit", "1");
    u.searchParams.set("sort", "latest");
    const res = await fetch(u.toString());
    if (!res.ok) throw new Error(`search ${res.status}`);
    const data = (await res.json()) as { posts?: any[] };
    const posts = data.posts || [];
    const phraseLower = phrase.toLowerCase();
    const hasAny = posts.some((p) => (p?.record?.text || "").toLowerCase().includes(phraseLower));

    const title = `dibs: “${truncate(phrase, 60)}”`;
    const desc = hasAny
      ? `Someone's already said this on Bluesky — see who got there first —`
      : `Nobody's ever said this on Bluesky, as far as the search index can tell. Go claim it —`;
    const ogUrl = `https://dibs.bisks.net/s/${encodeURIComponent(phrase)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(truncate(desc, 300)))
      .split(GENERIC_OG_URL).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't reach search server-side (rate limit, upstream hiccup) — still
    // serve the live page so the link isn't dead; the client runs the real
    // scan itself once it loads.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/avatar") {
      return proxyAvatar(request);
    }

    // /s/<phrase> — the distinct, shareable, per-phrase URL. Every phrase gets
    // its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
