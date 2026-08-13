// thread-heirloom Worker — mounted at bisks.net/thread-heirloom/ (see
// notes/40-new-site-playbook.md).
//
// Paste a Bluesky thread URL; the client (public/lib/thread.js) walks the
// PUBLIC AppView anonymously to fetch every post in it, then POSTs the
// flattened list here so Workers AI (the one thing that needs a server — no
// AI binding in the browser) can distill it into named referents, claims,
// the strongest disagreement, and the unresolved question. The model only
// ever returns *indices* into the list it was given; the client rebuilds
// every citation from posts it already fetched itself, so a citation always
// points at a real post with the model's actual words never substituted in.
//
// The finished card is never stored server-side. /c/<code> decodes the
// whole card out of the URL (same trick as sites/windmill's /r/<code>) and
// renders it directly — durable by construction: the card keeps reading
// exactly as captured even if the thread is later deleted, blocked, or the
// AppView changes what it returns for that URI.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  AI: { run: (model: string, inputs: unknown) => Promise<unknown> };
}

const PREFIX = "/thread-heirloom";
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

interface InPost {
  i: number;
  replyTo: number | null;
  handle: string;
  text: string;
}

const SYSTEM_PROMPT = `You are a careful, terse thread analyst for "thread heirloom" — a tool that turns a Bluesky thread into a durable context card: named referents, the strongest claims, the sharpest disagreement, and the open question nobody resolved.

You will be given a JSON array of posts from one thread, oldest first, each shaped {i, replyTo, handle, text}. replyTo is the index of the post it's replying to (or null for the root).

Reply with ONLY a single JSON object, no prose, no markdown fences, matching exactly this shape:
{
  "referents": [ { "name": string, "note": string } ],
  "claims": [ { "text": string, "citeIndex": number } ],
  "disagreement": { "summary": string, "sideACiteIndex": number, "sideBCiteIndex": number } | null,
  "unresolved": { "text": string, "citeIndex": number } | null
}

Rules:
- referents: up to 5 named people, projects, or things the thread keeps returning to (not just "the author" — proper nouns and specific concepts). note is one short clause of context, not a summary of the whole thread.
- claims: up to 5 of the strongest, most concrete assertions made in the thread — paraphrase tightly, one sentence each.
- citeIndex / sideACiteIndex / sideBCiteIndex must be an integer "i" value that is actually present in the input array. Pick the single post that best supports that item.
- disagreement: the sharpest real disagreement between two participants, with a citation to each side. If nothing in the thread actually disagrees, use null — do not invent a disagreement.
- unresolved: the most interesting question the thread raises but never answers. If everything raised was resolved, use null.
- Never fabricate a quote or a name that isn't grounded in the given posts.
- Keep every string short — this is a citation card, not an essay.`;

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

