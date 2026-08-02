// llmstance Worker — llmstance.bisks.net
//
// The scan itself runs client-side (public/index.html + public/lib/classify.js
// do the real work: page through getAuthorFeed, label every post Pro-LLM,
// Anti-LLM, or Unclear, tally the result). The one thing that needed a
// server: shared links. A plain static site serves the *same* index.html —
// same og:title/og:description/og:image — no matter whose handle is in the
// URL, so a link-unfurl cache (Bluesky's included) shows one generic card for
// every share, forever.
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side, runs a small hand-duplicated version of the same
// heuristic public/lib/classify.js runs client-side (just enough for a
// one-line verdict, not the full receipts list), and stamps personalized
// og:title/og:description/og:url onto the same page shell before handing it
// back — same shape as sites/didscope's /s/<handle>.
//
// /s/<handle>?scope=followers|following|network carries the client's scan
// mode into the share card too, so "scan my followers" shares a card about
// the followers' verdict, not the account's own posts.
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

// ---- reduced classifier (server side) -------------------------------------
// Same lexicons as public/lib/classify.js, trimmed to just what a one-line
// OG blurb needs: pro/anti/unclear counts, no receipts.

const TOPIC_TERMS = [
  "ai", "llm", "llms", "chatgpt", "gpt-4", "gpt4", "gpt-5", "gpt5", "gpt",
  "claude", "anthropic", "openai", "gemini", "copilot", "midjourney",
  "stable diffusion", "dall-e", "dalle", "sora", "grok", "llama", "mistral",
  "deepseek", "character.ai", "chatbot", "chatbots", "generative ai", "genai",
  "gen-ai", "artificial intelligence", "machine learning", "neural network",
  "large language model", "language model", "ai art", "ai image", "ai images",
  "ai video", "ai slop", "ai-generated", "ai generated", "vibe coding",
  "vibe coded", "prompt engineering", "agentic", "clanker", "clankers",
  "robot overlords", "ai bro", "ai bros",
];

const PRO_TERMS = [
  "game changer", "gamechanger", "changed my workflow", "actually useful",
  "so useful", "genuinely useful", "love using", "can't live without",
  "cant live without", "underrated", "genuinely impressive", "so impressive",
  "future is here", "bullish", "obsessed with", "huge fan of",
  "day one adopter", "early adopter", "best tool", "life changing",
  "life-changing", "saved me hours", "saved me so much time",
  "love", "loved", "amazing", "incredible", "impressive", "impressed",
  "useful", "helpful", "brilliant", "fantastic", "excellent", "revolutionary",
  "exciting", "promising", "powerful", "efficient", "remarkable",
  "fascinating", "favorite", "favourite", "genius", "great",
];

const ANTI_TERMS = [
  "kill it with fire", "hate ai", "hate llms", "stealing art",
  "stealing from artists", "plagiarism machine", "theft machine",
  "dead internet", "enshittification", "enshittify", "water usage",
  "environmental cost", "confidently wrong", "no soul", "replace artists",
  "replace writers", "replace us", "job loss", "regulate ai", "ban ai",
  "luddite and proud", "techbro slop", "ai slop", "not impressed",
  "not a fan", "dont trust", "don't trust", "cant trust", "can't trust",
  "wont use", "won't use", "no thanks", "over it", "sick of", "tired of",
  "slop", "garbage", "trash", "worthless", "useless", "disgusting", "gross",
  "creepy", "dystopian", "nightmare", "annoying", "sucks", "stupid", "dumb",
  "lazy", "cheating", "soulless", "grift", "scam", "ponzi", "overhyped",
  "overrated", "bubble", "wrong", "worst", "sickening", "hallucinates",
  "hallucinating", "hallucination", "ugh", "clanker", "clankers",
];

function countMatches(lower: string, terms: string[]): number {
  let count = 0;
  for (const t of terms) {
    if (t.includes(" ")) {
      let idx = 0;
      while ((idx = lower.indexOf(t, idx)) !== -1) {
        count++;
        idx += t.length;
      }
    } else {
      const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp("\\b" + esc + "\\b", "g");
      const m = lower.match(re);
      if (m) count += m.length;
    }
  }
  return count;
}

function classifyPost(text: string): "pro" | "anti" | "unclear" {
  const lower = (text || "").toLowerCase();
  if (!countMatches(lower, TOPIC_TERMS)) return "unclear";
  const proHits = countMatches(lower, PRO_TERMS);
  const antiHits = countMatches(lower, ANTI_TERMS);
  return proHits === antiHits ? "unclear" : proHits > antiHits ? "pro" : "anti";
}

function netLabel(pro: number, anti: number): string {
  const relevant = pro + anti;
  const net = relevant ? (pro - anti) / relevant : 0;
  if (net >= 0.6) return "Pro-LLM, no notes.";
  if (net >= 0.2) return "Leans Pro-LLM.";
  if (net > -0.2) return "Dead even — genuinely torn.";
  if (net > -0.6) return "Leans Anti-LLM.";
  return "Anti-LLM, hard line.";
}

