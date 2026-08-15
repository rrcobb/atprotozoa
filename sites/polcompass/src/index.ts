// polcompass Worker: static assets, plus per-chart share unfurls.
//
// The whole maker runs client-side (public/index.html builds a chart,
// public/chart.html renders one). The one thing that needs a server: a
// static site would serve the *same* chart.html — same og:title/description
// — for every /c/<config>/ URL, so every shared compass unfurls as one
// identical generic card (the problem notes/45-sharing-and-virality.md
// documents, tier 4). Fix: decode the chart's config straight out of the
// URL (no fetch, no storage — the config IS the URL) and stamp real
// og:title/description/url onto the same static shell before serving it.
// See sites/didscope/src/index.ts (renderShare) for the pattern this copies.
export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

interface Compass {
  title: string;
  top: string;
  bottom: string;
  left: string;
  right: string;
}

// Mirrors public/lib/compass.js's decodeCompass — kept as a server-side copy
// (not a shared import) on purpose, same reasoning as didscope's SIGNS
// tables: this is duplication within ONE site, not a package across sites.
function decodeCompass(encoded: string): Compass | null {
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = atob(b64);
    const o = JSON.parse(json);
    if (typeof o.t !== "string") return null;
    return {
      title: String(o.t).slice(0, 80),
      top: String(o.tp || "top").slice(0, 40),
      bottom: String(o.bt || "bottom").slice(0, 40),
      left: String(o.l || "left").slice(0, 40),
      right: String(o.r || "right").slice(0, 40),
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

// Every <title>/og:*/twitter:* tag in public/chart.html shares these exact
// strings, so one split/join each personalizes the whole head — no HTML
// parser needed. og:url is matched as a full quoted attribute (not the bare
// URL), same fix didscope needed: the bare URL is also a prefix of the
// og:image URL, so a naive split/join on it would corrupt that tag too.
const GENERIC_TITLE = "polcompass — plot yourself on any 2×2 chart";
const GENERIC_DESC = "Someone made this compass. Tap the grid to see where you land, then share your spot.";
const GENERIC_OG_URL_ATTR = 'content="https://polcompass.bisks.net/c/"';

function sideDesc(c: Compass, x: number, y: number): string {
  const xSide = x >= 0 ? c.right : c.left;
  const ySide = y >= 0 ? c.top : c.bottom;
  return `${xSide}-${ySide}`.toLowerCase();
}

async function renderChart(env: Env, request: Request, encoded: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/chart.html", request.url), { method: "GET" }));
  const html = await base.text();

  const compass = decodeCompass(encoded);
  if (!compass) {
    // Malformed link — still serve the shell so the client script can show
    // its own "couldn't read that chart" state, rather than a dead page.
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  }

  const url = new URL(request.url);
  const xs = url.searchParams.get("x");
  const ys = url.searchParams.get("y");
  const hasSpot = xs !== null && ys !== null && Number.isFinite(Number(xs)) && Number.isFinite(Number(ys));

  const title = hasSpot
    ? `polcompass: landed ${sideDesc(compass, Number(xs), Number(ys))} on "${compass.title}"`
    : `polcompass: ${compass.title}`;
  const desc = `${compass.left} ↔ ${compass.right} · ${compass.bottom} ↔ ${compass.top}. Tap the grid to plot yourself.`;
  const ogUrl = `https://polcompass.bisks.net/c/${encoded}/`;

  const stamped = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

  return new Response(stamped, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/c\/([^/]+)\/?$/);
    if (m) return renderChart(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
