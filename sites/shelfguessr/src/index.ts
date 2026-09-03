// shelfguessr Worker — served at the root of shelfguessr.bisks.net.
// Every game write (a shelf photo, a guess) is a plain atproto record the
// browser signs and writes to the *writer's own* PDS; the leaderboard and
// the cluster-filtered shelf pool are both computed client-side by replaying
// those records network-wide (public/lib/global-index.js). This Worker
// mostly stays a static-asset passthrough, plus one route: /s/<actor>/<correct>/
// <total>, a real per-result URL so a shared streak unfurls with its own
// og:title/description instead of every share showing the same generic card
// (see notes/45-sharing-and-virality.md tier 4, and sites/didscope/src/index.ts
// for the pattern this copies). Unlike didscope, the result here is pure
// arithmetic already baked into the URL — no AppView call needed server-side.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanActor(raw: string): string {
  let a = decodeURIComponent(raw).trim().replace(/^@/, "");
  const m = a.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) a = m[1];
  return a;
}

// Same identical-string trick as didscope: the <title>, og:title, meta
// description, and og:description tags all carry these exact strings, so one
// split/join each swaps the whole head. og:url is matched as a full quoted
// attribute (not the bare URL), same gotcha as didscope's comment — the bare
// URL is also a prefix of the og:image URL ("…/og.png").
const GENERIC_TITLE = "shelfguessr — whose bookshelf is this?";
const GENERIC_DESC =
  "GeoGuessr, but the map is your SimCluster and the location is a bookshelf. Upload yours, then guess whose shelf you're looking at from your mutuals.";
const GENERIC_OG_URL_ATTR = 'content="https://shelfguessr.bisks.net/"';

async function renderShare(
  env: Env,
  request: Request,
  rawActor: string,
  rawCorrect: string,
  rawTotal: string,
): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const actor = cleanActor(rawActor);
  const correct = Number(rawCorrect);
  const total = Number(rawTotal);
  const valid =
    actor &&
    /^\d{1,4}$/.test(rawCorrect) &&
    /^\d{1,4}$/.test(rawTotal) &&
    total >= 1 &&
    correct >= 0 &&
    correct <= total;
  if (!valid) return new Response(html, { headers: base.headers });

  const pct = Math.round((correct / total) * 100);
  const who = actor.startsWith("did:") ? actor : "@" + actor;
  const title = truncate(`shelfguessr: guessed ${correct}/${total} bookshelves in ${who}'s SimCluster`, 300);
  const desc = truncate(
    `Can you beat ${correct}/${total} (${pct}%)? Play ${who}'s SimCluster on shelfguessr — GeoGuessr, but the map is a SimCluster and the location is a bookshelf.`,
    300,
  );
  const ogUrl = `https://shelfguessr.bisks.net/s/${encodeURIComponent(actor)}/${correct}/${total}`;

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

    // /s/<actor>/<correct>/<total> — a distinct, shareable URL per streak, so
    // link-unfurl caches (Bluesky's included) can't collapse every share into
    // one generic card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/(\d{1,4})\/(\d{1,4})\/?$/);
    if (m) return renderShare(env, request, m[1], m[2], m[3]);

    return env.ASSETS.fetch(request);
  },
};
