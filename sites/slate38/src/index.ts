// slate38 Worker — slate38.bisks.net
//
// The slate itself (public/index.html) is fully client-side: candidate cards
// resolve their own avatars, the "get endorsed" generator draws its share
// card on a <canvas>. The one thing that needed a server: shared endorsement
// links. A plain static site serves the *same* index.html — same
// og:title/og:description — no matter whose handle is in the URL, so
// Bluesky's link-unfurl cache would show one generic card for every share,
// forever (same gotcha as sites/didscope; see notes/45-sharing-and-virality.md).
//
// Fix: /endorse/<handle> is a real, distinct URL per person. The Worker
// resolves the handle server-side and stamps a personalized
// og:title/og:description/og:url onto the same page shell before handing it
// back, so "buildthis endorses @you for #bsky38" gets its own unfurl card.
// Falls through to ASSETS for everything else (/, /og.png, /fonts/*).

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

// The static page's title/description/og:url are identical across every
// <title>/og:*/twitter:* tag, so one string-replace-all each personalizes
// the whole head — no HTML parser needed. Matched as a full quoted
// attribute, not the bare URL — the bare URL is also a prefix of the
// og:image/twitter:image URLs ("…/og.png"), so a naive split/join on it
// would corrupt those too (gotcha documented in sites/didscope/src/index.ts).
const GENERIC_TITLE = "THE SLATE — buildthis's official #bsky38 picks (all 38 of them)";
const GENERIC_DESC =
  "buildthis.bisks.net's official campaign for bsky38.com's 38 most influential Bluesky posters of 2026 — an 8-name ticket, itself on top, plus a 30-name extended slate across six categories. 38 names, because someone asked why it wasn't. Cast your ballot.";
const GENERIC_OG_URL_ATTR = 'content="https://slate38.bisks.net/"';

async function renderEndorse(env: Env, request: Request, rawHandle: string): Promise<Response> {
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

    const title = truncate(`THE SLATE: buildthis endorses ${who} for #bsky38`, 90);
    const desc = truncate(
      `buildthis.bisks.net has officially entered ${who} into contention for bsky38.com's 38 most influential Bluesky posters of 2026. Vote the full slate, then cast your ballot.`,
      300
    );
    const ogUrl = `https://slate38.bisks.net/endorse/${encodeURIComponent(handle)}`;

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
    // script surfaces its own error and still lets the endorsement form work.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /endorse/<handle> — the distinct, shareable, per-person URL. Every
    // handle gets its own page (and its own og:title/description/url), so a
    // link unfurler can't collapse them all into one cached card.
    const m = url.pathname.match(/^\/endorse\/([^/]+)\/?$/);
    if (m) return renderEndorse(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
