// laughtrack Worker — laughtrack.bisks.net
//
// The full scan runs client-side (public/lib/scan.js does the real work: walk
// recent posts, fetch each one's reply thread, count laugh markers). The one
// thing that needed a server: shared links. A plain static site serves the
// *same* index.html — same og:title/og:description/og:image — no matter whose
// handle is in the query string, so a link-unfurl cache shows one generic card
// for every share, forever. Same fix as sites/didscope and sites/beefcheck:
// /s/<handle> is a real, distinct URL per person. The Worker resolves the
// handle, runs a smaller version of the same scan (fewer posts — a fast OG
// preview, not the full read), and stamps personalized og:title/description/
// url onto the page shell before handing it back. Falls through to ASSETS for
// everything else (/, /og.png, /lib/*).

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

// Same family list as public/lib/scan.js's MARKER_FAMILIES, kept as a local
// copy — server-side duplication of client logic within ONE site, not a
// shared package across sites (same reasoning as sites/beefcheck/src/index.ts).
const MARKER_RES: RegExp[] = [
  /\bl(?:o+l)+\b/gi,
  /\b(?:h+a+){2,}h*\b|\b(?:a+h+){2,}a*\b/gi,
  /\blm+f?a+o+\b/gi,
  /\broflm?a?o?\b/gi,
  /\bomg+\b/gi,
  /😂|🤣/gu,
];

function countLaughs(text: string | undefined): number {
  if (!text) return 0;
  let total = 0;
  for (const re of MARKER_RES) {
    const m = text.match(re);
    if (m) total += m.length;
  }
  return total;
}

// Far fewer posts than the client's full scan (which now walks every post
// the account has) — this only needs to be fast enough for a preview fetch,
// not exhaustive.
const OG_MAX_POSTS = 15;

async function fetchOwnPosts(did: string): Promise<{ uri: string; text: string; createdAt: string }[]> {
  const out: { uri: string; text: string; createdAt: string }[] = [];
  const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "40", filter: "posts_with_replies" });
  for (const item of feed.feed || []) {
    if (item.reason) continue;
    const post = item.post;
    const text = post?.record?.text;
    if (!post || typeof text !== "string" || !text.trim()) continue;
    out.push({ uri: post.uri, text, createdAt: post.record?.createdAt || post.indexedAt });
    if (out.length >= OG_MAX_POSTS) break;
  }
  return out;
}

function walkReplyCount(node: any, authorDid: string): number {
  let total = 0;
  for (const kid of node?.replies || []) {
    const post = kid?.post;
    if (post && post.author?.did !== authorDid) total += countLaughs(post.record?.text);
    total += walkReplyCount(kid, authorDid);
  }
  return total;
}

async function scanPostLaughs(uri: string, authorDid: string): Promise<number> {
  try {
    const data = await xrpc("app.bsky.feed.getPostThread", { uri, depth: "6", parentHeight: "0" });
    return walkReplyCount(data.thread, authorDid);
  } catch (_) {
    return 0;
  }
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

const GENERIC_TITLE = "laughtrack — find someone's funniest post, by the replies";
const GENERIC_DESC =
  "Enter a Bluesky handle. laughtrack reads every reply to every post they've ever made and counts lol/haha/omg/lmao/rofl-family exclamations to find whichever post actually made people laugh — ranked by that, not by likes.";
const GENERIC_OG_URL = "https://laughtrack.bisks.net/";

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    const did = handle.startsWith("did:") ? handle : (await xrpc("com.atproto.identity.resolveHandle", { handle })).did;
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
    const who = "@" + (profile.handle || handle);

    const posts = await fetchOwnPosts(did);
    let best: { text: string; total: number } | null = null;
    if (posts.length) {
      const totals = await Promise.all(posts.map((p) => scanPostLaughs(p.uri, did)));
      let bestIdx = 0;
      for (let i = 1; i < totals.length; i++) if (totals[i] > totals[bestIdx]) bestIdx = i;
      if (totals[bestIdx] > 0) best = { text: posts[bestIdx].text, total: totals[bestIdx] };
    }

    const title = best ? `laughtrack: ${who}'s funniest post scored ${best.total}` : `laughtrack: ${who}`;
    const desc = truncate(
      best
        ? `“${truncate(best.text, 140)}” — ${best.total} lol/haha/omg-family laughs in the replies. not ranked by likes.`
        : `No laugh-marker replies found in ${who}'s recent posts yet. Read the full scan for the whole ranked list.`,
      300
    );
    const ogUrl = `https://laughtrack.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve/scan server-side (typo, deleted account, rate limit) —
    // still serve the live page; the client script surfaces its own error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<handle> — the distinct, shareable, per-person URL.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
