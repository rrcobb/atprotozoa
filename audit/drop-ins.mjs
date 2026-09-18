// Drop-ins: files that are copied verbatim into many sites and kept identical.
//
// The house rule is copy, don't abstract (notes/10). This is the third option
// that made the typeahead cutover a one-commit sweep: copy verbatim, never edit
// the copy. Edits go to the canonical file and get swept to every copy. No
// import, no package, no runtime coupling between sites — and a bad sweep is
// one revert. notes/41-drop-ins.md has the reasoning and the list.
//
// Usage, from the repo root:
//   node audit/drop-ins.mjs                 # report: copies per drop-in, which drifted
//   node audit/drop-ins.mjs --sweep         # overwrite every drifted copy with canonical
//   node audit/drop-ins.mjs --sweep visits  # sweep one drop-in only
//   node audit/drop-ins.mjs --json          # machine-readable report
//
// A drifted copy is one whose bytes differ from canonical. Before sweeping,
// look at the diff: a copy that drifted on purpose (a site that needed
// something the drop-in doesn't do) should be renamed, not overwritten — a
// drop-in with a site-specific edit is just a fork with a misleading name.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

// name -> canonical path. The file under public/lib/<name> in any other site
// is a copy. Keep this list short: a drop-in is small, has one call site, and
// carries its own fallback so a site never depends on it working.
export const DROP_INS = {
  "handle-typeahead.js": "sites/didscope/public/lib/handle-typeahead.js",
  "visits.js": "sites/didscope/public/lib/visits.js",
  "microcosm.js": "sites/listenheimer/public/lib/microcosm.js",
  "oauth-jwt.js": "sites/alice-meets-bob/public/lib/oauth-jwt.js",
};

const args = process.argv.slice(2);
const json = args.includes("--json");
const sweepIdx = args.indexOf("--sweep");
const sweep = sweepIdx !== -1;
const only = sweep ? args[sweepIdx + 1] : null;

const md5 = (buf) => createHash("md5").update(buf).digest("hex");

const sites = readdirSync("sites", { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const report = {};
for (const [name, canonical] of Object.entries(DROP_INS)) {
  if (!existsSync(canonical)) {
    report[name] = { canonical, error: "canonical file missing" };
    continue;
  }
  const want = readFileSync(canonical);
  const wantHash = md5(want);
  const copies = [];
  const drifted = [];
  for (const site of sites) {
    const p = join("sites", site, "public", "lib", name);
    if (!existsSync(p) || p === canonical) continue;
    copies.push(p);
    if (md5(readFileSync(p)) !== wantHash) drifted.push(p);
  }
  let swept = [];
  if (sweep && (!only || only === name || only === name.replace(/\.js$/, ""))) {
    for (const p of drifted) writeFileSync(p, want);
    swept = drifted;
  }
  report[name] = { canonical, copies: copies.length, drifted, swept };
}

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const [name, r] of Object.entries(report)) {
    if (r.error) {
      console.log(`${name}: ${r.error} (${r.canonical})`);
      continue;
    }
    const state = r.drifted.length ? `${r.drifted.length} drifted` : "all identical";
    console.log(`${name}: ${r.copies} copies of ${r.canonical} — ${state}`);
    for (const p of r.drifted) console.log(`  ${r.swept.includes(p) ? "swept   " : "drifted "} ${p}`);
  }
  if (!sweep && Object.values(report).some((r) => r.drifted?.length)) {
    console.log("\nRun with --sweep to overwrite drifted copies with canonical (look at the diffs first).");
  }
}
