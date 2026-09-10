// shadowcheck Worker — shadowcheck.bisks.net
//
// The check itself still runs client-side (public/index.html). The one thing
// that needs a server: shared links. A plain static site serves the *same*
// index.html — same og:title/og:description/og:image — no matter whose
// handle is in the URL, so a link-unfurl cache would show one generic card
// for every share (same gotcha as sites/didscope). Fix: /s/<handle> is a
// real, distinct URL per person. The Worker resolves the handle server-side,
// runs the same yes/no algorithm the client does, and stamps personalized
// og:title/og:description/og:url onto the same page shell before handing it
// back. Falls through to ASSETS for everything else (/, /og.png, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const FOLLOWERS_THRESHOLD = 10000;
const FOLLOWS_THRESHOLD = 2000;

// Kept as a server-side copy of the same regex in public/index.html — house
// style is duplication within one site, not a shared package across sites.
const FLAG_RE =
  /\p{Regional_Indicator}{2}|\u{1F3F3}\u{FE0F}?(?:\u{200D}\u{1F308})?|\u{1F3F4}(?:\u{200D}\u{2620}\u{FE0F})?|\u{1F3F4}\u{E0067}\u{E0062}(?:\u{E0065}\u{E006E}\u{E0067}|\u{E0073}\u{E0063}\u{E0074}|\u{E0077}\u{E006C}\u{E0073})\u{E007F}|\u{1F3C1}|\u{1F6A9}|\u{1F3F1}/u;

function hasFlagEmoji(s: string | undefined): boolean {
  return FLAG_RE.test(s || "");
}

interface Profile {
  handle: string;
  displayName?: string;
  description?: string;
  followersCount?: number;
  followsCount?: number;
}

// Bluesky's own moderation service — kept as a server-side copy of the same
// check in public/index.html (see that file's comment for why this one is
// real and the others aren't).
const MOD_SERVICE_DID = "did:plc:ar7c4by46qjdydhdevvrndac";

interface ModLabel { exp?: string }

async function fetchModLabels(did: string): Promise<ModLabel[]> {
  try {
    const res = await fetch(
      `https://mod.bsky.app/xrpc/com.atproto.label.queryLabels?uriPatterns=${encodeURIComponent(did)}`,
      { cf: { cacheTtl: 60 } as unknown as Record<string, unknown> },
    );
    if (!res.ok) return [];
    const j = (await res.json()) as { labels?: ModLabel[] };
    const now = Date.now();
    return (j.labels || []).filter((l) => !l.exp || new Date(l.exp).getTime() > now);
  } catch (_) {
    return [];
  }
}

function decide(profile: Profile, modLabels: ModLabel[]) {
  const followers = profile.followersCount || 0;
  const follows = profile.followsCount || 0;
  const countHit = followers > FOLLOWERS_THRESHOLD && follows >= FOLLOWS_THRESHOLD;
  const flagHit = hasFlagEmoji(profile.displayName) || hasFlagEmoji(profile.description);
  const modHit = modLabels.length > 0;
  return { followers, follows, countHit, flagHit, modHit, shadowbanned: countHit || flagHit || modHit };
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

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The static page's title/description phrase and og:url are identical across
// every <title>/og:*/twitter:* tag, so one string-replace-all each is enough
// to personalize the whole head — no HTML parser needed.
const GENERIC_TITLE = "shadowcheck — are you shadowbanned?";
const GENERIC_DESC =
  "Enter a Bluesky handle and find out if you're on the list. The criteria are classified. We don't publish how we know — we just know.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those into "…/s/<handle>og.png" too (the
// gotcha called out in sites/didscope/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://shadowcheck.bisks.net/"';

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
    const profile: Profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
    const modLabels = await fetchModLabels(did);
    const result = decide(profile, modLabels);

    const who = "@" + (profile.handle || handle);
    const verdict = result.shadowbanned ? "yes" : "no";
    const title = `shadowcheck: is ${who} shadowbanned? ${verdict}.`;
    const desc = result.shadowbanned
      ? "trips a classified criterion. we don't publish how we know."
      : "clears every classified criterion. we don't publish how we know.";
    const ogUrl = `https://shadowcheck.bisks.net/s/${encodeURIComponent(handle)}`;

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
    // script will surface its own "couldn't resolve that" error.
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
    // unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
