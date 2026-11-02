// Move sites off their own Worker and onto the shared host (fallback/).
//
// The account is over Cloudflare's 500-Worker cap, and since 2026-10-31 that
// blocks creating any new Worker. Most sites never needed one: their Worker
// only hands the request to ASSETS, sometimes after stripping a path-era mount
// prefix. Those can be served by fallback/, which already exists and already
// holds the *.bisks.net/* route. See "Hosted sites" in notes/20-deploy.md.
//
// A site is eligible only when the shared host reproduces what its own Worker
// does. That is checked, not assumed:
//
//   - wrangler.toml holds nothing but the standard fields: one
//     <name>.bisks.net/* route, assets from ./public, optional
//     run_worker_first, optional not_found_handling = "single-page-application",
//     observability, and Durable Object migrations whose classes are all deleted.
//   - the Worker code, if any, uses only the identifiers and literals of the
//     plain pass-through and the mount-prefix strip. Anything else (a share
//     route, an OG rewrite, an outbound fetch) makes it ineligible.
//   - public/ has no _headers or _redirects (those are per-Worker files and
//     would need prefixing).
//
// Usage:
//   node audit/migrate-to-host.mjs                  # classify every site, print a summary
//   node audit/migrate-to-host.mjs --list           # one line per site: name, verdict, reason
//   node audit/migrate-to-host.mjs --apply a b c    # migrate the named sites
//   node audit/migrate-to-host.mjs --apply --all    # migrate every eligible site
//
// --apply changes the repo only: it records the site in fallback/sites.json
// (with its prefix / spa options) and deletes its wrangler.toml and src/. The
// site keeps serving from its old Worker until that Worker's route is removed;
// see audit/cf-cutover.mjs.
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const MANIFEST = "fallback/sites.json";
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ALL = args.includes("--all");
const LIST = args.includes("--list");
const named = args.filter((a) => !a.startsWith("--"));

const stripJs = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

// Every identifier the plain pass-through and the prefix-strip variants use.
// A Worker whose code stays inside this set can only be doing one of those two.
const ALLOWED_IDS = new Set(
  `export interface Env ASSETS fetch req request Request Promise Response default async
   env const PREFIX prefix url URL pathname if return new startsWith slice length
   redirect toString else resolve mounted path assetUrl`.split(/\s+/),
);

