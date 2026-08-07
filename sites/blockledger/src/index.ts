// blockledger Worker — blockledger.bisks.net
//
// Everything real runs client-side (public/index.html + public/lib/*.js): a
// full mutuals crawl plus one PDS listRecords fetch per mutual, which is far
// too slow for an unfurl bot's timeout to redo server-side. The one thing
// that needs a server: shared links. A plain static site would serve the
// *same* og:title/og:description for every query string, so Bluesky's
// link-unfurl cache would show one generic card forever no matter who ran a
// check — see notes/45-sharing-and-virality.md tier 4, and sites/metamoots
// for the identical trick this is copied from. Fix: /s/<handle> is a real,
// distinct URL per person, carrying the already-computed edge count (`n`) as
// a query param, so the Worker can stamp personalized meta tags onto the
// same page shell without recomputing anything.
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

const short = (h: string) => "@" + (h || "").replace(/\.bsky\.social$/, "");

// Exact strings from public/index.html's <head> — kept as plain constants
// (not parsed out of the HTML) so a future copy edit is a visible diff in
// both places, same as sites/didscope and sites/metamoots.
const GENERIC_PAGE_TITLE = "blockledger — who blocks who in your circle — bisks.net";
const GENERIC_OG_TITLE = "blockledger — who blocks who in your circle";
const GENERIC_DESC =
  "Your mutuals are supposed to be your people. blockledger checks whether any of them quietly block each other.";
// Quoted so this only matches the og:url attribute's exact value, not the
// og:image/twitter:image tags, which share this string as a prefix.
const GENERIC_OG_URL_ATTR = '"https://blockledger.bisks.net/"';

function renderShare(env: Env, request: Request, rawHandle: string, url: URL): Promise<Response> {
  return env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" })).then(async (base) => {
    let html = await base.text();

    const handle = cleanHandle(rawHandle);
    const n = parseInt(url.searchParams.get("n") || "", 10);
    if (!handle || !Number.isFinite(n) || n < 0) {
      return new Response(html, { headers: base.headers });
    }

    const who = short(handle);
    const pageTitle = n
      ? `blockledger: ${n} block${n === 1 ? "" : "s"} inside ${who}'s circle`
      : `blockledger: ${who}'s circle is clean`;
    const desc = truncate(
      n
        ? `${n} block${n === 1 ? "" : "s"} found between ${who}'s own mutuals — moots who quietly block each other.`
        : `no blocks found between any of ${who}'s mutuals — clean circle.`,
      300,
    );
    const ogUrl = `https://blockledger.bisks.net/s/${encodeURIComponent(handle)}?n=${n}`;

    html = html
      .split(GENERIC_PAGE_TITLE).join(esc(pageTitle))
      .split(GENERIC_OG_TITLE).join(esc(pageTitle))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`"${esc(ogUrl)}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1], url);

    return env.ASSETS.fetch(request);
  },
};
