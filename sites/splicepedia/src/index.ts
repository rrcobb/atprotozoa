// Served at the root of splicepedia.bisks.net. Fetching random Wikipedia
// articles, splitting sentences, scoring splices, beam search — all of that
// still runs client-side in public/app.js against Wikipedia's own
// CORS-enabled API. The one thing that needed a server: shared links.
//
// A permalink encodes which exact sentences were used (see app.js
// encodeState/decodePath). It used to live in a #hash, which never reaches
// the server — every share unfurled as the same static og.png card forever,
// no matter which deranged article got generated (see
// notes/45-sharing-and-virality.md, tier 4). Now it's a real path,
// /a/<state>, and this Worker decodes it, pulls the opening sentence's real
// source article, and stamps a personalized og:title/og:description/og:url
// onto the same static shell before serving — so every splice gets its own
// distinct, cacheable preview. Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const API = "https://en.wikipedia.org/w/api.php";

// Kept as a local copy of public/app.js's sentence splitter — same reasoning
// as sites/didscope/src/index.ts: server-side duplication of client logic
// within ONE site, not a shared package across sites. Only what the OG text
// needs (splitting one article's extract into sentences) made the trip.
function looksLikeHeading(line: string): boolean {
  if (/[.!?]["'”)]?$/.test(line)) return false;
  return line.length < 60;
}

function cleanLine(line: string): string {
  return line.replace(/\[\d+\]/g, "").replace(/\s{2,}/g, " ").trim();
}

function splitIntoSentences(extract: string): string[] {
  const lines = extract.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const sentences: string[] = [];
  for (const raw of lines) {
    if (looksLikeHeading(raw)) continue;
    const line = cleanLine(raw);
    if (!line) continue;
    const parts = line.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(“])/);
    for (const part of parts) {
      const t = part.trim();
      if (t.length < 35 || t.length > 280) continue;
      if (!/[.!?]["')”]?$/.test(t)) continue;
      if (!/^[A-Z0-9"'“]/.test(t)) continue;
      if (t.split(/\s+/).length < 6) continue;
      sentences.push(t);
    }
  }
  return sentences;
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
      "User-Agent": "Splicepedia/1.0 (https://splicepedia.bisks.net; atprotozoa bot) Cloudflare-Workers",
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
const GENERIC_TITLE = "Splicepedia — the encyclopedia that lies with only true sentences";
const GENERIC_OG_DESC =
  "Every sentence is verbatim from a real, random Wikipedia page. Click 'show stitches' to see where each one was cut from.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (same gotcha documented in
// sites/didscope/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://splicepedia.bisks.net/"';

async function renderShare(env: Env, request: Request, state: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  let compact: [string, number][];
  try {
    const parsed = JSON.parse(b64urlDecode(state));
    if (!Array.isArray(parsed) || !parsed.length) throw new Error("empty");
    compact = parsed;
  } catch (_) {
    // Not a decodable state — still serve the live page so the link isn't
    // dead; the client script surfaces its own error and falls back to a
    // fresh generation.
    return new Response(html, { headers: base.headers });
  }

  try {
    const [firstTitle, firstPos] = compact[0];
    const page = await fetchExtract(firstTitle);
    if (!page) throw new Error("gone");
    const sentences = splitIntoSentences(page.extract);
    const opening = sentences[firstPos];
    if (!opening) throw new Error("edited");

    const uniqueTitles = new Set(compact.map(([t]) => t));
    const otherCount = uniqueTitles.size - 1;
    const secondEntry = compact.find(([t]) => t !== firstTitle);

    const title = `Splicepedia: "${page.title}"`;
    const desc = truncate(
      `"${opening}" — spliced verbatim with sentences from ${otherCount} other random Wikipedia article${otherCount === 1 ? "" : "s"}` +
        (secondEntry ? `, starting with "${secondEntry[0]}"` : "") +
        `. Every sentence is real; none of them belong together.`,
      300
    );
    const ogUrl = `https://splicepedia.bisks.net/a/${encodeURIComponent(state)}`;

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
    // article gets its own page (and its own og:title/description/url), so a
    // link unfurler can't collapse every share into one generic cached card.
    const m = url.pathname.match(/^\/a\/([A-Za-z0-9\-_]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