async function handleDistill(request: Request, env: Env): Promise<Response> {
  let body: { posts?: InPost[] };
  try {
    body = await request.json();
  } catch {
    return new Response("bad JSON body", { status: 400 });
  }
  const posts = Array.isArray(body.posts) ? body.posts : [];
  if (!posts.length) return new Response("no posts", { status: 400 });
  if (posts.length > 80) return new Response("thread too large", { status: 400 });

  const userContent = JSON.stringify(
    posts.map((p) => ({ i: p.i, replyTo: p.replyTo, handle: p.handle, text: p.text })),
  );

  let raw: unknown;
  try {
    raw = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      max_tokens: 800,
      temperature: 0.2,
    });
  } catch (err) {
    return new Response(`AI call failed: ${(err as Error).message || err}`, { status: 502 });
  }

  let parsed: unknown;
  try {
    parsed = coerceModelOutput(raw);
  } catch (err) {
    return new Response(`couldn't parse the model's output: ${(err as Error).message}`, { status: 502 });
  }

  return new Response(JSON.stringify(parsed), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// ---- card encode/decode (mirrors public/lib/card.js) ----

interface Cite {
  handle: string;
  permalink: string;
  quote: string;
}
interface Card {
  v: 1;
  root: string;
  postCount: number;
  participantCount: number;
  truncated: boolean;
  generatedAt: string;
  referents: { name: string; note: string }[];
  claims: { text: string; cite: Cite | null }[];
  disagreement: { summary: string; a: Cite | null; b: Cite | null } | null;
  unresolved: { text: string; cite: Cite | null } | null;
}

function fromBase64Url(s: string): Uint8Array {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeCard(code: string): Card {
  const json = new TextDecoder().decode(fromBase64Url(code));
  return JSON.parse(json);
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

function citeHtml(c: Cite | null): string {
  if (!c) return "";
  return ` <a class="cite" href="${esc(c.permalink)}" target="_blank" rel="noopener">— @${esc(c.handle)}</a>`;
}

function renderCardHtml(card: Card, canonicalUrl: string): string {
  const title = `thread heirloom: ${card.participantCount} voices, ${card.postCount} posts`;
  const descBits: string[] = [];
  if (card.claims[0]) descBits.push(card.claims[0].text);
  if (card.unresolved) descBits.push(`Unresolved: ${card.unresolved.text}`);
  const desc = truncate(descBits.join(" · ") || "A durable context card for a Bluesky thread.", 300);

  const referentsHtml = card.referents.length
    ? `<section><h2>named</h2><ul class="referents">${card.referents
        .map((r) => `<li><strong>${esc(r.name)}</strong><span>${esc(r.note)}</span></li>`)
        .join("")}</ul></section>`
    : "";

  const claimsHtml = card.claims.length
    ? `<section><h2>claims</h2><ol class="claims">${card.claims
        .map((c) => `<li>${esc(c.text)}${citeHtml(c.cite)}</li>`)
        .join("")}</ol></section>`
    : "";

  const disagreementHtml = card.disagreement
    ? `<section><h2>strongest disagreement</h2><p>${esc(card.disagreement.summary)}</p><div class="sides"><div>${citeHtml(
        card.disagreement.a,
      )}</div><div>${citeHtml(card.disagreement.b)}</div></div></section>`
    : "";

  const unresolvedHtml = card.unresolved
    ? `<section><h2>unresolved</h2><p>${esc(card.unresolved.text)}${citeHtml(card.unresolved.cite)}</p></section>`
    : "";

  const genDate = card.generatedAt ? new Date(card.generatedAt).toISOString().slice(0, 10) : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://bisks.net${PREFIX}/og.png">
<meta property="og:url" content="${esc(canonicalUrl)}">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="https://bisks.net${PREFIX}/og.png">
<link rel="stylesheet" href="${PREFIX}/style.css">
</head>
<body>
<main class="card">
  <header>
    <a class="brand" href="${PREFIX}/">thread heirloom</a>
    <a class="root-link" href="${esc(card.root)}" target="_blank" rel="noopener">original thread ↗</a>
  </header>
  <p class="meta">${card.postCount} posts · ${card.participantCount} voices${card.truncated ? " · truncated to the first 90 posts" : ""}${genDate ? ` · distilled ${genDate}` : ""}</p>
  ${referentsHtml}
  ${claimsHtml}
  ${disagreementHtml}
  ${unresolvedHtml}
  <footer>
    <p>This card is baked into its own URL — no database, so it reads the same even if the thread above goes away.</p>
    <a class="build-own" href="${PREFIX}/">distill your own thread →</a>
  </footer>
</main>
</body>
</html>`;
}

async function handleCard(request: Request, env: Env, code: string): Promise<Response> {
  let card: Card;
  try {
    card = decodeCard(code);
    if (card.v !== 1 || !card.root) throw new Error("bad card");
  } catch {
    const base = await env.ASSETS.fetch(new Request(new URL(PREFIX + "/", request.url), { method: "GET" }));
    return new Response(await base.text(), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const canonicalUrl = `https://bisks.net${PREFIX}/c/${encodeURIComponent(code)}`;
  return new Response(renderCardHtml(card, canonicalUrl), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=31536000, immutable" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === PREFIX) {
      url.pathname = PREFIX + "/";
      return Response.redirect(url.toString(), 308);
    }
    // Only strip when the prefix is actually present — on the subdomain
    // requests arrive without it, and an unconditional slice would chop
    // the front off short paths ("/app.js" -> "") so every asset would
    // silently serve index.html.
    const path = url.pathname.startsWith(PREFIX + "/")
      ? url.pathname.slice(PREFIX.length) || "/"
      : url.pathname;

    if (path === "/api/distill" && request.method === "POST") {
      return handleDistill(request, env);
    }

    const cardMatch = path.match(/^\/c\/([^/]+)\/?$/);
    if (cardMatch) return handleCard(request, env, cardMatch[1]);

    const assetUrl = new URL(request.url);
    assetUrl.pathname = path;
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
};
