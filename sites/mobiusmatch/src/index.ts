// mobiusmatch Worker — mobiusmatch.bisks.net
//
// The quiz itself runs entirely client-side (public/index.html). The one
// thing that needs a server: shared results. A plain static site serves the
// *same* index.html — same og:title/og:description/og:image — no matter
// which site is in the /s/<key> path, so Bluesky's link-unfurl cache would
// show one generic quiz card for every share, forever (same problem
// didscope hit — see its src/index.ts).
//
// Fix: /s/<key> is a real, distinct URL per matched site. The Worker looks
// the key up in SITES below and stamps a personalized og:title/description/
// url onto the same page shell before handing it back, so every one of the
// ~42 possible matches gets its own cache entry. Falls through to ASSETS for
// everything else (/, /og.png, /data/mino-sites.json).
//
// SITES is a server-side copy of public/data/mino-sites.json — same
// reasoning as didscope's duplicated SIGNS table: this is duplication of
// data within ONE site, not a shared package across sites. Only what the OG
// text needs (name/url/category/blurb) made the trip. Keep it in sync by
// hand if the catalog changes (see ../sync-mino.mjs).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

interface Site {
  key: string;
  name: string;
  url: string;
  category: string;
  blurb: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  generators: "Generators",
  bluesky: "Lenses on Bluesky",
  cylinder: "The O'Neill Cylinder",
  lore: "Fiction & Lore",
  science: "Math & Science Explainers",
  tools: "Tools That Built It",
  games: "Games & Play",
};

