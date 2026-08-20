// typeofguy Worker — typeofguy.bisks.net
//
// The generator is entirely client-side (public/index.html owns the real
// word banks and the on-page render). The one thing that needed a server:
// shared links. A plain static site serves the *same* index.html — same
// og:title/og:description — no matter what's in the query string or hash, so
// a link-unfurl cache shows one generic card for every share, forever (the
// didscope lesson, see sites/didscope/src/index.ts).
//
// Fix: /s/<seed36> is a real, distinct URL per generated guy. The Worker
// re-runs the same seeded generation server-side and stamps personalized
// og:title/og:description/og:url onto the same page shell before handing it
// back, so every share gets its own cache entry and preview text. Falls
// through to ASSETS for everything else (/, /og.png, /fonts/*).
//
// This duplicates the word banks and generateGuy() from public/index.html —
// deliberately: house style is copy-don't-share even within one site, same
// as didscope's SIGNS table living in both places.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function chance(rng: () => number, p: number): boolean {
  return rng() < p;
}

const ADJECTIVES: [string, string][] = [
  ["divorced", "divorcus"],
  ["finance", "financius"],
  ["group-chat-admin", "adminus"],
  ["LinkedIn", "linkedinus"],
  ["cottagecore", "cottagius"],
  ["fantasy-football", "footballus"],
  ["group-house", "domesticus"],
  ["gas-station-coffee", "stationus"],
  ["Warhammer", "warhammerus"],
  ["sourdough", "panificus"],
  ["vinyl", "vinylus"],
  ["home-espresso", "espressus"],
  ["Substack", "substackus"],
  ["Peloton", "pelotonus"],
  ["layover", "aeroportus"],
  ["run-club", "cursorus"],
  ["group-project", "proiectus"],
  ["group-text", "textus"],
];

const BEHAVIORS: [string, string][] = [
  ["explains the plot of a movie you've both already seen", "narrans"],
  ["has a spreadsheet ranking his friends by text-response time", "computans"],
  ["keeps a tier list for gas station coffee", "gradans"],
  ["will fight you about the correct way to load a dishwasher", "pugnans"],
  ["names his houseplants after ex-girlfriends", "nominans"],
  ["has a burner account just to argue about a TV finale", "occultus"],
  ["does a bit about airline food that's been running for six years", "iterans"],
  ["tells you his sleep score before you've said good morning", "vigilans"],
  ["carries a knife he's not legally supposed to carry", "armatus"],
  ["washes his car more than he drives it", "lavans"],
  ["is currently \"getting back into\" a hobby he quit twice", "redeuns"],
  ["DMs you at 2am with a podcast recommendation", "nocturnus"],
  ["will explain sous vide whether you asked or not", "coquens"],
  ["wears a novelty tie \"ironically\" and has for four years", "ridiculus"],
  ["is quietly furious about the group chat's read receipts", "iratus"],
  ["treats his leaderboard rank like a personality trait", "superbus"],
  ["has a whole thing about how he doesn't watch TV anymore", "abstinens"],
  ["keeps a Google Doc titled just \"thoughts\"", "cogitans"],
  ["will not shut up about a Substack no one asked him to start", "scribens"],
  ["is still mad about a group project from years ago", "memor"],
  ["has a starter culture named after an ex", "fermentans"],
  ["will tell you his personality type unprompted", "typicus"],
  ["is workshopping a bit about airports right now", "laborans"],
  ["owns exactly one tote bag and treats it like a personality", "portans"],
  ["has opinions about plant milk he needs you to hear", "opinans"],
  ["will pull up his fantasy rankings at a funeral if you let him", "inoportunus"],
  ["calls his coffee setup a \"workflow\"", "systematicus"],
  ["is three drinks away from crying about his fraternity", "lacrimans"],
  ["is unambiguously the admin of a group chat", "regens"],
  ["will do a voice impression unprompted", "imitans"],
  ["keeps a running tally of who owes him money", "debitor"],
  ["has a whole taxonomy for types of guys", "classificans"],
  ["points out a new type of guy every time you hang out", "indicans"],
  ["is convinced his friend group invented a meme", "originalis"],
  ["has a tab open explaining why his music taste is different", "defendens"],
  ["will tell you he \"doesn't really drink anymore\" unprompted", "negans"],
  ["brings his own hot sauce to restaurants", "praeparatus"],
  ["has a draft board pinned above his desk", "praeparans"],
  ["is in his \"reading era\" and needs you to know it", "legens"],
  ["still brings up a trade from three years ago", "recolens"],
  ["has a speech about how his commute builds character", "philosophans"],
  ["will explain the stock market to you at a wedding", "oeconomicus"],
  ["keeps his gym PRs in a notes file titled \"legacy\"", "aeternus"],
  ["has a bit where he pretends not to know what a meme is", "fingens"],
  ["will not stop talking about a run he did once", "gloriens"],
];

