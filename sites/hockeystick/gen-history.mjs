// Regenerate src/history.json from this repo's own git history — real
// cumulative site-count-over-time, not fabricated growth. For each
// sites/<name>/site.json, the *first* commit that added it (via
// `git log --diff-filter=A --reverse`) is that site's birthday. A rename or
// re-add of the same path only counts once (first occurrence wins, since the
// log is walked oldest-first).
//
// The resulting series is what the deck's chart draws: one point per day a
// site.json was added, with a running cumulative total. `asOfCount` /
// `asOfDate` mark where this snapshot ends — the Worker fetches the live
// GitHub contents API at request time and reports the delta since this file
// was last regenerated, so the deck stays honest about what's baked-in
// history vs. what's live.
//
// Usage:
//   node sites/hockeystick/gen-history.mjs           # check: does it match?
//   node sites/hockeystick/gen-history.mjs --apply   # rewrite src/history.json
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const OUT = "sites/hockeystick/src/history.json";

const log = execSync(
  `git log --diff-filter=A --name-only --format=COMMIT%x09%aI --reverse -- 'sites/*/site.json'`,
  { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 },
).toString("utf8");

const seenSites = new Set();
const firstSeenDate = new Map(); // "YYYY-MM-DD" -> count of sites first-seen that day

let currentDate = null;
for (const line of log.split("\n")) {
  if (line.startsWith("COMMIT\t")) {
    currentDate = line.slice("COMMIT\t".length).trim();
    continue;
  }
  const path = line.trim();
  if (!path) continue;
  const m = path.match(/^sites\/([^/]+)\/site\.json$/);
  if (!m) continue;
  const site = m[1];
  if (seenSites.has(site)) continue; // rename/re-add of the same site — first date wins
  seenSites.add(site);
  const day = currentDate.slice(0, 10); // UTC-offset-naive day bucket, matches the commit's own date
  firstSeenDate.set(day, (firstSeenDate.get(day) || 0) + 1);
}

const days = [...firstSeenDate.keys()].sort();
let cumulative = 0;
const series = days.map((date) => {
  cumulative += firstSeenDate.get(date);
  return { date, added: firstSeenDate.get(date), cumulative };
});

const next = {
  series,
  asOfCount: cumulative,
  asOfDate: new Date().toISOString(),
  totalSitesCounted: seenSites.size,
};

const nextStr = JSON.stringify(next, null, 2) + "\n";
const prevStr = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";

if (!APPLY) {
  const same = nextStr === prevStr;
  console.log(`${series.length} days, ${cumulative} sites (was ${existsSync(OUT) ? JSON.parse(prevStr).asOfCount : "none"})`);
  console.log(same ? "history is up to date" : "history DIFFERS (run with --apply)");
  process.exit(same ? 0 : 1);
}

writeFileSync(OUT, nextStr);
console.log(`wrote ${series.length} days / ${cumulative} sites into ${OUT}`);
