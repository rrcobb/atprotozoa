// Inventory Workers on the account against the 500-Worker cap.
//
// Background: the account sits above Cloudflare's 500-Worker limit (799 on
// 2026-11-02). Existing Workers serve and redeploy normally; CREATING a new one
// fails, with:
//
//   You have exceeded the limit of 500 Workers on your account. [code: 10037]
//
// Until 2026-10-29 newer wrangler versions got around that; since 2026-10-31
// every version gets 10037. The way out is moving sites onto fallback/ (state
// HOSTED below). See 'The 500-Worker cap' and 'Hosted sites' in
// notes/20-deploy.md.
//
// The failure does not always name the cap. `wrangler kv namespace create` has
// reported a bare "Authentication error [code: 10000]" and then succeeded on a
// plain retry, which sends you looking at auth instead.
//
// This tool has no --prune. Deleting a LIVE Worker deletes a site, which is a
// product decision, not a cleanup. The Workers that are safe to delete are the
// HOSTED ones, whose site fallback now serves; audit/cf-cutover.mjs removes
// those, checking each site before and after.
//
// Usage:
//   node audit/cf-workers.mjs              # inventory
//   node audit/cf-workers.mjs --json       # machine-readable, for other tools
//   node audit/cf-workers.mjs --stale 30   # flag sites not deployed in N days
//
// Auth: CLOUDFLARE_API_TOKEN if set (a token with Workers Scripts:Read), else
// the OAuth token `wrangler login` already stored in ~/.wrangler.
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID || "83803d427e6fd1a7d6408ed63e0a9191";
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || "1a089c79698cad41f55b2179d7880f25";
const API = "https://api.cloudflare.com/client/v4";
const CAP = 500;

// Workers that live at the repo root rather than under sites/. They are
// infrastructure, not experiments, and have no sites/<name> directory — without
// this list they read as orphans.
const ROOT_WORKERS = ["apex", "fallback", "watchtower", "trigrams"];

function wranglerOAuthToken() {
  const cfg = join(homedir(), ".wrangler", "config", "default.toml");
  if (!existsSync(cfg)) return null;
  const m = readFileSync(cfg, "utf8").match(/^oauth_token\s*=\s*"([^"]+)"/m);
  return m ? m[1] : null;
}

const TOKEN = process.env.CLOUDFLARE_API_TOKEN || wranglerOAuthToken();
if (!TOKEN) {
  console.error(
    "No credentials: set CLOUDFLARE_API_TOKEN or run `wrangler login`. See the header of this file.",
  );
  process.exit(1);
}

const JSON_OUT = process.argv.includes("--json");
const staleIdx = process.argv.indexOf("--stale");
const STALE_DAYS = staleIdx !== -1 ? Number(process.argv[staleIdx + 1]) : null;

const repoRoot = new URL("../", import.meta.url);
const manifestPath = new URL("./raw/cf-workers.json", import.meta.url);

async function cf(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || (body && body.success === false)) {
    throw new Error(
      `${init.method || "GET"} ${path} -> ${res.status} ${JSON.stringify(body?.errors)}`,
    );
  }
  return body?.result;
}

// The scripts endpoint returns the whole account in one response and ignores
// per_page, but page explicitly anyway: if that ever changes, a silent
// truncation here would under-report the cap and make the account look fine.
async function listScripts() {
  const all = [];
  const seen = new Set();
  for (let page = 1; ; page++) {
    const batch = await cf(`/accounts/${ACCOUNT_ID}/workers/scripts?per_page=100&page=${page}`);
    if (!batch?.length) break;
    const fresh = batch.filter((s) => !seen.has(s.id));
    for (const s of fresh) seen.add(s.id);
    all.push(...fresh);
    // No result_info comes back, so stop when a page repeats what we have
    // (the endpoint ignoring pagination) or returns a short page.
    if (!fresh.length || batch.length < 100) break;
  }
  return all;
}

// --- what the repo declares ------------------------------------------------

