// Rewrite hardcoded https://bisks.net/<name> URLs to https://<name>.bisks.net.
//
// Every site now answers on its own subdomain, but ~800 absolute URLs across
// the repo still name the old path form. They still resolve — the path routes
// were kept — but they're what gets embedded in og:url, og:image and share
// text, so every future share propagates the old address.
//
// Only rewrites a target that is a real site directory. Notably `bisks.net/games`
// (the cluster index) is NOT a site and has no subdomain, so it's left alone.
//
// Usage: node audit/rewrite-path-urls.mjs [--apply]
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");

const isSite = (name) => existsSync(join("sites", name, "wrangler.toml"));

let files = 0;
let edits = 0;
const perSite = new Map();

function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      walk(p);
      continue;
    }
    if (!/\.(html|js|ts|json|md)$/.test(e.name)) continue;

    const before = readFileSync(p, "utf8");
    let n = 0;
    // Capture any trailing path so /<name>/og.png becomes <name>.bisks.net/og.png.
    const after = before.replace(
      /https:\/\/bisks\.net\/(?:games\/)?([a-z0-9-]+)((?:\/[^\s"'`)\]]*)?)/g,
      (full, name, rest) => {
        if (!isSite(name)) return full; // e.g. bisks.net/games, the cluster index
        n++;
        return `https://${name}.bisks.net${rest || "/"}`;
      },
    );
    if (!n) continue;
    files++;
    edits += n;
    const site = p.split("/")[1];
    perSite.set(site, (perSite.get(site) || 0) + n);
    if (APPLY) writeFileSync(p, after);
  }
}

walk("sites");

for (const [site, n] of [...perSite].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(4)}  ${site}`);
}
console.log(
  `\n${edits} URLs in ${files} files across ${perSite.size} sites ${APPLY ? "rewritten" : "would change"}`,
);
if (!APPLY) console.log("DRY RUN — pass --apply to write.");
