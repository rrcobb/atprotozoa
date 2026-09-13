// mootrace Worker — mootrace.bisks.net
//
// Everything real happens client-side (public/index.html + public/lib/*.js):
// resolve a handle's mutuals, download each mutual's whole repo, and work out
// who replied to whom first. The one thing that needed a server: shared
// results. A plain static site serves the same index.html — same
// og:title/og:description — no matter whose grid you built, so sharing a
// link would unfurl one generic card forever (same issue as
// sites/didscope's notes/45-sharing-and-virality.md, tier 4, and the exact
// fix sites/dial-a-mutual already shipped for /call/).
//
// Fix: /summary/<handle>/<firstCount>/<totalCount> is a real, distinct URL
// per result. Unlike dial-a-mutual's /call/ route, this does NOT re-run any
// of the expensive work server-side (scanning a whole mutuals list's repos
// is far too slow/costly for a single Worker request) — the client already
// computed firstCount/totalCount before building the share link, so the
// Worker just formats them straight from the URL path into the OG tags.
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
const GENERIC_OG_TITLE = "mootrace — who replied to whom first";
const GENERIC_OG_DESC =
  "Type a Bluesky handle to build a full grid of its mutuals: every pairing shows who broke the ice first by replying to the other.";
const GENERIC_TWITTER_DESC =
  "A grid of a handle's mutuals — every pairing shows who replied to the other first.";
const GENERIC_OG_URL = "https://mootrace.bisks.net/";

async function renderSummary(
  env: Env,
  request: Request,
  rawHandle: string,
  rawFirst: string,
  rawTotal: string,
): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  const first = Number(rawFirst);
  const total = Number(rawTotal);
  if (!handle || !Number.isFinite(first) || !Number.isFinite(total) || total < 0) {
    return new Response(html, { headers: base.headers });
  }

  const title = `🏁 mootrace: @${handle} broke the ice with ${first}/${total} mutuals`;
  const desc =
    total === 0
      ? `@${handle} has no mutuals to race yet.`
      : `@${handle} was first to reply to ${first} of ${total} mutuals on mootrace — see the full grid.`;
  const ogUrl = `https://mootrace.bisks.net/summary/${encodeURIComponent(handle)}/${first}/${total}`;

  html = html
    .split(GENERIC_OG_TITLE).join(esc(title))
    .split(GENERIC_OG_DESC).join(esc(desc))
    .split(GENERIC_TWITTER_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /summary/<handle>/<firstCount>/<totalCount> — the distinct, shareable,
    // per-result URL. Every result gets its own og:title/description/url so
    // a link unfurler can't collapse different shared grids into one card.
    const m = url.pathname.match(/^\/summary\/([^/]+)\/(\d+)\/(\d+)\/?$/);
    if (m) return renderSummary(env, request, m[1], m[2], m[3]);

    return env.ASSETS.fetch(request);
  },
};
