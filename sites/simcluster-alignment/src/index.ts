// simcluster-alignment Worker — simcluster-alignment.bisks.net
//
// The whole reading runs client-side (public/app.js does the real analysis:
// pulls a handle's SimCluster, sums its posts into an aggregate vector,
// scores the handle against it). The one thing that needed a server: shared
// links. A plain static site serves the *same* index.html — same
// og:title/og:description — no matter whose handle or score is in the URL,
// so Bluesky's link-unfurl cache would show one generic card for every share
// forever (the exact problem notes/45-sharing-and-virality.md documents,
// first hit on sites/didscope).
//
// Fix, same shape as sites/windmill's /r/<code>: the client encodes its
// *already-computed* result into a URL-safe base64 blob (encodeResult in
// public/app.js) and links to /r/<code>. The Worker just decodes it — no
// re-running the analysis, no extra AppView calls, cheap and instant — and
// stamps a personalized og:title/description/url onto the same page shell.
// Falls through to ASSETS for everything else (/, /og.png, /fonts/*, /lib/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface Result {
  h: string; // handle
  s: number; // alignment score, 0-100
  e: string; // dominant element (Air / Fire / Water / Earth)
  b: string; // band name (e.g. "Harmonic Resonance")
}

function decodeResult(code: string): Result | null {
  try {
    let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = atob(b64);
    const o = JSON.parse(json);
    if (typeof o.h !== "string" || typeof o.s !== "number") return null;
    return { h: o.h, s: o.s, e: typeof o.e === "string" ? o.e : "", b: typeof o.b === "string" ? o.b : "" };
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

// Every <title>/og:*/twitter:* tag in public/index.html shares these exact
// strings, so one split/join each personalizes the whole head — no HTML
// parser needed. Matched as a full quoted attribute for the URL tag, not the
// bare URL — the bare URL is also a prefix of the og:image URL ("…/og.png"),
// so a naive split/join on it would corrupt that into "…/r/<code>og.png"
// too (gotcha called out in sites/didscope/src/index.ts).
const GENERIC_TITLE = "simcluster-alignment — are you spiritually aligned with the SimCluster?";
const GENERIC_DESC =
  "Enter a Bluesky handle. We download everything, sum your SimCluster into one communal mind, and measure your resonance against it. Real math, unserious conclusions.";
const GENERIC_OG_URL_ATTR = 'content="https://simcluster-alignment.bisks.net/"';

async function renderResult(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const result = decodeResult(code);
  if (!result) return new Response(html, { headers: base.headers });

  const who = "@" + result.h;
  const title = `simcluster-alignment: ${who} is ${result.s}% aligned with the SimCluster`;
  const elBit = result.e ? `${result.e}-dominant. ` : "";
  const bandBit = result.b ? `${result.b}. ` : "";
  const desc = `${elBit}${bandBit}Read off their real posts and their real mutuals' posts. Get your own reading.`;
  const ogUrl = `https://simcluster-alignment.bisks.net/r/${encodeURIComponent(code)}`;

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

    const m = url.pathname.match(/^\/r\/([^/]+)\/?$/);
    if (m) return renderResult(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
