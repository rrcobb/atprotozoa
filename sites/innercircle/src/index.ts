// innercircle Worker — innercircle.bisks.net
//
// Everything real happens client-side (public/index.html + public/lib/*.js):
// find a handle's mutuals, rank them purely from constellation backlinks to
// the handle's own posts, take the top 40, and show the first reply each
// way (you → them, them → you) for each one. The one thing that needed a
// server: shared results. A plain static site serves the same index.html —
// same og:title/og:description — no matter whose circle you built, so
// sharing a link would unfurl one generic card forever (same issue as
// sites/didscope's notes/45-sharing-and-virality.md, tier 4, and the fix
// sites/mootrace and sites/dial-a-mutual already shipped).
//
// Fix: /summary/<handle>/<circleSize>/<bothWaysCount> is a real, distinct
// URL per result. This does NOT re-run any of the expensive work
// server-side (constellation-ranking a prolific poster's own post history
// can take minutes — far too slow for a single Worker request) — the client
// already computed circleSize/bothWaysCount before building the share link,
// so the Worker just formats them straight from the URL path into the OG
// tags.
//
// Falls through to ASSETS for everything else (/, /og.png, /lib/*, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw || "").trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The static page's meta tags — these exact strings get swapped for the
// personalized versions. Keep in sync with public/index.html's <head>.
const GENERIC_OG_TITLE = "innercircle — your top mutuals' first words with you";
const GENERIC_OG_DESC =
  "Type a Bluesky handle to find its top 40 mutuals, ranked purely from constellation backlinks to their own posts, then see the first reply each way — text and link included.";
const GENERIC_TWITTER_DESC =
  "The top 40 mutuals of a handle, ranked by constellation backlinks, and the first reply each way with each one.";
// Quoted, not bare — "https://innercircle.bisks.net/" is also a *prefix* of
// the og:image/twitter:image URLs (".../og.png"), so a bare substring
// replace corrupts those into ".../summary/<handle>/<n>/<n>og.png" (a 404,
// no separating slash). Matching the closing quote scopes the replacement
// to the exact og:url/canonical attribute value only.
const GENERIC_OG_URL = `"https://innercircle.bisks.net/"`;

async function renderSummary(
  env: Env,
  request: Request,
  rawHandle: string,
  rawCircle: string,
  rawBothWays: string,
): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  const circle = Number(rawCircle);
  const bothWays = Number(rawBothWays);
  if (!handle || !Number.isFinite(circle) || !Number.isFinite(bothWays) || circle < 0) {
    return new Response(html, { headers: base.headers });
  }

  const title = `🔗 innercircle: @${handle}'s top ${circle} mutuals, ${bothWays} talked both ways`;
  const desc =
    circle === 0
      ? `@${handle} doesn't have enough replies (that constellation can see) yet to build an inner circle.`
      : `@${handle}'s top ${circle} mutuals, ranked purely from constellation backlinks — ${bothWays} of them have talked both ways. See who said what first.`;
  const ogUrl = `https://innercircle.bisks.net/summary/${encodeURIComponent(handle)}/${circle}/${bothWays}`;

  html = html
    .split(GENERIC_OG_TITLE).join(esc(title))
    .split(GENERIC_OG_DESC).join(esc(desc))
    .split(GENERIC_TWITTER_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(`"${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /summary/<handle>/<circleSize>/<bothWaysCount> — the distinct,
    // shareable, per-result URL. Every result gets its own og:title/
    // description/url so a link unfurler can't collapse different shared
    // circles into one card.
    const m = url.pathname.match(/^\/summary\/([^/]+)\/(\d+)\/(\d+)\/?$/);
    if (m) return renderSummary(env, request, m[1], m[2], m[3]);

    return env.ASSETS.fetch(request);
  },
};
