// quantizeme Worker — quantizeme.bisks.net
//
// The scan itself runs client-side (public/index.html + public/lib/failuremodes.js
// do the real work: download the account's whole repo CAR, grep for failure
// modes, map the score onto a joke LLM size). The one thing that needed a
// server: shared links. A plain static site serves the *same* index.html —
// same og:title/og:description/og:image — no matter whose handle is in the
// URL, so a link-unfurl cache (Bluesky's included) shows one generic card for
// every share, forever.
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side, runs a small hand-duplicated version of the same
// heuristic public/lib/failuremodes.js runs client-side (just enough for a
// one-line verdict, not the full sins list), and stamps personalized
// og:title/og:description/og:url onto the same page shell before handing it
// back — same shape as sites/epistemics's and sites/llmstance's /s/<handle>.
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

// ---- reduced heuristic (server side) --------------------------------------
// Same lexicons/logic as public/lib/failuremodes.js, trimmed to just what a
// one-line OG blurb needs: a total score, a top offense, and the tier it
// lands in — no quotes, no docket.

const POSITIVE = ["love", "loved", "best", "great", "amazing", "good", "favorite", "favourite", "underrated", "genius", "perfect", "brilliant", "correct", "agree", "based", "fantastic", "excellent"];
const NEGATIVE = ["hate", "hated", "worst", "terrible", "awful", "bad", "overrated", "stupid", "wrong", "disagree", "cringe", "garbage", "trash", "horrible", "ridiculous"];
const ABSOLUTE_POS = ["always", "everyone", "everybody"];
const ABSOLUTE_NEG = ["never", "no one", "nobody"];
const HEDGES = ["kind of", "sort of", "i guess", "maybe", "probably", "i think", "i feel like", "not sure", "possibly", "perhaps", "i mean", "idk", "i dunno"];
const CERTAINTY = ["obviously", "clearly", "literally", "definitely", "undeniably", "without question", "everyone knows", "factually", "objectively"];
const WHATABOUT = ["what about", "but what about", "no one talks about", "nobody talks about", "meanwhile nobody mentions"];
const STRAWMAN = ["so you're saying", "so youre saying", "so basically you're saying", "sounds like you think", "so your argument is"];
const DOOM = ["we're doomed", "were doomed", "it's over", "its over", "beyond saving", "too late to fix", "nothing matters anymore", "society is collapsing", "world is ending", "point of no return"];
const STOPWORDS = new Set("the a an and or but if then else when while for to of in on at by with from as is are was were be been being this that these those it its just so very really quite about into over under again here there all any both each few more most other some such only own same than too can will would could should shall may might must have has had do does did not no yes what which who whom because before after above below between out up down off own now also like get got one two three still even much many well way lot lots things thing stuff people".split(" "));

interface Claim {
  text: string;
  polarity: "pos" | "neg" | null;
  absolute: "always" | "never" | null;
  hedge: boolean;
  certainty: boolean;
  whatabout: boolean;
  strawman: boolean;
  doom: boolean;
  topics: string[];
}

