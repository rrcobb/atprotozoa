// Inventory Workers on the account against the 500-Worker cap.
//
// Background: the account sits above Cloudflare's 500-Worker limit (679 as of
// 2026-09-17) and has for weeks with nothing breaking. Existing Workers serve
// and redeploy normally; only CREATING a new one can fail, with:
//
//   You have exceeded the limit of 500 Workers on your account. [code: 10037]
//
// And even that depends on the wrangler version: 4.134.0 creates a new Worker
// on this account fine, 4.114.0 gets 10037 for the same deploy. Keep wrangler
// current. See 'The 500-Worker cap' in notes/20-deploy.md for the full story.
//
// The failure does not always name the cap. `wrangler kv namespace create` has
// reported a bare "Authentication error [code: 10000]" and then succeeded on a
// plain retry, which sends you looking at auth instead.
//
// Unlike cf-durable-objects.mjs and cf-custom-domains.mjs, this tool has no
// --prune. Those caps were occupied by leftovers that outlived their bindings,
// so there was something safe to derive and delete. This one is not: every
// Worker on the account maps to a live site directory (see "Retiring" below).
// Deleting one deletes a site, which is a product decision, not a cleanup.
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
  return sites;
}

// A site directory is a retirement stub if it has no wrangler.toml, or ships a
// RETIRED.md. sites/catsofatproto is the standing example and must not be
// revived (notes/20-deploy.md).
function isRetiredStub(dir) {
  const d = new URL(`./${dir}/`, repoRoot);
  if (existsSync(new URL("./RETIRED.md", d))) return true;
  return !existsSync(new URL("./wrangler.toml", d));
}

function classify(script, sites) {
  const id = script.id;
  if (!id.startsWith("atprotozoa-")) {
    return { state: "FOREIGN", reason: "not an atprotozoa-* Worker", site: null };
  }
  const site = id.replace(/^atprotozoa-/, "");
  const dir = sites.get(site);
  if (!dir) {
    return { state: "ORPHAN", reason: `no sites/${site} and not a root Worker`, site };
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
const now = Date.now();

const rows = scripts
  .map((s) => {
    const c = classify(s, sites);
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
// that silently is not live.
const deployed = new Set(rows.filter((r) => r.site).map((r) => r.site));
const undeployed = [...sites.keys()].filter((n) => !deployed.has(n));

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
for (const state of ["FOREIGN", "ORPHAN", "RETIRED"]) {
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
    `\nThe account is ${over} over the ${CAP} cap and has been for weeks without\n` +
      "anything breaking: existing Workers serve and redeploy fine. Creating a\n" +
      "NEW Worker is the only blocked operation, and only on old wrangler —\n" +
      "4.134.0 creates one here, 4.114.0 gets 10037. Keep wrangler current and\n" +
      "see 'The 500-Worker cap' in notes/20-deploy.md.",
  );
}

writeFileSync(manifestPath, JSON.stringify({ ...summary, workers: rows }, null, 2) + "\n");
console.log(`\nwrote inventory -> audit/raw/cf-workers.json`);
