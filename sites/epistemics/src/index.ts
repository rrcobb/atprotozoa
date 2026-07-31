// epistemics Worker — mounted at bisks.net/epistemics/ (see
// notes/40-new-site-playbook.md). The reading itself runs client-side (see
// public/index.html + public/lib/analysis.js does the real work). The one
// thing that needed a server: shared links. A plain static site serves the
// *same* index.html — same og:title/og:description/og:image — no matter
// whose handle is in the URL, so a link-unfurl cache (Bluesky's included)
// shows one generic card for every share, forever.
//
// Fix: /epistemics/s/<handle> is a real, distinct URL per person. The Worker
// resolves the handle server-side, runs a small hand-duplicated version of
// the same heuristic public/lib/analysis.js runs client-side (just enough
// for a one-line verdict, not the full quoted report), and stamps
// personalized og:title/og:description/og:url onto the same page shell
// before handing it back — same shape as sites/didscope's /s/<handle>.
// Duplicated, not imported: copy-don't-abstract applies within one site too.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

const PREFIX = "/epistemics";
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
// Same lexicons/logic as public/lib/analysis.js's Reversal + Certainty
// Whiplash detectors, trimmed to just what a one-line OG blurb needs: a
// total sin count and the single best (topic, quote-a, quote-b) example.

const POSITIVE = ["love", "loved", "best", "great", "amazing", "good", "favorite", "favourite", "underrated", "genius", "perfect", "brilliant", "correct", "agree", "based", "fantastic", "excellent"];
const NEGATIVE = ["hate", "hated", "worst", "terrible", "awful", "bad", "overrated", "stupid", "wrong", "disagree", "cringe", "garbage", "trash", "horrible", "ridiculous"];
const ABSOLUTE_POS = ["always", "everyone", "everybody"];
const ABSOLUTE_NEG = ["never", "no one", "nobody"];
const STOPWORDS = new Set("the a an and or but if then else when while for to of in on at by with from as is are was were be been being this that these those it its just so very really quite about into over under again here there all any both each few more most other some such only own same than too can will would could should shall may might must have has had do does did not no yes what which who whom because before after above below between out up down off own now also like get got one two three still even much many well way lot lots things thing stuff people".split(" "));

interface Claim {
  text: string;
  postUrl: string;
  polarity: "pos" | "neg" | null;
  absolute: "always" | "never" | null;
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

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function extractClaims(posts: { text: string; postUrl: string }[]): Claim[] {
  const claims: Claim[] = [];
  for (const post of posts) {
    for (const sentence of splitSentences(post.text)) {
      const lower = sentence.toLowerCase();
      const pos = containsAny(lower, POSITIVE);
      const neg = containsAny(lower, NEGATIVE);
      const absPos = containsAny(lower, ABSOLUTE_POS);
      const absNeg = containsAny(lower, ABSOLUTE_NEG);
      if (!pos && !neg && !absPos && !absNeg) continue;
      claims.push({
        text: sentence,
        postUrl: post.postUrl,
        polarity: pos && !neg ? "pos" : neg && !pos ? "neg" : null,
        absolute: absPos ? "always" : absNeg ? "never" : null,
        topics: topicsFor(lower),
      });
    }
  }
  return claims;
}

interface Pair {
  topic: string;
  kind: "Reversal" | "Certainty Whiplash";
  a: Claim;
  b: Claim;
}

function findPairs(claims: Claim[]): Pair[] {
  const byTopic = new Map<string, number[]>();
  claims.forEach((c, i) => {
    for (const t of c.topics) {
      if (!byTopic.has(t)) byTopic.set(t, []);
      byTopic.get(t)!.push(i);
    }
  });
  const pairs: Pair[] = [];
  for (const [topic, idxs] of byTopic) {
    if (idxs.length < 2) continue;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const c1 = claims[idxs[a]];
        const c2 = claims[idxs[b]];
        if (c1.polarity && c2.polarity && c1.polarity !== c2.polarity) {
          pairs.push({ topic, kind: "Reversal", a: c1, b: c2 });
        } else if (c1.absolute && c2.absolute && c1.absolute !== c2.absolute) {
          pairs.push({ topic, kind: "Certainty Whiplash", a: c1, b: c2 });
        }
      }
    }
  }
  return pairs;
}

function verdictFor(score: number): string {
  if (score === 0) return "clean docket. either remarkably consistent, or remarkably quiet.";
  if (score <= 3) return "a few minor inconsistencies. every witness embellishes a little.";
  if (score <= 8) return "a pattern is emerging, your honor.";
  if (score <= 15) return "the jury has seen enough.";
  return "case closed. the defendant contains multitudes, and none of them agree.";
}

async function findRecord(did: string, handle: string): Promise<{ score: number; topPair: Pair | null }> {
  const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "100", filter: "posts_with_replies" });
  const posts = (feed.feed || [])
    .filter((f: any) => !f.reason)
    .map((f: any) => {
      const text = f.post?.record?.text;
      const rkey = (f.post?.uri || "").split("/").pop();
      return text ? { text, postUrl: `https://bsky.app/profile/${handle}/post/${rkey}` } : null;
    })
    .filter(Boolean) as { text: string; postUrl: string }[];

  const claims = extractClaims(posts);
  const pairs = findPairs(claims);
  const reversals = pairs.filter((p) => p.kind === "Reversal").length;
  const whiplash = pairs.filter((p) => p.kind === "Certainty Whiplash").length;
  const score = reversals * 3 + whiplash * 2;
  const topPair = pairs.sort((x, y) => (x.kind === "Reversal" ? -1 : 1) - (y.kind === "Reversal" ? -1 : 1))[0] || null;
  return { score, topPair };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "epistemics — hold a mirror up to your words";
const GENERIC_DESC =
  "Enter a Bluesky handle. epistemics reads their recent posts, cross-references every stance they've taken, and flags where they argued both sides — no LLM required, just a very literal-minded grep.";
const GENERIC_OG_URL = "https://epistemics.bisks.net/";

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  let handle = decodeURIComponent(rawHandle || "").trim().replace(/^@/, "");
  if (!handle) return new Response(html, { headers: base.headers });

  try {
    let did: string;
    if (handle.startsWith("did:")) did = handle;
    else did = (await xrpc("com.atproto.identity.resolveHandle", { handle })).did;

    const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
    const who = "@" + (profile.handle || handle);
    const { score, topPair } = await findRecord(did, profile.handle || handle);

    const title = score === 0 ? `epistemics: ${who}'s record is clean` : `epistemics: ${score} epistemic sins on file for ${who}`;
    let desc = verdictFor(score);
    if (topPair) {
      desc = `Flagged re: "${topPair.topic}" — “${truncate(topPair.a.text, 80)}” vs. “${truncate(topPair.b.text, 80)}”. ${verdictFor(score)}`;
    }
    desc = truncate(desc, 300);
    const ogUrl = `https://bisks.net${PREFIX}/s/${encodeURIComponent(handle)}`;

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

    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }

    // /epistemics/s/<handle> — the distinct, shareable, per-person URL.
    const m = url.pathname.match(new RegExp(`^${PREFIX}/s/([^/]+)/?$`));
    if (m) return renderShare(env, request, m[1]);

    // Only strip when the prefix is actually present — on the subdomain

    // requests arrive without it, and an unconditional slice would chop

    // the front off short paths ("/app.js" -> "") so every asset would

    // silently serve index.html.

    if (url.pathname.startsWith(PREFIX + "/")) {

      url.pathname = url.pathname.slice(PREFIX.length) || "/";

    }
    return env.ASSETS.fetch(new Request(url, request));
  },
};
