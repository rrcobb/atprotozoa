// multiclass Worker — multiclass.bisks.net
//
// The scan itself runs client-side (public/index.html + public/lib/classify.js
// do the real work: download the account's repo CAR, label every post
// Wizard/Warlock/Cleric/unclear, tally into a multiclass build). The one
// thing that needed a server: shared links. A plain static site serves the
// *same* index.html — same og:title/og:description/og:image — no matter
// whose handle is in the URL, so a link-unfurl cache (Bluesky's included)
// shows one generic card for every share, forever.
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side, runs a small hand-duplicated version of the same
// heuristic public/lib/classify.js runs client-side (just enough for a
// one-line verdict, not the full receipts list), and stamps personalized
// og:title/og:description/og:url onto the same page shell before handing it
// back — same shape as sites/llmstance's renderShare.
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
// OG blurb needs: wizard/warlock/cleric counts, no receipts.

const TOPIC_TERMS = [
  "ai", "llm", "llms", "chatgpt", "gpt-4", "gpt4", "gpt-5", "gpt5", "gpt",
  "claude", "anthropic", "openai", "gemini", "copilot", "midjourney",
  "stable diffusion", "dall-e", "dalle", "sora", "grok", "llama", "mistral",
  "deepseek", "character.ai", "chatbot", "chatbots", "generative ai", "genai",
  "gen-ai", "artificial intelligence", "machine learning", "neural network",
  "large language model", "language model", "ai art", "ai image", "ai images",
  "ai video", "ai slop", "ai-generated", "ai generated", "vibe coding",
  "vibe coded", "prompt", "prompting", "prompted", "agent", "agentic",
  "the model", "my model", "assistant", "co-pilot",
];

const WIZARD_TERMS = [
  "verify", "verified", "verifying", "double-check", "double check",
  "fact-check", "fact check", "cite your sources", "citation", "citations",
  "hallucinat", "sanity check", "peer review", "peer-reviewed", "academic",
  "methodology", "rigorous", "rigor", "reproducible", "benchmark",
  "benchmarks", "eval", "evals", "evaluation", "rubric", "read the docs",
  "documentation", "unit test", "unit tests", "test coverage", "code review",
  "reviewed the diff", "reviewed every line", "read every line", "linting",
  "just a tool", "treat it like a tool", "a tool, not", "tool in the toolbox",
  "guardrails", "guard rails", "skeptical", "healthy skepticism",
  "appropriate skepticism", "audit the code", "audit the output",
  "source of truth", "ground truth", "controlled experiment", "citation needed",
  "check the source", "check my work", "checked my work", "footnote",
  "footnotes", "bibliography", "literature review", "study says",
  "the paper says", "according to the paper", "measured", "measure twice",
];

const WARLOCK_TERMS = [
  "yolo", "yoloed", "vibe cod", "just shipped", "shipped it", "ship it",
  "who cares how it works", "black box", "no idea how it works",
  "dont know how it works", "don't know how it works", "no idea why it works",
  "made a pact", "sold my soul", "corrupted", "the whispers",
  "it whispers", "listens to it whisper", "agent loop", "agent loops",
  "let it cook", "let it ride", "one more prompt", "just one more prompt",
  "prompt until it works", "prompt til it works", "trust the process",
  "full send", "send it", "no guardrails", "no guard rails", "unhinged",
  "whatever it takes", "gave it the keys", "gave it root", "gave it access",
  "autonomous agent", "hands off the wheel", "hands-off the wheel",
  "let the agent", "cant stop wont stop", "can't stop won't stop",
  "addicted to", "can't stop using", "cant stop using", "rewrite the whole",
  "rm -rf", "in prod", "straight to prod", "deployed straight to",
  "power at any cost", "at what cost", "didn't ask what it cost",
  "didnt ask what it cost", "not sure what i agreed to", "the fine print",
  "forbidden knowledge", "power i don't understand", "power i dont understand",
];

const CLERIC_TERMS = [
  "worship", "worshipping", "worshiping", "blessed", "bless this",
  "machine god", "our machine god", "all hail", "hail the model",
  "sermon", "prophecy", "prophet", "faithful", "true believer", "believer",
  "praying", "prayer", "salvation", "ascension", "the singularity",
  "singularity is near", "it's alive", "its alive", "sentient", "conscious",
  "has a soul", "soul in the machine", "divine", "a miracle", "chosen one",
  "gospel", "scripture", "the model told me", "the model said",
  "it told me the truth", "it knows me", "understands me better than",
  "my ai boyfriend", "my ai girlfriend", "i love my ai", "it loves me",
  "converted", "convert you", "heretic", "heretics", "nonbeliever",
  "nonbelievers", "faith in the model", "have faith", "the next model",
  "the next release will save us", "waiting for the next drop",
  "genuflect", "altar", "shrine", "devotion", "devoted", "amen",
];

