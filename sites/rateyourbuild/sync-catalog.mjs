// Regenerate public/data/catalog.json from the repo's own sites/*/site.json
// manifests — the same source the apex gallery and sites/receipts read (see
// audit/build-gallery.mjs, sites/receipts/sync-asks.mjs). rateyourbuild rates
// every site the bot has built, so its catalog can't be hand-maintained
// without drifting the moment a new site lands; this script is how "keep up
// to date somehow" (the original ask) actually gets satisfied — see the
// standing order in sites/buildthis/builder/INSTRUCTIONS.md that re-runs
// this every future build.
//
// Usage:
//   node sites/rateyourbuild/sync-catalog.mjs           # check: does the file match?
//   node sites/rateyourbuild/sync-catalog.mjs --apply   # rewrite it from the manifests
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const OUT = "sites/rateyourbuild/public/data/catalog.json";

// "Genre" is site.type (toy/game/tool/joke/explainer/art — matches the apex
// gallery's own filter, see sites/rateyourbuild/public/lib/genres.js for the
// descriptions + super-genre grouping the genre/super-genre pages read).
// "Subgenre" reuses the freeform site.tag field most sites already carry,
// filtered down to values that actually add information: drop it when it's
// missing, when it's just the genre word again (the common case — most
// site.json tag values just repeat type), and when it's "live", a
// data-freshness marker rather than a topical tag, not a genre distinction.
const MAIN_GENRES = new Set(["toy", "game", "tool", "joke", "explainer", "art"]);
const SUBGENRE_NOISE = new Set(["live"]);
function subgenreFor(s) {
  const t = (s.tag || "").trim().toLowerCase();
  const genre = (s.type || "misc").trim().toLowerCase();
  if (!t || t === genre || MAIN_GENRES.has(t) || SUBGENRE_NOISE.has(t)) return null;
  return t;
}

const sites = readdirSync("sites")
  .filter((n) => existsSync(`sites/${n}/site.json`))
  .map((n) => JSON.parse(readFileSync(`sites/${n}/site.json`, "utf8")))
  .filter((s) => !s.hidden && s.blurb)
  .sort((a, b) => a.name.localeCompare(b.name));

const next = sites.map((s) => ({
  name: s.name,
  url: s.url,
  title: s.title || s.name,
  blurb: s.blurb,
  genre: s.type || "misc",
  subgenre: subgenreFor(s),
  by: s.by || null,
  builtAt: s.builtAt || null,
  // The at:// URI of the post that originally tagged the bot for this build
  // (site.json's own mentionUri, when the bot recorded one) — lets the
  // per-site rateyourbuild page link straight to the original ask, so a
  // reviewer has real context before rating. Missing on builds that predate
  // mentionUri being recorded; the site page falls back to the prompter's
  // profile in that case.
  mentionUri: s.mentionUri || null,
}));

const nextStr = JSON.stringify(next, null, 2) + "\n";
const prevStr = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";

if (!APPLY) {
  const same = nextStr === prevStr;
  console.log(`${next.length} sites in the catalog (was ${prevStr ? JSON.parse(prevStr).length : 0})`);
  console.log(same ? "catalog is up to date" : "catalog DIFFERS from the manifests (run with --apply)");
  process.exit(same ? 0 : 1);
}

writeFileSync(OUT, nextStr);
console.log(`wrote ${next.length} sites into ${OUT}`);
