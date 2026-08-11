// threadwalk Worker — threadwalk.bisks.net
//
// Everything real happens client-side (public/lib/*.js): crawling the public
// AppView for a handle's oomfs (mutual follows), oomfs-of-oomfs, sampling
// candidate posts from that network, scoring each by how many oomfs/oomfs2
// liked it, and laying the result out as a 2D map you walk around with the
// arrow keys. Every read is on the public, unauthenticated AppView
// (resolveHandle / getFollows / getFollowers / getAuthorFeed / getLikes, all
// CORS *) — no OAuth anywhere in this site.
//
// The one server surface: /w/<authorHandle>/<rkey> — a distinct, shareable
// URL per thread someone arrives at in-game. A plain static site serves the
// same og:title/og:description for every visit, so every "share this walk"
// post collapses into one generic unfurl card no matter which thread it was
// (see notes/45-sharing-and-virality.md, tier 4). This route bakes the
// specific author + oomf counts (passed as query params from the client,
// which already computed them during the walk) into personalized meta tags,
// and re-fetches the live post text/likeCount server-side for a fresher
// description than trusting a snapshot in the URL. Falls through to ASSETS
// for everything else (/, /og.png, /fonts/*, /lib/*).
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PUB = "https://public.api.bsky.app/xrpc/";

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(PUB + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
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

// The static page repeats these two strings across <title>/og:*/twitter:*
// (see public/index.html) — a plain split/join swaps every occurrence, no
// HTML parser needed.
const GENERIC_TITLE = "threadwalk — walk the discourse map of your bit of the sky";
const GENERIC_DESC =
  "A 2D map of current discourse, laid out by how much your oomfs and oomfs-of-oomfs like each thread. Walk from thread to thread with the arrow keys — the nearest one is always the next thing your people are into.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those into "…/w/<h>/<r>og.png" too (the
// exact gotcha called out in sites/didscope/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://threadwalk.bisks.net/"';

async function renderShare(
  env: Env,
  request: Request,
  authorHandle: string,
  rkey: string,
  params: URLSearchParams,
): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();
  if (!authorHandle || !rkey) return new Response(html, { headers: base.headers });

  const by = (params.get("by") || "").replace(/^@/, "");
  const oh = Math.max(0, parseInt(params.get("oh") || "0", 10) || 0);
  const o2h = Math.max(0, parseInt(params.get("o2h") || "0", 10) || 0);

  try {
    const { did } = await xrpc("com.atproto.identity.resolveHandle", { handle: authorHandle });
    const uri = `at://${did}/app.bsky.feed.post/${rkey}`;
    const thread = await xrpc("app.bsky.feed.getPostThread", { uri, depth: "0" });
    const post = thread?.thread?.post;
    const text = (post?.record?.text || "").trim();
    const authorName = post?.author?.displayName || post?.author?.handle || authorHandle;

    const byBit = by ? `@${by}'s` : "your";
    const oomfBit = oh > 0 ? `${oh} oomf${oh === 1 ? "" : "s"}` : "the network";
    const oomf2Bit = o2h > 0 ? ` and ${o2h} oomfs-of-oomfs` : "";

    const title = truncate(`threadwalk: @${authorName} is what ${byBit} oomfs are into`, 70);
    const quoteBit = text ? `“${truncate(text, 130)}” — ` : "";
    const desc = truncate(
      `${quoteBit}liked by ${oomfBit}${oomf2Bit} in ${byBit} network. walk the discourse map yourself.`,
      300,
    );

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${esc(request.url)}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve the handle/post server-side (typo, deleted post, rate
    // limit) — still serve the live page so the link isn't dead; the client
    // just won't get a personalized preview card for this one.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/w\/([^/]+)\/([^/]+)\/?$/);
    if (m) {
      return renderShare(env, request, decodeURIComponent(m[1]), decodeURIComponent(m[2]), url.searchParams);
    }

    return env.ASSETS.fetch(request);
  },
};
