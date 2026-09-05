// orrery Worker — orrery.bisks.net
//
// The map itself is entirely client-side (public/app.js draws the orbits
// from public/data/fleet.json). The one thing that needed a server: shared
// links. A plain static site serves the same og:title/og:description for
// every /s/<name>, so Bluesky's link-unfurl cache would show one generic
// card forever no matter which world got pointed at — same problem
// didscope solved for handles and collatz solved for numbers. /s/<name> is
// a real, distinct URL per site: the Worker looks the name up in the same
// fleet.json the client reads, and stamps a personalized
// og:title/og:description/og:url onto the same page shell before serving
// it. public/app.js also reads the name back out of the path on load and
// highlights that world.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface FleetSite {
  name: string;
  title: string;
  blurb: string;
  type: string;
  by: string | null;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Identical across every <title>/og:*/twitter:* tag on the static shell, so
// one string-replace-all each personalizes the whole head — no HTML parser
// needed. See sites/didscope/src/index.ts / sites/collatz/src/index.ts for
// the same trick, including the GENERIC_OG_URL_ATTR gotcha (match the full
// quoted attribute, not the bare URL, or the og:image URL gets corrupted
// too since it shares the prefix).
const GENERIC_TITLE = "orrery — every atprotozoa site, orbiting bisks.net";
const GENERIC_DESC =
  "Every sites/*/site.json manifest, drawn as a tiny solar system. Six orbits, one sun, click a world to visit it.";
const GENERIC_OG_URL_ATTR = 'content="https://orrery.bisks.net/"';

async function renderShare(env: Env, request: Request, name: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const dataRes = await env.ASSETS.fetch(new Request(new URL("/data/fleet.json", request.url), { method: "GET" }));
  if (!dataRes.ok) return new Response(html, { headers: base.headers });
  const fleet = (await dataRes.json()) as { sites: FleetSite[] };
  const site = fleet.sites.find((s) => s.name === name);
  if (!site) return new Response(html, { headers: base.headers });

  const title = `orrery: ${site.title}`;
  const desc = `Found in the ${site.type} orbit. ${site.blurb}`;
  const ogUrl = `https://orrery.bisks.net/s/${encodeURIComponent(site.name)}`;

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

    // /s/<name> — the distinct, shareable, per-world URL. public/app.js
    // reads the name back out of the path on load and highlights that dot;
    // this handler just makes the link unfurl right before a click ever
    // happens.
    const m = url.pathname.match(/^\/s\/([a-zA-Z0-9_-]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
