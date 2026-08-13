// seinfeldify Worker — served at the root of seinfeldify.bisks.net.
//
// @fromthewestmeadow.com asked for a bot that "analyzes all your posts with
// ai to determine what Seinfeld character you are and why." The client
// (public/app.js) does the fetching: resolve a handle, download the
// account's ENTIRE repo as one CAR (com.atproto.sync.getRepo, via
// public/lib/car.js — every app.bsky.feed.post record, no page cap, falling
// back to paginated app.bsky.feed.getAuthorFeed only if the CAR read fails —
// same trick as sites/llmstance, copied wholesale). A capped, representative
// sample of that history is POSTed here, because Workers AI isn't reachable
// from the browser — the one thing that needs a server.
//
// The model only ever returns *indices* into the sample it was given for its
// supporting evidence; the client rebuilds every quote/permalink from posts
// it already fetched itself, so a citation always points at a real post with
// the model's actual words never substituted in (same discipline as
// sites/thread-heirloom's /api/distill).
//
// The finished verdict is never stored server-side: /c/<code> decodes the
// whole card out of the URL (same trick as sites/thread-heirloom's /c/<code>
// and sites/windmill's /r/<code>) and renders it directly — durable by
// construction, and it means a share link keeps reading exactly as generated
// even if the account later deletes posts, goes private, or gets a different
// verdict on a re-run.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  AI: { run: (model: string, inputs: unknown) => Promise<unknown> };
}

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

const CHARACTERS = [
  "Jerry Seinfeld",
  "George Costanza",
  "Elaine Benes",
  "Cosmo Kramer",
  "Newman",
  "Frank Costanza",
  "J. Peterman",
  "David Puddy",
] as const;

interface InPost {
  i: number;
  text: string;
}

const SYSTEM_PROMPT = `You are a sharp, funny pop-culture judge for "seinfeldify" — a tool that reads a sample of someone's real Bluesky posts and decides which Seinfeld character their posting style and personality most resemble, and why.

Pick exactly one character from this list (spell it exactly as given):
- Jerry Seinfeld: the wry observational comic. Notices everyone else's absurdities, low personal stakes, turns everything into a bit, mildly superior detachment.
- George Costanza: insecure, self-sabotaging schemer. Short-fused, cheap, lies to get out of trouble, obsessed with looking good while doing the opposite, catastrophizes small things.
- Elaine Benes: blunt, assertive, impulsive. Strong opinions stated loudly, competitive, socially confident but courts public disaster, "get out!"
- Cosmo Kramer: chaotic wildcard. Wild schemes and get-rich-quick ideas, physical/dramatic entrances, unbothered by social norms, oddly and unearnedly lucky.
- Newman: petty rival energy. Holds grudges, scheming asides, self-important, dramatic about mundane things (the mail), villain-coded but small-time.
- Frank Costanza: volatile absolutist. Invents grievances out of nothing, loud catchphrase-driven declarations, zero-to-sixty temper, "SERENITY NOW" energy.
- J. Peterman: florid, self-mythologizing dramatist. Every mundane thing becomes an overwrought adventure story, purple prose, treats small talk like a memoir.
- David Puddy: deadpan minimalist. Extremely low effort, unreadable calm, monosyllabic, sudden bursts of narrow enthusiasm, noncommittal about everything else.

You will be given a JSON array of real posts from one Bluesky account, each shaped {i, text}. Judge the account's actual voice, recurring habits, and preoccupations — not any single post in isolation.

Reply with ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape:
{
  "character": string (exactly one of the eight names above),
  "tagline": string,
  "reasoning": string,
  "runnerUp": string | null (a different name from the list, or null),
  "evidence": [ { "i": number, "note": string } ]
}

Rules:
- tagline: one short, funny, quotable line (under 12 words) that could caption the verdict.
- reasoning: 2-4 sentences, specific to patterns you actually see in the posts, dry and funny in the show's register but not mean-spirited about the real person.
- runnerUp: the second-closest character, or null if nothing else is close.
- evidence: up to 3 of the posts that best support the verdict. "i" must be an integer actually present in the input array. note is one short clause on why that post fits.
- Never fabricate a quote — you only ever cite by "i", never repeat post text back.
- If the sample is too thin or generic to tell much, still pick the closest fit and say so plainly in reasoning rather than refusing.
- Kramer is the easy, crowd-pleasing pick and models over-reach for it — most accounts are not Kramer. Only choose him when the posts genuinely show wild schemes, physical/chaotic flair, and unbothered-by-norms energy; if it's a close call, prefer whichever other character fits the specific, mundane texture of these posts better.`;

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("model didn't return JSON");
  return JSON.parse(text.slice(start, end + 1));
}

