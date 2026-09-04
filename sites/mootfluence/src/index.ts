// mootfluence Worker — mootfluence.bisks.net
//
// The ranking itself is intentionally static/client-side: no server-side
// index (see public/lib/*.js). The one thing that needed a server: shared
// links. A plain static site serves the *same* index.html — same
// og:title/og:description/og:url — no matter whose handle is in the query
// string, so Bluesky's link-unfurl cache shows one generic card for every
// share, forever. See notes/45-sharing-and-virality.md tier 4 and
// sites/didscope/src/index.ts (renderShare) for the reference pattern this
// is copied from.
//
// Deliberately NOT reproducing the actual rank number here: computing it
// needs a live moots lookup (CAR download + Constellation) plus a full
// network-wide influential25 vote scan — the whole reason the client does it
// incrementally over Jetstream instead of on every page load. Redoing that
// per Worker request (including for link-unfurl crawlers) would be the exact
// "backend index for what should be a frontend computation" this site's
// house style avoids. So /s/<handle> only personalizes the *text* (whose
// ranking this is) — the number stays something you have to open the page
// to see, same as before.
export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const API = "https://public.api.bsky.app/xrpc/";

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "mootfluence — your influential25 rank, among your moots";
const GENERIC_DESC =
  "See where you rank on influential25's live nomination board — not against the whole network, just your own moots (mutual follows). Then turn your top-ranked moots into a real starter pack.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image attribute ("…/og.png"), so a naive
// split/join on it would corrupt that into "…/s/<handle>og.png" too (this
// exact bug is called out in didscope's src/index.ts, copied here so it
// isn't repeated).
const GENERIC_OG_URL_ATTR = 'content="https://mootfluence.bisks.net/"';

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    let did: string;
    if (handle.startsWith("did:")) {
      did = handle;
    } else {
      const r = await xrpc("com.atproto.identity.resolveHandle", { handle });
      did = r.did;
    }
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
    const who = "@" + (profile.handle || handle);

    const title = `mootfluence: ${who} vs their moots`;
    const desc = `See where ${who} ranks on influential25 among just the people who follow them back — then turn their top-ranked moots into a real starter pack.`;
    const ogUrl = `https://mootfluence.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve the handle server-side (typo, deleted account, rate
    // limit) — still serve the live page so the link isn't dead; the client
    // script will surface its own error once it tries the same handle.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<handle> — the distinct, shareable, per-person URL. Every handle
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse every share into one cached generic card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
