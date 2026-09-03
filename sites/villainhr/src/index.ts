// villainhr Worker — villainhr.bisks.net
//
// The whole hiring pipeline runs client-side (public/app.js: shortlist,
// dossier, mandatory interview, offer letter). The one thing that needed a
// server: shared offer letters. A plain static site serves the *same*
// index.html — same og:title/og:description — no matter whose offer is in
// the URL, so Bluesky's link-unfurl cache would show one generic card for
// every share forever (the exact problem notes/45-sharing-and-virality.md
// documents, first hit on sites/didscope).
//
// Fix, same shape as sites/simcluster-alignment's /r/<code>: the client
// encodes its already-computed offer into a URL-safe base64 blob
// (encodeResult in public/app.js) and links to /r/<code>. The Worker just
// decodes it — no re-running the analysis, no extra AppView calls, cheap and
// instant — and stamps a personalized og:title/description/url onto the
// same page shell. Falls through to ASSETS for everything else (/, /og.png,
// /fonts/*, /lib/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface Result {
  h: string; // candidate handle
  s: number; // villain score, 0-100
  t: string; // tier name (e.g. "Credible Threat")
  a: string; // archetype (e.g. "The Mastermind")
  o: string; // origin handle whose SimCluster this candidate came from
}

function decodeResult(code: string): Result | null {
  try {
    let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = atob(b64);
    const o = JSON.parse(json);
    if (typeof o.h !== "string" || typeof o.s !== "number") return null;
    return {
      h: o.h,
      s: o.s,
      t: typeof o.t === "string" ? o.t : "",
      a: typeof o.a === "string" ? o.a : "",
      o: typeof o.o === "string" ? o.o : "",
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

// Every <title>/og:*/twitter:* tag in public/index.html shares these exact
// strings, so one split/join each personalizes the whole head — no HTML
// parser needed. Matched as a full quoted attribute for the URL tag, not the
// bare URL — the bare URL is also a prefix of the og:image URL ("…/og.png"),
// so a naive split/join on it would corrupt that into "…/r/<code>og.png"
// too (gotcha called out in sites/didscope/src/index.ts).
const GENERIC_TITLE = "villainhr — cast your SimCluster's next villain";
const GENERIC_DESC =
  "Enter a Bluesky handle. We rank its whole SimCluster on menace vocabulary, caps-lock monologuing, chaos emoji, lair-hours posting, and instigation, shortlist the top 10, and run your pick through an audition dossier and a mandatory villain-coding interview before the offer letter.";
const GENERIC_OG_URL_ATTR = 'content="https://villainhr.bisks.net/"';

async function renderResult(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const result = decodeResult(code);
  if (!result) return new Response(html, { headers: base.headers });

  const who = "@" + result.h;
  const title = `villainhr: ${who} got the offer letter (${result.s}/100${result.t ? ", " + result.t : ""})`;
  const archBit = result.a ? `${result.a}. ` : "";
  const originBit = result.o ? `Screened from @${result.o}'s SimCluster. ` : "";
  const desc = `${archBit}${originBit}Cleared the shortlist, the dossier, and the mandatory villain-coding interview. Screen your own SimCluster.`;
  const ogUrl = `https://villainhr.bisks.net/r/${encodeURIComponent(code)}`;

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
