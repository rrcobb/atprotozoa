// crowdpleaser Worker — crowdpleaser.bisks.net
//
// The generator itself is entirely client-side (public/app.js): pick three
// indices at random, look them up in three fixed tables, done. The one thing
// that needed a server: shared links. A plain static site serves the *same*
// index.html — same og:title/og:description — no matter what combo is in the
// URL, so Bluesky's link-unfurl cache would show one generic card forever no
// matter which "certified crowd-pleaser" got shared (same problem sites/didscope
// solved for handles). Fix: /s/<seed> is a real, distinct URL per combo. The
// Worker decodes the seed server-side, builds the same sentence the client
// would show, and stamps it into the page's og:title/og:description/og:url
// before handing it back. Falls through to ASSETS for everything else.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept as a local copy of the tables in public/app.js — same reasoning as
// sites/didscope/src/index.ts: server-side duplication within ONE site, not a
// shared package across sites. Indices must line up exactly with the client.
const ANIMALS = [
  "a golden retriever puppy meeting stairs for the first time",
  "a kitten discovering its own reflection",
  "two otters holding hands so they don't drift apart",
  "a baby penguin faceplanting into snow, then getting right back up",
  "a hedgehog eating a single blueberry with both paws",
  "a duckling riding piggyback on its mom",
  "a baby elephant sneezing and scaring itself",
  "a tortoise wearing a tiny raincoat",
];
const RELATABLE = [
  "the wifi reconnects right as you're about to rage quit",
  "you find a $20 in a coat you haven't worn since last winter",
  "the barista writes something nice on your cup",
  "your package shows up a day early",
  "someone lets you merge in traffic and you actually get to wave",
  "the group chat agrees on a restaurant on the first try",
  "you wake up and remember it's Saturday",
  "the vending machine drops two",
];
const OUTCOMES = [
  "everyone in the room claps",
  "gets forwarded to the family group chat within the hour",
  "makes your coworker cry a little, in a good way",
  "ends up taped to someone's fridge",
  "gets read out loud at a wedding, unprompted",
  "becomes the office screensaver by Friday",
  "makes the local news, somehow",
  "gets a slow clap from total strangers",
];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseSeed(raw: string): [number, number, number] | null {
  const parts = raw.split("-").map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) return null;
  const [a, b, c] = parts;
  if (a < 0 || a >= ANIMALS.length) return null;
  if (b < 0 || b >= RELATABLE.length) return null;
  if (c < 0 || c >= OUTCOMES.length) return null;
  return [a, b, c];
}

function sentence(seed: [number, number, number]): string {
  const [a, b, c] = seed;
  return `${cap(ANIMALS[a])}, plus ${RELATABLE[b]} — ${OUTCOMES[c]}.`;
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

const GENERIC_TITLE = "crowdpleaser — a website engineered so everyone likes it";
const GENERIC_DESC =
  "Cute animal + relatable feeling + wholesome outcome. 100% certified approval, every single time.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is also
// a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (gotcha called out in
// sites/didscope/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://crowdpleaser.bisks.net/"';

async function renderShare(env: Env, request: Request, rawSeed: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const seed = parseSeed(decodeURIComponent(rawSeed));
  if (!seed) return new Response(html, { headers: base.headers });

  const line = sentence(seed);
  const title = "crowdpleaser: 100% Certified Crowd-Pleaser";
  const desc = truncate(line, 300);
  const ogUrl = `https://crowdpleaser.bisks.net/s/${seed.join("-")}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<seed> — the distinct, shareable, per-combo URL. Every generated
    // sentence gets its own page (and its own og:title/description/url), so a
    // link unfurler can't collapse them into one cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