function verdictFor(pro: number, anti: number, unclear: number): string {
  const total = pro + anti + unclear;
  if (total === 0) return "no posts to go on.";
  const relevant = pro + anti;
  if (relevant === 0) return "never really weighed in — no clear stance either way.";
  return netLabel(pro, anti);
}

// Sharing a network scan (followers/following/network) still needs a real
// per-link OG card. This mirrors public/index.html's scan, but the Worker
// runs synchronously per-request (no progress bar, no user patience to
// spend), so the caps here are much smaller than the client's.
const SHARE_NETWORK_SIDE_CAP = 8;
const SHARE_POSTS_PER_ACCOUNT = 15;

async function fetchGraphList(kind: "followers" | "follows", did: string, cap: number): Promise<{ did: string; handle: string }[]> {
  const method = kind === "followers" ? "app.bsky.graph.getFollowers" : "app.bsky.graph.getFollows";
  const key = kind === "followers" ? "followers" : "follows";
  const out: { did: string; handle: string }[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 2 && out.length < cap; page++) {
    const params: Record<string, string> = { actor: did, limit: "100" };
    if (cursor) params.cursor = cursor;
    const res = await xrpc(method, params);
    const items = res[key] || [];
    for (const a of items) {
      out.push({ did: a.did, handle: a.handle });
      if (out.length >= cap) break;
    }
    cursor = res.cursor;
    if (!cursor || items.length === 0) break;
  }
  return out;
}

async function scanForVerdict(
  did: string,
  scope: string
): Promise<{ pro: number; anti: number; unclear: number; accountCount: number | null }> {
  if (scope !== "followers" && scope !== "following" && scope !== "network") {
    const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "100", filter: "posts_with_replies" });
    const posts = (feed.feed || [])
      .filter((f: any) => !f.reason)
      .map((f: any) => f.post?.record?.text)
      .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0);

    let pro = 0, anti = 0, unclear = 0;
    for (const text of posts) {
      const label = classifyPost(text);
      if (label === "pro") pro++;
      else if (label === "anti") anti++;
      else unclear++;
    }
    return { pro, anti, unclear, accountCount: null };
  }

  let accounts: { did: string; handle: string }[] = [];
  if (scope === "followers" || scope === "network") accounts.push(...(await fetchGraphList("followers", did, SHARE_NETWORK_SIDE_CAP)));
  if (scope === "following" || scope === "network") accounts.push(...(await fetchGraphList("follows", did, SHARE_NETWORK_SIDE_CAP)));
  const seen = new Set([did]);
  accounts = accounts.filter((a) => (seen.has(a.did) ? false : (seen.add(a.did), true)));

  let pro = 0, anti = 0, unclear = 0;
  await Promise.all(
    accounts.map(async (acc) => {
      try {
        const feed = await xrpc("app.bsky.feed.getAuthorFeed", {
          actor: acc.did,
          limit: String(SHARE_POSTS_PER_ACCOUNT),
          filter: "posts_with_replies",
        });
        const posts = (feed.feed || [])
          .filter((f: any) => !f.reason)
          .map((f: any) => f.post?.record?.text)
          .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0);
        for (const text of posts) {
          const label = classifyPost(text);
          if (label === "pro") pro++;
          else if (label === "anti") anti++;
          else unclear++;
        }
      } catch (_) {
        // one bad account (blocked, deactivated, rate-limited) shouldn't sink the whole preview
      }
    })
  );
  return { pro, anti, unclear, accountCount: accounts.length };
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

const GENERIC_TITLE = "llmstance — where does this account actually stand on AI?";
const GENERIC_DESC =
  "Enter a Bluesky handle. llmstance pages through their feed, labels every post Pro-LLM, Anti-LLM, or Unclear with a keyword heuristic, and tallies up their overall stance.";
const GENERIC_OG_URL = "https://llmstance.bisks.net/";

const SCOPE_NOUN: Record<string, string> = { followers: "followers", following: "following", network: "network" };

async function renderShare(env: Env, request: Request, rawHandle: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const handle = cleanHandle(rawHandle);
  if (!handle) return new Response(html, { headers: base.headers });

  const scope = new URL(request.url).searchParams.get("scope") || "posts";

  try {
    let did: string;
    if (handle.startsWith("did:")) did = handle;
    else did = (await xrpc("com.atproto.identity.resolveHandle", { handle })).did;

    const profile = await xrpc("app.bsky.actor.getProfile", { actor: did });
    const who = "@" + (profile.handle || handle);
    const { pro, anti, unclear, accountCount } = await scanForVerdict(did, scope);
    const verdict = verdictFor(pro, anti, unclear);

    const scopeNoun = SCOPE_NOUN[scope];
    const subject = scopeNoun ? `${who}'s ${scopeNoun}${accountCount ? ` (${accountCount})` : ""}` : who;

    const title = `llmstance: ${subject} is ${verdict.replace(/\.$/, "")}`;
    const desc = truncate(`${pro} pro-llm · ${anti} anti-llm · ${unclear} unclear. ${verdict}`, 300);
    const ogUrl = `https://llmstance.bisks.net/s/${encodeURIComponent(handle)}${scopeNoun ? `?scope=${scope}` : ""}`;

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
