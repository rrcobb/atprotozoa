// blockcurve Worker — blockcurve.bisks.net
//
// The whole trace runs client-side (public/app.js does the real work against
// constellation.microcosm.blue and the public AppView). The one thing that
// needed a server: shared links. A plain static site serves the same
// index.html — same og:title/og:description — no matter whose handle is in
// the URL, so Bluesky's link-unfurl cache would show one generic card for
// every share. Fix: /s/<handle> is a real, distinct URL per person. The
// Worker resolves the handle and the direct-block count server-side and
// stamps personalized og:title/og:description/og:url onto the same page
// shell before handing it back — every share gets its own unfurl. Falls
// through to ASSETS for everything else. Same shape as sites/didscope/src/index.ts.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const API = "https://public.api.bsky.app/xrpc/";
const CONSTELLATION = "https://constellation.microcosm.blue";

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

const GENERIC_TITLE = "blockcurve — your blocks over time";
const GENERIC_DESC =
  "A cumulative chart of blocks received, built from public app.bsky.graph.block backlinks — no login needed, works for any handle.";
// Matched as a full quoted attribute (not the bare URL, which is also a
// prefix of the og:image URL) — same gotcha noted in sites/didscope/src/index.ts.
const GENERIC_OG_URL_ATTR = 'content="https://blockcurve.bisks.net/"';

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    const did = handle.startsWith("did:") ? handle : (await xrpc("com.atproto.identity.resolveHandle", { handle })).did;
    let displayHandle = handle;
    try {
      const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
      if (profile.handle) displayHandle = profile.handle;
    } catch (_) {
      // cosmetic only
    }

    const countRes = await fetch(
      `${CONSTELLATION}/links/count?target=${encodeURIComponent(did)}&collection=app.bsky.graph.block&path=${encodeURIComponent(".subject")}`,
    );
    const count = countRes.ok ? ((await countRes.json()) as { total?: number }).total ?? null : null;

    const title = count != null ? `blockcurve: @${displayHandle} has been blocked ${count.toLocaleString("en-US")} times` : `blockcurve: @${displayHandle}`;
    const desc = "Cumulative chart of blocks received, built from public app.bsky.graph.block backlinks.";
    const ogUrl = `https://blockcurve.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE)
      .join(esc(title))
      .split(GENERIC_DESC)
      .join(esc(desc))
      .split(GENERIC_OG_URL_ATTR)
      .join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve the handle server-side (typo, deleted account, rate
    // limit) — still serve the live page so the link isn't dead; the
    // client script will surface its own error.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
