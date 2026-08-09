// stillhere Worker — stillhere.bisks.net
//
// The reading runs client-side (public/index.html does the real work: it
// resolves a handle and reads real profile stats back as "proof you're
// here"). The one server-side job: shared links. A plain static site would
// serve the same generic og:title/description for every /s/<handle>, so
// Bluesky's link-unfurl cache would show one card for everyone who shares —
// same problem, same fix as sites/didscope's renderShare.
//
// /s/<handle> resolves the handle server-side, fetches the real profile, and
// stamps personalized og:title/og:description/og:url onto the same page
// shell before handing it back. Falls through to ASSETS for everything else.

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

function fmtDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
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

// Every <title>/og:*/twitter:* tag shares the same generic phrase, so one
// string-replace-all each personalizes the whole head — no HTML parser
// needed. The og:url match is a full quoted attribute, not the bare URL — the
// bare URL is also a prefix of the og:image URL ("…/og.png"), and a naive
// split/join on it would corrupt that too (the exact bug hit while copying
// this pattern into other sites; see sites/didscope/src/index.ts).
const GENERIC_TITLE = "stillhere — proof you're still here";
const GENERIC_DESC =
  "Real numbers pulled live from Bluesky's AppView: how long you've been here, how many posts you've kept, one thing you actually wrote. Not vibes — receipts.";
const GENERIC_OG_URL_ATTR = 'content="https://stillhere.bisks.net/"';

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
    const since = fmtDate(profile.createdAt);
    const bits = [`${profile.postsCount ?? 0} posts`, `${profile.followersCount ?? 0} followers`];
    if (since) bits.push(`here since ${since}`);

    const title = `stillhere: ${who} is real`;
    const desc = truncate(`${bits.join(" · ")}. Not vibes — receipts, pulled live from the record.`, 300);
    const ogUrl = `https://stillhere.bisks.net/s/${encodeURIComponent(handle)}`;

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
    // script surfaces its own "couldn't find that one" error.
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
