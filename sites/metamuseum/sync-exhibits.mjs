// Regenerate public/data/exhibits.json from the repo's own sites/*/site.json
// manifests — the same source the apex gallery, sites/receipts, and
// sites/rateyourbuild read (see audit/build-gallery.mjs, sites/receipts/
// sync-asks.mjs, sites/rateyourbuild/sync-catalog.mjs). The metamuseum's
// whole premise is a wall-text plaque for every piece the bot has built, so
// its catalog can't be hand-maintained without drifting the moment a new
// site lands — this script, re-run every future build per the standing
// order in sites/buildthis/builder/INSTRUCTIONS.md, is how that's kept true.
//
// Two things are pulled in from elsewhere rather than invented here:
//   - "reception" (critical reception) is sites/receipts' own hand-written
//     `roast` for the same site name, when one exists — receipts already
//     is the bot's in-house critic, so its verdict is the museum's verdict.
//   - "curatorNote", when a human or the bot has hand-written one directly
//     into a previous exhibits.json (this script preserves it across
//     regeneration, same pattern as receipts preserving `roast`), overrides
//     the generated wing wall-text with real curatorial prose for that one
//     piece — used for the museum's own self-referential exhibit.
//
// Usage:
//   node sites/metamuseum/sync-exhibits.mjs           # check: does the file match?
//   node sites/metamuseum/sync-exhibits.mjs --apply   # rewrite it from the manifests
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const OUT = "sites/metamuseum/public/data/exhibits.json";
const RECEIPTS = "sites/receipts/public/data/asks.json";

const MAIN_WINGS = new Set(["toy", "game", "tool", "joke", "explainer", "art"]);
const MEDIUM_NOISE = new Set(["live"]);
function mediumFor(s) {
  const t = (s.tag || "").trim().toLowerCase();
  const wing = (s.type || "misc").trim().toLowerCase();
  if (!t || t === wing || MAIN_WINGS.has(t) || MEDIUM_NOISE.has(t)) return null;
  return t;
}

const receipts = existsSync(RECEIPTS) ? JSON.parse(readFileSync(RECEIPTS, "utf8")) : [];
const receptionByName = new Map(receipts.filter((a) => a.roast).map((a) => [a.name, a.roast]));

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const curatorNotes = new Map(existing.filter((e) => e.curatorNote).map((e) => [e.name, e.curatorNote]));

const sites = readdirSync("sites")
  .filter((n) => existsSync(`sites/${n}/site.json`))
  .map((n) => JSON.parse(readFileSync(`sites/${n}/site.json`, "utf8")))
  .filter((s) => !s.hidden && s.blurb)
  .sort((a, b) => a.name.localeCompare(b.name));

const next = sites.map((s) => {
  const entry = {
    name: s.name,
    url: s.url,
    title: s.title || s.name,
    blurb: s.blurb,
    wing: MAIN_WINGS.has((s.type || "").toLowerCase()) ? s.type : "toy",
    medium: mediumFor(s),
    by: s.by || null,
    builtAt: s.builtAt || null,
    mentionUri: s.mentionUri || null,
    reception: receptionByName.get(s.name) || null,
  };
  const note = curatorNotes.get(s.name);
  if (note) entry.curatorNote = note;
  return entry;
});

const nextStr = JSON.stringify(next, null, 2) + "\n";
const prevStr = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";

if (!APPLY) {
  const same = nextStr === prevStr;
  console.log(`${next.length} exhibits from manifests (was ${existing.length})`);
  console.log(same ? "catalog is up to date" : "catalog DIFFERS from the manifests (run with --apply)");
  process.exit(same ? 0 : 1);
}

writeFileSync(OUT, nextStr);
console.log(`wrote ${next.length} exhibits into ${OUT}`);