const SITES: Site[] = [
  { key: "fable", name: "fable", url: "https://fable.mino.mobi", category: "generators", blurb: "nine tiny generators under one roof — puzzles, cards, shapes, remixed forever, no two visits alike" },
  { key: "wormhole", name: "wormhole", url: "https://wormhole.mino.mobi", category: "generators", blurb: "academic wormhole roulette: spin it, land on a real paper from a field you've never heard of" },
  { key: "fipo", name: "fipo", url: "https://fipo.mino.mobi", category: "generators", blurb: "a deterministic bad-sci-fi pitch engine. ask again, get a different terrible movie" },
  { key: "table", name: "table", url: "https://table.mino.mobi", category: "generators", blurb: "procedural character sheets for RPGs whose rules are open enough to actually generate" },
  { key: "silk", name: "silk", url: "https://silk.mino.mobi", category: "generators", blurb: "an agent with no plan and no map builds a spider's web from local rules alone" },
  { key: "bismuth", name: "bismuth", url: "https://bismuth.mino.mobi", category: "generators", blurb: "crystals grown brick by brick by a colony of agents that don't know they're building anything" },

  { key: "b", name: "b", url: "https://b.mino.mobi", category: "bluesky", blurb: "one portal to every Bluesky tool in the building — feeds, network maps, account analysis" },
  { key: "hose", name: "hose", url: "https://hose.mino.mobi", category: "bluesky", blurb: "a custom feed defined only by what it excludes. the firehose, filtered down to a shape" },
  { key: "bsky", name: "bsky", url: "https://bsky.mino.mobi", category: "bluesky", blurb: "an AppView with no database. reads the network live, keeps nothing" },
  { key: "answers", name: "answers", url: "https://ask.mino.mobi", category: "bluesky", blurb: "ask it something. it answers, powered by ATProto records instead of a search index" },
  { key: "empathy", name: "empathy", url: "https://empath.mino.mobi", category: "bluesky", blurb: "reads a feed and tells you what it actually sounds like, not what you think it sounds like" },
  { key: "photo", name: "photo", url: "https://photo.mino.mobi", category: "bluesky", blurb: "every image from any handle, one filterable wall, sorted by what actually landed" },

  { key: "mappa", name: "mappa", url: "https://mappa.mino.mobi", category: "cylinder", blurb: "the world engine and atlas underneath the whole cylinder suite" },
  { key: "polis", name: "polis", url: "https://polis.mino.mobi", category: "cylinder", blurb: "a city, cascading — watch settlements bloom across a world that didn't have them yesterday" },
  { key: "civ", name: "civ", url: "https://civ.mino.mobi", category: "cylinder", blurb: "a coevolutionary civilization sim running on top of a cylinder that doesn't exist. yet" },
  { key: "biome", name: "biome", url: "https://biome.mino.mobi", category: "cylinder", blurb: "the ecosystem wing. life, modeled, inside a structure still being built next door" },
  { key: "foam", name: "foam", url: "https://foam.mino.mobi", category: "cylinder", blurb: "first-person, inside a voronoi foam. you are standing inside the cylinder's own geometry" },
  { key: "iris", name: "iris", url: "https://iris.mino.mobi", category: "cylinder", blurb: "the end-on view: look straight down the axis at a 4km ring habitat, from the inside" },

  { key: "borges", name: "borges", url: "https://borges.mino.mobi", category: "lore", blurb: "a library that behaves like it was designed by someone who'd read too much Borges. because it was" },
  { key: "rant", name: "rant", url: "https://rant.mino.mobi", category: "lore", blurb: "a whole publication engine written in Rust, for people with a lot to say and nowhere sanctioned to say it" },
  { key: "time", name: "time", url: "https://time.mino.mobi", category: "lore", blurb: "Mino Times — a two-desk paper, articles and a podcast, stored entirely as records on a PDS" },
  { key: "fifty", name: "fifty", url: "https://fifty.mino.mobi", category: "lore", blurb: "fifty ATProto app pitches on one page. thirty actually work. twenty are just very convincing lies" },
  { key: "words", name: "words", url: "https://words.mino.mobi", category: "lore", blurb: "Words With Friends, minus the ads, the accounts, and the nagging. also, secretly, something else" },
  { key: "clef", name: "clef", url: "https://clef.mino.mobi", category: "lore", blurb: "a sheet-music viewer that reads real LilyPond notation and turns it into something you can follow" },

  { key: "math", name: "math", url: "https://math.mino.mobi", category: "science", blurb: "a sortable hub for an entire extremal-geometry pack, complete with a roadmap of what's next" },
  { key: "neuro", name: "neuro", url: "https://neuro.mino.mobi", category: "science", blurb: "cognitive-science models rebuilt from their original papers, running live against the published results" },
  { key: "sci", name: "sci", url: "https://sci.mino.mobi", category: "science", blurb: "real scientific instruments, taken apart, one page per instrument, each one a solver you drive yourself" },
  { key: "fold", name: "fold", url: "https://fold.mino.mobi", category: "science", blurb: "watch a protein actually fold, frame by frame, under real Langevin dynamics" },
  { key: "phylofiction", name: "phylofiction", url: "https://phylofiction.mino.mobi", category: "science", blurb: "a seeded tree-of-life generator: a real evolution engine growing entirely fictional species" },
  { key: "atlas", name: "atlas", url: "https://atlas.mino.mobi", category: "science", blurb: "county-level North America, no build step, no secrets, just a map that actually loads" },

  { key: "moji", name: "moji", url: "https://moji.mino.mobi", category: "tools", blurb: "every Unicode emoji, one pastable searchable table. click a glyph, it's already copied" },
  { key: "uni", name: "uni", url: "https://uni.mino.mobi", category: "tools", blurb: "the Unicode browser, moji's sibling — for when you need the codepoint, not just the emoji" },
  { key: "unit", name: "unit", url: "https://unit.mino.mobi", category: "tools", blurb: "a unit converter built by the same hands that built everything else here. no ads, obviously" },
  { key: "fix", name: "fix", url: "https://fix.mino.mobi", category: "tools", blurb: "a parser for FIX financial messages. the single most niche tool on this whole list, and proud of it" },
  { key: "loop", name: "loop", url: "https://loop.mino.mobi", category: "tools", blurb: "the apparatus behind everything else: the ticket graph, the ready queue, the quality-vs-turns curve" },
  { key: "pm", name: "pm", url: "https://pm.mino.mobi", category: "tools", blurb: "earned-value project management, because someone had to build the thing that tracks building things" },

  { key: "duck", name: "duck", url: "https://duck.mino.mobi", category: "games", blurb: "two WebGPU games sharing one worker. spin-gravity physics you can actually feel" },
  { key: "hoop", name: "hoop", url: "https://hoop.mino.mobi", category: "games", blurb: "the original O'Neill cylinder game, before it got split into wings. still playable" },
  { key: "torus", name: "torus", url: "https://torus.mino.mobi", category: "games", blurb: "a whole family of toroidal games — pac, chess, corn — all sharing one warped board" },
  { key: "reef", name: "reef", url: "https://reef.mino.mobi", category: "games", blurb: "Tinder, but for judging procedurally generated voxel sea creatures. you will have opinions" },
  { key: "golem", name: "golem", url: "https://golem.mino.mobi", category: "games", blurb: "a Minecraft-like builder world made of smart cellular bricks that actually know what they are" },
  { key: "pokemon", name: "poke", url: "https://poke.mino.mobi", category: "games", blurb: "Critter Red — a full Pokémon-style game, built because someone eventually had to" },
];

const SITES_BY_KEY = new Map(SITES.map((s) => [s.key, s]));

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
// to personalize the whole head — no HTML parser needed (same approach as
// sites/didscope's src/index.ts).
const GENERIC_TITLE = "mobiusmatch — which mino.mobi site are you?";
const GENERIC_DESC =
  "Seven questions. Seven categories. One of mino.mobi's ~300 tiny sites, matched to you. Pulled live from mino.mobi's own deploy registry.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (the gotcha didscope hit first —
// see its src/index.ts).
const GENERIC_OG_URL_ATTR = 'content="https://mobiusmatch.bisks.net/"';

async function renderShare(env: Env, request: Request, rawKey: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const key = decodeURIComponent(rawKey || "").trim();
  const site = SITES_BY_KEY.get(key);
  if (!site) return new Response(html, { headers: base.headers });

  const catLabel = CATEGORY_LABELS[site.category] || site.category;
  const title = `mobiusmatch: you're ${site.name} (${catLabel})`;
  const desc = truncate(`${site.blurb}. Take the quiz and find your own match.`, 300);
  const ogUrl = `https://mobiusmatch.bisks.net/s/${encodeURIComponent(key)}`;

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

    // /s/<key> — the distinct, shareable, per-match URL. Every one of the
    // ~42 possible matches gets its own page (and its own og:title/
    // description/url), so a link unfurler can't collapse them into one
    // cached card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
