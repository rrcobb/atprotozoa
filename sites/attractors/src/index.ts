// attractors Worker — attractors.bisks.net
//
// Almost everything runs client-side (public/app.js does the actual sim and
// rendering). The one thing that needed a server: shared links. A plain
// static site serves the *same* index.html — same og:title/og:description —
// no matter what seed is in the URL, so Bluesky's link-unfurl cache would
// show one generic card for every handle-seeded share, forever. Fix (same
// pattern as sites/didscope's renderShare): /s/<seed> is a real, distinct
// URL per seed. The Worker recomputes the same deterministic recipe the
// client would from the seed text, and stamps a personalized
// og:title/og:description/og:url onto the same page shell before serving it.
// The og:image itself stays the generic static card — actually rendering the
// attractor server-side would need a raster library, and none of Cloudflare
// Workers' image options run without native bindings or heavy wasm, so this
// mirrors didscope's own choice to personalize text only.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Kept in sync by hand with the identical tables/functions in public/app.js —
// same "duplicated within one site, not shared across sites" reasoning as
// didscope's SIGNS table. Only what the OG text needs made the trip.
const FAMILY_KEYS = ["clifford", "dejong", "svensson"];
const FAMILY_LABELS: Record<string, string> = { clifford: "clifford", dejong: "de jong", svensson: "svensson" };
const PALETTE_KEYS = ["nebula", "ember", "glacier", "toxic"];
const SPECIES_ADJ = [
  "Luminous", "Feral", "Velvet", "Copper", "Whispering", "Gloomy", "Electric",
  "Tidal", "Ashen", "Vermillion", "Quiet", "Restless", "Amber", "Frosted",
  "Molten", "Errant", "Hollow", "Radiant", "Brittle", "Wandering",
];
const SPECIES_NOUN = [
  "Vortex", "Spiral", "Lattice", "Halo", "Orbit", "Braid", "Filament",
  "Weave", "Nebula", "Coil", "Drift", "Bloom", "Loop", "Skein", "Wake",
  "Ribbon", "Fold", "Tangle", "Bell", "Wing",
];

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
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

function recipeFromSeed(text: string) {
  const rng = mulberry32(hashString(text.trim().toLowerCase()));
  const family = FAMILY_KEYS[Math.floor(rng() * FAMILY_KEYS.length)];
  rng(); rng(); rng(); rng(); // a, b, c, d — not needed for the OG text
  const palette = PALETTE_KEYS[Math.floor(rng() * PALETTE_KEYS.length)];
  const adj = SPECIES_ADJ[Math.floor(rng() * SPECIES_ADJ.length)];
  const noun = SPECIES_NOUN[Math.floor(rng() * SPECIES_NOUN.length)];
  return { family, palette, common: `${adj} ${noun}` };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "attractors — a chaotic map draws its own shape";
const GENERIC_OG_DESC =
  "A tiny deterministic equation, iterated a few million times, glows into a strange attractor. Drag the parameters, or seed one from a handle.";
// Matched as a full quoted attribute, not the bare URL — the bare URL is
// also a prefix of the og:image/twitter:image URLs ("…/og.png"), so a naive
// split/join on it would corrupt those too (see sites/didscope's
// GENERIC_OG_URL_ATTR comment for the incident this pattern avoids).
const GENERIC_OG_URL_ATTR = 'content="https://attractors.bisks.net/"';

async function renderShare(env: Env, request: Request, rawSeed: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  let seed = "";
  try {
    seed = decodeURIComponent(rawSeed).trim().slice(0, 60);
  } catch (_) {
    // malformed percent-encoding — fall through and serve the generic shell
  }
  if (!seed) return new Response(html, { headers: base.headers });

  const recipe = recipeFromSeed(seed);
  const title = `attractors: "${recipe.common}" — grown from ${seed}`;
  const desc = `A ${FAMILY_LABELS[recipe.family]} strange attractor, deterministically grown from "${seed}" and rendered in the ${recipe.palette} palette. Grow your own from any handle.`;
  const ogUrl = `https://attractors.bisks.net/s/${encodeURIComponent(seed)}`;

  html = html
    .split(GENERIC_TITLE).join(esc(title))
    .split(GENERIC_OG_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /s/<seed> — the distinct, shareable, per-seed URL. Every seed gets its
    // own page (and its own og:title/description/url), so a link unfurler
    // can't collapse every handle-seeded share into one cached generic card.
    const m = url.pathname.match(/^\/s\/([^/]+)\/?$/);
    if (m) return renderShare(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
