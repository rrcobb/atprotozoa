// Regenerate public/data/fleet.json from the repo's own sites/*/site.json
// manifests — same source apex's gallery, receipts, rateyourbuild, orrery,
// and fleetswipe all read (see audit/build-gallery.mjs,
// sites/receipts/sync-asks.mjs, sites/rateyourbuild/sync-catalog.mjs,
// sites/orrery/sync-fleet.mjs, sites/fleetswipe/sync-fleet.mjs). Every
// manifest becomes one tile fleetwatch pings, so a site missing here is a
// site nobody's watching.
//
// This is a snapshot, not a live view — re-run this by hand (or fold it
// into a future daily-slot pass) when the board starts looking stale.
//
// Usage:
//   node sites/fleetwatch/sync-fleet.mjs           # check: does the file match?
//   node sites/fleetwatch/sync-fleet.mjs --apply   # rewrite it from the manifests
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const OUT = "sites/fleetwatch/public/data/fleet.json";

const sites = readdirSync("sites")
  .filter((n) => existsSync(`sites/${n}/site.json`))
  .map((n) => JSON.parse(readFileSync(`sites/${n}/site.json`, "utf8")))
  .filter((s) => !s.hidden && s.url && s.name !== "fleetwatch")
  .sort((a, b) => a.name.localeCompare(b.name));

const KNOWN_TYPES = new Set(["toy", "game", "tool", "joke", "explainer", "art"]);

const next = {
  count: sites.length,
  sites: sites.map((s) => ({
    name: s.name,
    url: s.url,
    title: s.title || s.name,
    type: KNOWN_TYPES.has(s.type) ? s.type : "other",
    by: s.by || null,
  })),
};

const nextStr = JSON.stringify(next, null, 2) + "\n";
const prevStr = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";

if (!APPLY) {
  const same = nextStr === prevStr;
  console.log(`${next.sites.length} sites from manifests`);
  console.log(same ? "fleet.json is up to date" : "fleet.json DIFFERS from the manifests (run with --apply)");
  process.exit(same ? 0 : 1);
}

writeFileSync(OUT, nextStr);
console.log(`wrote ${next.sites.length} sites into ${OUT}`);
