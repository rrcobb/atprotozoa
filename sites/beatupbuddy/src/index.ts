// beatupbuddy Worker — beatupbuddy.bisks.net
//
// Static physics toy: a ragdoll wearing @mfzx.net's real avatar as its head,
// standing on a weighted base, that wobbles, dances, and cries out one of
// her real posts every time you land a hit. Went generic for a while
// after @mfzx.net said she wasn't sure how she felt about it and a
// third party's claim of consent on her behalf wasn't good enough to
// bring it back — but @mfzx.net has since tagged the bot directly, more
// than once, stating her own enthusiastic consent, so the real avatar
// and posts are back. All the game logic and the AppView fetches (avatar +
// recent posts) happen client-side in public/game.js — this Worker's only
// job is the personalized share unfurl at /s/<hits>, same trick as
// sites/didscope and sites/hyperobject: a static page serves one cached
// generic embed forever, so a real per-result URL with a server-stamped
// og:title/description is needed for a shared "I beat up @mfzx.net N
// times" link to actually show N in the unfurl instead of the generic
// card. Falls through to ASSETS for everything else.

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

const GENERIC_TITLE = "beat up buddy — @mfzx.net is standing there and it's your fault";
const GENERIC_DESC =
  "a physics ragdoll wearing @mfzx.net's real face. pick a tool, swing, watch her wobble and cry out her own posts.";
const GENERIC_OG_URL = "https://beatupbuddy.bisks.net/";

async function renderShare(env: Env, request: Request, rawHits: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const hits = Math.max(0, Math.min(99999, parseInt(rawHits, 10) || 0));
  if (!hits) return new Response(html, { headers: base.headers });

  const title = `beat up buddy: @mfzx.net took ${hits} hit${hits === 1 ? "" : "s"} today`;
  const desc = `I hit @mfzx.net's ragdoll ${hits} time${hits === 1 ? "" : "s"} and she cried out her own posts every time. your turn.`;
  const ogUrl = `https://beatupbuddy.bisks.net/s/${hits}`;

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