function splitSentences(text: string): string[] {
  return (text || "")
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

function containsAny(text: string, list: string[]): boolean {
  return list.some((w) => text.includes(w));
}

function topicsFor(sentence: string): string[] {
  const hashtags = (sentence.match(/#\w+/g) || []).map((h) => h.toLowerCase());
  const words = sentence
    .toLowerCase()
    .replace(/[^a-z0-9#'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const marker = new Set([...POSITIVE, ...NEGATIVE, ...ABSOLUTE_POS, ...ABSOLUTE_NEG]);
  const content = words.filter((w) => w.length >= 5 && !STOPWORDS.has(w) && !marker.has(w) && !/^\d+$/.test(w));
  return [...new Set([...hashtags, ...content])].slice(0, 8);
}

function extractClaims(posts: { text: string }[]): Claim[] {
  const claims: Claim[] = [];
  for (const post of posts) {
    for (const sentence of splitSentences(post.text)) {
      const lower = sentence.toLowerCase();
      const pos = containsAny(lower, POSITIVE);
      const neg = containsAny(lower, NEGATIVE);
      const absPos = containsAny(lower, ABSOLUTE_POS);
      const absNeg = containsAny(lower, ABSOLUTE_NEG);
      const hedge = containsAny(lower, HEDGES);
      const certainty = containsAny(lower, CERTAINTY);
      const whatabout = containsAny(lower, WHATABOUT);
      const strawman = containsAny(lower, STRAWMAN);
      const doom = containsAny(lower, DOOM);
      if (!pos && !neg && !absPos && !absNeg && !hedge && !certainty && !whatabout && !strawman && !doom) continue;
      claims.push({
        text: sentence,
        polarity: pos && !neg ? "pos" : neg && !pos ? "neg" : null,
        absolute: absPos ? "always" : absNeg ? "never" : null,
        hedge,
        certainty,
        whatabout,
        strawman,
        doom,
        topics: topicsFor(lower),
      });
    }
  }
  return claims;
}

function scoreClaims(claims: Claim[]): { score: number; top: string | null } {
  const byTopic = new Map<string, number[]>();
  claims.forEach((c, i) => {
    for (const t of c.topics) {
      if (!byTopic.has(t)) byTopic.set(t, []);
      byTopic.get(t)!.push(i);
    }
  });

  let reversals = 0, whiplash = 0;
  for (const [, idxs] of byTopic) {
    if (idxs.length < 2) continue;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const c1 = claims[idxs[a]], c2 = claims[idxs[b]];
        if (c1.polarity && c2.polarity && c1.polarity !== c2.polarity) reversals++;
        else if (c1.absolute && c2.absolute && c1.absolute !== c2.absolute) whiplash++;
      }
    }
  }

  const hedgeCount = claims.filter((c) => c.hedge).length;
  const certaintyCount = claims.filter((c) => c.certainty).length;
  const whataboutCount = claims.filter((c) => c.whatabout).length;
  const strawmanCount = claims.filter((c) => c.strawman).length;
  const doomCount = claims.filter((c) => c.doom).length;

  const hedgeFog = claims.length >= 6 && hedgeCount / claims.length >= 0.22 && hedgeCount >= 3 ? hedgeCount : 0;
  const mainCharacter = certaintyCount >= 4 ? certaintyCount : 0;
  const whatabout = whataboutCount >= 2 ? whataboutCount : 0;
  const strawman = strawmanCount >= 2 ? strawmanCount : 0;
  const doom = doomCount >= 2 ? doomCount : 0;

  const weighted: [string, number][] = [
    ["Reversal", reversals * 3],
    ["Certainty Whiplash", whiplash * 2],
    ["Hedge Fog", hedgeFog * 1],
    ["Main Character Certainty", mainCharacter * 1],
    ["Whataboutism", whatabout * 2],
    ["Strawman", strawman * 2],
    ["Doom Loop", doom * 1],
  ];
  const score = weighted.reduce((sum, [, v]) => sum + v, 0);
  const top = weighted.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  return { score, top };
}

// Same tiers as public/lib/failuremodes.js's TIERS table.
const TIERS: { max: number; gb: string; spec: string; blurb: string }[] = [
  { max: 0, gb: "0 GB", spec: "no model — nothing measurable", blurb: "clean scan. either remarkably consistent, or remarkably quiet." },
  { max: 3, gb: "~0.7 GB", spec: "1.1B params, Q4_K_M quant", blurb: "small hiccups, nothing structural." },
  { max: 8, gb: "~4.1 GB", spec: "7B params, Q4_K_M quant", blurb: "a real pattern, not a fluke." },
  { max: 15, gb: "~19 GB", spec: "34B params, Q4_K_M quant", blurb: "confident, wrong, and confident about being wrong." },
  { max: 25, gb: "~40 GB", spec: "70B params, Q4_K_M quant", blurb: "big enough to sound authoritative while contradicting itself." },
  { max: 40, gb: "~140 GB", spec: "70B params, full fp16", blurb: "the failure modes didn't shrink, the receipts just got heavier." },
  { max: Infinity, gb: "~230 GB+", spec: "405B-class, quantized", blurb: "frontier-scale inconsistency." },
];

function tierFor(score: number) {
  return TIERS.find((t) => score <= t.max)!;
}

async function scanForVerdict(did: string): Promise<{ score: number; top: string | null }> {
  const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "100", filter: "posts_with_replies" });
  const posts = (feed.feed || [])
    .filter((f: any) => !f.reason)
    .map((f: any) => ({ text: f.post?.record?.text }))
    .filter((p: any) => typeof p.text === "string" && p.text.trim().length > 0);
  const claims = extractClaims(posts);
  return scoreClaims(claims);
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

const GENERIC_TITLE = "quantizeme — what size of LLM thinks like you?";
const GENERIC_DESC =
  "Enter a Bluesky handle. quantizeme downloads their entire post history and greps for the failure modes language models have — contradictions, hedge fog, unearned certainty, whataboutism, doomcasting, broken-record repeats — then tells you the size and quantization of LLM that would embarrass itself the same way.";
const GENERIC_OG_URL = "https://quantizeme.bisks.net/";

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
    const { score, top } = await scanForVerdict(did);
    const tier = tierFor(score);

    const title = score === 0
      ? `quantizeme: ${who}'s thinking runs clean — 0 GB`
      : `quantizeme: ${who}'s thinking is ${tier.gb} (${tier.spec})`;
    let desc = tier.blurb;
    if (top) desc = `top failure mode: ${top}. ${desc}`;
    desc = truncate(desc, 300);
    const ogUrl = `https://quantizeme.bisks.net/s/${encodeURIComponent(handle)}`;

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

    // /s/<handle> — the distinct, shareable, per-person URL.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
