// nextbigthing Worker — nextbigthing.bisks.net
//
// The trend-spotting itself is entirely client-side (public/app.js): connect
// to Jetstream, tally real words from real posts in a rolling window, crown
// whichever one has the most hits. The one thing that needed a server:
// shared links. A plain static site serves the same index.html — same
// og:title/og:description — no matter which term is in the URL, so
// Bluesky's link-unfurl cache would show one generic card forever no matter
// which trend got shared (same problem sites/crowdpleaser and sites/didscope
// solved). Fix: /s/<term>/<count> is a real, distinct URL per snapshot. The
// Worker stamps the term and count into the page's og tags before handing it
// back. Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
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

const GENERIC_TITLE = "nextbigthing — the honest next big thing on bluesky, live";
const GENERIC_DESC =
  "No manufactured hype. This crowns whatever's genuinely trending on the real Bluesky firehose right now, recomputed every second.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is also
// a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (gotcha called out in
// sites/crowdpleaser/src/index.ts, sites/didscope/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://nextbigthing.bisks.net/"';

async function renderShare(env: Env, request: Request, rawTerm: string, rawCount: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const term = decodeURIComponent(rawTerm).trim();
  const count = parseInt(rawCount, 10);
  if (!term || term.length > 60 || !Number.isFinite(count) || count < 0) {
    return new Response(html, { headers: base.headers });
  }

  const title = `nextbigthing: "${term}" is the next big thing on bluesky`;
  const desc = truncate(
    `${count} real post${count === 1 ? "" : "s"} mentioned "${term}" in the last few minutes on the live firehose. that's the whole ranking — nothing here is manufactured.`,
    300,
  );
  const ogUrl = `https://nextbigthing.bisks.net/s/${encodeURIComponent(term)}/${count}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<term>/<count> — the distinct, shareable, per-snapshot URL. Every
    // crowned trend gets its own link (and its own og:title/description), so
    // a link unfurler can't collapse every share into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1], m[2]);

    return env.ASSETS.fetch(request);
  },
};
