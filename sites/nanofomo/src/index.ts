// nanofomo Worker — nanofomo.bisks.net
//
// The pledge itself is still entirely client-side (public/index.html), but a
// bare static site serves the *same* og:title/og:description/og:url for
// every pledge, so every "share your pledge on bluesky" post unfurls to one
// generic card no matter who signed it — nothing about the share itself
// signals that a real person just took the pledge, which is exactly the
// thing worth showing off when the ask is "raise awareness."
//
// Fix (same pattern as sites/didscope/src/index.ts, `renderShare`): /p/<name>
// is a real, distinct URL per pledge. The Worker stamps a personalized
// title/description/url onto the same static page shell before serving it,
// so each pledge gets its own unfurl card ("@handle just pledged not to
// foom") instead of the generic one — and each share becomes its own little
// bit of awareness-raising instead of a repeat of the same link. Falls
// through to ASSETS for everything else (/, /og.png, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const GENERIC_TITLE_TAG = "NaNoFoMo — No Foom November — bisks.net";
const GENERIC_META_DESC =
  "National No Foom Month. This November, instead of writing 50,000 words, just... don't recursively self-improve into a superintelligence. Take the pledge, watch the global foom counter hold at zero, and get your certificate.";
const GENERIC_OG_TITLE = "NaNoFoMo · No Foom November"; // shared by og:title and twitter:title
const GENERIC_OG_DESC =
  "National No Foom Month. Forgo any intelligence explosions, recursive self-improvement, or lightcone-related activity for the whole month of November. Take the pledge.";
const GENERIC_TWITTER_DESC =
  "This November, don't foom. Take the pledge, defend the global foom counter, get your certificate.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is also
// a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (same gotcha noted in didscope's
// src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://nanofomo.bisks.net/"';

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

function cleanName(raw: string): string {
  let n = decodeURIComponent(raw).trim();
  n = n.replace(/\s+/g, " ");
  return truncate(n, 60);
}

async function renderShare(env: Env, request: Request, rawName: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const name = cleanName(rawName);
  if (!name) return new Response(html, { headers: base.headers });

  // ?chain=<depth>&via=<nominator> ride along on every share link (see
  // buildShareText in public/index.html) so the unfurl card itself can show
  // off how deep the nomination chain is — the recursive-awareness bit, not
  // just a static "someone pledged" card. Both are cosmetic flavor, derived
  // entirely from the URL, no storage involved.
  const url = new URL(request.url);
  const chain = Math.max(0, Math.min(1000, parseInt(url.searchParams.get("chain") || "", 10) || 0));
  const via = cleanName(url.searchParams.get("via") || "");
  const chainNote = chain > 0 ? ` link #${chain} in the No Foom chain${via && via !== name ? `, nominated by ${via}` : ""}.` : "";

  const title = `${name} pledged not to foom · NaNoFoMo`;
  const ogDesc = truncate(
    `${name} just pledged not to recursively self-improve, bootstrap an intelligence explosion, or otherwise foom this November.${chainNote} Take the pledge yourself at nanofomo.bisks.net.`,
    300
  );
  const twitterDesc = truncate(
    `${name} took the No Foom November pledge and is helping defend the global foom counter.${chainNote} Sign yours too.`,
    300
  );
  const ogUrl = `https://nanofomo.bisks.net/p/${encodeURIComponent(name)}`;

  html = html
    .split(GENERIC_TITLE_TAG).join(esc(title))
    .split(GENERIC_META_DESC).join(esc(ogDesc))
    .split(GENERIC_OG_TITLE).join(esc(title))
    .split(GENERIC_OG_DESC).join(esc(ogDesc))
    .split(GENERIC_TWITTER_DESC).join(esc(twitterDesc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /p/<name> — the distinct, shareable, per-pledge URL. Every pledge gets
    // its own unfurl card, so a link-unfurl cache (Bluesky's included) can't
    // collapse every share into one generic preview.
    const m = url.pathname.match(/^\/p\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
