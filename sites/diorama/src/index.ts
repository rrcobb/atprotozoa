// diorama Worker — diorama.bisks.net
//
// diorama's twin, constructor, builds blueprints; this one builds tiny
// paper-craft stage sets. Same reasoning, same fix — see
// sites/constructor/src/index.ts for the full writeup. The generator runs
// entirely client-side (public/index.html); /b/<slug> exists only so a
// shared build gets its own og:title/og:description instead of every link
// collapsing into one generic card (notes/45-sharing-and-virality.md).

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Light keyword → tagline table for og:description flavor. The real
// mood → palette/word-bank tables live client-side in public/index.html;
// this is a small, separate copy, same call as constructor's version.
const MOODS: { keys: string[]; line: string }[] = [
  { keys: ["space", "star", "planet", "moon", "rocket", "cosmic", "galaxy"], line: "staged with a foil-star backdrop and one very committed cotton-ball nebula." },
  { keys: ["ocean", "sea", "wave", "fish", "coral", "tide", "boat"], line: "staged in blue cellophane, with a seashell chorus line." },
  { keys: ["forest", "tree", "garden", "leaf", "moss", "woods", "plant"], line: "staged with real moss, glued down before anyone could stop it." },
  { keys: ["cat", "kitten", "dog", "puppy", "pet", "animal"], line: "staged with a cast that mostly wants to know when snack time is." },
  { keys: ["ghost", "spooky", "haunt", "halloween", "skeleton", "witch"], line: "staged after dark, cobwebs optional but strongly encouraged." },
  { keys: ["robot", "machine", "gear", "circuit", "tech", "cyborg"], line: "staged with a bottle-cap gear that almost, almost turns." },
  { keys: ["party", "birthday", "cake", "balloon", "celebrat"], line: "staged mid-confetti-toss, the best possible moment to freeze." },
  { keys: ["love", "heart", "romance", "date", "crush"], line: "staged with a pressed flower and a note nobody's supposed to read yet." },
  { keys: ["food", "cafe", "coffee", "pizza", "kitchen", "recipe", "snack"], line: "staged with clay-dough pastries that smell like nothing, tragically." },
  { keys: ["music", "song", "band", "guitar", "beat", "concert"], line: "staged mid-song, on a matchstick-guitar budget." },
  { keys: ["winter", "snow", "ice", "cold", "frost"], line: "staged in cotton snow, with a tea-light doing its best as a fireplace." },
  { keys: ["city", "night", "neon", "street", "urban"], line: "staged under a foil skyline, one string light standing in for the whole grid." },
  { keys: ["dragon", "castle", "wizard", "magic", "fantasy", "sword"], line: "staged with a cardboard turret that's held up longer than expected." },
  { keys: ["rain", "cozy", "blanket", "tea", "quiet"], line: "staged with a felt blanket and a lamp turned down low." },
  { keys: ["arcade", "retro", "pixel", "game", "8-bit", "console"], line: "staged with a cardboard cabinet and a bead for a joystick." },
];
const DEFAULT_LINE = "staged out of whatever was in the craft box.";

function titleCase(words: string[]): string {
  return words.map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

function decode(slug: string): { title: string; line: string } {
  const words = slug.split("-").filter(Boolean);
  const title = titleCase(words) || "An Unspecified Scene";
  const joined = " " + words.join(" ") + " ";
  const mood = MOODS.find((m) => m.keys.some((k) => joined.includes(" " + k) || joined.includes(k)));
  return { title, line: mood ? mood.line : DEFAULT_LINE };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "diorama — tell it what to stage";
const GENERIC_DESC =
  "a little shoebox theater: describe a web page, it builds a one-off paper-craft scene for it on the spot and hands you a link to the finished set.";
// Matched as a full quoted attribute — the bare URL is also a prefix of the
// og:image URL ("…/og.png"), so a naive split/join on it would corrupt that
// too (bug caught building didscope's version of this; see sites/sidenote).
const GENERIC_OG_URL_ATTR = 'content="https://diorama.bisks.net/"';

async function renderBuild(env: Env, request: Request, slug: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const clean = decodeURIComponent(slug).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!clean) return new Response(html, { headers: base.headers });

  const { title, line } = decode(clean);
  const fullTitle = `diorama: ${title}`;
  const desc = `set list on file for "${title}" — ${line}`;
  const ogUrl = `https://diorama.bisks.net/b/${clean}`;

  html = html
    .split(GENERIC_TITLE).join(esc(fullTitle))
    .split(GENERIC_DESC).join(esc(desc))
    .split(GENERIC_OG_URL_ATTR).join(`content="${ogUrl}"`);

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /b/<slug> — one real URL per build, so every shared link unfurls with
    // its own title/description instead of collapsing into a generic card.
    const m = url.pathname.match(/^\/b\/([^/]+)\/?$/);
    if (m) return renderBuild(env, request, m[1]);

    return env.ASSETS.fetch(request);
  },
};
