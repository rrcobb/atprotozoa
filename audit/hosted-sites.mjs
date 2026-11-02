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
// --apply adds a new site with no options. The prefix / spa options are set
// by audit/migrate-to-host.mjs for migrated sites; a new site has no mount
// prefix, and one that wants SPA routing sets "spa": true by hand.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const MANIFEST = "fallback/sites.json";

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
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
  for (const n of added) manifest.sites[n] = {};
  for (const n of dropped) delete manifest.sites[n];
  manifest.sites = Object.fromEntries(Object.entries(manifest.sites).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${MANIFEST}: ${hosted.length} hosted sites (+${added.length} -${dropped.length})`);
} else {
  console.log(`${hosted.length} hosted sites`);
  if (problems.length) console.log(problems.join("\n") + `\n(run node audit/hosted-sites.mjs --apply)`);
}
if (blocking.length) console.log(blocking.join("\n"));
process.exit(blocking.length || (!APPLY && problems.length) ? 1 : 0);
