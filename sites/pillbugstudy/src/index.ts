// pillbugstudy Worker — pillbugstudy.bisks.net
//
// Static ambient toy: a keyhole-shaped window onto @isolyth.dev's study,
// where they've been turned into a giant pillbug hunched over their desk,
// crying about their sins — their own real posts, fetched from the AppView
// and read out one at a time. All of that (the AppView fetch, the keyhole
// mask, the crying loop) happens client-side in public/scene.js — this
// Worker's only job is the personalized share unfurl at /s/<n>, same trick
// as sites/beatupbuddy and sites/didscope: a static page serves one cached
// generic embed forever, so a real per-result URL with a server-stamped
// og:title/description is needed for a shared "I made them confess N sins"
// link to actually show N in the unfurl instead of the generic card. Falls
// through to ASSETS for everything else.

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

const GENERIC_TITLE = "the keyhole into @isolyth.dev's study";
const GENERIC_DESC =
  "peek through the keyhole: @isolyth.dev is a giant pillbug hunched over their desk, crying about their sins — their own real posts, one at a time.";
const GENERIC_OG_URL = "https://pillbugstudy.bisks.net/";

async function renderShare(env: Env, request: Request, rawN: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const n = Math.max(0, Math.min(99999, parseInt(rawN, 10) || 0));
  if (!n) return new Response(html, { headers: base.headers });

  const title = `@isolyth.dev has confessed ${n} sin${n === 1 ? "" : "s"} today`;
  const desc = `I watched through the keyhole while @isolyth.dev, now a giant pillbug, cried out ${n} of their own posts. come watch too.`;
  const ogUrl = `https://pillbugstudy.bisks.net/s/${n}`;

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
