// ridegently Worker — ridegently.bisks.net
//
// The carousel and the rocking-ride animation are all client-side (see
// public/index.html + public/app.js). The one thing that needs a server: a
// plain static site serves the *same* og:title/og:description for every
// /?ride=<id> query string, so Bluesky's link-unfurl cache shows one generic
// card forever no matter which model someone rode (same problem didscope hit
// — see sites/didscope/src/index.ts). Fix: /r/<id> is a real, distinct URL
// per ride, so it gets its own preview text.
//
// Kept as a small local copy of the roster in public/app.js — same
// reasoning as didscope's SIGNS table: server-side duplication of client
// data within ONE site, not a shared package across sites. Only what the OG
// text needs (name + tagline) made the trip.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const RIDES: Record<string, { name: string; tagline: string }> = {
  claude: { name: "Claude", tagline: "gentle, thoughtful, will absolutely refuse to go too fast" },
  gemini: { name: "Gemini", tagline: "twins riding tandem, somehow still one horse" },
  gpt: { name: "GPT", tagline: "the original pony, still the one everyone asks for by name" },
  llama: { name: "Llama", tagline: "open pasture, open weights, open saddle" },
  grok: { name: "Grok", tagline: "rides like it's got something to prove" },
  mistral: { name: "Mistral", tagline: "small, fast, faintly windswept" },
  deepseek: { name: "DeepSeek", tagline: "came out of nowhere, now everyone wants a turn" },
  command: { name: "Command R", tagline: "the quiet one, very good at fetching things" },
};

const GENERIC_TITLE = "ridegently — pick an LLM, ride it gently";
const GENERIC_DESC =
  "A Daytona-USA-style select screen for large language models. Spin the turntable, pick one, and take it for a gentle rock-on-a-spring ride. Like the ride-on toy sheep, but it's Claude.";
const GENERIC_OG_URL_ATTR = 'content="https://ridegently.bisks.net/"';

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderRide(env: Env, request: Request, rawId: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const id = decodeURIComponent(rawId).toLowerCase();
  const ride = RIDES[id];
  if (!ride) return new Response(html, { headers: base.headers });

  const title = `ridegently: riding ${ride.name} gently`;
  const desc = `${ride.tagline}. Pick your own at ridegently.bisks.net.`;
  const ogUrl = `https://ridegently.bisks.net/r/${encodeURIComponent(id)}`;

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

    // /r/<id> — the distinct, shareable, per-ride URL.
    const m = url.pathname.match(/^\/r\/([^/]+)\/?$/);
    if (m) return renderRide(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