function classify(name) {
  const dir = join("sites", name);
  const tomlPath = join(dir, "wrangler.toml");
  if (!existsSync(tomlPath)) return { ok: false, why: "no wrangler.toml (already hosted?)" };
  const toml = readFileSync(tomlPath, "utf8").replace(/#.*$/gm, "");

  // wrangler.toml: walk it line by line and allow only the standard shape.
  let main = null;
  let spa = false;
  let section = "";
  const routes = [...toml.matchAll(/pattern\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  if (routes.length !== 1 || routes[0] !== `${name}.bisks.net/*`) {
    return { ok: false, why: `routes are not exactly ${name}.bisks.net/*: ${routes.join(", ")}` };
  }
  if (/custom_domain/.test(toml)) return { ok: false, why: "custom_domain" };
  const created = new Set();
  const deleted = new Set();
  // Unroll an inline `assets = { directory = "./public", ... }` into an
  // [assets] table so the walk below sees one shape. The table goes last, since
  // in TOML every key after a table header belongs to that table.
  let body = toml.replace(/routes\s*=\s*\[[\s\S]*?\]/, "");
  const inline = body.match(/^assets\s*=\s*\{([^}]*)\}\s*$/m);
  if (inline) {
    body = body.replace(inline[0], "") + "\n[assets]\n" + inline[1].split(",").map((s) => s.trim()).join("\n");
  }
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const header = line.match(/^\[\[?([a-z_.]+)\]\]?$/);
    if (header) {
      section = header[1];
      if (!["assets", "migrations", "observability"].includes(section)) {
        return { ok: false, why: `wrangler.toml has [${section}]` };
      }
      continue;
    }
    const kv = line.match(/^([a-z_]+)\s*=\s*(.+)$/);
    if (!kv) return { ok: false, why: `unparsed wrangler.toml line: ${line}` };
    const [, key, value] = kv;
    if (section === "") {
      // The script name can differ from the directory (chatcontrol deploys as
      // atprotozoa-chatcontrol2); the hostname is what the host keys on.
      if (key === "name") {
        if (!/^"atprotozoa-[a-z0-9-]+"$/.test(value)) return { ok: false, why: `name is ${value}` };
      } else if (key === "main") main = value.replace(/"/g, "");
      else if (key !== "compatibility_date") return { ok: false, why: `wrangler.toml sets ${key}` };
    } else if (section === "assets") {
      if (key === "directory") {
        if (!['"./public"', '"public"'].includes(value)) return { ok: false, why: `assets from ${value}` };
      } else if (key === "not_found_handling") {
        if (value !== '"single-page-application"') return { ok: false, why: `not_found_handling ${value}` };
        spa = true;
      } else if (!["binding", "run_worker_first"].includes(key)) {
        return { ok: false, why: `[assets] sets ${key}` };
      }
    } else if (section === "migrations") {
      const classes = [...value.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      if (key === "new_sqlite_classes" || key === "new_classes") classes.forEach((c) => created.add(c));
      else if (key === "deleted_classes") classes.forEach((c) => deleted.add(c));
      else if (key !== "tag") return { ok: false, why: `[[migrations]] sets ${key}` };
    } else if (section === "observability") {
      if (key !== "enabled") return { ok: false, why: `[observability] sets ${key}` };
    }
  }
  const live = [...created].filter((c) => !deleted.has(c));
  if (live.length) return { ok: false, why: `live Durable Object classes: ${live.join(", ")}` };

  if (!existsSync(join(dir, "public", "index.html"))) return { ok: false, why: "no public/index.html" };
  for (const f of ["_headers", "_redirects", "_routes.json", ".assetsignore"]) {
    if (existsSync(join(dir, "public", f))) return { ok: false, why: `public/${f}` };
  }

  // Worker code: only the pass-through / prefix-strip vocabulary.
  let prefix = null;
  if (main) {
    const mainPath = join(dir, main);
    if (!existsSync(mainPath)) return { ok: false, why: `main ${main} missing` };
    const srcDir = join(dir, main.split("/")[0]);
    if (statSync(srcDir).isDirectory() && readdirSync(srcDir).length !== 1) {
      return { ok: false, why: `${main.split("/")[0]}/ has more than one file` };
    }
    const code = stripJs(readFileSync(mainPath, "utf8"));
    if (/\bimport\b/.test(code)) return { ok: false, why: "Worker imports a module" };
    const strings = [...code.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2]);
    const pm = code.match(/\b(?:PREFIX|prefix)\s*=\s*"([^"]+)"/);
    if (pm) prefix = pm[1];
    for (const s of strings) {
      if (s === "/" || s === prefix || s === prefix + "/") continue;
      return { ok: false, why: `Worker has the string literal "${s}"` };
    }
    if (/\/\^|\.test\(|\.match\(/.test(code)) return { ok: false, why: "Worker matches a pattern" };
    const ids = code.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "").match(/[A-Za-z_$][\w$]*/g) || [];
    const extra = [...new Set(ids.filter((id) => !ALLOWED_IDS.has(id)))];
    if (extra.length) return { ok: false, why: `Worker uses ${extra.join(", ")}` };
    if (/pathname/.test(code) && !prefix) return { ok: false, why: "rewrites the path without a PREFIX" };
    // solvers strips its prefix unconditionally, so its assets live under the
    // prefix; anything that slices without a startsWith guard isn't the
    // standard strip.
    if (prefix && !/startsWith\(/.test(code) && !/===\s*(?:PREFIX|prefix)/.test(code)) {
      return { ok: false, why: "prefix strip without a guard" };
    }
    if (prefix && !/startsWith\(/.test(code)) return { ok: false, why: "prefix strip without startsWith" };
  }

  const opts = {};
  if (prefix) opts.prefix = prefix;
  if (spa) opts.spa = true;
  return { ok: true, why: main ? (prefix ? `prefix ${prefix}` : "pass-through") : "static", opts };
}

const sites = readdirSync("sites").filter((n) => existsSync(join("sites", n, "wrangler.toml"))).sort();
const results = sites.map((name) => ({ name, ...classify(name) }));

if (!APPLY) {
  if (LIST) {
    for (const r of results) console.log(`${r.ok ? "eligible" : "keep    "}  ${r.name.padEnd(28)} ${r.why}`);
  }
  const ok = results.filter((r) => r.ok);
  const byKind = {};
  for (const r of ok) {
    const k = r.why.startsWith("prefix") ? "prefix" : r.why;
    byKind[k] = (byKind[k] || 0) + 1;
  }
  console.log(`${sites.length} sites with their own Worker; ${ok.length} eligible for the shared host`);
  console.log(`  ${JSON.stringify(byKind)}`);
  process.exit(0);
}

const targets = ALL ? results.filter((r) => r.ok).map((r) => r.name) : named;
if (!targets.length) {
  console.error("nothing to apply: name sites, or pass --all");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
let done = 0;
for (const name of targets) {
  const r = results.find((x) => x.name === name);
  if (!r || !r.ok) {
    console.error(`skip ${name}: ${r ? r.why : "no such site with a wrangler.toml"}`);
    continue;
  }
  const dir = join("sites", name);
  const toml = readFileSync(join(dir, "wrangler.toml"), "utf8");
  const main = toml.match(/^main\s*=\s*"([^"]+)"/m)?.[1];
  if (main) {
    const top = main.split("/")[0];
    rmSync(join(dir, top), { recursive: true, force: true });
  }
  rmSync(join(dir, "wrangler.toml"));
  manifest.sites[name] = r.opts;
  if (++done % 50 === 0) console.log(`${done}/${targets.length}`);
}
manifest.sites = Object.fromEntries(Object.entries(manifest.sites).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`migrated ${done} site(s) into ${MANIFEST}`);
