// Served at the root of wordsplice.bisks.net. Fetching random Wikipedia
// articles, tokenizing/tagging words, scoring splices, beam search — all of
// that still runs client-side in public/app.js against Wikipedia's own
// CORS-enabled API. The one thing that needed a server: shared links.
//
// A permalink encodes which exact words were used (see app.js
// encodeState/decodePath). It used to live in a #hash, which never reaches
// the server — every share unfurled as the same static og.png card forever,
// no matter which deranged ransom note got generated (see
// notes/45-sharing-and-virality.md, tier 4, and splicepedia/src/index.ts,
// which is where this fix was first built — this is that same fix, ported
// one unit down). Now it's a real path, /a/<state>, and this Worker decodes
// it, pulls the opening word's real source article, and stamps a
// personalized og:title/og:description/og:url onto the same static shell
// before serving — so every splice gets its own distinct, cacheable preview.
// Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const API = "https://en.wikipedia.org/w/api.php";

// Kept as a local copy of public/app.js's word tokenizer — same reasoning as
// sites/didscope/src/index.ts and splicepedia/src/index.ts: server-side
// duplication of client logic within ONE site, not a shared package across
// sites. Only what the OG text needs (which word landed at a given position
// in one article's extract) made the trip — the POS tagging that decides
// grammar slots isn't needed here, just the same token boundaries so
// position indices line up with what the client encoded.
function looksLikeHeading(line: string): boolean {
  if (/[.!?]["'”)]?$/.test(line)) return false;
  return line.length < 60;
}

function cleanLine(line: string): string {
  return line.replace(/\[\d+\]/g, "").replace(/\s{2,}/g, " ").trim();
}

function tokenizeWords(extract: string): string[] {
  const lines = extract.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const words: string[] = [];
  for (const raw of lines) {
    if (looksLikeHeading(raw)) continue;
    const line = cleanLine(raw);
    if (!line) continue;
    const re = /[A-Za-z][A-Za-z'-]*|\d+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (!/^\d+$/.test(m[0])) words.push(m[0]);
    }
  }
  return words;
}

async function fetchExtract(title: string): Promise<{ title: string; extract: string } | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "extracts",
    explaintext: "1",
    exsectionformat: "plain",
    format: "json",
    origin: "*",
    formatversion: "2",
  });
  // Wikimedia's API rejects server-to-server requests with no descriptive
  // User-Agent (their robot policy, https://w.wiki/4wJS) — a browser fetch
  // sends one automatically, which is why public/app.js never hit this, but
  // a Workers-initiated fetch needs one set explicitly or every share link
  // 403s and falls back to the generic card.
  const res = await fetch(`${API}?${params.toString()}`, {
    headers: {
      "User-Agent": "WordSplice/1.0 (https://wordsplice.bisks.net; atprotozoa bot) Cloudflare-Workers",
    },
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  const page = (data.query && data.query.pages && data.query.pages[0]) || null;
  if (!page || page.missing || !page.extract) return null;
  return { title: page.title, extract: page.extract };
}

function b64urlDecode(s: string): string {
  let str = s.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// The static page's title phrase (used verbatim in <title>, og:title, and
// twitter:title) and og/twitter description are each identical everywhere
// they appear, so one string-replace-all apiece is enough to personalize the
// whole head — no HTML parser needed.
const GENERIC_TITLE = "WordSplice — a Wikipedia ransom note";
const GENERIC_OG_DESC =
  "Every word is real, verbatim, and from a different Wikipedia article — spliced word-by-word by a beam search into a real English grammar skeleton.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (same gotcha documented in
// sites/didscope/src/index.ts and splicepedia/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://wordsplice.bisks.net/"';

async function renderShare(env: Env, request: Request, state: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  let compact: { t: string[][]; w: [string, number][] };
  try {
    const parsed = JSON.parse(b64urlDecode(state));
    if (!parsed || !Array.isArray(parsed.w) || !parsed.w.length) throw new Error("empty");
    compact = parsed;
  } catch (_) {
    // Not a decodable state — still serve the live page so the link isn't
    // dead; the client script surfaces its own error and falls back to a
    // fresh generation.
    return new Response(html, { headers: base.headers });
  }

  try {
    const [firstTitle, firstPos] = compact.w[0];
    const page = await fetchExtract(firstTitle);
    if (!page) throw new Error("gone");
    const words = tokenizeWords(page.extract);
    const opening = words[firstPos];
    if (!opening) throw new Error("edited");

    const uniqueTitles = new Set(compact.w.map(([t]) => t));
    const otherCount = uniqueTitles.size - 1;
    const wordCount = compact.w.length;

    const title = `WordSplice: "${opening}…"`;
    const desc = truncate(
      `"${opening}" — one word clipped verbatim from "${page.title}", joined word-by-word with ${otherCount} other real Wikipedia article${otherCount === 1 ? "" : "s"} into a ${wordCount}-word ransom note. Every word is real; none of them belong together.`,
      300
    );
    const ogUrl = `https://wordsplice.bisks.net/a/${encodeURIComponent(state)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_OG_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve the source article server-side (deleted, renamed,
    // edited since the splice was made, rate limit) — still serve the live
    // page; the client will surface its own error and regenerate.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /a/<state> — the distinct, shareable, per-splice URL. Every generated
    // ransom note gets its own page (and its own og:title/description/url),
    // so a link unfurler can't collapse every share into one generic cached
    // card.
    const m = url.pathname.match(/^\/a\/([A-Za-z0-9\-_]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
