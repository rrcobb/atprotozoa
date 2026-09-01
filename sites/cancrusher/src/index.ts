// cancrusher Worker — cancrusher.bisks.net
//
// Static physics toy: the whole simulation (public/game.js) runs client-side.
// The one server-side job is the personalized share unfurl at /s/<pct>, same
// trick as sites/didscope and sites/beatupbuddy: a plain static page serves
// the same og:image/title/description for every visitor, so a shared "I
// crushed it to 61%" link would otherwise show one generic card forever.
// Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "cancrusher — a physically-ish accurate soda can crushing simulator";
const GENERIC_DESC =
  "drag the plate down and crush a virtual soda can with real (well, real-ish) buckling physics. every crush is different.";
const GENERIC_OG_URL = "https://cancrusher.bisks.net/";

async function renderShare(env: Env, request: Request, rawPct: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const pct = Math.max(0, Math.min(100, parseInt(rawPct, 10) || 0));
  if (!pct) return new Response(html, { headers: base.headers });

  const title = `cancrusher: crushed to ${pct}%`;
  const desc = `I crushed a virtual soda can down to ${pct}% of its original height. think you can flatten it further?`;
  const ogUrl = `https://cancrusher.bisks.net/s/${pct}`;

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

    const m = url.pathname.match(/^\/s\/(\d+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
