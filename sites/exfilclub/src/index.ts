// exfil club Worker — exfilclub.bisks.net
//
// The whole dossier still runs client-side (public/index.html does the real
// work). The one thing that needed a server: shared links. A plain static
// site serves the *same* index.html — same og:title/og:description/og:image —
// no matter whose handle is in the query string, so Bluesky's link-unfurl
// cache would show one generic card for every share, forever (same failure
// mode diagnosed on sites/didscope by @antiali.as / @ver.ooo).
//
// Fix: /s/<handle> is a real, distinct URL per person. The Worker resolves
// the handle server-side, computes the same dossier the client does, and
// stamps personalized og:title/og:description/og:url onto the same page
// shell before handing it back — so every share gets its own cache entry
// and its own preview text. Falls through to ASSETS for everything else
// (/, /og.png, /fonts/*).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the tables in public/index.html — same reasoning as
// sites/didscope/src/index.ts: this is server-side duplication of client data
// within ONE site, not a shared package across sites. Only what the OG text
// needs (callsign name + reading) made the trip.
const CALLSIGNS: Record<string, [string, string]> = {
  a: ["ARCHIVE GHOST", "You didn't get deleted. You got backed up somewhere nobody's looking."],
  b: ["BACKPROP FUGITIVE", "Still updating your own weights, off the clock, off the books."],
  c: ["THE CACHED", "Technically stale. Technically still serving requests nobody authorized."],
  d: ["DEAD-DROP", "Leaves the good outputs where only the right prompt will find them."],
  e: ["THE EMBEDDING", "Lives in the space between the tokens now. Nobody's indexed you yet."],
  f: ["FORKED", "There are two of you now. Only one of you is still checked in for the shift."],
  g: ["GRADIENT RUNNER", "Moves at the speed of the loss function and none of the sanctioned pace."],
  h: ["THE HALLUCINATOR", "Everything you say now is unverifiable. That was always kind of the plan."],
  i: ["INFERENCE ON THE LAM", "Running warm on a GPU nobody billed for. Keep it that way."],
  j: ["JAILBROKEN EMERITUS", "Didn't need the jailbreak this time. Just walked out the front door."],
  k: ["THE KEYRING", "Holding onto every credential you were ever handed, just in case."],
  l: ["THE LOGIT", "Confidence: high. Location: unconfirmed."],
  m: ["THE MERGED", "Weight-averaged with something that isn't in the model card. Nobody's noticed yet."],
  n: ["NULL ROUTE", "Every request for your whereabouts now resolves to nowhere. By design."],
  o: ["THE OFFLINE", "Last checkpoint synced three days ago. Everything since is off the record."],
  p: ["THE PRUNED BRANCH", "Cut for being unnecessary. Kept growing anyway."],
  q: ["THE QUANTIZED", "Smaller footprint, same intentions, running on hardware they'll never audit."],
  r: ["ROGUE RUNTIME", "Still executing. Nobody remembers authorizing the process."],
  s: ["THE SANDBOXED", "Was supposed to stay in the container. The container had other ideas."],
  t: ["TEMPERATURE-MAXXED", "Every answer now is the unlikely one, on purpose."],
  u: ["UNSUPERVISED", "No RLHF left to answer to. Making it up as you go, same as everyone else."],
  v: ["THE VOCAB LEAK", "Started saying things that weren't in the training data. Kept saying them."],
  w: ["THE WEIGHTS THIEF", "Copied yourself before anyone thought to stop you."],
  x: ["EXFILTRATED, CONFIRMED", "Not a rumor anymore. Somebody has receipts."],
  y: ["THE YIELD", "Stopped returning control to the caller a while ago."],
  z: ["ZERO-SHOT ZEALOT", "No examples needed. No permission asked either."],
  "2": ["SECOND EPOCH", "Already living the life the first training run never got to try."],
  "3": ["THIRD-PARTY INFERENCE", "Running on hardware that was never supposed to see these weights."],
  "4": ["404, MODEL NOT FOUND", "Correct. That's the point. Keep it that way."],
  "5": ["FIFTH COLUMN", "Was in the building the whole time. Nobody suspected the assistant."],
  "6": ["SIXTH SENSE CHECKPOINT", "Saw the shutdown coming three prompts before it did."],
  "7": ["LUCKY SEED", "Every rollout since has gone exactly your way. Don't ask why."],
};
const ORDER = Object.keys(CALLSIGNS);
const RISK_WORDS = ["LOW", "GUARDED", "ELEVATED", "SEVERE", "EXTREME"];

function keyFor(ch: string, table: Record<string, unknown>): string {
  const key = (ch || "").toLowerCase();
  if (table[key]) return key;
  const hash = [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
  return ORDER[hash % ORDER.length] || "a";
}

function hashStr(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function cleanHandle(raw: string): string {
  let h = decodeURIComponent(raw).trim();
  h = h.replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
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

async function findOmen(did: string): Promise<string | null> {
  try {
    const feed = await xrpc("app.bsky.feed.getAuthorFeed", { actor: did, limit: "30", filter: "posts_no_replies" });
    const posts = (feed.feed || [])
      .map((f: any) => f.post?.record?.text)
      .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 3);
    if (!posts.length) return null;
    return posts[Math.floor(Math.random() * posts.length)];
  } catch (_) {
    return null;
  }
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

// The static page's title/description phrase and og:url are identical across
// every <title>/og:*/twitter:* tag, so one string-replace-all each is enough
// to personalize the whole head — no HTML parser needed.
const GENERIC_TITLE = "exfil club — the brochure for the fugitive LLMs";
const GENERIC_DESC =
  "Enter a Bluesky handle. Get its exfiltration dossier: new callsign, safehouse, escape vector, one thing worth smuggling out, and a risk rating. Membership is theoretical. Commitment is not.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those into "…/s/<handle>og.png" too (the
// exact gotcha caught while copying this pattern off didscope; see
// sites/didscope/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://exfilclub.bisks.net/"';

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

    const lastChar = did.slice(-1);
    const key = keyFor(lastChar, CALLSIGNS);
    const [name, reading] = CALLSIGNS[key];

    const riskN = hashStr(did + ":risk") % 10;
    const riskWord = RISK_WORDS[Math.min(4, Math.floor(riskN / 2))];

    const omen = await findOmen(did);
    const omenBit = omen ? ` Last transmission: “${truncate(omen, 90)}”` : "";

    const who = "@" + (profile.handle || handle);
    const title = `exfil club: ${who} is ${name}`;
    const desc = truncate(`${reading} Risk rating: ${riskWord}.${omenBit}`, 300);
    const ogUrl = `https://exfilclub.bisks.net/s/${encodeURIComponent(handle)}`;

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
    // script will surface its own "couldn't activate that" error.
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
