// Re-pull mino.mobi's own deploy registry and check the curated quiz catalog
// (public/data/mino-sites.json) against it. mino.mobi has ~100 top-level
// surfaces (and grows) — there's no honest way to auto-sort a new one into
// one of the 7 quiz categories or auto-write its blurb, so this script does
// NOT regenerate the file. It fetches the live registry, tells you which
// curated keys have vanished (drop them) and which surfaces are new since
// the categorized set was picked (add a few by hand, in the style of the
// existing entries, if any look fun), and leaves the actual editing to you.
//
// Usage:
//   node sites/mobiusmatch/sync-mino.mjs
import { readFileSync } from "node:fs";

const REGISTRY_URL = "https://mino.mobi/deploy-registry.json";
const CATALOG = "sites/mobiusmatch/public/data/mino-sites.json";

const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const known = new Set(catalog.sites.map((s) => s.key));

const res = await fetch(REGISTRY_URL);
if (!res.ok) {
  console.error(`fetch failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const registry = await res.json();
const live = new Set((registry.surfaces || []).map((s) => s.surface));

const gone = [...known].filter((k) => !live.has(k));
const fresh = [...live].filter((k) => !known.has(k));

console.log(`catalog has ${known.size} curated sites; registry has ${live.size} live surfaces`);
if (gone.length) {
  console.log(`\nno longer in the registry (remove from ${CATALOG}):`);
  for (const k of gone) console.log(`  - ${k}`);
}
if (fresh.length) {
  console.log(`\nnew since curation, not yet in the quiz (add by hand if one's a good fit):`);
  for (const k of fresh) console.log(`  - ${k}`);
}
if (!gone.length && !fresh.length) console.log("\nnothing to reconcile.");
