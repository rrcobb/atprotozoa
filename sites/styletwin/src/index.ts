// styletwin Worker — styletwin.bisks.net
//
// The real analysis (both cee.wtf's baseline and any visitor's account) runs
// client-side — public/index.html + public/lib/style-engine.js do the actual
// measuring, same shape as sites/verbosity. The one thing that needs a
// server: shared links. A plain static site serves the *same* index.html —
// same og:title/og:description — no matter whose handle is in the query
// string, so Bluesky's link-unfurl cache would show one generic card for
// every share, forever (same problem sites/didscope and sites/verbosity hit).
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side, computes a *lighter* version of the comparison
// (fewer pages, five axes instead of nineteen — just needs to be right
// enough for the preview text) against cee's baked-in baseline
// (public/data/cee-profile.json, produced by build-profile.js), and stamps
// personalized og:title/og:description/og:url onto the same page shell
// before handing it back. Falls through to ASSETS for everything else.

import ceeProfile from "../public/data/cee-profile.json";

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const API = "https://public.api.bsky.app/xrpc/";
const OG_MAX_PAGES = 6; // lighter cap than the client's full history walk — just needs to be representative

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

interface QuickProfile {
  avgLength: number;
  lowercaseStartRatio: number;
  noPunctRatio: number;
  replyRatio: number;
  emojiPerPost: number;
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

// A lighter version of style-engine.js's analyze() — five axes instead of
// nineteen, just enough to compute a rough preview number server-side. The
// client always recomputes the full, live comparison on page load.
function quickAnalyze(posts: { text: string; isReply: boolean }[]): QuickProfile {
  const withText = posts.filter((p) => p.text && p.text.trim());
  const n = withText.length || 1;
  const lengths = withText.map((p) => graphemeLength(p.text));
  const avgLength = lengths.reduce((a, b) => a + b, 0) / n;

  let lowerStarts = 0;
  let letterStarts = 0;
  let noPunct = 0;
  let emojiCount = 0;
  for (const p of withText) {
    const m = p.text.match(/\p{L}/u);
    if (m) {
      letterStarts++;
      if (m[0] === m[0].toLowerCase() && m[0] !== m[0].toUpperCase()) lowerStarts++;
    }
    const t = p.text.trim();
    const last = t[t.length - 1] || "";
    if (/\p{L}|\p{N}/u.test(last)) noPunct++;
    emojiCount += (p.text.match(EMOJI_RE) || []).length;
  }
  const replyCount = withText.filter((p) => p.isReply).length;

  return {
    avgLength,
    lowercaseStartRatio: letterStarts ? lowerStarts / letterStarts : 0,
    noPunctRatio: noPunct / n,
    replyRatio: replyCount / n,
    emojiPerPost: emojiCount / n,
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Same five axes, scored against cee's baked baseline (public/data/cee-profile.json).
function quickSimilarity(you: QuickProfile): number {
  const cee = ceeProfile as any;
  const axes: [number, number, number][] = [
    [you.avgLength / 300, cee.raw.avgLength / 300, 1.1],
    [you.lowercaseStartRatio, cee.raw.lowercaseStartRatio, 1.1],
    [you.noPunctRatio, cee.terminalPct.none / 100, 1],
    [you.replyRatio, cee.raw.replyRatio, 0.8],
    [clamp01(you.emojiPerPost / 1.2), clamp01(cee.raw.emojiPerPost / 1.2), 0.9],
  ];
  const totalWeight = axes.reduce((a, [, , w]) => a + w, 0);
  const score = axes.reduce((a, [x, y, w]) => a + clamp01(1 - Math.abs(clamp01(x) - clamp01(y))) * w, 0);
  return (score / totalWeight) * 100;
}

function verdictFor(overall: number): string {
  if (overall >= 85) return "Basically the Same Person";
  if (overall >= 70) return "Style Siblings";
  if (overall >= 55) return "Kindred-ish";
  if (overall >= 35) return "Parallel Timelines";
  return "Total Opposites";
}

async function fetchQuickPosts(did: string): Promise<{ text: string; isReply: boolean }[]> {
  const posts: { text: string; isReply: boolean }[] = [];
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
      posts.push({ text, isReply: !!post.record.reply });
    }
    cursor = data.cursor;
    if (!cursor || !data.feed || !data.feed.length) break;
  }
  return posts;
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

const GENERIC_TITLE = "styletwin — how close is your posting style to cee.wtf's?";
const GENERIC_DESC =
  "cee.wtf's own writing style, broken into heuristics — sentence length, punctuation, capitalization, emoji, posting rhythm — then compare your Bluesky account against it.";
const GENERIC_OG_URL = "https://styletwin.bisks.net/";

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
    const posts = await fetchQuickPosts(did);
    if (!posts.length) throw new Error("no posts");

    const quick = quickAnalyze(posts);
    const overall = quickSimilarity(quick);
    const who = "@" + (profile.handle || handle);
    const verdict = verdictFor(overall);

    const title = `styletwin: ${who} is ${Math.round(overall)}% ${(ceeProfile as any).handle}`;
    const desc = truncate(`${verdict}. ${Math.round(overall)}% style match against cee.wtf across posting habits, punctuation, and grammar quirks.`, 300);
    const ogUrl = `https://styletwin.bisks.net/s/${encodeURIComponent(handle)}`;

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
