// kevinmoot Worker — kevinmoot.bisks.net
//
// The actual search (a bounded bidirectional BFS across live mutual-follow
// data — see public/lib/bfs.js) runs entirely client-side; it's too
// expensive (potentially hundreds of paginated AppView reads) to redo on
// every share-link fetch. The one thing that needed a server: shared links.
// A plain static site serves the *same* index.html — same
// og:title/og:description/og:image — no matter which two handles are in the
// URL, so a link-unfurl cache (Bluesky's included) shows one generic card
// forever, for every pair (same problem didscope hit; see its src/index.ts).
//
// Fix: /s/<handleA>/<handleB> is a real, distinct URL per pair. The Worker
// resolves both handles server-side (two cheap lookups, no graph crawl) and
// stamps a personalized og:title/og:description/og:url onto the same page
// shell — the card teases the question ("how many moots apart are @a and
// @b?") without computing the real answer, since that's the expensive part
// the client does live when the link is opened. Falls through to ASSETS for
// everything else (/, /og.png).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
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

async function resolveHandle(raw: string): Promise<{ handle: string; did: string }> {
  const handle = cleanHandle(raw);
  if (!handle) throw new Error("empty handle");
  const did = handle.startsWith("did:") ? handle : (await xrpc("com.atproto.identity.resolveHandle", { handle })).did;
  const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
  return { handle: profile.handle || handle, did };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The static page's title/description phrase and og:url are identical across
// every <title>/og:*/twitter:* tag, so one string-replace-all each is enough
// to personalize the whole head — no HTML parser needed. Matched as a full
// quoted attribute, not the bare URL — the bare URL is also a prefix of the
// og:image/twitter:image URLs ("…/og.png"), so a naive split/join on it
// would corrupt those too (caught the hard way on didscope; see its
// src/index.ts and sites/sidenote).
const GENERIC_TITLE = "kevinmoot — how many moots separate you?";
const GENERIC_DESC =
  "Pick two Bluesky accounts and trace the shortest mutual-follow chain between them, one moot at a time.";
const GENERIC_OG_URL_ATTR = 'content="https://kevinmoot.bisks.net/"';

async function renderShare(env: Env, request: Request, rawA: string, rawB: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    const [a, b] = await Promise.all([resolveHandle(rawA), resolveHandle(rawB)]);

    const title = `kevinmoot: @${a.handle}  <->  @${b.handle}`;
    const desc =
      a.did === b.did
        ? `that's the same account. degrees of separation: zero. see the full trace on kevinmoot.`
        : `how many moots separate @${a.handle} and @${b.handle}? trace the shortest mutual-follow chain between them on kevinmoot.`;
    const ogUrl = `https://kevinmoot.bisks.net/s/${encodeURIComponent(a.handle)}/${encodeURIComponent(b.handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve one of the handles server-side (typo, deleted
    // account, rate limit) — still serve the live page so the link isn't
    // dead; the client script resolves them itself and surfaces its own
    // error if they're really bad.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<handleA>/<handleB> — the distinct, shareable, per-pair URL. Every
    // combination gets its own page (and its own og:title/description/url),
    // so a link unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1], m[2]);

    return env.ASSETS.fetch(request);
  },
};
