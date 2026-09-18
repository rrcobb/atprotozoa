// loopronym Worker — loopronym.bisks.net. Brand-new site served at the root
// of its own hostname, so no mount-prefix stripping. The one thing that
// needs the Worker: /r/<encoded>, a real per-result URL so a shared link
// unfurls with that specific backronym's title/description instead of the
// generic one (same pattern as sites/spoonerism's /p/<n>). The client
// (public/app.js) also decodes the same URL itself to render the page, so
// this only needs to reproduce the title/description text, not the game.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

function fromBase64Url(b64: string): string {
  let s = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "loopronym — recursive backronyms, entangled on request";
const GENERIC_DESC =
  "Type any word, get a TESCREAL-flavored backronym — one entry per letter. The R slot is 75% a tautology and 25% both readings at once, exactly per the thread that asked for it.";
const GENERIC_OG_URL = "https://loopronym.bisks.net/";

async function renderShare(env: Env, request: Request, encoded: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  let word: string;
  let defs: string[];
  try {
    const obj = JSON.parse(fromBase64Url(encoded)) as { w: string; r: string[] };
    word = obj.w.toUpperCase();
    defs = obj.r;
  } catch {
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const letters = word.replace(/[^A-Z]/g, "").split("");
  const summary = letters.map((L, i) => `${L}: ${(defs[i] || "").split(" — ")[0].split(" (")[0]}`).join(", ");
  const title = `${word} — a recursive backronym`;
  const desc = `${word} is ${summary}. Generate your own recursive backronym at loopronym.bisks.net.`;
  const ogUrl = `https://loopronym.bisks.net/r/${encoded}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/r\/([A-Za-z0-9_-]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);
    return env.ASSETS.fetch(request);
  },
};