const JOINERS = ["and", "but also", "and, somehow also,"];

const TAGS = [
  "(unprompted.)",
  "(you did not ask.)",
  "(this is the whole personality now.)",
  "(he will bring it up at your wedding.)",
  "(unclear if this is a bit anymore.)",
  "(no further questions.)",
  "(unbothered, in the group chat.)",
  "(unlicensed for this.)",
  "(has been like this since 2019.)",
  "(there is no stopping this.)",
  "(you will hear about it again.)",
  "(it's happening right now, actually.)",
  "(this is not a bit.)",
  "(genuinely can't be talked out of it.)",
];

interface Guy {
  sentence: string;
  binomial: string;
  specimenNo: string;
}

function generateGuy(seed: number): Guy {
  const rng = mulberry32(seed);
  const hasAdj = chance(rng, 0.68);
  const adj = hasAdj ? pick(rng, ADJECTIVES) : null;
  const b1 = pick(rng, BEHAVIORS);
  const compound = chance(rng, 0.32);
  let b2: [string, string] | null = null;
  if (compound) {
    do {
      b2 = pick(rng, BEHAVIORS);
    } while (b2[0] === b1[0]);
  }
  const joiner = pick(rng, JOINERS);
  const tag = chance(rng, 0.5) ? pick(rng, TAGS) : null;

  const adjLabel = adj ? adj[0] + " " : "";
  let sentence = `the ${adjLabel}guy who ${b1[0]}`;
  if (b2) sentence += `, ${joiner} ${b2[0]}`;
  if (tag) sentence += ` ${tag}`;

  const species = adj ? adj[1] : b1[1];
  const subspecies = adj ? b1[1] : null;
  const binomial = subspecies ? `Guyus ${species} ${subspecies}` : `Guyus ${species}`;

  const specimenNo = String((seed % 9973) + 1).padStart(4, "0");

  return { sentence, binomial, specimenNo };
}

function seedFromToken(token: string): number | null {
  const n = parseInt(token, 36);
  if (!Number.isFinite(n) || n < 0) return null;
  return n >>> 0;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

const GENERIC_TITLE = "typeofguy — a procedural guy generator";
const GENERIC_DESC =
  "New type of guy just dropped. Generate a plausible kind of guy from a system of aesthetics, behaviors, and field-guide taxonomy.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is also
// a prefix of the og:image/twitter:image URL ("…/og.png"), so a naive
// split/join on it would corrupt those too (the didscope gotcha, see
// sites/didscope/src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://typeofguy.bisks.net/"';

async function renderShare(env: Env, request: Request, token: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const seed = seedFromToken(token);
  if (seed === null) return new Response(html, { headers: base.headers });

  const guy = generateGuy(seed);
  const title = `typeofguy — ${guy.binomial}`;
  const desc = truncate(`new type of guy just dropped: ${guy.sentence}`, 300);
  const ogUrl = `https://typeofguy.bisks.net/s/${token}`;

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

    // /s/<seed36> — the distinct, shareable, per-guy URL. Every generated guy
    // gets its own page (and its own og:title/description/url), so a link
    // unfurler can't collapse them all into one cached card.
    const m = url.pathname.match(/^\/s\/([0-9a-z]+)\/?$/i);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