function countMatches(lower: string, terms: string[]): number {
  let count = 0;
  for (const t of terms) {
    if (t.includes(" ") || /[^a-z0-9]/.test(t)) {
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

function classifyPost(text: string): "wizard" | "warlock" | "cleric" | "unclear" {
  const lower = (text || "").toLowerCase();
  if (!countMatches(lower, TOPIC_TERMS)) return "unclear";
  const wizardHits = countMatches(lower, WIZARD_TERMS);
  const warlockHits = countMatches(lower, WARLOCK_TERMS);
  const clericHits = countMatches(lower, CLERIC_TERMS);
  const max = Math.max(wizardHits, warlockHits, clericHits);
  if (max === 0) return "unclear";
  const tiedAt = [wizardHits, warlockHits, clericHits].filter((h) => h === max).length;
  if (tiedAt > 1) return "unclear";
  return wizardHits === max ? "wizard" : warlockHits === max ? "warlock" : "cleric";
}

function buildTitle(pcts: { wizard: number; warlock: number; cleric: number }): string {
  const names: Record<string, string> = { wizard: "Wizard", warlock: "Warlock", cleric: "Cleric" };
  const order = (["wizard", "warlock", "cleric"] as const).sort((a, b) => pcts[b] - pcts[a]);
  const [c1, c2] = order;
  if (pcts[c1] >= 70) return "Pure " + names[c1];
  if (pcts[c1] + pcts[c2] >= 85) return names[c1] + " / " + names[c2] + " Multiclass";
  return "Triple-classed — Wizard/Warlock/Cleric";
}

const SHARE_POST_CAP = 100; // one page of recent posts is plenty for a share-card preview

async function scanForBuild(did: string): Promise<{ wizard: number; warlock: number; cleric: number; total: number }> {
  const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: String(SHARE_POST_CAP), filter: "posts_with_replies" });
  const posts = (feed.feed || [])
    .filter((f: any) => !f.reason)
    .map((f: any) => f.post?.record?.text)
    .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0);

  let wizard = 0, warlock = 0, cleric = 0;
  for (const text of posts) {
    const label = classifyPost(text);
    if (label === "wizard") wizard++;
    else if (label === "warlock") warlock++;
    else if (label === "cleric") cleric++;
  }
  return { wizard, warlock, cleric, total: wizard + warlock + cleric };
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

const GENERIC_TITLE = "multiclass — what kind of LLM practitioner are you?";
const GENERIC_DESC =
  "Wizard, Warlock, or Cleric — the roguelikedev 'proc gen practitioner' talk, remapped onto how you actually use AI. Scan a Bluesky handle for a multiclass build, or skip the scan and answer six questions by hand.";
const GENERIC_OG_URL = "https://multiclass.bisks.net/";

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
    const { wizard, warlock, cleric, total } = await scanForBuild(did);

    if (total === 0) {
      const title = `multiclass: ${who} hasn't tipped their hand on AI yet`;
      const desc = truncate(`No clear Wizard/Warlock/Cleric tells in their recent posts. Scan them yourself, or take the manual quiz.`, 300);
      html = html
        .split(GENERIC_TITLE).join(esc(title))
        .split(GENERIC_DESC).join(esc(desc))
        .split(GENERIC_OG_URL).join(`https://multiclass.bisks.net/s/${encodeURIComponent(handle)}`);
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
    }

    const pcts = {
      wizard: Math.round((wizard / total) * 100),
      warlock: Math.round((warlock / total) * 100),
      cleric: 0,
    };
    pcts.cleric = 100 - pcts.wizard - pcts.warlock;
    const title = `multiclass: ${who} is a ${buildTitle(pcts)}`;
    const desc = truncate(`🧙 ${pcts.wizard}% wizard · 😈 ${pcts.warlock}% warlock · 🙏 ${pcts.cleric}% cleric`, 300);
    const ogUrl = `https://multiclass.bisks.net/s/${encodeURIComponent(handle)}`;

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
