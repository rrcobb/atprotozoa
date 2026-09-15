// listrank Worker — listrank.bisks.net
//
// The whole scan (repo CAR read + per-block constellation lookups + full
// list-membership reads) still runs client-side (public/lib/rank.js). A
// plain static site would serve the *same* index.html — same
// og:title/og:description — no matter whose result is in the URL, so every
// "share this" link unfurls as one identical generic card forever (the
// problem notes/45-sharing-and-virality.md documents, tier 4).
//
// Fix: /s/<code> is a distinct URL per result. <code> is a URL-safe base64
// blob of the already-computed top match — the client encodes it in
// index.html's shareBtn handler (encodeShare). The Worker just decodes that
// same shape and stamps a personalized og:title/description/url onto the
// same static shell before serving it — no re-running the scan
// server-side, the result is already computed (same reasoning as
// sites/windmill's /r/<code> and sites/polcompass's /c/<code>, not
// sites/didscope's server-side recompute, which only works there because
// its computation is a cheap deterministic hash).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface ShareResult {
  h: string; // handle
  n: string; // top list name
  b: number; // blocksInList
  bt: number; // totalBlocks
  f: number; // followsInList
  mc: number; // list memberCount
  s: number; // .bsky.social share pct, or -1 if unknown
  lc: number; // total matching lists found
}

function decodeShare(code: string): ShareResult | null {
  try {
    let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = decodeURIComponent(escape(atob(b64)));
    const o = JSON.parse(json);
    if (typeof o.h !== "string" || typeof o.n !== "string") return null;
    if (typeof o.b !== "number" || typeof o.f !== "number" || typeof o.mc !== "number") return null;
    return {
      h: o.h.slice(0, 100),
      n: o.n.slice(0, 80),
      b: o.b,
      bt: typeof o.bt === "number" ? o.bt : 0,
      f: o.f,
      mc: o.mc,
      s: typeof o.s === "number" ? o.s : -1,
      lc: typeof o.lc === "number" ? o.lc : 1,
    };
  } catch (_) {
    return null;
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// Every occurrence of these exact strings in the static shell gets replaced
// (title tag once, og:*/twitter:* pairs twice each) via plain
// String.split().join() — no HTML parser needed. og:url is matched as a
// full quoted attribute, not the bare URL: the bare URL is also a prefix of
// the og:image URL ("…/og.png"), so a naive split/join on it would corrupt
// that tag too (the exact bug didscope/polcompass's own comments warn about).
const GENERIC_TITLE_TAG = "listrank — which blocklists actually match your blocks";
const GENERIC_OG_TITLE = "listrank — find the blocklists that actually match your blocks";
const GENERIC_OG_DESC =
  "Ranks every moderation list your blocks are on by how many of your blocks it contains and how few of your follows — plus each list's share of default .bsky.social handles.";
const GENERIC_OG_URL_ATTR = 'content="https://listrank.bisks.net/"';

async function renderShare(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const r = decodeShare(code);
  if (!r) {
    // Malformed/truncated code — still serve the live shell so the link
    // isn't dead; the client just shows its normal blank-start state.
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  }

  const pct = r.b && r.bt ? Math.round((r.b / r.bt) * 100) : null;
  const sharePart = r.s >= 0 ? ` ~${r.s}% of the list is .bsky.social.` : "";

  const title = `listrank: @${r.h}'s top blocklist match — "${r.n}"`;
  const desc = truncate(
    `${r.b.toLocaleString()}${r.bt ? ` of ${r.bt.toLocaleString()}` : ""} blocks${pct !== null ? ` (${pct}%)` : ""} landed on "${r.n}" (${r.mc.toLocaleString()} members), vs only ${r.f.toLocaleString()} of their follows.${sharePart} ${r.lc.toLocaleString()} matching list${r.lc === 1 ? "" : "s"} total.`,
    300
  );
  const ogUrl = `https://listrank.bisks.net/s/${code}`;

  html = html
    .split(GENERIC_TITLE_TAG).join(esc(title))
    .split(GENERIC_OG_TITLE).join(esc(title))
    .split(GENERIC_OG_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
