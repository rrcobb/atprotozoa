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
  by: s.by || null,
  builtAt: s.builtAt || null,
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
