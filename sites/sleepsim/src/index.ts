// sleepsim Worker — sleepsim.bisks.net
//
// The simulation itself (a black screen) is entirely client-side. The one
// server-side thing: a "wake up" report's share link is a base64url blob of
// {minutes asleep, dream-flash count} baked into the URL path (/r/<code>),
// and a plain static page serves the *same* og:title/og:description no
// matter what's encoded there — so every report anyone shares would unfurl
// as one generic card forever (same fix as sites/lovecoupons's /b/<code>).
//
// Fix: decode the report server-side, stamp a personalized og:title/
// og:description/og:url into the same page shell, and let the client script
// do the identical decode to render the report interactively.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface SleepReport {
  minutes: number;
  dreams: number;
}

function b64urlDecode(str: string): string {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return decodeURIComponent(escape(atob(b64)));
}

function decodeReport(code: string): SleepReport | null {
  try {
    const o = JSON.parse(b64urlDecode(code));
    if (typeof o.m !== "number" || !isFinite(o.m) || o.m < 0) return null;
    const minutes = Math.min(Math.floor(o.m), 999999);
    const dreams = typeof o.d === "number" && isFinite(o.d) ? Math.max(0, Math.min(Math.floor(o.d), 999)) : 0;
    return { minutes, dreams };
  } catch (_) {
    return null;
  }
}

function fmtDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Every <title>/og:*/twitter:* tag on the static shell repeats these two
// phrases verbatim, so one string-replace-all each personalizes the whole
// head — no HTML parser needed, same trick as sites/lovecoupons.
const GENERIC_TITLE = "sleeping simulator — extremely accurate";
const GENERIC_DESC =
  "Hyper-realistic sleep simulation. Shows you exactly what you see when you're asleep, and nothing else.";
const GENERIC_OG_URL = "https://sleepsim.bisks.net/";

async function renderReport(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const report = decodeReport(code);
  if (!report) {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }

  const dur = fmtDuration(report.minutes);
  const title = `😴 slept for ${dur} — saw absolutely nothing`;
  const desc =
    report.dreams > 0
      ? `${dur} of pure black, interrupted by ${report.dreams} dream flash${report.dreams === 1 ? "" : "es"} nobody will ever remember. Extremely accurate.`
      : `${dur} of pure, uninterrupted black. Zero dreams recorded. Extremely accurate.`;
  const ogUrl = `https://sleepsim.bisks.net/r/${encodeURIComponent(code)}`;

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

    // /r/<code> — a distinct, shareable URL per sleep report, so a
    // link-unfurl cache can't collapse every share into one generic card.
    const m = url.pathname.match(/^\/r\/([^/]+)\/?$/);
    if (m) return renderReport(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
