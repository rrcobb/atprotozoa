// Assemble fallback's assets directory from the hosted sites.
//
// Every site listed in sites.json gets its public/ copied to .build/<name>/.
// wrangler.toml runs this as its [build] command, so `wrangler deploy` and
// `wrangler dev` both start from a fresh copy. .build/ is gitignored.
//
// A listed site with no public/index.html fails the build rather than
// deploying a hostname that would serve nothing.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sitesDir = join(here, "..", "sites");
const out = join(here, ".build");
const { sites } = JSON.parse(readFileSync(join(here, "sites.json"), "utf8"));

// Cloudflare's per-Worker asset limits (Workers Paid).
const MAX_FILES = 100_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

rmSync(out, { recursive: true, force: true });
mkdirSync(out);

const names = Object.keys(sites);
let files = 0;
let bytes = 0;
const problems = [];

function count(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) count(p);
    else {
      const size = statSync(p).size;
      if (size > MAX_FILE_BYTES) problems.push(`${p}: ${size} bytes, over the 25 MiB asset limit`);
      files++;
      bytes += size;
    }
  }
}

names.forEach((name, i) => {
  const pub = join(sitesDir, name, "public");
  if (existsSync(join(sitesDir, name, "wrangler.toml"))) {
    problems.push(`${name}: listed in sites.json but has its own wrangler.toml`);
  } else if (!existsSync(join(pub, "index.html"))) {
    problems.push(`${name}: no public/index.html`);
  } else {
    cpSync(pub, join(out, name), { recursive: true });
    count(join(out, name));
  }
  if ((i + 1) % 100 === 0) console.log(`copied ${i + 1}/${names.length} sites`);
});

if (files > MAX_FILES) problems.push(`${files} files, over the ${MAX_FILES}-file asset limit`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`built ${names.length} hosted sites: ${files} files, ${(bytes / 1e6).toFixed(1)} MB`);
