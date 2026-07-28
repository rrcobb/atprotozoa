// Static check: find local script/link/import references that will 404 (or
// silently hit the wrong site) once deployed. Two distinct failure modes this
// catches, both seen in the wild:
//
//   1. Typo'd / stale relative path — the file just isn't there.
//   2. Absolute path ("/foo.js") on a path-mounted site that forgets the
//      site's mount prefix. Root-relative paths resolve against the *zone*
//      root (bisks.net/foo.js), not the site's mount (bisks.net/<site>/foo.js),
//      so these silently 404 or collide with another site once deployed —
//      exactly the class of bug behind the fitzcarraldo game-load report
//      (notes/20-deploy.md, "Migrated-to-path sites" section), just on the
//      asset-reference side instead of the Worker prefix-strip side.
//
// Pure filesystem analysis, no network/deploy access needed — run any time
// with `pnpm check:imports` from the repo root.
import { readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

function listSiteDirs() {
  const dirs = [];
  for (const name of readdirSync(path.join(REPO_ROOT, "sites"))) {
    const dir = path.join(REPO_ROOT, "sites", name);
    if (existsSync(path.join(dir, "wrangler.toml"))) dirs.push({ name, dir });
  }
  const apex = path.join(REPO_ROOT, "apex");
  if (existsSync(path.join(apex, "wrangler.toml"))) {
    dirs.push({ name: "apex", dir: apex });
  }
  return dirs;
}

// The mount PREFIX a site is served under ("" for a domain-root/subdomain
// site, "/name" or "/games/name" for a path-mounted one). Prefer the actual
// `const PREFIX = "..."` the site's own Worker strips (ground truth for what
// it does at runtime); fall back to deriving it from wrangler.toml's route
// pattern for the ~28 pure-[assets] sites that have no src/index.ts at all.
function sitePrefix({ name, dir }) {
  const idx = path.join(dir, "src", "index.ts");
  if (existsSync(idx)) {
    const m = readFileSync(idx, "utf8").match(/const\s+PREFIX\s*=\s*"([^"]*)"/);
    if (m) return m[1];
  }
  const toml = readFileSync(path.join(dir, "wrangler.toml"), "utf8");
  if (/custom_domain\s*=\s*true/.test(toml)) return "";
  const m = toml.match(/pattern\s*=\s*"bisks\.net(\/[^"*]+?)\/?\*?"/);
  return m ? m[1] : "";
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(html?|js|mjs)$/.test(entry.name)) out.push(p);
  }
  return out;
}

// Attribute-based refs (script src, link href, img/source/audio/video src).
const ATTR_RE = /<(script|link|img|source|audio|video)\b[^>]*?\s(src|href)=["']([^"']+)["']/gi;
// ES module refs inside .js/.mjs (and inline <script type="module">).
const IMPORT_RE = /\bimport\s[^;]*?\sfrom\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)|\bexport\s[^;]*?\sfrom\s*["']([^"']+)["']/g;

function extractRefs(content, isHtml) {
  const refs = [];
  if (isHtml) {
    for (const m of content.matchAll(ATTR_RE)) {
      refs.push({ raw: m[3], kind: `${m[1]}[${m[2]}]` });
    }
  }
  for (const m of content.matchAll(IMPORT_RE)) {
    const raw = m[1] || m[2] || m[3];
    if (raw) refs.push({ raw, kind: "import" });
  }
  return refs;
}

function isSkippable(raw) {
  return (
    raw === "" ||
    raw.startsWith("#") ||
    raw.startsWith("data:") ||
    raw.startsWith("mailto:") ||
    raw.startsWith("tel:") ||
    raw.startsWith("javascript:") ||
    raw.startsWith("//") || // protocol-relative -> external
    /^[a-z]+:\/\//i.test(raw) || // http(s)://, etc
    raw.includes("${") // template-literal built at runtime, not a static path
  );
}

// Bare module specifiers ("three", "three/addons/foo.js") aren't filesystem
// paths at all when the page defines an <script type="importmap"> — the
// browser resolves them against the map (often to a CDN), same as npm-style
// resolution. Collect every importmap in a site's public/ dir up front so
// both HTML and the JS it loads can be checked against it.
function siteImportMap(publicDir) {
  const specifiers = [];
  for (const file of walk(publicDir)) {
    if (!/\.html?$/.test(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const m of content.matchAll(/<script\s+type=["']importmap["']>([\s\S]*?)<\/script>/gi)) {
      try {
        const map = JSON.parse(m[1]);
        specifiers.push(...Object.keys(map.imports || {}));
      } catch {
        // malformed importmap JSON isn't this script's concern
      }
    }
  }
  return specifiers;
}

function isMappedByImportMap(raw, specifiers) {
  return specifiers.some((s) => (s.endsWith("/") ? raw.startsWith(s) : raw === s));
}

const findings = [];

for (const site of listSiteDirs()) {
  const publicDir = path.join(site.dir, "public");
  if (!existsSync(publicDir)) continue;
  const prefix = sitePrefix(site);
  const importMap = siteImportMap(publicDir);

  for (const file of walk(publicDir)) {
    const isHtml = /\.html?$/.test(file);
    const content = readFileSync(file, "utf8");
    // The URL this file is actually served at once deployed — used as the
    // base for resolving relative refs exactly like a browser would,
    // including clamping ".." at the site's mount root instead of letting it
    // escape onto the filesystem above public/.
    const servedPath = prefix + "/" + path.posix.relative(publicDir, file).split(path.sep).join("/");
    const baseUrl = "https://dummy" + servedPath;

    for (const { raw, kind } of extractRefs(content, isHtml)) {
      if (isSkippable(raw)) continue;
      if (isMappedByImportMap(raw, importMap)) continue;

      const targetPath = new URL(raw, baseUrl).pathname;

      if (prefix && !(targetPath === prefix || targetPath.startsWith(prefix + "/"))) {
        findings.push({
          site: site.name,
          file: path.relative(REPO_ROOT, file),
          kind,
          raw,
          reason: "resolves outside the site's mount prefix",
          detail: `site is mounted at "${prefix}" but "${raw}" resolves to bisks.net${targetPath} — will 404 (or hit an unrelated path) once deployed`,
        });
        continue;
      }

      const rest = prefix ? targetPath.slice(prefix.length) : targetPath;
      const onDisk = path.join(publicDir, ...rest.split("/"));
      if (!existsSync(onDisk) || statSync(onDisk).isDirectory()) {
        findings.push({
          site: site.name,
          file: path.relative(REPO_ROOT, file),
          kind,
          raw,
          reason: "file not found",
          detail: `resolves to ${path.relative(REPO_ROOT, onDisk)}, which doesn't exist`,
        });
      }
    }
  }
}

writeFileSync(
  path.join(REPO_ROOT, "audit/raw/import-paths.json"),
  JSON.stringify(findings, null, 2),
);

if (findings.length === 0) {
  console.log("check-import-paths: no broken local script/link/import paths found.");
} else {
  console.log(`check-import-paths: ${findings.length} broken reference(s):\n`);
  for (const f of findings) {
    console.log(`[${f.site}] ${f.file}`);
    console.log(`  ${f.kind} "${f.raw}" — ${f.reason}`);
    console.log(`  ${f.detail}\n`);
  }
  process.exitCode = 1;
}
