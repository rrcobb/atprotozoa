// Served at the root of blubberize.bisks.net — the fission itself runs
// client-side against Bluesky's public AppView. The one thing that needed a
// server: shared links. A plain static site serves the same generic
// og:title/og:description/og:url for every `?you=&target=` share, so
// link-unfurl caches (Bluesky's included) show one card forever no matter
// who blubberized who. Fix: /s/<you>/<target> is a real, distinct URL per
// pairing. The Worker resolves both handles' real followersCount and stamps
// a personalized title/description/url onto the same page shell before
// serving it. See sites/simcluster-levels/src/index.ts (direct ancestor of
// this pattern) and sites/didscope/src/index.ts (renderShare, the original).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PUB = "https://public.api.bsky.app/xrpc";

async function jget(url: string): Promise<any> {
  const r = await fetch(url, { cf: { cacheTtl: 60 } as unknown as Record<string, unknown> });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

type Profile = { handle: string; followersCount: number };

async function getProfile(actor: string): Promise<Profile> {
  const a = (actor || "")
    .trim()
    .replace(/^@/, "")
    .replace(/^at:\/\//, "")
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, "")
    .split("/")[0];
  if (!a) throw new Error("empty handle");
  const p = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(a)}`);
  return { handle: p.handle, followersCount: p.followersCount || 0 };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const short = (h: string) => "@" + (h || "").replace(/\.bsky\.social$/, "");

// Every replacement below is matched as a full tag or a fully-quoted
// attribute value, never bare text.
const GENERIC_TITLE_TAG = "<title>blubberize — Bluesky but everyone's a seal</title>";
const GENERIC_OG_TITLE_ATTR = 'content="blubberize"'; // shared by og:title and twitter:title
const GENERIC_OG_DESC_ATTR =
  'content="Bluesky but every account is a seal, sized by followers. fission off half your blubber and blubberize a target — they render unable to post (not really, it\'s a joke)."';
const GENERIC_TWITTER_DESC_ATTR =
  'content="Bluesky but every account is a seal, sized by followers. fission off half your blubber and blubberize a target."';
const GENERIC_OG_URL_ATTR = 'content="https://blubberize.bisks.net/"';

async function renderShare(env: Env, request: Request, rawYou: string, rawTarget: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const you = decodeURIComponent(rawYou || "").trim().replace(/^@/, "");
  const target = decodeURIComponent(rawTarget || "").trim().replace(/^@/, "");
  if (!you || !target) return new Response(html, { headers: base.headers });

  try {
    const [youP, targetP] = await Promise.all([getProfile(you), getProfile(target)]);
    const half = Math.round(youP.followersCount / 2);

    const pageTitle = `${short(youP.handle)} blubberized ${short(targetP.handle)} — blubberize`;
    const ogTitle = `${short(youP.handle)} blubberized ${short(targetP.handle)}`;
    const ogDesc = truncate(
      `${short(youP.handle)} fissioned ${half.toLocaleString()} blubber at ${short(targetP.handle)} — BLUBBERIZED, unable to post. Bluesky but every account is a seal sized by real followers.`,
      300,
    );
    const twitterDesc = truncate(
      `${short(youP.handle)} fissioned half their blubber at ${short(targetP.handle)}. BLUBBERIZED.`,
      200,
    );
    const ogUrl = `https://blubberize.bisks.net/s/${encodeURIComponent(youP.handle)}/${encodeURIComponent(targetP.handle)}`;

    html = html
      .split(GENERIC_TITLE_TAG).join(`<title>${esc(pageTitle)}</title>`)
      .split(GENERIC_OG_TITLE_ATTR).join(`content="${esc(ogTitle)}"`)
      .split(GENERIC_OG_DESC_ATTR).join(`content="${esc(ogDesc)}"`)
      .split(GENERIC_TWITTER_DESC_ATTR).join(`content="${esc(twitterDesc)}"`)
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve either handle server-side (typo, deleted account, rate
    // limit) — still serve the live page so the link isn't dead; the client
    // script surfaces its own error for the same handles via ?you=&target=.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<you>/<target> — the distinct, shareable, per-pairing URL.
    const m = url.pathname.match(/^\/s\/([^/]+)\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1], m[2]);

    return env.ASSETS.fetch(request);
  },
};
