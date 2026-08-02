// cursekind Worker — cursekind.bisks.net
//
// The real work happens client-side (public/index.html): enter a handle, it
// fetches the account's latest 10 own posts from the public AppView, and
// runs each one through transformers.js — a real DistilBERT sentiment model
// (Xenova/distilbert-base-uncased-finetuned-sst-2-english), loaded from a
// CDN and run in-browser via WASM/ONNX. No server inference; the model never
// touches this Worker. Each post lands on a gauge running from "<Name>CURSE"
// to "<Name>KIND", where <Name> is the queried account's own first name —
// asked for by shimmermathlabs.com, riffing on @norvid-studies.bsky.social's
// "grace curses".
//
// The one server job: /s/<handle> is a real per-handle URL so a shared link
// gets its own og:title/description instead of one generic card for every
// account — same shape as sites/llmstance's renderShare. Running the actual
// transformer model synchronously per share-request isn't practical here, so
// this route approximates with a tiny AFINN-style word-list scorer, good
// enough for a one-line OG blurb, not shown anywhere as the real result.
//
// Duplicated, not imported: copy-don't-abstract applies within one site too.

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

// ---- reduced sentiment scorer (server side) --------------------------------
// A small hand-picked word list, just polar enough to guess a one-line OG
// blurb. The real per-post gauge on the live page comes from an actual model
// (public/lib/sentiment.js's DistilBERT pipeline) — this is not that.

const KIND_WORDS = [
  "love", "loved", "loving", "happy", "great", "amazing", "wonderful",
  "grateful", "thankful", "excited", "beautiful", "kind", "sweet", "good",
  "best", "awesome", "fantastic", "delight", "delighted", "joy", "joyful",
  "proud", "warm", "hope", "hopeful", "blessed", "yay", "congrats",
  "congratulations", "excellent", "brilliant", "perfect", "adorable",
  "lovely", "glad", "fun", "cute", "win", "won", "success", "thanks",
  "welcome", "cheers", "nice",
];

const CURSE_WORDS = [
  "hate", "hated", "angry", "furious", "terrible", "awful", "worst",
  "sad", "sadly", "cry", "crying", "grief", "miserable", "horrible",
  "disgusting", "gross", "ugh", "sucks", "sucked", "annoying", "annoyed",
  "frustrated", "frustrating", "exhausted", "tired", "sick", "hurts",
  "hurt", "painful", "pain", "broken", "fail", "failed", "failure",
  "sorry", "regret", "afraid", "scared", "anxious", "anxiety", "stress",
  "stressed", "cursed", "damn", "hell", "lonely", "lost", "dying", "dead",
  "kill", "die",
];

function scoreText(text: string): number {
  const lower = " " + (text || "").toLowerCase().replace(/[^\w' ]+/g, " ") + " ";
  let kind = 0, curse = 0;
  for (const w of KIND_WORDS) if (lower.includes(" " + w + " ")) kind++;
  for (const w of CURSE_WORDS) if (lower.includes(" " + w + " ")) curse++;
  const total = kind + curse;
  if (!total) return 0;
  return (kind - curse) / total; // -1 (curse) .. +1 (kind)
}

async function scoreAccount(did: string): Promise<{ avg: number; postCount: number } | null> {
  const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "30", filter: "posts_no_replies" });
  const posts = (feed.feed || [])
    .filter((f: any) => !f.reason)
    .map((f: any) => f.post?.record?.text)
    .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
    .slice(0, 10);
  if (!posts.length) return null;
  const scores = posts.map(scoreText);
  const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
  return { avg, postCount: posts.length };
}

function labelFor(avg: number): string {
  if (avg >= 0.5) return "reads pure kind.";
  if (avg >= 0.15) return "leans kind.";
  if (avg > -0.15) return "dead even — a wash of both.";
  if (avg > -0.5) return "leans curse.";
  return "reads pure curse.";
}

function firstName(displayName: string | undefined, handle: string): string {
  const fromDisplay = (displayName || "").trim().split(/\s+/)[0] || "";
  const cleaned = (fromDisplay || handle.split(".")[0] || "").replace(/[^a-zA-Z]/g, "");
  const name = cleaned || "THEIR";
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw || "").trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

const GENERIC_TITLE = "cursekind — where does this account fall, CURSE to KIND?";
const GENERIC_DESC =
  "Enter a Bluesky handle. cursekind pulls their latest 10 posts and runs each through a real in-browser sentiment model, plotted on a gauge from their own name's CURSE to their own name's KIND.";
const GENERIC_OG_URL = "https://cursekind.bisks.net/";

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    let did: string;
    if (handle.startsWith("did:")) did = handle;
    else did = (await xrpc("com.atproto.identity.resolveHandle", { handle })).did;

    const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
    const who = "@" + (profile.handle || handle);
    const name = firstName(profile.displayName, profile.handle || handle);

    const result = await scoreAccount(did);
    if (!result) {
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    }

    const verdict = labelFor(result.avg);
    const title = `cursekind: ${who} reads ${verdict.replace(/\.$/, "")} (${name}CURSE…${name}KIND)`;
    const desc = truncate(`Their last ${result.postCount} posts, scored ${name}CURSE to ${name}KIND: ${verdict}`, 300);
    const ogUrl = `https://cursekind.bisks.net/s/${encodeURIComponent(handle)}`;

    html = html
      .split(GENERIC_TITLE).join(esc(title))
      .split(GENERIC_DESC).join(esc(desc))
      .split(GENERIC_OG_URL).join(ogUrl);

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  } catch (_) {
    // Couldn't resolve/read server-side (typo, deleted account, rate limit) —
    // still serve the live page; the client script surfaces its own error.
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
    // unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
