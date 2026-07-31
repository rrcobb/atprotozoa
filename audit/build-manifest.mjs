// Derive a canonical per-site record (sites/<name>/site.json) from whatever
// already describes that site, so the gallery can be GENERATED rather than
// hand-edited.
//
// Why: gallery cards were hand-written HTML in apex/public/index.html, with
// nothing tying a card to a site. That drift is not hypothetical — a buildthis
// run on 2026-07-28 committed a card for `beyondbsky` during a build of
// `simcluster-atlas`, and the site did not exist for three days. In the other
// direction, 16 live sites had no card at all and were unreachable from the
// front page.
//
// Sources, in priority order (first hit wins for each field):
//   1. the existing gallery card   — best copy, human-written, covers 169
//   2. the site's own <title> / meta description — covers 10 more
//   3. .buildthis.json             — requestedBy / builtAt / mentionUri
//
// Anything still missing is reported, never invented. Run with --apply to
// write the files.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const gallery = readFileSync("apex/public/index.html", "utf8");

// --- source 1: the existing gallery cards ---------------------------------
const cards = new Map();
const cardRe =
  /<a class="card"[^>]*data-site="([^"]+)"([^>]*)>\s*<h2>([\s\S]*?)<\/h2>\s*<p>([\s\S]*?)<\/p>/g;
for (const m of gallery.matchAll(cardRe)) {
  const [, name, attrs, h2, p] = m;
  const tag = h2.match(/<span class="tag">([^<]*)<\/span>/);
  cards.set(name, {
    title: h2.replace(/<span class="tag">[\s\S]*?<\/span>/, "").trim(),
    tag: tag ? tag[1].trim() : null,
    blurb: p.replace(/\s+/g, " ").trim(),
    by: (attrs.match(/data-by="([^"]*)"/) || [])[1] || null,
    type: (attrs.match(/data-type="([^"]*)"/) || [])[1] || null,
    src: (attrs.match(/data-src="([^"]*)"/) || [])[1] || null,
  });
}

// --- source 2: the site's own page ----------------------------------------
function fromPage(name) {
  const p = `sites/${name}/public/index.html`;
  if (!existsSync(p)) return {};
  const t = readFileSync(p, "utf8");
  const title = (t.match(/<title>([^<]*)<\/title>/) || [])[1];
  const desc = (t.match(/name="description" content="([^"]*)"/) || [])[1];
  return {
    // Site titles are usually "name — tagline"; the tagline is the useful half.
    title: title ? title.split(/\s+—\s+/)[0].trim() : undefined,
    blurb: desc && desc.length > 20 ? desc.trim() : undefined,
  };
}

// --- source 3: the bot's build record -------------------------------------
function fromBuildthis(name) {
  const p = `sites/${name}/.buildthis.json`;
  if (!existsSync(p)) return {};
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return { by: j.requestedBy || undefined, builtAt: j.builtAt || undefined, mentionUri: j.mentionUri || undefined };
  } catch {
    return {};
  }
}

// A site's public URL. Every site is on <name>.bisks.net now; the two path-only
// exceptions are the cluster index and the apex, which aren't gallery entries.
const urlFor = (name) =>
  name === "games" ? "https://bisks.net/games/" : `https://${name}.bisks.net/`;

// Sites that are live but deliberately not gallery entries: the bot itself,
// the cluster index, and anything retired on purpose.
const HIDDEN = new Set(["buildthis", "buildthis2", "games", "catsofatproto"]);

// Sites with no gallery card had no data-type either, and the front page's
// filter drops an untyped card from every specific filter. Classified from each
// site's own description, using the vocabulary already on the page
// (toy / game / tool / joke / explainer / art).
const FALLBACK_TYPES = {
  aphoverb: "game", beanjar: "toy", beesky: "toy", cobweb: "joke",
  crossbreed: "toy", didneighbors: "tool", mechpilot: "toy",
  mootstream: "art", quadrants: "tool", semanticmute: "tool",
  skyclone: "tool", solvers: "tool", "spot-the-ai": "game",
  "thread-heirloom": "tool", war: "game", wutangclam: "joke",
};

// The handful with no card and no usable meta description. Written by hand from
// each site's own title rather than generated, so they aren't invented copy.
const FALLBACK_BLURBS = {
  aphoverb: "proverb or aphorism? a quiz on the difference, which turns out to be slipperier than it sounds.",
  beanjar: "a jar of beans you can shake — real physics, real sound, no purpose whatsoever.",
  beesky: "your Bluesky mutuals as a 3D hive: fly through it and see who's near whom.",
  mootstream: "wind currents drawn from Bluesky's live pulse — the firehose as weather.",
  quadrants: "make your own alignment chart, drag people onto it, and publish it as a record.",
  semanticmute: "mute a concept rather than a word: it reads meaning, so it catches the paraphrases too.",
  war: "the card game war, played against the network — no decisions, just the slow reveal of who wins.",
};

const sites = readdirSync("sites")
  .filter((n) => existsSync(`sites/${n}/wrangler.toml`))
  .sort();

const incomplete = [];
let written = 0;

for (const name of sites) {
  const card = cards.get(name) || {};
  const page = fromPage(name);
  const bt = fromBuildthis(name);

  const rec = {
    name,
    url: urlFor(name),
    title: card.title || page.title || name,
    blurb: card.blurb || page.blurb || FALLBACK_BLURBS[name] || null,
    tag: card.tag || null,
    type: card.type || FALLBACK_TYPES[name] || null,
    by: card.by || bt.by || null,
    src: card.src || (bt.mentionUri ? "bot" : null),
    builtAt: bt.builtAt || null,
    mentionUri: bt.mentionUri || null,
    // Sites deliberately kept off the front page (infrastructure, retired).
    hidden: HIDDEN.has(name),
  };

  if (!rec.blurb && !rec.hidden) incomplete.push(name);
  if (APPLY) {
    writeFileSync(`sites/${name}/site.json`, JSON.stringify(rec, null, 2) + "\n");
    written++;
  }
}

console.log(`${sites.length} sites`);
console.log(`  from gallery card: ${sites.filter((s) => cards.has(s)).length}`);
console.log(`  needs a blurb written by hand (${incomplete.length}): ${incomplete.join(" ")}`);
if (APPLY) console.log(`\nwrote ${written} site.json files`);
else console.log("\nDRY RUN — pass --apply to write.");
