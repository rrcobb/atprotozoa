// coliseum Worker — coliseum.bisks.net
//
// The viewer itself runs entirely client-side (public/index.html + app.js +
// lib/atproto.js) against the public AppView. The one thing that needs a
// server: shared links. A plain static site serves the same index.html —
// same og:title/og:description/og:url — no matter which thread is in the
// query string, so a link-unfurl cache would show one generic card for
// every brawl shared, forever (same problem didscope hit; see its
// src/index.ts and notes/45-sharing-and-virality.md). Fix: /s/<encoded
// at-uri> is a real, distinct URL per thread. The Worker re-fetches the
// thread server-side, works out the same matchup the client would, and
// stamps a personalized og:title/og:description/og:url onto the same page
// shell before handing it back.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PUB = "https://public.api.bsky.app/xrpc";

async function jget(url: string): Promise<any> {
  const r = await fetch(url, { headers: { accept: "application/json" }, cf: { cacheTtl: 60 } as any });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Trimmed server-side copy of public/lib/atproto.js's flatten + pick-gladiators
// logic — just enough to build the OG title/description text. Duplication
// within one site, not a shared package (house style).
function flatten(thread: any) {
  const root = thread.post;
  const topLevel = (thread.replies || []).filter((r: any) => r?.$type === "app.bsky.feed.defs#threadViewPost");
  let count = 0;
  const scoreOf = (p: any) => (p.likeCount || 0) + (p.repostCount || 0) + (p.replyCount || 0) * 2;
  function walk(view: any): number {
    let n = 1;
    for (const kid of view.replies || []) {
      if (kid?.$type === "app.bsky.feed.defs#threadViewPost") n += walk(kid);
    }
    return n;
  }
  for (const view of topLevel) count += walk(view);
  const sorted = [...topLevel].sort((x, y) => scoreOf(y.post) - scoreOf(x.post));
  return { root, gladiatorA: sorted[0]?.post || null, gladiatorB: sorted[1]?.post || null, count };
}

function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s || "";
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "coliseum — everyone, fighting it out";
const GENERIC_DESC =
  "Paste a Bluesky thread. The two loudest replies fight on the floor; the rest of the thread fills the stands, sorted by who they're cheering for.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is also
// a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (the gotcha didscope hit first).
const GENERIC_OG_URL_ATTR = 'content="https://coliseum.bisks.net/"';

async function renderShare(env: Env, request: Request, rawUri: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const uri = decodeURIComponent(rawUri);
  if (!uri.startsWith("at://")) return new Response(html, { headers: base.headers });

  try {
    const r = await jget(`${PUB}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=1000&parentHeight=0`);
    if (r.thread?.$type !== "app.bsky.feed.defs#threadViewPost") throw new Error("gone");
    const { root, gladiatorA, gladiatorB, count } = flatten(r.thread);

    let title: string;
    if (gladiatorA && gladiatorB) {
      title = `coliseum: @${gladiatorA.author.handle} vs @${gladiatorB.author.handle} under @${root.author.handle}'s post`;
    } else if (gladiatorA) {
      title = `coliseum: @${gladiatorA.author.handle} alone on the floor under @${root.author.handle}'s post`;
    } else {
      title = `coliseum: @${root.author.handle}'s post, empty floor`;
    }
    const rootText = (root.record?.text || "").replace(/\s+/g, " ").trim();
    const desc = truncate(`${count} in the stands. ${truncate(rootText, 140)}`.trim(), 300);
    const ogUrl = `https://coliseum.bisks.net/s/${encodeURIComponent(uri)}`;

    html = html
      .split(GENERIC_TITLE)
      .join(esc(title))
      .split(GENERIC_DESC)
      .join(esc(desc))
      .split(GENERIC_OG_URL_ATTR)
      .join(`content="${ogUrl}"`);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't refetch server-side (deleted post, rate limit, bad uri) — still
    // serve the live page so the link isn't dead; the client script surfaces
    // its own error once it tries to load the thread.
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
