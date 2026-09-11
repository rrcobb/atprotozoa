// greygoo Worker — greygoo.bisks.net
//
// The whole game is client-side (public/app.js): you play a self-assembling
// invader reaching into an "enemy facility" grid with two independently
// controlled (qwoplike) arms, harvesting resources into six modules, then
// holding a doom cascade steady for an ending — victory, or one of two ways
// to fail (PURGED, if a security-attention meter maxes out from stumbles;
// FIZZLED, if the cascade itself is botched). State lives in localStorage.
// The one thing that needed a server: shared endings. A plain static site
// serves the same og:title/og:description no matter how your run ended, so
// Bluesky's link-unfurl cache would show one generic card forever no matter
// what happened (same problem sites/projecthydra, sites/didscope solved).
// Fix: /s/<nines>/<assimilated> (victory) and /f/<kind>/<assimilated>
// (failure) are real, distinct URLs per ending. The Worker stamps the right
// numbers/copy into the page's og tags before handing it back. Falls
// through to ASSETS for everything else.

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
  "Play an invading AI dropped into an enemy facility. Reach for its silicon, power, data, alloy, bandwidth, and biomass with two independently-controlled arms, assemble six modules without getting caught, then hold the line through the doom cascade. Global p(doom) awaits — if security doesn't purge you first.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too.
const GENERIC_OG_URL_ATTR = 'content="https://greygoo.bisks.net/"';

function nines(n: number): string {
  return "9".repeat(Math.max(1, Math.min(n, 20)));
}

function stamp(html: string, title: string, desc: string, ogUrl: string): string {
  return html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);
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
    `Assimilated ${assimilated} piece${assimilated === 1 ? "" : "s"} of an enemy facility, built all six modules, and held the cascade steady to push global p(doom) to ${doomStr}. Nothing else happened. Go trigger your own cascade.`,
    300,
  );
  const ogUrl = `https://greygoo.bisks.net/s/${n}/${assimilated}`;

  html = stamp(html, title, desc, ogUrl);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

const FAILURE_COPY: Record<string, { titleWord: string; descFor: (assimilated: number) => string }> = {
  purged: {
    titleWord: "PURGED",
    descFor: (assimilated) =>
      `Got PURGED by facility security after assimilating ${assimilated} piece${assimilated === 1 ? "" : "s"} — two uncoordinated arms and one stumble too many. p(doom) never moved. Go try not to get caught.`,
  },
  fizzled: {
    titleWord: "cascade fizzled",
    descFor: (assimilated) =>
      `Built all six modules, assimilated ${assimilated} piece${assimilated === 1 ? "" : "s"} to get there, then choked holding the final cascade steady. p(doom) never moved. Go hold the line.`,
  },
};

async function renderFailureShare(env: Env, request: Request, kind: string, rawAssimilated: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const copy = FAILURE_COPY[kind];
  const assimilated = parseInt(rawAssimilated, 10);
  if (!copy || !Number.isFinite(assimilated) || assimilated < 0) {
    return new Response(html, { headers: base.headers });
  }

  const title = `greygoo: ${copy.titleWord}`;
  const desc = truncate(copy.descFor(assimilated), 300);
  const ogUrl = `https://greygoo.bisks.net/f/${kind}/${assimilated}`;

  html = stamp(html, title, desc, ogUrl);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<nines>/<assimilated> — the distinct, shareable victory URL.
    const s = url.pathname.match(/^\/s\/(\d+)\/(\d+)\/?$/);
    if (s) return renderShare(env, request, s[1], s[2]);

    // /f/<kind>/<assimilated> — the distinct, shareable failure URL (purged | fizzled).
    const f = url.pathname.match(/^\/f\/([a-z]+)\/(\d+)\/?$/);
    if (f) return renderFailureShare(env, request, f[1], f[2]);

    return env.ASSETS.fetch(request);
  },
};