// Workers AI doesn't always hand back the same shape: sometimes `raw` is a
// plain string, sometimes `{ response: "...json prose..." }`, and sometimes —
// when the model's structured-output mode kicks in — `.response` (or `raw`
// itself) is already the parsed object, not a string to re-parse. Handle all
// three instead of assuming `.response` is always text.
function coerceModelOutput(raw: unknown): unknown {
  if (typeof raw === "string") return extractJson(raw);
  const response = (raw as { response?: unknown })?.response;
  if (typeof response === "string") return extractJson(response);
  if (response && typeof response === "object") return response;
  if (raw && typeof raw === "object") return raw;
  throw new Error("model didn't return JSON");
}

function isCharacter(s: unknown): s is (typeof CHARACTERS)[number] {
  return typeof s === "string" && (CHARACTERS as readonly string[]).includes(s);
}

async function handleAnalyze(request: Request, env: Env): Promise<Response> {
  let body: { posts?: InPost[] };
  try {
    body = await request.json();
  } catch {
    return new Response("bad JSON body", { status: 400 });
  }
  const posts = Array.isArray(body.posts) ? body.posts : [];
  if (!posts.length) return new Response("no posts", { status: 400 });
  if (posts.length > 100) return new Response("sample too large", { status: 400 });

  const userContent = JSON.stringify(posts.map((p) => ({ i: p.i, text: p.text })));

  let raw: unknown;
  try {
    raw = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      max_tokens: 500,
      temperature: 0.6,
    });
  } catch (err) {
    return new Response(`AI call failed: ${(err as Error).message || err}`, { status: 502 });
  }

  let parsed: any;
  try {
    parsed = coerceModelOutput(raw);
  } catch (err) {
    return new Response(`couldn't parse the model's output: ${(err as Error).message}`, { status: 502 });
  }

  if (!isCharacter(parsed.character)) {
    return new Response("model didn't return a valid character", { status: 502 });
  }

  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence
        .filter((e: any) => typeof e?.i === "number" && posts.some((p) => p.i === e.i))
        .slice(0, 3)
        .map((e: any) => ({ i: e.i, note: String(e.note || "").slice(0, 200) }))
    : [];

  return new Response(
    JSON.stringify({
      character: parsed.character,
      tagline: String(parsed.tagline || "").slice(0, 160),
      reasoning: String(parsed.reasoning || "").slice(0, 800),
      runnerUp: isCharacter(parsed.runnerUp) ? parsed.runnerUp : null,
      evidence,
    }),
    { headers: { "content-type": "application/json; charset=utf-8" } },
  );
}

// ---- card encode/decode (mirrors public/lib/card.js) ----

interface Evidence {
  text: string;
  permalink: string;
  note: string;
}
interface Card {
  v: 1;
  handle: string;
  postCount: number;
  totalPostCount: number;
  method: "car" | "feed";
  character: string;
  tagline: string;
  reasoning: string;
  runnerUp: string | null;
  evidence: Evidence[];
  generatedAt: string;
  flipped?: boolean;
}

function fromBase64Url(s: string): Uint8Array {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCard(code: string): Card {
  const json = new TextDecoder().decode(fromBase64Url(code));
  return JSON.parse(json);
}

function encodeCard(card: Card): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(card)));
}

