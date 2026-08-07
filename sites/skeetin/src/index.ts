// skeetin Worker — skeetin.bisks.net
//
// Everything else runs client-side (public/app.js does the real work: fetch
// a Bluesky profile + feed from the public AppView, render it as a LinkedIn
// feed). The one thing that needed a server: a plain static site serves the
// *same* index.html — same og:title/og:description/og:image — no matter
// whose handle is in the query string, so a link-unfurl cache shows one
// generic card for every share, forever (same issue writen up for didscope,
// see notes/45-sharing-and-virality.md).
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side and stamps a personalized og:title/og:description
// /og:url onto the same page shell before handing it back, so every share
// gets its own cache entry. Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
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

// Kept as a local copy of public/app.js's job-title generator — server-side
// duplication within ONE site, not a shared package across sites. Same hash,
// same tables, so a share card's headline matches what the live page shows.
const TITLES = [
  "Senior Vibes Engineer", "Head of Posting", "Chief Skeeting Officer", "VP of Replies",
  "Director of Ratio Prevention", "Growth Lead, Timeline", "Principal Lurker",
  "Staff Reply-Guy", "Community Doomscroller", "Notifications Architect",
  "Head of Quote-Tweets", "Firehose Wrangler", "Feed Algorithm Whisperer",
  "Chief Vibes Officer", "Engagement Farmer", "Rate-Limit Survivor",
  "Senior Screenshot Analyst", "VP, Thirst Trap Relations", "Blocklist Curator",
];
const COMPANIES = [
  "Bluesky PBC", "Self-Employed", "Firehose Industries", "Stealth Startup",
  "Freelance", "AT Protocol Inc.", "Jetstream Logistics", "Rate Limit Ventures",
  "Timeline Capital", "Quote-Post Holdings", "Notifications LLC",
];
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function jobTitleFor(handle: string): string {
  const h = hashStr(handle);
  return TITLES[h % TITLES.length] + " at " + COMPANIES[(h >> 3) % COMPANIES.length];
}

const GENERIC_TITLE = "SkeetIn — Bluesky, but it's LinkedIn";
const GENERIC_DESC =
  "Bluesky, reskinned as LinkedIn. Enter a handle, watch their skeets become a professional feed.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those into "…/s/<handle>og.png" too (bit
// nothoney's version of this same pattern; see sites/sidenote).
const GENERIC_OG_URL_ATTR = 'content="https://skeetin.bisks.net/"';

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
    const name = profile.displayName || profile.handle || handle;
    const title = `${name} — ${jobTitleFor(profile.handle || handle)} | SkeetIn`;
    const desc = truncate(
      `${who} · ${(profile.followersCount ?? 0).toLocaleString("en-US")} connections · ${(profile.postsCount ?? 0).toLocaleString("en-US")} posts. ` +
        `View their Skeeting Career, reskinned as a professional feed.`,
      300
    );
    const ogUrl = `https://skeetin.bisks.net/s/${encodeURIComponent(handle)}`;

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
    // script will surface its own "couldn't find that" toast.
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<handle> — the distinct, shareable, per-person URL. Every combination
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
