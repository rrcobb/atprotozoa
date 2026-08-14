// cartouche Worker — cartouche.bisks.net
//
// Everything still runs client-side (public/index.html does the actual
// transliteration and rendering). The one thing that needed a server: shared
// links. A plain static site serves the *same* index.html — same
// og:title/og:description/og:url — no matter whose handle is in the query
// string, so Bluesky's link-unfurl cache shows one generic card (always
// @fromthewestmeadow.com) for every share, forever. Same gap sites/didscope
// hit and fixed the same way.
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side and stamps personalized og:title/og:description/
// og:url onto the same page shell before handing it back — so sharing
// someone else's reading gets its own preview card instead of borrowing
// fromthewestmeadow.com's. Falls through to ASSETS for everything else
// (/, /og.png, /fonts/*). The og:image itself stays the static og.png (no
// resvg in the Workers runtime) — only the text personalizes.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Local copy of the same 47-symbol substitution table public/index.html
// uses — server-side duplication within ONE site, not a shared package.
// Only what the OG title needs (a handle) makes the trip.
const ALPHABET: Record<string, number> = {
  a: 0x13174, b: 0x1317c, c: 0x13106, d: 0x130d9, e: 0x130de, f: 0x132a6,
  g: 0x13317, h: 0x13142, i: 0x133ea, j: 0x13211, k: 0x133a7, l: 0x131fe,
  m: 0x131b0, n: 0x133b4, o: 0x1310c, p: 0x132d6, q: 0x13042, r: 0x1315d,
  s: 0x132cc, t: 0x1335a, u: 0x131c9, v: 0x13291, w: 0x1322d, x: 0x132df,
  y: 0x133fa, z: 0x132d5, "0": 0x13252, "1": 0x13387, "2": 0x133c7,
  "3": 0x13148, "4": 0x130da, "5": 0x13151, "6": 0x1320f, "7": 0x13030,
  "8": 0x13103, "9": 0x13358, " ": 0x1324e, ".": 0x1330e, ",": 0x133e1,
  ":": 0x1342b, ";": 0x13305, "-": 0x13000, "'": 0x1336a, "!": 0x13194,
  "?": 0x1330f, "@": 0x131fd, "/": 0x13253,
};
const RANGE_START = 0x13000, RANGE_SIZE = 0x430;

function fallbackGlyph(ch: string): number {
  const code = ch.codePointAt(0) || 0;
  let h = Math.imul(code ^ 0x9e3779b9, 2654435761) >>> 0;
  return RANGE_START + (h % RANGE_SIZE);
}

function transliterate(str: string): string {
  let out = "";
  for (const ch of (str || "").toLowerCase()) {
    const cp = ALPHABET[ch] !== undefined ? ALPHABET[ch] : fallbackGlyph(ch);
    out += String.fromCodePoint(cp);
  }
  return out;
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
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

// The static page's tags — matched and swapped exactly once each, no HTML
// parser needed. The og:url match is a full quoted attribute, not the bare
// URL: the bare URL is also a prefix of the og:image/twitter:image content
// ("…/og.png"), so a naive split/join on it would corrupt those too (the
// same gotcha logged in sites/didscope's src/index.ts).
const GENERIC_TITLE_TAG = "<title>cartouche — a website about @fromthewestmeadow.com, in hieroglyphs</title>";
const GENERIC_OG_TITLE = "cartouche — a website written entirely in hieroglyphs";
const GENERIC_OG_DESC =
  "A live Bluesky profile, transliterated glyph-by-glyph into real Egyptian hieroglyphs and carved onto floating 3D steles that drift with your mouse. Inscrutable until you hover.";
const GENERIC_OG_URL_ATTR = 'content="https://cartouche.bisks.net/"';

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: handle });
    const who = "@" + (profile.handle || handle);
    const displayName = profile.displayName || profile.handle || handle;
    const glyphName = transliterate(displayName);

    const titleTag = `<title>cartouche — ${esc(who)}, carved in hieroglyphs</title>`;
    const ogTitle = `cartouche: ${who} written entirely in hieroglyphs`;
    const ogDesc = truncate(
      `${who}'s real Bluesky profile, transliterated glyph by glyph — "${glyphName}" — and carved onto floating 3D steles. Inscrutable until you hover.`,
      300
    );
    const ogUrl = `https://cartouche.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE_TAG).join(titleTag)
      .split(GENERIC_OG_TITLE).join(esc(ogTitle))
      .split(GENERIC_OG_DESC).join(esc(ogDesc))
      .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve the handle server-side (typo, deleted account, rate
    // limit) — still serve the live page so the link isn't dead; the client
    // script surfaces its own "the stele is cracked here" error.
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
    // unfurler can't collapse every share into fromthewestmeadow.com's card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