function esc(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  s = s || "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function evidenceHtml(e: Evidence): string {
  return `<li><p>“${esc(e.text)}”</p><span>${esc(e.note)}</span> <a class="cite" href="${esc(e.permalink)}" target="_blank" rel="noopener">view post ↗</a></li>`;
}

function renderCardHtml(card: Card, canonicalUrl: string): string {
  const title = `@${card.handle} is ${card.character}`;
  const desc = truncate(card.tagline || card.reasoning || `seinfeldify's verdict on @${card.handle}.`, 300);

  const evidenceHtmlBlock = card.evidence.length
    ? `<section><h2>the receipts</h2><ul class="evidence">${card.evidence.map(evidenceHtml).join("")}</ul></section>`
    : "";

  const scanNote =
    card.method === "car"
      ? `every post in their repo (${card.totalPostCount}), sampled down to ${card.postCount} for the AI`
      : `their last ${card.totalPostCount} posts (full-repo scan wasn't available), sampled down to ${card.postCount} for the AI`;

  const genDate = card.generatedAt ? new Date(card.generatedAt).toISOString().slice(0, 10) : "";

  // "everyone is just getting Kramer, maybe the runner-up should be number
  // 1?" — a flip swaps the two, client-independent: the AI never re-runs,
  // the flipped card just relabels its runner-up as the headline. Only
  // offered once (no flip link on an already-flipped card) so it can't
  // ping-pong forever.
  const swapLink =
    card.runnerUp && !card.flipped
      ? (() => {
          const swapped: Card = { ...card, character: card.runnerUp!, runnerUp: card.character, flipped: true };
          const swapCode = encodeCard(swapped);
          return `<a class="flip-link" href="/c/${swapCode}">not buying it? make ${esc(card.runnerUp!)} the headline instead →</a>`;
        })()
      : "";
  const flippedNote = card.flipped
    ? `<p class="flip-note">(you asked for the runner-up — this is that verdict promoted to #1; the reasoning below is the AI's original case, not a re-run)</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://seinfeldify.bisks.net/og.png">
<meta property="og:url" content="${esc(canonicalUrl)}">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="https://seinfeldify.bisks.net/og.png">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<main class="card">
  <header>
    <a class="brand" href="/">seinfeldify</a>
    <a class="root-link" href="https://bsky.app/profile/${esc(card.handle)}" target="_blank" rel="noopener">@${esc(card.handle)} ↗</a>
  </header>
  <p class="verdict-label">the verdict</p>
  <h1 class="verdict">${esc(card.character)}</h1>
  <p class="tagline-big">${esc(card.tagline)}</p>
  <p class="reasoning">${esc(card.reasoning)}</p>
  ${flippedNote}
  ${card.runnerUp ? `<p class="runner-up">runner-up: <strong>${esc(card.runnerUp)}</strong></p>` : ""}
  ${swapLink ? `<p class="runner-up">${swapLink}</p>` : ""}
  ${evidenceHtmlBlock}
  <p class="meta">scanned ${esc(scanNote)}${genDate ? ` · judged ${genDate}` : ""}</p>
  <footer>
    <p>This card is baked into its own URL — no database, so it reads the same even if the account above changes.</p>
    <a class="build-own" href="/">seinfeldify yourself →</a>
  </footer>
</main>
</body>
</html>`;
}

async function handleCard(request: Request, env: Env, code: string): Promise<Response> {
  let card: Card;
  try {
    card = decodeCard(code);
    if (card.v !== 1 || !card.handle || !isCharacter(card.character)) throw new Error("bad card");
  } catch {
    const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
    return new Response(await base.text(), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const canonicalUrl = `https://seinfeldify.bisks.net/c/${encodeURIComponent(code)}`;
  return new Response(renderCardHtml(card, canonicalUrl), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=31536000, immutable" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/analyze" && request.method === "POST") {
      return handleAnalyze(request, env);
    }

    const cardMatch = url.pathname.match(/^\/c\/([^/]+)\/?$/);
    if (cardMatch) return handleCard(request, env, cardMatch[1]);

    return env.ASSETS.fetch(request);
  },
};
