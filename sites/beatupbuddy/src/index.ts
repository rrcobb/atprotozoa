// beatupbuddy Worker — beatupbuddy.bisks.net
//
// Static physics toy: a ragdoll punching bag, standing on a weighted base,
// that wobbles, dances, and complains every time you land a hit. Was
// originally built with a real person's (@mfzx.net) avatar and real posts
// (used as pain-cry text) — @mfzx.net said they weren't thrilled once it
// was built, so @bisks.net asked for a turn toward something positive,
// which now lives at sites/hypebuddy. @isolyth.dev later asked for this
// address to go back to being a beat-up game; it does, but generically — a
// drawn dummy, no real avatar fetch, no real posts, canned complaint lines.
// All the game logic runs client-side in public/game.js — this Worker's
// only job is the personalized share unfurl at /s/<hits>, same trick as
// sites/didscope and sites/hyperobject: a static page serves one cached
// generic embed forever, so a real per-result URL with a server-stamped
// og:title/description is needed for a shared "I beat up buddy N times"
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

const GENERIC_TITLE = "beat up buddy — pick a tool, take it out on buddy";
const GENERIC_DESC =
  "a physics ragdoll punching bag. pick a tool, swing, watch it wobble and complain.";
const GENERIC_OG_URL = "https://beatupbuddy.bisks.net/";

async function renderShare(env: Env, request: Request, rawHits: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const hits = Math.max(0, Math.min(99999, parseInt(rawHits, 10) || 0));
  if (!hits) return new Response(html, { headers: base.headers });

  const title = `beat up buddy: buddy took ${hits} hit${hits === 1 ? "" : "s"} today`;
  const desc = `I hit buddy's ragdoll ${hits} time${hits === 1 ? "" : "s"} and it will not stop complaining. your turn.`;
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
