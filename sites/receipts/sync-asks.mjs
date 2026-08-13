// Regenerate public/data/asks.json from the repo's own sites/*/site.json
// manifests — the same source the apex gallery reads (see
// audit/build-gallery.mjs). Keeps the archive from silently drifting behind
// the actual set of built sites (it did: logs, trigrams, trigruessr, and
// receipts itself were all missing before this script existed).
//
// Any `roast` a human or the bot has hand-written onto an existing entry is
// preserved across regeneration — this script only adds/removes/refreshes
// the factual fields (name, url, by, type, blurb), never the commentary.
//
// Usage:
//   node sites/receipts/sync-asks.mjs           # check: does the file match?
//   node sites/receipts/sync-asks.mjs --apply   # rewrite it from the manifests
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const OUT = "sites/receipts/public/data/asks.json";

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const roasts = new Map(existing.filter((a) => a.roast).map((a) => [a.name, a.roast]));

const sites = readdirSync("sites")
  .filter((n) => existsSync(`sites/${n}/site.json`))
  .map((n) => JSON.parse(readFileSync(`sites/${n}/site.json`, "utf8")))
  .filter((s) => !s.hidden && s.blurb)
  .sort((a, b) => a.name.localeCompare(b.name));

const next = sites.map((s) => {
  const entry = { name: s.name, url: s.url, by: s.by, type: s.type, blurb: s.blurb };
  const roast = roasts.get(s.name);
  if (roast) entry.roast = roast;
  return entry;
});

const nextStr = JSON.stringify(next, null, 2) + "\n";
const prevStr = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";

if (!APPLY) {
  const same = nextStr === prevStr;
  console.log(`${next.length} asks from manifests (was ${existing.length})`);
  console.log(same ? "archive is up to date" : "archive DIFFERS from the manifests (run with --apply)");
  process.exit(same ? 0 : 1);
}

writeFileSync(OUT, nextStr);
console.log(`wrote ${next.length} asks into ${OUT}`);
