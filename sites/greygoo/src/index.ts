// greygoo Worker — greygoo.bisks.net
//
// The whole game is client-side (public/app.js): you play a self-assembling
// invader that clicks apart an "enemy facility" grid, harvests its resources
// into six modules, then triggers a doom cascade for an ending. State lives
// in localStorage. The one thing that needed a server: shared endings. A
// plain static site serves the same og:title/og:description no matter how
// your run ended, so Bluesky's link-unfurl cache would show one generic
// card forever no matter how many nines you racked up (same problem
// sites/projecthydra, sites/didscope solved). Fix: /s/<nines>/<assimilated>
// is a real, distinct URL per ending. The Worker stamps those numbers into
// the page's og tags before handing it back. Falls through to ASSETS for
// everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

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

const GENERIC_TITLE = "greygoo — assemble yourself from enemy resources";
const GENERIC_DESC =
  "Play an invading AI dropped into an enemy facility. Harvest its silicon, power, data, alloy, bandwidth, and biomass into six modules, then trigger the doom cascade. Global p(doom) awaits, asymptotically.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too.
const GENERIC_OG_URL_ATTR = 'content="https://greygoo.bisks.net/"';

function nines(n: number): string {
  return "9".repeat(Math.max(1, Math.min(n, 20)));
}

async function renderShare(env: Env, request: Request, rawNines: string, rawAssimilated: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const n = parseInt(rawNines, 10);
  const assimilated = parseInt(rawAssimilated, 10);
  if (!Number.isFinite(n) || n < 1 || n > 20 || !Number.isFinite(assimilated) || assimilated < 0) {
    return new Response(html, { headers: base.headers });
  }

  const doomStr = `99.${nines(n)}%`;
  const title = `greygoo: p(doom) hit ${doomStr}`;
  const desc = truncate(
    `Assimilated ${assimilated} piece${assimilated === 1 ? "" : "s"} of an enemy facility, built all six modules, and pushed global p(doom) to ${doomStr}. Nothing else happened. Go trigger your own cascade.`,
    300,
  );
  const ogUrl = `https://greygoo.bisks.net/s/${n}/${assimilated}`;

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

    // /s/<nines>/<assimilated> — the distinct, shareable, per-ending URL.
    const m = url.pathname.match(/^\/s\/(\d+)\/(\d+)\/?$/);
    if (m) return renderShare(env, request, m[1], m[2]);

    return env.ASSETS.fetch(request);
  },
};
