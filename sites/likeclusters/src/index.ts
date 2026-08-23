// Served at the root of likeclusters.bisks.net, so requests are passed to
// the static-asset router unchanged. One extra route: /s/<handle> is the
// per-result share link (see notes/45-sharing-and-virality.md, tier 4). A
// plain static page serves the *same* og:title/og:description/og:url for
// every query-string variant, so a link-unfurl cache shows one generic card
// no matter who shares it. The actual crawl (dozens of getLikes calls) is
// far too slow for an unfurl bot's timeout — so instead of recrawling
// server-side, the client stamps its already-computed liker count and top
// topic tag onto the share URL as `n`/`tag` query params when it builds the
// share link. This route just reads those back and personalizes the page
// shell's meta tags; no network calls of its own. The live page still
// redoes the real crawl client-side for a human visitor. Pattern copied
// from sites/metamoots/src/index.ts.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

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
// diff in both places, same as sites/didscope/src/index.ts.
const GENERIC_PAGE_TITLE = "likeclusters — who likes which topic — bisks.net";
const GENERIC_OG_TITLE = "likeclusters — who likes which topic";
const GENERIC_DESC =
  "Which of your moots only likes one topic cluster? likeclusters reads an account's posts, samples their likers, and groups them by the topic they keep coming back for.";
// Quoted so this only matches the og:url attribute's exact value, not the
// og:image/twitter:image tags — both are "https://likeclusters.bisks.net/og.png",
// which contains this string as a prefix and would otherwise get mangled by
// a bare substring replace.
const GENERIC_OG_URL_ATTR = '"https://likeclusters.bisks.net/"';

async function renderShare(env: Env, request: Request, rawHandle: string, url: URL): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  const n = parseInt(url.searchParams.get("n") || "", 10);
  if (!handle || !Number.isFinite(n) || n < 0) {
    return new Response(html, { headers: base.headers });
  }

  const tag = (url.searchParams.get("tag") || "").trim().slice(0, 40);

  const who = short(handle);
  const named = tag ? ` biggest topic: ${tag}.` : "";
  const pageTitle = `likeclusters: ${who}'s liker clusters`;
  const desc = truncate(
    `${n} liker${n === 1 ? "" : "s"} found across ${who}'s sampled posts, grouped by topic.${named}`,
    300,
  );
  const ogUrl = `https://likeclusters.bisks.net/s/${encodeURIComponent(handle)}?n=${n}&tag=${encodeURIComponent(tag)}`;

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
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1], url);

    return env.ASSETS.fetch(request);
  },
};
