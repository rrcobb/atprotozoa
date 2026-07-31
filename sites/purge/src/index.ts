// Mounted at bisks.net/purge/ — strips the mount prefix before handing the
// request to the static-asset router, since the assets directory has no
// idea it isn't living at the domain root.
//
// One extra route: /purge/s/<handle> is the per-result share link (see
// notes/45-sharing-and-virality.md, tier 4). A plain static page serves the
// *same* og:title/og:description/og:url for every query-string variant, so
// a link-unfurl cache shows one generic card no matter who shares it. The
// actual quiet-mutuals crawl is expensive (mutuals x recent posts x
// getLikes/getPostThread) — far too slow for an unfurl bot's timeout — so
// instead of recrawling server-side, the client stamps its already-computed
// count onto the share URL as `n`/`of`/`months` query params when it builds
// the share link. This route just reads those back and personalizes the
// page shell's meta tags; no network calls of its own, so it's fast enough
// for any unfurler. The live page still redoes the real crawl client-side
// for a human visitor.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/purge";

const short = (h: string) => "@" + (h || "").replace(/\.bsky\.social$/, "");

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

// Exact strings from public/index.html's <head> — kept as plain constants
// (not parsed out of the HTML) so a future edit to the copy is a visible
// diff in both places, same as sites/metamoots/src/index.ts.
const GENERIC_PAGE_TITLE = "purge — find your quiet mutuals — bisks.net";
const GENERIC_OG_TITLE = "purge — find your quiet mutuals";
const GENERIC_DESC =
  "Mutuals who haven't liked or replied to a single one of your posts in months. purge finds them for any Bluesky handle, so you know who to consider unfollowing.";
// Quoted so this only matches the og:url attribute's exact value, not the
// og:image/twitter:image tags — both are "https://purge.bisks.net/og.png",
// which contains this string as a prefix and would otherwise get mangled by
// a bare substring replace.
const GENERIC_OG_URL_ATTR = '"https://purge.bisks.net/"';

async function renderShare(env: Env, request: Request, rawHandle: string, url: URL): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  const n = parseInt(url.searchParams.get("n") || "", 10);
  const of = parseInt(url.searchParams.get("of") || "", 10);
  const months = parseInt(url.searchParams.get("months") || "", 10) || 6;
  if (!handle || !Number.isFinite(n) || n < 0) {
    return new Response(html, { headers: base.headers });
  }

  const who = short(handle);
  const ofPart = Number.isFinite(of) && of > 0 ? ` of ${of} mutuals` : "";
  const pageTitle = `purge: ${who}'s quiet mutuals`;
  const desc = truncate(
    `${n}${ofPart} haven't liked or replied to any of ${who}'s posts in the last ${months} month${months === 1 ? "" : "s"}.`,
    300,
  );
  const ogUrl = `https://purge.bisks.net/s/${encodeURIComponent(handle)}?n=${n}&of=${Number.isFinite(of) ? of : ""}&months=${months}`;

  html = html
    .split(GENERIC_PAGE_TITLE).join(esc(pageTitle))
    .split(GENERIC_OG_TITLE).join(esc(pageTitle))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`"${esc(ogUrl)}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }

    // Only strip when the prefix is actually present — on the subdomain

    // requests arrive without it, and an unconditional slice would chop

    // the front off short paths ("/app.js" -> "") so every asset would

    // silently serve index.html.

    const stripped = url.pathname.startsWith(PREFIX + "/")

      ? url.pathname.slice(PREFIX.length) || "/"

      : url.pathname;

    const m = stripped.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1], url);

    url.pathname = stripped;
    return env.ASSETS.fetch(new Request(url, request));
  },
};
