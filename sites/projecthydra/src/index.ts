// projecthydra Worker — projecthydra.bisks.net
//
// The whole game is client-side (public/app.js): click a project, 50/50
// odds finish it, the other 50/50 it splits into 3 new ones — a hydra of
// half-finished projects, state kept in localStorage. The one thing that
// needed a server: shared links. A plain static site serves the same
// index.html — same og:title/og:description — no matter what your pit
// looks like, so Bluesky's link-unfurl cache would show one generic card
// forever no matter how deep anyone's pit got (same problem sites/didscope,
// sites/nextbigthing solved). Fix: /s/<finished>/<active> is a real,
// distinct URL per snapshot. The Worker stamps those numbers into the
// page's og tags before handing it back. Falls through to ASSETS for
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

const GENERIC_TITLE = "projecthydra — cut one head, three more start";
const GENERIC_DESC =
  "You start with 1 half-finished project. Click it: 50/50 it actually gets done, 50/50 it spawns 3 more to replace it. The pit is bottomless. See how deep yours goes.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (gotcha called out in
// sites/crowdpleaser/src/index.ts, sites/nextbigthing/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://projecthydra.bisks.net/"';

async function renderShare(env: Env, request: Request, rawFinished: string, rawActive: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const finished = parseInt(rawFinished, 10);
  const active = parseInt(rawActive, 10);
  if (!Number.isFinite(finished) || finished < 0 || !Number.isFinite(active) || active < 0) {
    return new Response(html, { headers: base.headers });
  }

  const title = `projecthydra: ${finished} finished, ${active} still piled up`;
  const desc = truncate(
    active === 0
      ? `Finished all ${finished}. The pit is, for one glorious moment, empty. Go build your own bottomless pile.`
      : `${finished} project${finished === 1 ? "" : "s"} actually finished. ${active} more currently unfinished and staring back. Cut one, three more grow. Go try your own pit.`,
    300,
  );
  const ogUrl = `https://projecthydra.bisks.net/s/${finished}/${active}`;

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

    // /s/<finished>/<active> — the distinct, shareable, per-pit URL. Every
    // shared snapshot gets its own link (and its own og:title/description),
    // so a link unfurler can't collapse every share into one cached card.
    const m = url.pathname.match(/^\/s\/(\d+)\/(\d+)\/?$/);
    if (m) return renderShare(env, request, m[1], m[2]);

    return env.ASSETS.fetch(request);
  },
};
