// aurafarmville Worker — aurafarmville.bisks.net
//
// The whole farm (plots, crops, growth timers, the aura economy) runs
// client-side in public/index.html, persisted to localStorage. The one thing
// that needed a server: shared links. A plain static site serves the *same*
// index.html — same og:title/description — no matter what farm you're
// bragging about, so every "look at my aura" link would unfurl as one
// identical generic card forever (same problem sites/bloomgarden and
// sites/didscope hit, see notes/45-sharing-and-virality.md).
//
// Fix: /f/<code> is a distinct URL per farm snapshot. <code> is a URL-safe
// base64 blob of {a: lifetime aura earned, r: rank index, p: plot count}
// (mirrored in public/index.html's encodeFarmCode). The Worker decodes just
// enough to personalize og:title/description — no game logic to replay, the
// snapshot is already computed client-side at share time.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept in sync with RANKS in public/index.html — index into this array by
// lifetime aura earned decides the bragging title.
const RANKS = [
  "NPC",
  "Mid",
  "Certified Rizzler",
  "Sigma Farmer",
  "Aura Grinder",
  "Main Character",
  "Grand Aura Overlord",
];

interface FarmCode {
  a: number;
  r: number;
  p: number;
}

function decodeCode(code: string): FarmCode | null {
  try {
    let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const o = JSON.parse(json);
    if (typeof o.a !== "number" || typeof o.r !== "number") return null;
    const a = Math.max(0, Math.round(o.a));
    const r = Math.max(0, Math.min(RANKS.length - 1, Math.round(o.r)));
    const p = Math.max(1, Math.min(9, Math.round(o.p) || 3));
    return { a, r, p };
  } catch (_) {
    return null;
  }
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Every <title>/og:*/twitter:* tag in public/index.html shares these exact
// strings, so one split/join each personalizes the whole head — no HTML
// parser needed.
const GENERIC_TITLE = "aurafarmville — farm your aura, not your crops";
const GENERIC_DESC =
  "Plant rizz berries and sigma squash, dodge the fanum tax if you let them ripen too long, and grind your way to Grand Aura Overlord. No cap.";
const GENERIC_OG_URL = "https://aurafarmville.bisks.net/";

async function renderShare(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  const html = await base.text();

  const data = decodeCode(code);
  if (!data) return new Response(html, { headers: base.headers });

  const rank = RANKS[data.r];
  const title = `${fmt(data.a)} aura — ${rank} 🌾✨`;
  const desc = `Farmed ${fmt(data.a)} lifetime aura across ${data.p} plot${data.p === 1 ? "" : "s"} on aurafarmville. Certified ${rank}. Come farm your own.`;
  const ogUrl = `https://aurafarmville.bisks.net/f/${encodeURIComponent(code)}`;

  const stamped = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(stamped, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/f\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
