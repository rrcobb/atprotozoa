// Regenerate public/data/byline.json from the repo's own sites/*/site.json
// manifests — same source/pattern as sites/receipts/sync-asks.mjs and
// audit/build-gallery.mjs. Keeps the leaderboard from drifting behind the
// actual set of built sites: unlike footfall (frozen at whatever visits
// landed before the beacon was retired), this board is only ever built from
// data that still exists — the manifests — so it can be regenerated for as
// long as the bot keeps building things, with no shared write path required.
//
// Usage:
//   node sites/byline/sync-byline.mjs           # check: does the file match?
//   node sites/byline/sync-byline.mjs --apply   # rewrite it from the manifests
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const OUT = "sites/byline/public/data/byline.json";

const sites = readdirSync("sites")
  .filter((n) => existsSync(`sites/${n}/site.json`))
  .map((n) => JSON.parse(readFileSync(`sites/${n}/site.json`, "utf8")))
  .filter((s) => !s.hidden && s.by)
  .map((s) => ({
    name: s.name,
    url: s.url,
    title: s.title || s.name,
    by: s.by,
    type: s.type || "toy",
    tag: s.tag || null,
    builtAt: s.builtAt || null,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const nextStr = JSON.stringify(sites, null, 2) + "\n";
const prevStr = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";

if (!APPLY) {
  const same = nextStr === prevStr;
  console.log(`${sites.length} sites from manifests`);
  console.log(same ? "byline is up to date" : "byline DIFFERS from the manifests (run with --apply)");
  process.exit(same ? 0 : 1);
}

writeFileSync(OUT, nextStr);
console.log(`wrote ${sites.length} sites into ${OUT}`);