function repoSites() {
  const sites = new Map(); // name -> relative dir
  const sitesDir = new URL("./sites/", repoRoot);
  for (const name of readdirSync(sitesDir)) {
    if (name.startsWith(".")) continue;
    if (!existsSync(new URL(`./${name}/`, sitesDir))) continue;
    if (!statSync(new URL(`./${name}/`, sitesDir)).isDirectory()) continue;
    sites.set(name, `sites/${name}`);
  }
  for (const name of ROOT_WORKERS) {
    if (existsSync(new URL(`./${name}/wrangler.toml`, repoRoot))) sites.set(name, name);
  }
  // hosts/<n>/ deploys atprotozoa-host-<n>, a host Worker for hosted sites.
  const hostsDir = new URL("./hosts/", repoRoot);
  if (existsSync(hostsDir)) {
    for (const n of readdirSync(hostsDir)) {
      if (existsSync(new URL(`./${n}/wrangler.toml`, hostsDir))) sites.set(`host-${n}`, `hosts/${n}`);
    }
  }
  return sites;
}

// A site directory is a retirement stub if it ships a RETIRED.md.
// sites/catsofatproto is the standing example and must not be revived
// (notes/20-deploy.md).
function isRetiredStub(dir) {
  return existsSync(new URL(`./${dir}/RETIRED.md`, repoRoot));
}

// Sites served by fallback/ rather than a Worker of their own. A Worker named
// for one of them is left over from before the migration (audit/cf-cutover.mjs
// removes it).
const hosted = new Set(
  Object.keys(JSON.parse(readFileSync(new URL("./fallback/sites.json", repoRoot), "utf8")).sites),
);

// A Worker's name doesn't always match its directory (chatcontrol deploys as
// atprotozoa-chatcontrol2), so read the name each wrangler.toml declares.
function workerNames(sites) {
  const names = new Map(); // script id -> site
  for (const [site, dir] of sites) {
    const toml = new URL(`./${dir}/wrangler.toml`, repoRoot);
    if (!existsSync(toml)) continue;
    const m = readFileSync(toml, "utf8").match(/^name\s*=\s*"([^"]+)"/m);
    if (m) names.set(m[1], site);
  }
  return names;
}

function classify(script, sites, names) {
  const id = script.id;
  if (!id.startsWith("atprotozoa-")) {
    return { state: "FOREIGN", reason: "not an atprotozoa-* Worker", site: null };
  }
  const site = names.get(id) || id.replace(/^atprotozoa-/, "");
  const dir = sites.get(site);
  if (!dir) {
    return { state: "ORPHAN", reason: `no sites/${site} and not a root Worker`, site };
  }
  if (hosted.has(site)) {
    const routed = (script.routes || []).length > 0;
    return {
      state: "HOSTED",
      reason: routed
        ? `${dir} is hosted by fallback, but this Worker still holds its route`
        : `${dir} is hosted by fallback; this Worker is unused`,
      site,
    };
  }
  if (isRetiredStub(dir)) {
    return { state: "RETIRED", reason: `${dir} is a retirement stub but is still deployed`, site };
  }
  return { state: "LIVE", reason: dir, site };
}

// --- main ------------------------------------------------------------------

let scripts;
try {
  scripts = await listScripts();
} catch (err) {
  if (/-> 403|9109/.test(err.message)) {
    console.error(
      `Authenticated, but this identity cannot see account ${ACCOUNT_ID}.\n` +
        "That usually means the active credentials belong to a different\n" +
        "Cloudflare login than the one owning bisks.net. Check `wrangler whoami`.",
    );
    process.exit(1);
  }
  if (/Invalid access token|10000|Authentication/i.test(err.message)) {
    console.error(
      "Cloudflare rejected the credentials. The wrangler OAuth token expires —\n" +
        "run `wrangler login`, or set CLOUDFLARE_API_TOKEN to a token with\n" +
        "Workers Scripts:Read on the account.",
    );
    process.exit(1);
  }
  throw err;
}

// Routes are a ZONE resource, not a property of the script — the script list
// echoes them, but they are stored and deleted separately. That is the same
// shape as the DO namespaces that outlived their bindings, so a deleted Worker
// can strand its routes behind it. Right now the zone has none stranded; this
// check is here so that stays true after anything is deleted.
async function danglingRoutes(scriptIds) {
  const routes = await cf(`/zones/${ZONE_ID}/workers/routes`);
  return (routes || []).filter((r) => r.script && !scriptIds.has(r.script));
}

