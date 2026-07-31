// Inventory and prune Workers Custom Domains on the bisks.net zone.
//
// Background: the zone hit Cloudflare's 100-custom-domains-per-zone cap, so new
// `<name>.bisks.net` deploys silently fail to provision DNS (see
// notes/20-deploy.md). Most of the occupied slots are stale: moving a site's
// `routes` off `custom_domain = true` in wrangler.toml does NOT deprovision the
// hostname in Cloudflare, so every site migrated subdomain -> path over the past
// weeks still holds its slot.
//
// Usage:
//   node audit/cf-custom-domains.mjs                 # inventory only
//   node audit/cf-custom-domains.mjs --prune         # dry-run the prune
//   node audit/cf-custom-domains.mjs --prune --apply # actually delete
//
// Auth: needs a Cloudflare API token with Workers Scripts:Edit on the account.
// Reads CLOUDFLARE_API_TOKEN from the env, so the secret never lands in argv or
// shell history:
//   CLOUDFLARE_API_TOKEN=$(op read "op://Personal/Cloudflare/api token edit workers bisks.net") \
//     node audit/cf-custom-domains.mjs --prune
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const ACCOUNT_ID = "83803d427e6fd1a7d6408ed63e0a9191";
const ZONE = "bisks.net";
const API = "https://api.cloudflare.com/client/v4";

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
if (!TOKEN) {
  console.error("CLOUDFLARE_API_TOKEN is not set. See the header of this file.");
  process.exit(1);
}

const PRUNE = process.argv.includes("--prune");
const APPLY = process.argv.includes("--apply");

const repoRoot = new URL("../", import.meta.url);
const manifestPath = new URL("./raw/cf-pruned-domains.json", import.meta.url);

async function cf(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  // A successful DELETE returns 200 with an empty body (no `success` field), so
  // trust the HTTP status first — checking `body.success` alone reports every
  // successful delete as a failure.
  if (!res.ok || (body && body.success === false)) {
    throw new Error(
      `${init.method || "GET"} ${path} -> ${res.status} ${JSON.stringify(body?.errors)}`,
    );
  }
  return body?.result;
}

// --- what the repo currently declares -------------------------------------

// Map of hostname -> site dir, for every site whose wrangler.toml still asks for
// a custom domain. Anything provisioned in Cloudflare but absent here has been
// migrated away (or never belonged to this repo at all).
function repoCustomDomains() {
  const declared = new Map();
  const sitesDir = new URL("./sites/", repoRoot);
  const dirs = readdirSync(sitesDir).map((d) => [d, new URL(`./${d}/wrangler.toml`, sitesDir)]);
  dirs.push(["apex", new URL("./apex/wrangler.toml", repoRoot)]);
  for (const [name, tomlUrl] of dirs) {
    if (!existsSync(tomlUrl)) continue;
    const toml = readFileSync(tomlUrl, "utf8");
    // Match `{ pattern = "host", custom_domain = true }` in either order, and
    // only inside a routes entry — a bare `pattern =` in a comment won't match
    // because we require the custom_domain flag on the same table.
    const re = /\{[^}]*pattern\s*=\s*"([^"]+)"[^}]*custom_domain\s*=\s*true[^}]*\}/g;
    for (const m of toml.matchAll(re)) declared.set(m[1], name);
  }
  return declared;
}

// A hostname is safe to prune only if ALL of these hold. This is the whole
// safety argument for the delete — it is derived, not eyeballed off a list.
//   1. it is under the bisks.net zone (never touch other domains, e.g.
//      sharedmoment.app, which is a different project on the same account)
//   2. the Worker it points at is named atprotozoa-* (this repo's naming scheme)
//   3. a site directory of that name still exists in the repo
//   4. that site's wrangler.toml no longer declares the hostname as a custom
//      domain — i.e. it genuinely migrated to a path route
function classify(domain, declared) {
  const host = domain.hostname;
  const service = domain.service || "";
  if (declared.has(host)) return { state: "LIVE", reason: "repo still declares it" };
  if (host !== ZONE && !host.endsWith("." + ZONE)) {
    return { state: "FOREIGN", reason: `not on ${ZONE}` };
  }
  if (!service.startsWith("atprotozoa-")) {
    return { state: "FOREIGN", reason: `worker ${service} is not atprotozoa-*` };
  }
  const site = service.replace(/^atprotozoa-/, "");
  const tomlUrl = new URL(`./sites/${site}/wrangler.toml`, repoRoot);
  if (!existsSync(tomlUrl)) {
    return { state: "ORPHAN", reason: `no sites/${site} in repo` };
  }
  const expected = `${site}.${ZONE}`;
  if (host !== expected) {
    return { state: "ORPHAN", reason: `host does not match sites/${site}` };
  }
  return { state: "STALE", reason: `sites/${site} moved to a path route`, site };
}

// --- main ------------------------------------------------------------------

const declared = repoCustomDomains();
const domains = await cf(
  `/accounts/${ACCOUNT_ID}/workers/domains?per_page=500`,
);

const rows = domains
  .map((d) => ({ ...classify(d, declared), hostname: d.hostname, service: d.service, id: d.id }))
  .sort((a, b) => a.state.localeCompare(b.state) || a.hostname.localeCompare(b.hostname));

const byState = {};
for (const r of rows) (byState[r.state] ||= []).push(r);

for (const state of Object.keys(byState).sort()) {
  console.log(`\n=== ${state} (${byState[state].length}) ===`);
  for (const r of byState[state]) {
    console.log(`  ${r.hostname.padEnd(38)} ${String(r.service).padEnd(34)} ${r.reason}`);
  }
}

console.log(
  `\nTOTAL ${rows.length} / 100 cap  |  ` +
    Object.entries(byState).map(([k, v]) => `${k}=${v.length}`).join("  "),
);

if (!PRUNE) {
  console.log("\n(inventory only; pass --prune to see what would be deleted)");
  process.exit(0);
}

// Only STALE is prunable. ORPHAN needs a human look (the repo has no matching
// site, so we cannot prove what it was), and FOREIGN/LIVE are never touched.
const prunable = byState.STALE || [];
console.log(`\n--- PRUNE: ${prunable.length} stale domains ---`);
console.log(`freeing ${prunable.length} slots: ${rows.length} -> ${rows.length - prunable.length}`);

if (!APPLY) {
  console.log("\nDRY RUN. Re-run with --apply to delete.");
  process.exit(0);
}

// Write the restore manifest BEFORE deleting anything, so a failed run mid-way
// still leaves a complete record of what was targeted.
const manifest = {
  zone: ZONE,
  account: ACCOUNT_ID,
  deleted: prunable.map((r) => ({ hostname: r.hostname, service: r.service, id: r.id })),
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`wrote restore manifest -> audit/raw/cf-pruned-domains.json`);

let ok = 0;
const failed = [];
for (const r of prunable) {
  try {
    await cf(`/accounts/${ACCOUNT_ID}/workers/domains/${r.id}`, { method: "DELETE" });
    ok++;
    console.log(`  deleted ${r.hostname}`);
  } catch (err) {
    failed.push({ hostname: r.hostname, error: String(err) });
    console.log(`  FAILED  ${r.hostname}: ${err}`);
  }
}
console.log(`\ndeleted ${ok}/${prunable.length}` + (failed.length ? `, ${failed.length} failed` : ""));
