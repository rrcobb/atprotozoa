// ashbychart Worker: static assets, plus per-chart share unfurls.
//
// The whole maker and viewer run client-side (public/index.html builds a
// chart, public/chart.html fetches each handle's public profile and plots
// it). The one thing that needs a server: a static site would serve the
// *same* chart.html — same og:title/description — for every /c/<config>/
// URL, so every shared chart unfurls as one identical generic card (the
// problem notes/45-sharing-and-virality.md documents, tier 4). Fix: decode
// the chart's config straight out of the URL (no fetch, no storage — the
// config IS the URL) and stamp real og:title/description/url onto the same
// static shell before serving it. Copied from sites/polcompass/src/index.ts.
//
// This does NOT fetch live profile data server-side (that's tier 5 —
// didscope's renderShare does it for a single subject; a whole chart of up
// to 40 accounts is a heavier ask for a per-request stamp), so the stamped
// text names the axes and handle count, not exact numbers or who's on the
// frontier — the client-side fetch fills in the real chart once the page
// loads.
export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

// Mirrors public/lib/ashby.js's PROP labels and decodeChart — kept as a
// server-side copy (not a shared import) on purpose, same reasoning as
// didscope's SIGNS tables: this is duplication within ONE site, not a
// package across sites.
const PROP_LABELS: Record<string, string> = {
  followers: "followers",
  following: "following",
  posts: "posts",
  ratio: "followers per following",
  postsPerDay: "posts per day since profile created",
};
const PROP_KEYS = Object.keys(PROP_LABELS);

interface ChartCfg {
  title: string;
  x: string;
  y: string;
  handles: string[];
}

function decodeChart(encoded: string): ChartCfg | null {
  try {
    let b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = atob(b64);
    const o = JSON.parse(json);
    const x = PROP_KEYS.includes(o.x) ? o.x : "followers";
    const y = PROP_KEYS.includes(o.y) ? o.y : "posts";
    if (!Array.isArray(o.h)) return null;
    return {
      title: String(o.t || "").slice(0, 80),
      x,
      y,
      handles: o.h.slice(0, 40).map((h: unknown) => String(h)),
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
// URL), same fix didscope/polcompass needed: the bare URL is also a prefix
// of the og:image URL, so a naive split/join on it would corrupt that tag.
const GENERIC_TITLE = "ashbychart — an Ashby materials-selection chart, for Bluesky accounts";
const GENERIC_DESC = "Someone built this chart. Two public account stats, plotted against each other, with the trade-off frontier drawn in.";
const GENERIC_OG_URL_ATTR = 'content="https://ashbychart.bisks.net/c/"';

async function renderChart(env: Env, request: Request, encoded: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/chart.html", request.url), { method: "GET" }));
  const html = await base.text();

  const cfg = decodeChart(encoded);
  if (!cfg) {
    // Malformed link — still serve the shell so the client script can show
    // its own "couldn't read that chart" state, rather than a dead page.
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  }

  const title = `ashbychart: ${cfg.title || `${PROP_LABELS[cfg.y]} vs ${PROP_LABELS[cfg.x]}`}`;
  const desc = `${cfg.handles.length} account${cfg.handles.length === 1 ? "" : "s"} plotted by ${PROP_LABELS[cfg.x]} (x) vs ${PROP_LABELS[cfg.y]} (y). See who's on the trade-off frontier.`;
  const ogUrl = `https://ashbychart.bisks.net/c/${encoded}/`;

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
