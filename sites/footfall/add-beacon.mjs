// Retrofits the footfall beacon (public/beacon.js on footfall.bisks.net) onto
// every OTHER site's public/index.html, so the leaderboard tracks real
// traffic instead of starting hollow. Idempotent and mechanical — safe to
// re-run any time a new site is added; existing beacons are left alone.
//
// Standing order (see sites/buildthis/builder/INSTRUCTIONS.md): after
// building or editing a site, run this with --apply so the new/changed site
// picks up tracking on its next deploy, same shape as sites/receipts'
// sync-asks.mjs standing order.
//
// Skips:
//   - footfall itself (it tracks the rest of the constellation, not itself)
//   - sites with a RETIRED.md (down by request; left alone entirely)
//   - sites with no public/index.html (a handful of multi-page / dynamic
//     sites render their own root — see the printed skip list)
//   - a site whose index.html already references footfall.bisks.net/beacon.js
//
// Usage:
//   node sites/footfall/add-beacon.mjs           # dry run: report what would change
//   node sites/footfall/add-beacon.mjs --apply   # actually write the snippet in

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const MARKER = "footfall.bisks.net/beacon.js";

function snippetFor(name) {
  return `<script defer src="https://footfall.bisks.net/beacon.js" data-site="${name}"></script>`;
}

const names = readdirSync("sites").filter((n) => existsSync(`sites/${n}/wrangler.toml`));

let added = 0;
let already = 0;
const skippedNoIndex = [];
const skippedRetired = [];

for (const name of names) {
  if (name === "footfall") continue;
  const dir = `sites/${name}`;
  if (existsSync(`${dir}/RETIRED.md`)) {
    skippedRetired.push(name);
    continue;
  }
  const indexPath = `${dir}/public/index.html`;
  if (!existsSync(indexPath)) {
    skippedNoIndex.push(name);
    continue;
  }

  const html = readFileSync(indexPath, "utf8");
  if (html.includes(MARKER)) {
    already++;
    continue;
  }

  const bodyClose = /<\/body>/i;
  if (!bodyClose.test(html)) {
    skippedNoIndex.push(`${name} (no </body>)`);
    continue;
  }

  added++;
  if (!APPLY) continue;

  const next = html.replace(bodyClose, `  ${snippetFor(name)}\n</body>`);
  writeFileSync(indexPath, next);
}

console.log(`${added} site(s) ${APPLY ? "beaconed" : "would be beaconed"}`);
console.log(`${already} already had the beacon`);
if (skippedRetired.length) console.log(`skipped ${skippedRetired.length} retired site(s): ${skippedRetired.join(", ")}`);
if (skippedNoIndex.length) console.log(`skipped ${skippedNoIndex.length} site(s) with no public/index.html </body>: ${skippedNoIndex.join(", ")}`);
if (!APPLY && added > 0) console.log("re-run with --apply to write the snippet in");
