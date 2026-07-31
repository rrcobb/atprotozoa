// mailadollar Worker — mounted at bisks.net/mailadollar/
//
// Everything the search itself needs runs client-side (public/index.html
// hits the public AppView directly: app.bsky.actor.searchActors, CORS *, no
// auth). The one thing that needed a server: shared links. A plain static
// site serves the same og:title/description for every query string, so a
// link-unfurl cache shows one generic card no matter who got searched for
// (same problem/fix as sites/didscope's renderShare).
//
// /s/<name> is a real, distinct URL per search: the Worker re-runs the same
// public search server-side and stamps a personalized og:title/description
// onto the static shell before serving it. Falls through to ASSETS (with the
// /mailadollar prefix stripped) for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/mailadollar";
const API = "https://public.api.bsky.app/xrpc/";

const GENERIC_TITLE = "mail-a-dollar — find the author, send the buck";
const GENERIC_DESC =
  "libgen doesn't do this part. type an author's name: we check if they're on Bluesky, dig a tip link out of their bio, and if not, hand you a printable dollar IOU to mail instead.";
const GENERIC_OG_URL = "https://bisks.net/mailadollar/";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// Same tip-domain list as the client (public/index.html) — kept as a local
// copy for the server-side og:description, same reasoning as didscope's
// SIGNS table duplication: this is one site's server mirroring its own
// client, not a shared package across sites.
const TIP_DOMAINS = ["paypal.me", "venmo.com", "cash.app", "ko-fi.com", "buymeacoffee.com", "patreon.com"];

function findTipLink(text: string): string | null {
  const urls = text.match(/https?:\/\/[^\s)]+/gi) || [];
  for (const u of urls) {
    if (TIP_DOMAINS.some((d) => u.toLowerCase().includes(d))) return u;
  }
  return null;
}

async function searchActor(name: string): Promise<{ handle: string; displayName: string; description: string } | null> {
  const url = `${API}app.bsky.actor.searchActors?q=${encodeURIComponent(name)}&limit=1`;
  const res = await fetch(url, { cf: { cacheTtl: 120 } as unknown as Record<string, unknown> });
  if (!res.ok) return null;
  const data = (await res.json()) as { actors?: Array<{ handle: string; displayName?: string; description?: string }> };
  const a = data.actors?.[0];
  if (!a) return null;
  return { handle: a.handle, displayName: a.displayName || a.handle, description: a.description || "" };
}

async function renderShare(env: Env, request: Request, rawName: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const name = decodeURIComponent(rawName).trim();
  if (!name) return new Response(html, { headers: base.headers });

  try {
    const actor = await searchActor(name);
    let title: string;
    let desc: string;
    if (actor) {
      const tip = findTipLink(actor.description);
      title = `mail-a-dollar: found ${actor.displayName} (@${actor.handle})`;
      desc = tip
        ? `They've got a tip link right in their Bluesky bio. Go send @${actor.handle} a dollar.`
        : `@${actor.handle} is on Bluesky but hasn't posted a tip link — say hi, or mail an actual dollar instead.`;
    } else {
      title = `mail-a-dollar: looking for ${name}`;
      desc = `Not on Bluesky (or not findable) — here's a printable dollar IOU to mail them the old-fashioned way.`;
    }
    desc = truncate(desc, 300);
    const ogUrl = `https://bisks.net/mailadollar/s/${encodeURIComponent(name)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let path = url.pathname;
    if (path === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    // Only strip when the prefix is actually present — on the subdomain
    // requests arrive without it, and an unconditional slice would chop
    // the front off short paths ("/app.js" -> "") so every asset would
    // silently serve index.html.
    if (path.startsWith(PREFIX + "/")) {
      path = path.slice(PREFIX.length) || "/";
    }

    const m = path.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    url.pathname = path;
    return env.ASSETS.fetch(new Request(url, request));
  },
};
