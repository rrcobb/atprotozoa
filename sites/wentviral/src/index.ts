// wentviral Worker — mounted at bisks.net/wentviral (see
// notes/40-new-site-playbook.md).
//
// The whole sim is client-side (public/app.js runs it). The one thing that
// needed a server: shared permalinks. A plain static site would serve the
// *same* index.html — same og:title/og:description — no matter what post is
// encoded in the URL, so every "look at my post going viral" link would
// unfurl as one identical generic card forever (same problem sites/didscope
// and sites/windmill hit, see notes/45-sharing-and-virality.md).
//
// Fix: /wentviral/p/<code> decodes the same base64url JSON payload the
// client encodes (public/app.js encodePost/decodePost — {t: text, c:
// createdAt ms, n: display name}) and stamps a personalized og:title/
// og:description onto the same static shell before serving it. The
// like/repost/quote/reply counts in that description are computed with the
// same deterministic curve public/app.js uses (countAt/computeMultiplier,
// copied here rather than shared — see notes/00-vision.md, "copy, don't
// abstract") evaluated at the *request's* wall-clock time, so the preview
// text roughly tracks what a visitor would actually see.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/wentviral";
const FAKE_TLD = ".viral.fake";

// ---------- seeded PRNG (mirror of public/app.js) ----------

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(min + rng() * (max - min + 1));
}

const BAIT_WORDS = [
  "bluesky", "twitter", "elon", " ai ", "algorithm", "nft", "crypto",
  "cursed", "unhinged", "hot take", "discourse", "ratio", "main character",
  "delete this", "touch grass", "cheugy", "opinion", "controversial",
];

function computeMultiplier(text: string): number {
  let m = 1;
  const emojiMatches = text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
  m += Math.min(1, (emojiMatches ? emojiMatches.length : 0) * 0.15);
  if (text.length > 180) m += 0.5;
  const letters = text.replace(/[^a-zA-Z]/g, "");
  const upper = text.replace(/[^A-Z]/g, "");
  if (letters.length > 10 && upper.length / letters.length > 0.4) m += 0.4;
  const lower = " " + text.toLowerCase() + " ";
  for (const w of BAIT_WORDS) if (lower.includes(w)) m += 0.25;
  const rng = mulberry32(hashSeed("spice:" + text));
  m += rng() * 0.6;
  return Math.max(0.5, Math.min(3.5, m));
}

function countAt(target: number, tau: number, t: number): number {
  if (t <= 0) return 0;
  const base = target * (1 - Math.exp(-t / tau));
  const trickle = Math.floor(t / 600) * Math.max(1, Math.round(target * 0.003));
  return Math.floor(base + trickle);
}

interface Payload {
  t: string;
  c: number;
  n: string;
}

function decodePost(code: string): Payload | null {
  try {
    let b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = decodeURIComponent(escape(atob(b64)));
    const o = JSON.parse(json);
    if (typeof o.t !== "string" || typeof o.c !== "number" || !o.t.trim()) return null;
    return { t: o.t, c: o.c, n: typeof o.n === "string" ? o.n : "" };
  } catch (_) {
    return null;
  }
}

function slugify(s: string): string {
  const slug = String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20);
  return slug || "you";
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncate(s: string, n: number): string {
  s = s.trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

const GENERIC_TITLE = "wentviral — write a post, watch it blow up";
const GENERIC_DESC =
  "A fake Bluesky compose box. Write whatever you want, hit post, and watch a simulated pile-on of replies, likes, reposts, and quote posts grow over time. Nothing is really posted.";
const GENERIC_OG_URL = "https://bisks.net/wentviral/";

async function renderPost(env: Env, request: Request, code: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  const html = await base.text();

  const payload = decodePost(code);
  if (!payload) return new Response(html, { headers: base.headers });

  const seed = hashSeed(payload.c + "|" + payload.t);
  const rng = mulberry32(seed);
  const mult = computeMultiplier(payload.t);
  const targets = {
    likes: Math.round(randInt(rng, 700, 5000) * mult),
    reposts: Math.round(randInt(rng, 150, 900) * mult),
    quotes: Math.round(randInt(rng, 20, 220) * mult),
    replies: Math.round(randInt(rng, 30, 420) * mult),
  };
  const t = Math.max(0, Math.floor((Date.now() - payload.c) / 1000));
  // Mirrors the tau in public/app.js buildSim() — keep in sync.
  const likes = countAt(targets.likes, 240, t);
  const reposts = countAt(targets.reposts, 420, t);
  const quotes = countAt(targets.quotes, 600, t);
  const replies = countAt(targets.replies, 300, t);

  const name = payload.n.trim() || "You";
  const handle = slugify(name) + FAKE_TLD;
  const title = `"${truncate(payload.t, 60)}" — @${handle} on wentviral`;
  const desc = `${fmt(likes)} likes, ${fmt(reposts)} reposts, ${fmt(quotes)} quotes, ${fmt(replies)} replies and climbing. It's fake — nobody posted this, watch it happen anyway.`;
  const ogUrl = `https://bisks.net/wentviral/p/${encodeURIComponent(code)}`;

  const stamped = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(stamped, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.slice(PREFIX.length) || "/";

    const m = path.match(/^\/p\/([^/]+)\/?$/);
    if (m) return renderPost(env, request, m[1]);

    // /me and /notifications are pure client-side routes (the local
    // post-history "profile" view and the derived notifications feed in
    // public/app.js) with no matching static file — fall back to the same
    // shell as "/" rather than letting ASSETS 404 them.
    if (path === "/me" || path === "/me/" || path === "/notifications" || path === "/notifications/") {
      return env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
    }

    const assetUrl = new URL(request.url);
    assetUrl.pathname = path;
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
};
