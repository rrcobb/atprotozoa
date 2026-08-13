// constructor Worker — constructor.bisks.net
//
// The generator itself is entirely client-side (public/index.html): type a
// prompt, get a deterministic little "blueprint" page back, no server round
// trip. The one thing that needed a server: shared links. A plain static
// site serves the same index.html — same og:title/description — no matter
// what's in the URL, so every build shared to Bluesky unfurls as one generic
// card forever (same problem didscope hit with /s/<handle>; see
// notes/45-sharing-and-virality.md).
//
// Fix: /b/<slug> is a real, distinct URL per build. The Worker decodes the
// slug back into words server-side and stamps a personalized
// og:title/og:description onto the same page shell before handing it back,
// so a link-unfurl cache gets one entry per build instead of one for the
// whole site. The client does the actual (identical, deterministic)
// generation from the same slug on load — see decodeSlug()/build() in
// public/index.html, which this file's decode() mirrors just enough to
// write the two og: lines.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

// Light keyword → tagline table, just for og:description flavor. The real
// mood → palette/word-bank tables live client-side in public/index.html;
// this is a small, separate copy (server-side duplication within one site,
// not a shared package across sites — same call as didscope's SIGNS table).
const MOODS: { keys: string[]; line: string }[] = [
  { keys: ["space", "star", "planet", "moon", "rocket", "cosmic", "galaxy"], line: "assembled from orbital-grade parts, stress-tested for vacuum." },
  { keys: ["ocean", "sea", "wave", "fish", "coral", "tide", "boat"], line: "assembled from a waterproof parts bin, tide-tested." },
  { keys: ["forest", "tree", "garden", "leaf", "moss", "woods", "plant"], line: "assembled from reclaimed timber and one very patient vine." },
  { keys: ["cat", "kitten", "dog", "puppy", "pet", "animal"], line: "assembled to withstand extensive paw-based quality inspection." },
  { keys: ["ghost", "spooky", "haunt", "halloween", "skeleton", "witch"], line: "assembled after midnight, per the union rules for haunted hardware." },
  { keys: ["robot", "machine", "gear", "circuit", "tech", "cyborg"], line: "assembled from off-the-shelf servos and one custom bracket." },
  { keys: ["party", "birthday", "cake", "balloon", "celebrat"], line: "assembled under confetti-fall conditions, rated for one (1) party." },
  { keys: ["love", "heart", "romance", "date", "crush"], line: "assembled with a tolerance of zero for anything less than sincere." },
  { keys: ["food", "cafe", "coffee", "pizza", "kitchen", "recipe", "snack"], line: "assembled to spec, then immediately smells like something good." },
  { keys: ["music", "song", "band", "guitar", "beat", "concert"], line: "assembled to hold a rhythm even after the warranty expires." },
  { keys: ["winter", "snow", "ice", "cold", "frost"], line: "assembled below freezing, every joint rated for frost." },
  { keys: ["city", "night", "neon", "street", "urban"], line: "assembled under sodium light, delivered before the shift ends." },
  { keys: ["dragon", "castle", "wizard", "magic", "fantasy", "sword"], line: "assembled from a spec sheet that includes one (1) miracle." },
  { keys: ["rain", "cozy", "blanket", "tea", "quiet"], line: "assembled slowly, on purpose, with the good mug nearby." },
  { keys: ["arcade", "retro", "pixel", "game", "8-bit", "console"], line: "assembled from parts salvaged off a decommissioned cabinet." },
];
const DEFAULT_LINE = "assembled to spec from whatever was on the bench.";

function titleCase(words: string[]): string {
  return words
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function decode(slug: string): { title: string; line: string } {
  const words = slug.split("-").filter(Boolean);
  const title = titleCase(words) || "An Unspecified Assembly";
  const joined = " " + words.join(" ") + " ";
  const mood = MOODS.find((m) => m.keys.some((k) => joined.includes(" " + k) || joined.includes(k)));
  return { title, line: mood ? mood.line : DEFAULT_LINE };
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GENERIC_TITLE = "constructor — tell it what to build";
const GENERIC_DESC =
  "a little universal constructor: describe a web page, it assembles a one-off blueprint for it on the spot and hands you a link to the finished build.";
// Matched as a full quoted attribute — the bare URL is also a prefix of the
// og:image URL ("…/og.png"), so a naive split/join on it would corrupt that
// too (bug caught building didscope's version of this; see sites/sidenote).
const GENERIC_OG_URL_ATTR = 'content="https://constructor.bisks.net/"';

async function renderBuild(env: Env, request: Request, slug: string): Promise<Response> {
  const base = await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
  let html = await base.text();

  const clean = decodeURIComponent(slug).toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!clean) return new Response(html, { headers: base.headers });

  const { title, line } = decode(clean);
  const fullTitle = `constructor: ${title}`;
  const desc = `spec on file for "${title}" — ${line}`;
  const ogUrl = `https://constructor.bisks.net/b/${clean}`;

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
