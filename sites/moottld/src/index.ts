// moottld Worker — moottld.bisks.net
//
// The whole census still runs client-side (public/index.html +
// public/lib/census.js do the real work, capped at ~4,000 follows/followers
// scanned per side). The one thing that needed a server: shared links. A
// plain static site serves the *same* index.html — same og:title/
// og:description — no matter whose handle is in the URL, so Bluesky's
// link-unfurl cache would show one generic card for every share, forever
// (same problem sites/didscope solved for /s/<handle>).
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side, runs a smaller version of the same follows ∩
// followers census (capped tighter than the client — this only has to
// produce a preview number, not the full report), and stamps personalized
// og:title/og:description/og:url onto the same page shell before handing it
// back. The client script then re-runs the full census itself when the page
// loads (see the /s/<handle> path handling at the bottom of index.html), so
// what's on screen always matches the live data — the server-rendered
// numbers are only ever seen by link-unfurl bots reading the HTML head.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PUB = "https://public.api.bsky.app/xrpc";

// Much tighter than the client's 40-page cap: this only has to produce a
// plausible preview number fast enough for an unfurl bot's timeout, not a
// complete report.
const SHARE_GRAPH_PAGES = 6; // ≤ ~600 follows + ~600 followers per side

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${PUB}/${method}${qs ? "?" + qs : ""}`, {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

async function graphAll(endpoint: string, key: string, did: string): Promise<any[]> {
  const out: any[] = [];
  let cursor = "";
  for (let p = 0; p < SHARE_GRAPH_PAGES; p++) {
    const params: Record<string, string> = { actor: did, limit: "100" };
    if (cursor) params.cursor = cursor;
    let d: any;
    try {
      d = await xrpc(endpoint, params);
    } catch {
      break;
    }
    for (const it of d[key] || []) out.push(it);
    cursor = d.cursor;
    if (!cursor) break;
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

// The static page's title/description/url are identical across every
// <title>/og:*/twitter:* tag, so one string-replace-all each is enough to
// personalize the whole head — no HTML parser needed. Matched as a full
// quoted attribute for the URL, not the bare string — the bare URL is also a
// prefix of the og:image URL ("…/og.png"), and a naive split/join corrupted
// that in an earlier site (see sites/didscope's GENERIC_OG_URL_ATTR note).
const GENERIC_TITLE = "moottld — census your mutuals' TLDs";
const GENERIC_DESC =
  "Turn your Bluesky mutuals into a census: unique TLDs and how many handles sit under each, segment counts, shortest/longest handles, average length. Enter any handle.";
const GENERIC_OG_URL_ATTR = 'content="https://moottld.bisks.net/"';

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

    const [follows, followers] = await Promise.all([
      graphAll("app.bsky.graph.getFollows", "follows", did),
      graphAll("app.bsky.graph.getFollowers", "followers", did),
    ]);
    const followerDids = new Set(followers.map((f: any) => f.did));
    const mutuals = follows.filter((f: any) => f.did !== did && followerDids.has(f.did));
    const validHandles = mutuals
      .map((m: any) => m.handle)
      .filter((h: string) => h && h !== "handle.invalid");
    const tlds = new Set(validHandles.map((h: string) => h.split(".").pop()));
    const avgLen = validHandles.length
      ? validHandles.reduce((a: number, h: string) => a + h.length, 0) / validHandles.length
      : 0;

    const title = `moottld: ${who}'s moot census`;
    const desc = truncate(
      `${mutuals.length} mutuals across ${tlds.size} unique TLD${tlds.size === 1 ? "" : "s"}, average handle length ${avgLen.toFixed(1)} chars. Enter any handle for the full breakdown.`,
      300,
    );
    const ogUrl = `https://moottld.bisks.net/s/${encodeURIComponent(handle)}`;

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
    // script will surface its own "couldn't census that" error and the /s/
    // path handling in index.html will still try the full client-side run.
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
    // unfurler can't collapse them into one cached generic card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
