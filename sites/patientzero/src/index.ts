// patientzero Worker — patientzero.bisks.net
//
// The outbreak investigation itself is entirely client-side (public/index.html
// + public/lib/*.js): search Bluesky for a phrase via sites/trigrams's open
// /api/search proxy, find the earliest post (global patient zero) and the
// earliest one inside the requester's moots (local patient zero), render a
// case history timeline, and record a hype video with canvas + MediaRecorder.
//
// Two small server jobs, same shape as sites/mechpilot:
//
// 1. /api/avatar — cdn.bsky.app sends no Access-Control-Allow-Origin, so a
//    crossOrigin="anonymous" <img> fetch of an avatar always fails and the
//    hype-video canvas would silently fall back to a plain placeholder. This
//    same-origin proxy lets the client draw real avatars into frames without
//    tainting the canvas. Locked to cdn.bsky.app so it can't be used as an
//    open image proxy.
//
// 2. /s/<phrase> — a plain static site serves the same index.html (same
//    og:title/description/image) no matter what phrase is in the URL, so
//    Bluesky's link-unfurl cache would show one generic card for every
//    shared case file, forever. This route is a real, distinct URL per
//    phrase: the Worker fetches one page of /api/search server-side for a
//    rough case count + earliest-seen guess, and stamps a personalized
//    og:title/og:description/og:url onto the same page shell before handing
//    it back. og:image stays the static public/og.png sample card — Workers
//    have no native canvas rasterizer to draw a real one per phrase
//    server-side, and the real per-phrase visuals are the client's job
//    (the timeline + hype video) anyway.

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

const GENERIC_TITLE = "patient zero — outbreak tracking for whatever weird phrase everyone's suddenly saying";
const GENERIC_DESC =
  "Paste a phrase and it finds the global patient zero, your local patient zero, a full case history timeline, and makes you a hype video about the outbreak.";
const GENERIC_OG_URL = "https://patientzero.bisks.net/";

async function renderShare(env: Env, request: Request, rawPhrase: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const phrase = decodeURIComponent(rawPhrase).trim();
  if (!phrase) return new Response(html, { headers: base.headers });

  try {
    const u = new URL(SEARCH_API);
    u.searchParams.set("q", phrase);
    u.searchParams.set("limit", "100");
    u.searchParams.set("sort", "latest");
    const res = await fetch(u.toString());
    if (!res.ok) throw new Error(`search ${res.status}`);
    const data = (await res.json()) as { posts?: any[] };
    const posts = data.posts || [];

    const title = `patient zero: "${truncate(phrase, 60)}"`;
    let desc: string;
    if (posts.length === 0) {
      desc = `No confirmed cases of "${phrase}" yet — investigate anyway, or watch it hit patient zero live —`;
    } else {
      const oldest = posts[posts.length - 1];
      const who = oldest?.author?.handle ? "@" + oldest.author.handle : "an unidentified carrier";
      const countLabel = posts.length >= 100 ? "100+" : String(posts.length);
      desc = `${countLabel} confirmed case${posts.length === 1 ? "" : "s"} so far. Earliest spotted from ${who}. Full case history + a hype video —`;
    }
    desc = truncate(desc, 300);
    const ogUrl = `https://patientzero.bisks.net/s/${encodeURIComponent(phrase)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't reach search server-side (rate limit, upstream hiccup) — still
    // serve the live page so the link isn't dead; the client script runs the
    // same search itself once it loads.
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
