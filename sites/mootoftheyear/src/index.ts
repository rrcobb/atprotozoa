// mootoftheyear Worker — mootoftheyear.bisks.net
//
// The cover itself is drawn client-side (public/index.html: drawCoverCard).
// The one thing that needs a server: shared links. A plain static site
// serves the *same* index.html — same og:title/og:description/og:image — no
// matter whose handle is in the query string, so a link-unfurl cache shows
// one generic card for every share, forever (same problem sites/didscope
// solved; see that site's src/index.ts for the fuller writeup).
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side, re-derives the same headline the client would
// (highest-engagement recent post), and stamps personalized
// og:title/og:description/og:url onto the same page shell before handing it
// back. Falls through to ASSETS for everything else (/, /og.png, /fonts/*).

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

function stripForHeadline(text: string): string {
  return text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
}

// same ranking the client uses in findHeadlinePost: highest engagement wins,
// kept as a server-side duplicate (one site, not a shared package).
async function findHeadline(did: string): Promise<{ text: string; likeCount: number } | null> {
  try {
    const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "50", filter: "posts_no_replies" });
    const posts = (feed.feed || [])
      .filter((f: any) => !f.reason && f.post?.record?.text)
      .map((f: any) => ({
        text: stripForHeadline(f.post.record.text),
        likeCount: f.post.likeCount || 0,
        score: (f.post.likeCount || 0) + (f.post.repostCount || 0) * 2 + (f.post.quoteCount || 0) * 2 + (f.post.replyCount || 0),
      }))
      .filter((p: any) => p.text.length > 3);
    if (!posts.length) return null;
    posts.sort((a: any, b: any) => b.score - a.score);
    return posts[0];
  } catch (_) {
    return null;
  }
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

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

const GENERIC_TITLE = "mootoftheyear — crown your moot of the year";
const GENERIC_DESC =
  "Enter a Bluesky handle. We pull your best-performing post as the headline, your avatar as the cover photo, and print you a TIME-style Moot of the Year cover.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (gotcha documented in
// sites/didscope/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://mootoftheyear.bisks.net/"';

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
    const top = await findHeadline(did);

    const who = "@" + (profile.handle || handle);
    const title = truncate(`MOOT: ${who} is the moot of the year`, 90);
    const desc = top
      ? truncate(`Cover line: "${top.text}" (${top.likeCount} likes). ${who}'s official 2026 cover.`, 300)
      : truncate(`${who} is the moot of the year. New to the timeline — the cover's still theirs to write.`, 300);
    const ogUrl = `https://mootoftheyear.bisks.net/s/${encodeURIComponent(handle)}`;

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
    // script surfaces its own "couldn't build a cover" error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

// cdn.bsky.app serves avatars with no Access-Control-Allow-Origin header, so
// a client-side `img.crossOrigin = "anonymous"` load always fails (onerror
// fires, the canvas draws the initials fallback instead) — and dropping
// crossOrigin "fixes" the visual draw but taints the canvas, throwing on the
// toBlob() calls the download/native-share buttons depend on. /img proxies
// the bytes through this same-origin Worker instead, so the browser never
// needs cross-origin canvas permission at all. Locked to the one CDN host
// avatars actually come from — not a general open proxy.
const ALLOWED_IMG_HOSTS = new Set(["cdn.bsky.app"]);

async function proxyImage(rawUrl: string): Promise<Response> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch (_) {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_IMG_HOSTS.has(target.hostname)) {
    return new Response("host not allowed", { status: 400 });
  }
  const upstream = await fetch(target.toString(), { cf: { cacheTtl: 3600 } as unknown as Record<string, unknown> });
  if (!upstream.ok || !upstream.body) return new Response("upstream error", { status: 502 });
  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") || "image/jpeg",
      "cache-control": "public, max-age=3600",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<handle> — the distinct, shareable, per-person URL. Every handle
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    if (url.pathname === "/img") {
      const u = url.searchParams.get("u");
      if (!u) return new Response("missing u", { status: 400 });
      return proxyImage(u);
    }

    return env.ASSETS.fetch(request);
  },
};
