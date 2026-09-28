// doublefeature Worker — doublefeature.bisks.net
//
// Everything runs client-side (public/index.html builds and reads the two-clip
// state entirely in the browser). The one thing that needed a server: shared
// links. A plain static site would serve the *same* index.html — same
// og:title/og:image — no matter which two clips are encoded into the URL, so
// every remix would collapse into one generic link-unfurl card. Same fix as
// sites/didscope: /s/<encoded> is a real, distinct URL per remix. The Worker
// decodes the state, builds a title/description out of both clips' captions,
// points og:image at the left clip's own YouTube thumbnail (YouTube already
// serves one per video id — no image generation needed), and falls through to
// ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface ClipState {
  i: string; // youtube video id
  s: number; // start seconds
  e: number; // end seconds, 0 = no trim
  m: boolean; // muted
  l: string; // caption/label
}
interface RemixState {
  a: ClipState;
  b: ClipState;
}

// Mirrors decodeState() in public/index.html: base64url of a UTF-8-encoded
// JSON blob. Duplicated here rather than shared — same reasoning as
// sites/logs/src/index.ts, server-side duplication within ONE site, not a
// package across sites.
function decodeState(raw: string): RemixState | null {
  try {
    let b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    if (!obj || !obj.a || !obj.b || !obj.a.i || !obj.b.i) return null;
    return {
      a: { i: obj.a.i, s: obj.a.s || 0, e: obj.a.e || 0, m: !!obj.a.m, l: obj.a.l || "" },
      b: { i: obj.b.i, s: obj.b.s || 0, e: obj.b.e || 0, m: !!obj.b.m, l: obj.b.l || "" },
    };
  } catch (_) {
    return null;
  }
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

// The static page's title/description phrase is identical across the
// <title> tag and every og:*/twitter:* content attribute, so one
// split/join each replaces all of them — no HTML parser needed. Same
// pattern as sites/didscope.
const GENERIC_TITLE = "doublefeature — two youtube clips, side by side";
const GENERIC_DESC =
  "Nolan's Odyssey siren song next to a muted Red Lobster Endless Shrimp ad — swap in any two YouTube clips, set a time range for each, and share the remix.";
const GENERIC_OG_URL_ATTR = 'content="https://doublefeature.bisks.net/"';
const GENERIC_OG_IMAGE_ATTR = 'content="https://img.youtube.com/vi/LgOMT7ka6do/hqdefault.jpg"';

async function renderShare(env: Env, request: Request, rawEncoded: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const state = decodeState(decodeURIComponent(rawEncoded));
  if (!state) {
    // Bad/typo'd share blob — still serve the live page rather than a dead
    // link; the client's own decode falls back to the default pairing.
    return new Response(html, { headers: base.headers });
  }

  const labelA = state.a.l || "clip A";
  const labelB = (state.b.l || "clip B") + (state.b.m ? " (muted)" : "");
  const title = truncate(`doublefeature: "${labelA}" × "${labelB}"`, 70);
  const desc = truncate(
    `"${labelA}" next to "${labelB}" — two YouTube clips side by side. Remix your own pairing at doublefeature.bisks.net.`,
    300
  );
  const ogUrl = `https://doublefeature.bisks.net/s/${encodeURIComponent(rawEncoded)}`;
  const ogImage = `https://img.youtube.com/vi/${state.a.i}/hqdefault.jpg`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`)
    .split(GENERIC_OG_IMAGE_ATTR).join(`content="${ogImage}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<encoded> — the distinct, shareable, per-remix URL. Every combination
    // of two clips gets its own page (and its own og:title/description/image),
    // so a link unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
