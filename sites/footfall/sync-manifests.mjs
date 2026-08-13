// Regenerate public/data/manifests.json from the repo's own sites/*/site.json
// manifests — the same source apex's gallery and sites/receipts' archive read
// (see audit/build-gallery.mjs and sites/receipts/sync-asks.mjs). This is the
// site -> prompter join the leaderboard page uses to roll live visit/dwell
// totals up per-prompter, client-side.
//
// Run from the repo root, same as sites/receipts/sync-asks.mjs:
//   node sites/footfall/sync-manifests.mjs           # check: does it match?
//   node sites/footfall/sync-manifests.mjs --apply   # rewrite it

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const OUT = "sites/footfall/public/data/manifests.json";

const sites = readdirSync("sites")
  .filter((n) => existsSync(`sites/${n}/site.json`))
  .map((n) => JSON.parse(readFileSync(`sites/${n}/site.json`, "utf8")))
  .filter((s) => !s.hidden && s.by)
  .map((s) => ({ name: s.name, url: s.url, title: s.title, by: s.by, type: s.type }))
  .sort((a, b) => a.name.localeCompare(b.name));

const nextStr = JSON.stringify(sites, null, 2) + "\n";
const prevStr = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";

if (!APPLY) {
  const same = nextStr === prevStr;
  console.log(`${sites.length} manifests found`);
  console.log(same ? "manifests.json is up to date" : "manifests.json DIFFERS from the source (run with --apply)");
  process.exit(same ? 0 : 1);
}

writeFileSync(OUT, nextStr);
console.log(`wrote ${sites.length} manifests into ${OUT}`);
