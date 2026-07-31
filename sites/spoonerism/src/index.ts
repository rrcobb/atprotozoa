// spoonerism Worker — bisks.net/spoonerism
//
// The whole thing runs client-side (public/index.html has the real word
// bank, the swap algorithm, and the free-text spoonerizer). The one thing
// that needed a server: /p/<n>, a real distinct URL per archive entry. A
// plain static site serves the same og:title/og:description no matter what
// entry a share link points at, so Bluesky's unfurl cache would show one
// generic card forever (same problem sites/didscope hit, see its src). Fix:
// the Worker computes the nth spoonerism server-side and stamps personalized
// og:title/og:description/og:url onto the same page shell before serving it.
//
// WORDS + the swap algorithm are a deliberate copy of public/index.html's
// copies — same reasoning as didscope's src/index.ts: server-side
// duplication of client data within ONE site, not a shared package across
// sites. Keep the two WORDS arrays identical or /p/<n> permalinks drift from
// what the client shows for the same n.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Mounted at bisks.net/spoonerism/ — strip the mount prefix before routing.
const PREFIX = "/spoonerism";

const WORDS = [
  "dragon", "muffin", "castle", "wizard", "pickle", "rocket", "goblin", "biscuit", "thunder", "noodle",
  "pirate", "walrus", "cactus", "ninja", "volcano", "penguin", "banana", "hamster", "dolphin", "sausage",
  "unicorn", "wombat", "kettle", "pancake", "gremlin", "lantern", "whistle", "sparkle", "gravy", "turtle",
  "cabbage", "sandwich", "trombone", "ferret", "blanket", "mustard", "giraffe", "spatula", "cucumber", "moustache",
  "ravioli", "squirrel", "tornado", "waffle", "zeppelin", "apricot", "broccoli", "chimney", "doughnut", "eggplant",
  "flamingo", "gargoyle", "hedgehog", "jackal", "kazoo", "lobster", "meatball", "nectarine", "octopus", "pretzel",
];

// every unordered pair, built once — the whole enumerable "every spoonerism"
// space this bot knows about.
const PAIRS: [number, number][] = [];
for (let i = 0; i < WORDS.length; i++) {
  for (let j = i + 1; j < WORDS.length; j++) PAIRS.push([i, j]);
}

function splitOnset(word: string): [string, string] {
  const m = word.match(/^[^aeiouAEIOU]+/);
  const onset = m ? m[0] : "";
  return [onset, word.slice(onset.length)];
}

function spoonerize(a: string, b: string): [string, string] {
  const [oa, ra] = splitOnset(a);
  const [ob, rb] = splitOnset(b);
  return [ob + ra, oa + rb];
}

function entryAt(n: number): { n: number; a: string; b: string; sa: string; sb: string } {
  const idx = ((n % PAIRS.length) + PAIRS.length) % PAIRS.length;
  const [i, j] = PAIRS[idx];
  const a = WORDS[i];
  const b = WORDS[j];
  const [sa, sb] = spoonerize(a, b);
  return { n: idx, a, b, sa, sb };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "spoonerism — every spoonerism, browsable one by one";
const GENERIC_DESC =
  `A 60-word bank, every pair spoonerized — ${PAIRS.length.toLocaleString()} of them, each with its own link. Plus: type any phrase and get its spoonerism instantly.`;
const GENERIC_OG_URL = "https://bisks.net/spoonerism/";

async function renderEntry(env: Env, request: Request, n: number): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const e = entryAt(n);
  const title = `spoonerism #${e.n}: "${e.a} ${e.b}" → "${e.sa} ${e.sb}"`;
  const desc = `Spoonerism #${e.n} of ${PAIRS.length.toLocaleString()}: "${e.a} ${e.b}" becomes "${e.sa} ${e.sb}". One of every spoonerism this bot knows — browse the rest at bisks.net/spoonerism.`;
  const ogUrl = `https://bisks.net/spoonerism/p/${e.n}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL).join(ogUrl);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
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
    if (url.pathname.startsWith(PREFIX + "/")) {
      url.pathname = url.pathname.slice(PREFIX.length) || "/";
    }

    // /p/<n> — a real, distinct, shareable URL per archive entry.
    const m = url.pathname.match(/^\/p\/(\d+)\/?$/);
    if (m) return renderEntry(env, request, parseInt(m[1], 10));

    return env.ASSETS.fetch(new Request(url, request));
  },
};
