// Served at the root of graftpedia.bisks.net. Fetching random Wikipedia
// articles, parsing them into phrase-level chunks, scoring grafts, all of
// that still runs client-side in public/app.js against Wikipedia's own
// CORS-enabled API. The one thing that needed a server: shared links.
//
// Unlike splicepedia/wordsplice, a GraftPedia permalink encodes the FULLY
// RENDERED state — literal text plus graft/repair metadata, not coordinates
// to re-fetch and re-derive (see app.js's buildState/encodeState/decodePath
// comment). That means this Worker never needs to hit the Wikipedia API
// itself: everything the OG title/description needs (headline, graft count,
// which articles got grafted from) is already sitting in the decoded state.
// Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
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

interface GraftPart {
  k: "t" | "g" | "r";
  s: string;
  src?: { t: string; u: string; ty: string };
}
interface GraftState {
  headline: string;
  strength: number;
  sentences: Array<{ parts: GraftPart[]; skeletonSource: { t: string; u: string } }>;
}

// The static page's title phrase (used verbatim in <title>, og:title, and
// twitter:title) and og/twitter description are each identical everywhere
// they appear, so one string-replace-all apiece is enough to personalize the
// whole head — no HTML parser needed.
const GENERIC_TITLE = "GraftPedia — syntax-tree semantic vandalism";
const GENERIC_OG_DESC =
  "Real Wikipedia sentences, grammatically parsed and grafted phrase-by-phrase with unrelated articles. Perfect grammar, deranged meaning. Click 'show stitches' to see the seams.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (same gotcha documented in
// sites/didscope/src/index.ts and sites/splicepedia/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://graftpedia.bisks.net/"';

async function renderShare(env: Env, request: Request, stateParam: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  let state: GraftState;
  try {
    const parsed = JSON.parse(b64urlDecode(stateParam));
    if (!parsed || !Array.isArray(parsed.sentences) || !parsed.sentences.length || !parsed.headline) {
      throw new Error("empty");
    }
    state = parsed;
  } catch (_) {
    // Not a decodable state — still serve the live page so the link isn't
    // dead; the client script surfaces its own error and falls back to a
    // fresh generation.
    return new Response(html, { headers: base.headers });
  }

  const grafts: GraftPart[] = [];
  const sourceTitles = new Set<string>();
  for (const sent of state.sentences) {
    sourceTitles.add(sent.skeletonSource.t);
    for (const p of sent.parts) {
      if (p.k === "g" && p.src) { grafts.push(p); sourceTitles.add(p.src.t); }
    }
  }
  const otherCount = sourceTitles.size - 1;

  const title = `GraftPedia: "${state.headline}"`;
  const desc = truncate(
    `"${state.headline}" — grammatically parsed and grafted with ${grafts.length} phrase${grafts.length === 1 ? "" : "s"} stolen from ${otherCount} other real Wikipedia article${otherCount === 1 ? "" : "s"}. Every word is real; the sentences are semantic vandalism.`,
    300
  );
  const ogUrl = `https://graftpedia.bisks.net/a/${encodeURIComponent(stateParam)}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_OG_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
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
