// activitygrid Worker — mounted at bisks.net/activitygrid/ (see
// notes/40-new-site-playbook.md).
//
// The actual heatmap is entirely client-side (public/index.html walks the
// account's own PDS repo via com.atproto.repo.listRecords — falling back to
// getAuthorFeed if that PDS lookup fails — and draws the grid to a
// <canvas>). The one thing that needed a server: shared results. A plain
// static site serves the *same*
// index.html — same og:title/description — for every handle, so every
// "share your grid" link would unfurl as one identical generic card forever
// (same problem sites/didscope and sites/windmill already hit, see
// notes/45-sharing-and-virality.md).
//
// Fix: /activitygrid/s/<handle> is a distinct URL per person. The Worker
// resolves the handle, walks a few pages of getAuthorFeed (capped smaller
// than the client's full-year walk — this only has to produce OG text, not
// the pixel-perfect grid) and stamps a personalized og:title/description/url
// onto the same static shell before serving it.
//
// Every request first gets its "/activitygrid" mount prefix stripped; what's
// left is matched against /s/<handle> and otherwise falls through to ASSETS
// for everything else (/, /og.png, /lib/*). ASSETS.fetch always sees the
// un-prefixed path — the assets directory has no idea it isn't living at the
// domain root.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/activitygrid";
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

// A capped, server-side re-walk of the same pagination the client does in
// public/index.html (computeHeatmap) — kept small (6 pages / ~600 items)
// since this only needs to produce a rough OG description, not the exact
// grid a visitor sees once the page loads and does the full walk itself.
async function summarize(did: string): Promise<{ total: number; days: number; streak: number; busiest: number }> {
  const dayCounts = new Map<string, number>();
  let cursor: string | undefined;
  const cutoff = Date.now() - 371 * 86400000;

  for (let page = 0; page < 6; page++) {
    const feed = await xrpc("app.bsky.feed.getAuthorFeed", {
      actor: did,
      limit: "100",
      filter: "posts_with_replies",
      ...(cursor ? { cursor } : {}),
    });
    let stop = false;
    for (const item of feed.feed || []) {
      if (item.reason) continue; // skip reposts, only count authored content
      const createdAt = item.post?.record?.createdAt || item.post?.indexedAt;
      if (!createdAt) continue;
      const t = Date.parse(createdAt);
      if (Number.isNaN(t) || t < cutoff) { stop = true; continue; }
      const date = new Date(t).toISOString().slice(0, 10);
      dayCounts.set(date, (dayCounts.get(date) || 0) + 1);
    }
    cursor = feed.cursor;
    if (!cursor || stop) break;
  }

  const total = [...dayCounts.values()].reduce((a, b) => a + b, 0);
  const busiest = Math.max(0, ...dayCounts.values());

  let streak = 0;
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  for (;;) {
    const key = d.toISOString().slice(0, 10);
    if (!dayCounts.get(key)) break;
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }

  return { total, days: dayCounts.size, streak, busiest };
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

// Every <title>/og:*/twitter:* tag in public/index.html shares these exact
// strings, so one split/join each personalizes the whole head — no HTML
// parser needed.
const GENERIC_TITLE = "activitygrid — a GitHub-style contribution graph for Bluesky";
const GENERIC_DESC =
  "Enter a Bluesky handle, get a year of posting activity as a green contribution heat map — just like GitHub, but for bisks.";
const GENERIC_OG_URL = "https://activitygrid.bisks.net/";

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  // ASSETS.fetch expects an un-prefixed path (the assets directory has no
  // idea it isn't living at the domain root) — "/", not PREFIX + "/". See
  // notes/20-deploy.md's stale-hostname section for the same class of bug.
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
    const { total, days, streak, busiest } = await summarize(did);

    const who = "@" + (profile.handle || handle);
    const title = `activitygrid: ${who}'s last year — ${total} bisk${total === 1 ? "" : "s"}`;
    const bits = [`${days} active day${days === 1 ? "" : "s"} in the last year`];
    if (streak > 0) bits.push(`${streak}-day current streak`);
    if (busiest > 0) bits.push(`busiest day: ${busiest} bisks`);
    const desc = truncate(bits.join(" · ") + ". See the full grid.", 300);
    const ogUrl = `https://activitygrid.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

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

    // This site was called "skeetgrid" until 2026-07-29 (renamed in 416c00a).
    // Links to the old name were shared before the rename, and until now they
    // kept resolving — to the ORPHANED pre-rename Worker, which still held
    // bisks.net/skeetgrid routes and served three-day-old frozen code that no
    // fix since has reached. Claim the old paths and forward them here, keeping
    // any sub-path so a shared /skeetgrid/s/<handle> still lands on that
    // person's grid.
    const LEGACY = "/skeetgrid";
    if (url.pathname === LEGACY || url.pathname.startsWith(LEGACY + "/")) {
      const rest = url.pathname.slice(LEGACY.length);
      url.hostname = "activitygrid.bisks.net";
      url.pathname = rest || "/";
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    const path = url.pathname.startsWith(PREFIX + "/") ? url.pathname.slice(PREFIX.length) : url.pathname;

    // /s/<handle> — the distinct, shareable, per-person URL. Every handle
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them into one cached generic card.
    const m = path.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    const assetUrl = new URL(request.url);
    assetUrl.pathname = path;
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
};
