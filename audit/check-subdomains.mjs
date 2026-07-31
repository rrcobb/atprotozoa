// Verify every site answers on its own <name>.bisks.net subdomain, and that
// its assets resolve there too.
//
// The asset check is the point. A site whose Worker strips the mount prefix
// unconditionally still returns 200 for "/" on the subdomain — it just serves
// index.html for every asset request as well, so the page renders and nothing
// works. Fetching a real asset and checking the content-type catches that;
// fetching only "/" does not.
import { readFileSync, readdirSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const sitesDir = new URL("./sites/", root);
const CONCURRENCY = 8;

function firstAsset(name) {
  // Pick a real non-HTML asset the site actually ships, so a content-type of
  // text/html is unambiguous evidence of the prefix bug.
  const pub = new URL(`./${name}/public/`, sitesDir);
  if (!existsSync(pub)) return null;
  for (const e of readdirSync(pub, { withFileTypes: true })) {
    if (e.isFile() && /\.(js|css)$/.test(e.name)) return e.name;
  }
  return null;
}

async function head(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    return { status: res.status, type: res.headers.get("content-type") || "" };
  } catch (err) {
    return { status: 0, type: String(err.name || err) };
  }
}

const names = readdirSync(sitesDir)
  .filter((n) => existsSync(new URL(`./${n}/wrangler.toml`, sitesDir)))
  .sort();

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < names.length) {
    const name = names[cursor++];
    const root = await head(`https://${name}.bisks.net/`);
    const asset = firstAsset(name);
    let assetRes = null;
    if (asset) assetRes = await head(`https://${name}.bisks.net/${asset}`);
    results.push({ name, root, asset, assetRes });
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
results.sort((a, b) => a.name.localeCompare(b.name));

const bad = [];
for (const r of results) {
  const problems = [];
  if (r.root.status !== 200) problems.push(`root=${r.root.status}`);
  // An asset served as text/html means the prefix-strip mangled the path.
  if (r.assetRes && r.assetRes.status === 200 && /text\/html/.test(r.assetRes.type)) {
    problems.push(`asset ${r.asset} served as HTML`);
  }
  if (r.assetRes && r.assetRes.status !== 200) {
    problems.push(`asset ${r.asset}=${r.assetRes.status}`);
  }
  if (problems.length) bad.push(`${r.name.padEnd(22)} ${problems.join("  ")}`);
}

for (const b of bad) console.log(b);
console.log(`\n${results.length} sites checked, ${bad.length} with problems`);
