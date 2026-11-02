// Keep fallback/sites.json in step with the hosted sites.
//
// A hosted site is a sites/<name>/ directory with no wrangler.toml: it has no
// Worker of its own, and fallback/ serves its public/ at <name>.bisks.net.
// See "Hosted sites" in notes/20-deploy.md.
//
// The manifest is how fallback knows which hostnames are real. If a hosted
// site is missing from it, the site answers "nothing here"; if a listed site
// has gained a wrangler.toml, it is in two places at once. This check fails
// the push on either, the way build-gallery.mjs does for the gallery.
//
// It also fails a hosted site that has a src/ directory, since nothing would
// ever run that code. A site that needs server code needs its own Worker.
//
// Usage:
//   node audit/hosted-sites.mjs           # check: does the manifest match?
//   node audit/hosted-sites.mjs --apply   # add new hosted sites, drop gone ones
//
// Each site also has a "group": the host Worker (hosts/<group>/,
// atprotozoa-host-<group>) that serves it. --apply puts a new site in whichever
// group has the fewest sites, so the groups stay even as sites arrive.
//
// --apply adds a new site with only a group. The prefix / spa options are set
// by audit/migrate-to-host.mjs for migrated sites; a new site has no mount
// prefix, and one that wants SPA routing sets "spa": true by hand.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const MANIFEST = "fallback/sites.json";

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const groups = readdirSync("hosts")
  .filter((n) => /^\d+$/.test(n) && existsSync(join("hosts", n, "wrangler.toml")))
  .map(Number)
  .sort((a, b) => a - b);
const validGroup = (g) => groups.includes(g);

function smallestGroup() {
  const size = new Map(groups.map((g) => [g, 0]));
  for (const o of Object.values(manifest.sites)) if (size.has(o.group)) size.set(o.group, size.get(o.group) + 1);
  return [...size].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0][0];
}
const hosted = readdirSync("sites", { withFileTypes: true })
  .filter((e) => e.isDirectory() && !existsSync(join("sites", e.name, "wrangler.toml")))
  .map((e) => e.name)
  .sort();

const problems = [];
const added = hosted.filter((n) => !Object.hasOwn(manifest.sites, n));
const dropped = Object.keys(manifest.sites).filter((n) => !hosted.includes(n));
for (const n of added) problems.push(`${n}: hosted (no wrangler.toml) but not in ${MANIFEST}`);
for (const n of dropped) {
  const why = existsSync(join("sites", n)) ? "has its own wrangler.toml" : "no longer exists";
  problems.push(`${n}: in ${MANIFEST} but ${why}`);
}
const ungrouped = Object.keys(manifest.sites).filter((n) => !dropped.includes(n) && !validGroup(manifest.sites[n].group));
for (const n of ungrouped) problems.push(`${n}: no group, or a group with no hosts/<group>/`);

// These need a person, not --apply.
const blocking = [];
for (const n of hosted) {
  if (!/^[a-z0-9-]+$/.test(n)) blocking.push(`${n}: not a valid hostname label`);
  if (!existsSync(join("sites", n, "public", "index.html"))) blocking.push(`${n}: hosted but has no public/index.html`);
  if (existsSync(join("sites", n, "src"))) {
    blocking.push(`${n}: hosted but has src/, which never runs — give it a wrangler.toml or delete src/`);
  }
}

if (APPLY) {
  for (const n of dropped) delete manifest.sites[n];
  for (const n of ungrouped) delete manifest.sites[n].group;
  for (const n of [...ungrouped, ...added].sort()) {
    manifest.sites[n] = { group: smallestGroup(), ...manifest.sites[n] };
  }
  manifest.sites = Object.fromEntries(Object.entries(manifest.sites).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  const sizes = groups.map((g) => Object.values(manifest.sites).filter((o) => o.group === g).length);
  console.log(`${MANIFEST}: ${hosted.length} hosted sites (+${added.length} -${dropped.length}), groups ${sizes.join("/")}`);
} else {
  console.log(`${hosted.length} hosted sites`);
  if (problems.length) console.log(problems.join("\n") + `\n(run node audit/hosted-sites.mjs --apply)`);
}
if (blocking.length) console.log(blocking.join("\n"));
process.exit(blocking.length || (!APPLY && problems.length) ? 1 : 0);
