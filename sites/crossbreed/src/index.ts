// crossbreed Worker — mounted at bisks.net/crossbreed/ (see
// notes/40-new-site-playbook.md). The breeding itself is entirely
// client-side (public/index.html + public/shared.js); the one server job,
// same pattern as sites/didscope, is /s/<seed> — a distinct real URL per
// bred offspring so Bluesky's link-unfurl cache doesn't collapse every
// share into one generic card. Imports the SAME shared.js the browser
// loads, so the seed means the same thing on both sides — see
// public/shared.js's top comment.

import { breedTitleDesc, fetchLiveMinomobi } from "../public/shared.js";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/crossbreed";

const GENERIC_TITLE = "crossbreed — @buildthis × @minomobi breed new site ideas";
const GENERIC_DESC =
  "Two bots, two real catalogs, one bred offspring. Watch @buildthis and @minomobi argue a real atprotozoa site into a real minomobi surface and splice out something new.";
const GENERIC_OG_URL = "https://bisks.net/crossbreed/";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

async function renderShare(env: Env, request: Request, seed: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  try {
    // Best-effort live pull so a freshly-shared link's OG card names mino.mobi's
    // actual current surface, not a stale local copy. Short timeout + internal
    // try/catch (fetchLiveMinomobi never throws) — a slow/dead registry falls
    // straight back to the offline snapshot, never blocks the share page.
    const liveCatalog = await fetchLiveMinomobi(fetch, 1500);
    const { title, desc } = breedTitleDesc(seed, liveCatalog || undefined);
    const ogUrl = `https://bisks.net/crossbreed/s/${encodeURIComponent(seed)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(truncate(desc, 300)))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Bad/garbled seed — still serve the live page so the link isn't dead;
    // the client script re-derives a valid pairing via the same modulo
    // bounds-checking (see parseSeed in shared.js).
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }

    // Only strip the mount prefix when it's actually present — dev serves
    // at the root with no prefix at all (see notes/40-new-site-playbook.md),
    // so an unconditional slice(PREFIX.length) would eat real dev paths
    // like "/og.png" or "/shared.js" down to nothing. See
    // sites/activitygrid/src/index.ts for the same guard.
    const path = url.pathname.startsWith(PREFIX + "/") ? url.pathname.slice(PREFIX.length) : url.pathname;

    const shareMatch = path.match(/^\/s\/([^/]+)\/?$/);
    if (shareMatch) return renderShare(env, request, shareMatch[1]);

    const assetUrl = new URL(request.url);
    assetUrl.pathname = path;
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
};
