// grue Worker — grue.bisks.net
//
// The chain itself is trained and walked entirely client-side (public/lib/markov.js
// against the snapshot in public/data/corpus.json). The one thing that needed
// a server: shared results. A plain static site serves the *same* index.html —
// same og:title/description — no matter which generated line is in the URL,
// so every "share this line" link unfurls as one identical generic card
// forever (same problem sites/didscope and sites/windmill hit, see
// notes/45-sharing-and-virality.md).
//
// Fix: /q/<code> is a distinct URL per generated line. <code> is a URL-safe
// base64 blob of {t: text, s: seed} — the client encodes it in share() (see
// public/index.html). The Worker decodes the same shape (no chain to replay,
// the line is already generated) and stamps a personalized
// og:title/description/url onto the same static shell before serving it.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface SharedQuote {
  t: string; // the generated text
  s: string | null; // seed word, if any
}

function decodeQuote(code: string): SharedQuote | null {
  try {
    let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    // atob() decodes to a Latin1 byte-string, not text — the client encoded
    // JSON as UTF-8 bytes before base64 (btoa(unescape(encodeURIComponent(...))))
    // so any non-ASCII byte (the "…" fitToBudget appends on truncation) needs
    // re-decoding as UTF-8, not handed straight to JSON.parse.
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const o = JSON.parse(json);
    if (typeof o.t !== "string" || !o.t.trim()) return null;
    return { t: o.t.slice(0, 320), s: typeof o.s === "string" ? o.s.slice(0, 60) : null };
  } catch (_) {
    return null;
  }
}

function truncate(s: string, max: number): string {
  const g = [...s];
  if (g.length <= max) return s;
  return g.slice(0, max - 1).join("") + "…";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Every <title>/og:*/twitter:* tag in public/index.html shares these exact
// strings, so one split/join each personalizes the whole head — no HTML
// parser needed.
const GENERIC_TITLE = "grue — a godoglyness markov chain";
const GENERIC_DESC =
  "Trained on thousands of @godoglyness.bsky.social's real posts. Generates a fresh line of gemeralds-and-coalsop erudition every time — can you tell it from the real thing?";
const GENERIC_OG_URL_ATTR = 'content="https://grue.bisks.net/"';

async function renderShare(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const quote = decodeQuote(code);
  if (!quote) return new Response(html, { headers: base.headers });

  const title = `grue: “${truncate(quote.t, 70)}”`;
  const desc = truncate(
    `A godoglyness markov chain said this. Real @godoglyness.bsky.social post, or synthetic? “${quote.t}”`,
    300
  );
  const ogUrl = `https://grue.bisks.net/q/${encodeURIComponent(code)}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/q\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
