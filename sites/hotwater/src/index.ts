// hotwater Worker — hotwater.bisks.net
//
// The whole "study" still runs client-side (public/index.html does the real
// work). The one thing that needed a server: shared links. A plain static
// site serves the *same* index.html — same og:title/og:description/og:image —
// no matter whose handle is in the query string, so Bluesky's link-unfurl
// cache shows one generic card for every share, forever (same issue as
// sites/didscope, copied from there).
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side, builds the same findings summary the client does,
// and stamps personalized og:title/og:description/og:url onto the same page
// shell before handing it back. Falls through to ASSETS for everything else
// (/, /og.png, /fonts/*).

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

// Same hash-to-fake-serial the client uses, kept in sync so a shared link's
// og:title and the page's own on-load render agree.
function patentNumber(did: string): string {
  let h = 0;
  for (const c of did) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const serial = String(h % 9999999).padStart(7, "0");
  return `US-${serial}-OBVIOUS`;
}

// The static page's title/description phrase and og:url are identical across
// every <title>/og:*/twitter:* tag, so one string-replace-all each is enough
// to personalize the whole head — no HTML parser needed. See sites/didscope's
// src/index.ts for the gotcha on why GENERIC_OG_URL_ATTR must be matched as a
// full quoted attribute, not the bare URL (og:image is also "…/og.png", a
// naive bare-URL split/join corrupts that too).
const GENERIC_TITLE = "hotwater — groundbreaking research into things you already knew";
const GENERIC_DESC =
  "The Bureau of Redundant Discovery examines your atproto account and issues a formal Certificate of Discovery for facts you were already fully aware of.";
const GENERIC_OG_URL_ATTR = 'content="https://hotwater.bisks.net/"';

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
    const certNo = patentNumber(did);
    const followers = (profile.followersCount || 0).toLocaleString();
    const posts = (profile.postsCount || 0).toLocaleString();

    const title = `hotwater: ${certNo} — the Bureau confirms ${who} has an account`;
    const desc = truncate(
      `Peer-reviewed findings: ${followers} accounts follow ${who}, and ${posts} posts have been published. ` +
        `Novelty score: 0%. Filed under Prior Art (everyone, since forever).`,
      300
    );
    const ogUrl = `https://hotwater.bisks.net/s/${encodeURIComponent(handle)}`;

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
    // script will surface its own "study inconclusive" error.
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
