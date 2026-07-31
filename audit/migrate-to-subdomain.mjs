// Move sites back onto their own <name>.bisks.net subdomain.
//
// Three edits per site, each applied only if needed:
//   1. wrangler.toml — add a `<name>.bisks.net/*` hostname route, keeping any
//      existing path routes so old shared links keep working. Sites on
//      `custom_domain = true` are CONVERTED to a hostname route: a wildcard
//      catch-all shadows a Custom Domain but loses to a hostname route, so the
//      fallback Worker can only go live once nothing is left on custom domains.
//   2. src/index.ts — guard the mount-prefix strip so it only fires when the
//      prefix is actually present. Unconditional slicing mangles asset paths
//      on the subdomain ("/app.js".slice(6) -> "") and silently serves
//      index.html for every asset.
//   3. public/**.js|html — a hardcoded `const MOUNT = "/<name>"` becomes
//      location-derived so share links and API calls work under both hosts.
//
// Deliberately conservative: anything that doesn't match the expected shape is
// SKIPPED and reported, never rewritten on a guess.
//
// Usage:
//   node audit/migrate-to-subdomain.mjs                 # dry run, all sites
//   node audit/migrate-to-subdomain.mjs --apply         # write changes
//   node audit/migrate-to-subdomain.mjs --apply a b c   # only these sites
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const sitesDir = new URL("./sites/", root);

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const only = argv.filter((a) => !a.startsWith("--"));

const skipped = [];
const changed = [];

function migrateToml(name, toml) {
  const hostPattern = `{ pattern = "${name}.bisks.net/*", zone_name = "bisks.net" }`;
  if (toml.includes(`"${name}.bisks.net/*"`)) return null; // already done

  const custom = /\{\s*pattern\s*=\s*"([^"]+)"\s*,\s*custom_domain\s*=\s*true\s*\}/;
  if (custom.test(toml)) {
    // Replace the custom_domain entry with an equivalent hostname route.
    return toml.replace(custom, (_m, host) => {
      if (host !== `${name}.bisks.net`) return _m; // unexpected host, leave alone
      return hostPattern;
    });
  }

  // Otherwise prepend the hostname route to the existing routes array.
  const routes = /routes\s*=\s*\[\s*\n/;
  if (!routes.test(toml)) return undefined; // unrecognised shape -> skip
  return toml.replace(routes, (m) => m + `  ${hostPattern},\n`);
}

function migrateWorker(src) {
  // Already guarded?
  if (/startsWith\(\s*PREFIX/.test(src)) return null;
  const slice = /(\n\s*)url\.pathname = url\.pathname\.slice\(PREFIX\.length\) \|\| "\/";/;
  if (!slice.test(src)) return undefined; // unrecognised shape -> skip
  return src.replace(slice, (_m, indent) =>
    `${indent}// Only strip when the prefix is actually present — on the subdomain` +
    `${indent}// requests arrive without it, and an unconditional slice would chop` +
    `${indent}// the front off short paths ("/app.js" -> "") so every asset would` +
    `${indent}// silently serve index.html.` +
    `${indent}if (url.pathname.startsWith(PREFIX + "/")) {` +
    `${indent}  url.pathname = url.pathname.slice(PREFIX.length) || "/";` +
    `${indent}}`,
  );
}

function migrateMount(txt, name) {
  const re = new RegExp(
    `((?:const|let|var)\\s+MOUNT\\s*=\\s*)["'\`]/${name}["'\`]\\s*;`,
  );
  if (!re.test(txt)) return undefined;
  return txt.replace(
    re,
    `$1location.pathname.startsWith("/${name}") ? "/${name}" : "";`,
  );
}

for (const name of readdirSync(sitesDir).sort()) {
  if (only.length && !only.includes(name)) continue;
  const dir = new URL(`./${name}/`, sitesDir);
  const tomlUrl = new URL("./wrangler.toml", dir);
  if (!existsSync(tomlUrl)) continue;

  const edits = [];

  const toml = readFileSync(tomlUrl, "utf8");
  const newToml = migrateToml(name, toml);
  if (newToml === undefined) skipped.push(`${name}: unrecognised routes block`);
  else if (newToml !== null) edits.push([tomlUrl, newToml, "routes"]);

  const idxUrl = new URL("./src/index.ts", dir);
  if (existsSync(idxUrl)) {
    const src = readFileSync(idxUrl, "utf8");
    const newSrc = migrateWorker(src);
    if (newSrc === undefined) {
      if (/PREFIX/.test(src)) skipped.push(`${name}: unrecognised prefix-strip`);
    } else if (newSrc !== null) edits.push([idxUrl, newSrc, "strip"]);
  }

  const pubDir = new URL("./public/", dir);
  if (existsSync(pubDir)) {
    const walk = (d, rel = "") => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const child = new URL(`./${e.name}${e.isDirectory() ? "/" : ""}`, d);
        if (e.isDirectory()) walk(child, rel + e.name + "/");
        else if (/\.(js|html)$/.test(e.name)) {
          const txt = readFileSync(child, "utf8");
          if (!/(const|let|var)\s+MOUNT\s*=\s*["'`]/.test(txt)) continue;
          const out = migrateMount(txt, name);
          if (out === undefined) skipped.push(`${name}: MOUNT in ${rel}${e.name} not the expected literal`);
          else edits.push([child, out, `mount:${rel}${e.name}`]);
        }
      }
    };
    walk(pubDir);
  }

  if (!edits.length) continue;
  changed.push(`${name}  [${edits.map((e) => e[2]).join(" ")}]`);
  if (APPLY) for (const [url, content] of edits) writeFileSync(url, content);
}

for (const c of changed) console.log(c);
if (skipped.length) {
  console.log(`\n--- SKIPPED (${skipped.length}), handle by hand ---`);
  for (const s of skipped) console.log("  " + s);
}
console.log(`\n${changed.length} sites ${APPLY ? "migrated" : "would change"}, ${skipped.length} skipped`);
if (!APPLY) console.log("DRY RUN — pass --apply to write.");
