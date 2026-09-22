// moodring Worker — moodring.bisks.net
//
// The read itself runs client-side (public/app.js + public/lib/mood.js).
// The one thing that needs a server: shared links. A plain static site
// serves the same index.html — same og:title/og:description/og:url — no
// matter whose handle is in the query string, so a link-unfurl cache shows
// one generic card forever no matter who shares it (same problem
// sites/didscope and sites/vulnscope hit; see their src/index.ts).
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle, fetches the same public data the client would, re-derives the
// same mood reading, and stamps a personalized og:title/description/url onto
// the same page shell before serving it. Falls through to ASSETS for
// everything else.
//
// The scoring logic (lexicon, scoreValence/scoreIntensity, MOODS, moodFor)
// is a trimmed copy of public/lib/mood.js — kept in sync by hand, same as
// vulnscope's and didscope's own server/client duplication.

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

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

const POSITIVE = [
  "love", "loved", "loving", "great", "amazing", "good", "thanks", "thank you",
  "appreciate", "haha", "lol", "lmao", "lmaooo", "agree", "based", "fair",
  "valid", "yeah", "yes", "exactly", "beautiful", "awesome", "glad", "happy",
  "proud", "congrats", "congratulations", "nice", "sweet", "yay", "excited",
  "hyped", "stoked", "grateful", "blessed", "win", "winning",
];
const NEGATIVE = [
  "hate", "hated", "hating", "worst", "terrible", "awful", "bad", "stupid",
  "wrong", "disagree", "cringe", "garbage", "trash", "pathetic", "ridiculous",
  "shut up", "block", "unfollow", "gross", "ugh", "screw you", "screw this",
  "liar", "lying", "fake", "clown", "grow up", "unbelievable", "disgusting",
  "tired", "exhausted", "sad", "crying", "miss", "lonely", "anxious", "scared",
  "sorry", "worried", "stressed", "angry", "furious", "pissed",
];
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

function scoreValence(text: string): number {
  const lower = text.toLowerCase();
  let pos = 0, neg = 0;
  for (const w of POSITIVE) if (lower.includes(w)) pos++;
  for (const w of NEGATIVE) if (lower.includes(w)) neg++;
  return clamp((pos - neg) / 3, -1, 1);
}

function scoreIntensity(text: string): number {
  let score = 0;
  score += Math.min((text.match(/!/g) || []).length, 4) * 0.12;
  score += Math.min((text.match(/\?/g) || []).length, 4) * 0.04;
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 4) {
    score += ((letters.match(/[A-Z]/g) || []).length / letters.length) * 0.5;
  }
  score += Math.min((text.match(EMOJI_RE) || []).length, 5) * 0.08;
  if (/([a-z])\1{2,}/i.test(text)) score += 0.15;
  return clamp(score, 0, 1);
}

type Mood = { name: string; swatch: string; v: number; i: number; hue: number; sat?: number };

const MOODS: Mood[] = [
  { name: "serene", swatch: "pale blue", v: 0.55, i: 0.12, hue: 195 },
  { name: "content", swatch: "green", v: 0.35, i: 0.3, hue: 140 },
  { name: "elated", swatch: "hot pink", v: 0.75, i: 0.72, hue: 322 },
  { name: "smitten", swatch: "violet", v: 0.65, i: 0.42, hue: 280 },
  { name: "restless", swatch: "amber", v: 0.0, i: 0.78, hue: 44 },
  { name: "wistful", swatch: "indigo", v: -0.32, i: 0.18, hue: 236 },
  { name: "prickly", swatch: "burnt orange", v: -0.45, i: 0.55, hue: 22 },
  { name: "storming", swatch: "red", v: -0.75, i: 0.85, hue: 356 },
  { name: "numb", swatch: "gray", v: -0.05, i: 0.05, hue: 0, sat: 6 },
];

function moodFor(valence: number, intensity: number): { label: string; swatch: string } {
  let best: Mood | null = null;
  let bestDist = Infinity;
  for (const m of MOODS) {
    const dv = valence - m.v, di = intensity - m.i;
    const dist = Math.sqrt(dv * dv + di * di);
    if (dist < bestDist) {
      bestDist = dist;
      best = m;
    }
  }
  return { label: best!.name, swatch: best!.swatch };
}

async function readMood(did: string): Promise<{ label: string; swatch: string; postCount: number }> {
  const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "10", filter: "posts_with_replies" });
  const posts = (feed.feed || []).filter((it: any) => !it.reason).map((it: any) => it.post).filter(Boolean);
  if (!posts.length) return { label: "unreadable", swatch: "gray", postCount: 0 };

  let vSum = 0, iSum = 0;
  for (const p of posts) {
    const t: string = p.record?.text || "";
    vSum += scoreValence(t);
    iSum += scoreIntensity(t);
  }
  const { label, swatch } = moodFor(vSum / posts.length, iSum / posts.length);
  return { label, swatch, postCount: posts.length };
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

const GENERIC_TITLE = "moodring — a bluesky mood ring";
const GENERIC_DESC =
  "Enter a Bluesky handle. moodring reads the tone of their last 10 posts and replies and wraps their avatar in a color that shifts with it, like the novelty ring.";
// Matched as a full quoted attribute — the bare "https://moodring.bisks.net/"
// is also a prefix of the og:image URL ("…/og.png"), so a naive split/join
// on just the bare URL would corrupt that tag too. Same gotcha as
// didscope's/vulnscope's GENERIC_OG_URL_ATTR.
const GENERIC_OG_URL_ATTR = 'content="https://moodring.bisks.net/"';

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
    const { label, swatch, postCount } = await readMood(did);

    const who = "@" + (profile.handle || handle);
    const title = `moodring: ${who} is reading ${label}`;
    const confidence = postCount < 5 ? ` (only ${postCount} recent post(s) to read — low-confidence)` : "";
    const desc = truncate(`${label}, a ${swatch} on the ring${confidence}. moodring reads the tone of ${who}'s last 10 posts and replies.`, 300);
    const ogUrl = `https://moodring.bisks.net/s/${encodeURIComponent(handle)}`;

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
    // script surfaces its own "couldn't read that ring" error.
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
    // unfurler can't collapse every share into one cached generic card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