const sites = repoSites();
const names = workerNames(sites);
const now = Date.now();

const rows = scripts
  .map((s) => {
    const c = classify(s, sites, names);
    const ageDays = Math.floor((now - Date.parse(s.modified_on)) / 86400000);
    return {
      ...c,
      id: s.id,
      modified_on: s.modified_on,
      ageDays,
      routes: (s.routes || []).map((r) => r.pattern),
      has_assets: !!s.has_assets,
    };
  })
  .sort((a, b) => a.state.localeCompare(b.state) || a.id.localeCompare(b.id));

// Site directories with no deployed Worker. These are the free headroom: a
// directory that never deployed is not consuming a slot, and is also a site
// that silently is not live. Hosted sites are expected to have none.
const deployed = new Set(rows.filter((r) => r.site).map((r) => r.site));
const undeployed = [...sites.keys()].filter((n) => !deployed.has(n) && !hosted.has(n));

const byState = {};
for (const r of rows) (byState[r.state] ||= []).push(r);

const dangling = await danglingRoutes(new Set(rows.map((r) => r.id)));

const summary = {
  cap: CAP,
  total: rows.length,
  over: rows.length - CAP,
  byState: Object.fromEntries(Object.entries(byState).map(([k, v]) => [k, v.length])),
  undeployed,
  danglingRoutes: dangling.map((r) => ({ pattern: r.pattern, script: r.script, id: r.id })),
};

if (JSON_OUT) {
  console.log(JSON.stringify({ ...summary, workers: rows }, null, 2));
  process.exit(0);
}

// Print the states that need a human look in full; LIVE is the bulk and only
// gets a count, since listing 675 healthy sites buries everything else.
for (const state of ["FOREIGN", "ORPHAN", "RETIRED", "HOSTED"]) {
  const list = byState[state] || [];
  if (!list.length) continue;
  console.log(`\n=== ${state} (${list.length}) ===`);
  for (const r of list) {
    console.log(`  ${r.id.padEnd(40)} ${r.modified_on.slice(0, 10)}  ${r.reason}`);
  }
}

console.log(`\n=== LIVE (${(byState.LIVE || []).length}) ===`);
console.log("  every one maps to a site directory in the repo");

if (dangling.length) {
  console.log(`\n=== DANGLING ROUTES (${dangling.length}) ===`);
  console.log("  routes whose script no longer exists — delete them on the zone");
  for (const r of dangling) console.log(`  ${String(r.pattern).padEnd(44)} -> ${r.script}`);
}

if (undeployed.length) {
  console.log(`\n=== NOT DEPLOYED (${undeployed.length}) ===`);
  for (const n of undeployed) console.log(`  ${n}`);
}

if (STALE_DAYS) {
  const stale = rows.filter((r) => r.ageDays >= STALE_DAYS);
  console.log(`\n=== NOT DEPLOYED IN ${STALE_DAYS}+ DAYS (${stale.length}) ===`);
  for (const r of stale.sort((a, b) => b.ageDays - a.ageDays)) {
    console.log(`  ${r.id.padEnd(40)} ${r.ageDays}d  ${r.modified_on.slice(0, 10)}`);
  }
}

const over = rows.length - CAP;
console.log(
  `\nTOTAL ${rows.length} / ${CAP} cap` +
    (over > 0 ? `  — OVER by ${over}` : `  — ${-over} slots free`) +
    "  |  " +
    Object.entries(summary.byState).map(([k, v]) => `${k}=${v}`).join("  "),
);

if (over > 0) {
  console.log(
    `\nThe account is ${over} over the ${CAP} cap. Existing Workers serve and\n` +
      "redeploy, but creating a new one fails with 10037 on every wrangler\n" +
      "version since 2026-10-31. Move sites onto fallback/ to get under it:\n" +
      "see 'Hosted sites' in notes/20-deploy.md.",
  );
}

writeFileSync(manifestPath, JSON.stringify({ ...summary, workers: rows }, null, 2) + "\n");
console.log(`\nwrote inventory -> audit/raw/cf-workers.json`);
