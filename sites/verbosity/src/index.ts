// verbosity Worker — verbosity.bisks.net
//
// The whole measurement still runs client-side (public/index.html +
// public/lib/stats.js do the real work). The one thing that needed a server:
// shared links. A plain static site serves the *same* index.html — same
// og:title/og:description/og:image — no matter whose handle is in the query
// string, so Bluesky's link-unfurl cache would show one generic card for
// every share, forever (same problem sites/didscope hit).
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side, computes a lighter version of the same stat (fewer
// pages, since this only needs to be right enough for the preview text — the
// client always recomputes the full, live numbers when the page loads), and
// stamps personalized og:title/og:description/og:url onto the same page
// shell before handing it back. Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const API = "https://public.api.bsky.app/xrpc/";
const CAP = 300;
const OG_MAX_PAGES = 6; // lighter cap than the client's 20 — just needs to be representative for the preview

async function xrpc(method: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(API + method + (qs ? "?" + qs : ""), {
    cf: { cacheTtl: 60 } as unknown as Record<string, unknown>,
  });
  if (!res.ok) throw new Error(`${method} ${res.status}`);
  return res.json();
}

function graphemeLength(text: string): number {
  if (!text) return 0;
  const seg = (Intl as any).Segmenter ? new (Intl as any).Segmenter("en", { granularity: "grapheme" }) : null;
  if (seg) return [...seg.segment(text)].length;
  return Array.from(text).length;
}

interface PostStat {
  length: number;
}

async function fetchStats(did: string): Promise<{ total: number; exact: number; avg: number }> {
  const lengths: number[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < OG_MAX_PAGES; page++) {
    const params: Record<string, string> = { actor: did, limit: "100" };
    if (cursor) params.cursor = cursor;
    const data = await xrpc("app.bsky.feed.getAuthorFeed", params);
    for (const item of data.feed || []) {
      if (item.reason) continue;
      const post = item.post;
      if (!post || !post.record || post.author?.did !== did) continue;
      const text: string = post.record.text || "";
      if (!text) continue;
      lengths.push(graphemeLength(text));
    }
    cursor = data.cursor;
    if (!cursor || !data.feed || !data.feed.length) break;
  }
  const exact = lengths.filter((l) => l === CAP).length;
  const avg = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  return { total: lengths.length, exact, avg };
}

function verdictLabel(avg: number, exactPct: number): string {
  if (exactPct >= 15) return "Chronic Maximizer";
  if (avg >= 220) return "The Sprawler";
  if (avg >= 130) return "Measured";
  if (avg >= 60) return "Clipped";
  return "Haiku Energy";
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

const GENERIC_TITLE = "verbosity — how much of the 300-character limit do you actually use?";
const GENERIC_DESC =
  "Enter a Bluesky handle. See how many of your posts hit exactly 300 characters, a length histogram, and whether you tend to run long or short.";
const GENERIC_OG_URL = "https://verbosity.bisks.net/";

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
    const stats = await fetchStats(did);
    if (!stats.total) throw new Error("no posts");

    const exactPct = (stats.exact / stats.total) * 100;
    const who = "@" + (profile.handle || handle);
    const verdict = verdictLabel(stats.avg, exactPct);

    const title = `verbosity: ${who} hits 300 exactly ${Math.round(exactPct * 10) / 10}% of the time`;
    const desc = truncate(
      `${stats.exact} of ${stats.total} recent posts maxed out the 300-character cap. Average length ${Math.round(stats.avg)} chars. ${verdict}.`,
      300
    );
    const ogUrl = `https://verbosity.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve/measure server-side (typo, deleted account, rate
    // limit, an account with zero posts) — still serve the live page so the
    // link isn't dead; the client script surfaces its own error if needed.
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
