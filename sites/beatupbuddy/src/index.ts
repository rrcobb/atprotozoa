// beatupbuddy Worker — beatupbuddy.bisks.net
//
// Static physics toy: a ragdoll wearing @mfzx.net's real avatar as its head,
// standing on a weighted base, that wobbles, dances, and lights up with
// confetti every time you land a hit. Was originally a "beat up a buddy"
// game; @mfzx.net said they weren't thrilled once it was built, so
// @bisks.net asked for a turn toward something positive — same ragdoll toy,
// but tools are now celebratory and a "hype" meter climbs instead of an hp
// bar draining. All the game logic and the AppView avatar fetch happen
// client-side in public/game.js — this Worker's only job is the
// personalized share unfurl at /s/<hits>, same trick as sites/didscope and
// sites/hyperobject: a static page serves one cached generic embed forever,
// so a real per-result URL with a server-stamped og:title/description is
// needed for a shared "I hyped up @mfzx.net N times" link to actually show
// N in the unfurl instead of the generic card. Falls through to ASSETS for
// everything else.

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

const GENERIC_TITLE = "hype up buddy — @mfzx.net is standing there and today's a good day";
const GENERIC_DESC =
  "a physics ragdoll wearing @mfzx.net's real face. pick a tool, shower them in confetti and love, watch them light up and dance.";
const GENERIC_OG_URL = "https://beatupbuddy.bisks.net/";

async function renderShare(env: Env, request: Request, rawHits: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const hits = Math.max(0, Math.min(99999, parseInt(rawHits, 10) || 0));
  if (!hits) return new Response(html, { headers: base.headers });

  const title = `hype up buddy: @mfzx.net got ${hits} cheer${hits === 1 ? "" : "s"} today`;
  const desc = `I cheered on @mfzx.net's ragdoll ${hits} time${hits === 1 ? "" : "s"} and gave them a great day. your turn.`;
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
