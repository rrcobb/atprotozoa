// Inventory and delete leftover Durable Object namespaces on the account.
//
// Background: this repo finished migrating off Durable Objects — no
// wrangler.toml declares a `[[durable_objects]]` binding anymore. But removing
// a binding does not delete the namespace it pointed at, so the account still
// holds orphan namespaces. They are invisible to `wrangler` (there is no
// `wrangler durable-objects namespace list`), which is why this script exists.
//
// Usage:
//   node audit/cf-durable-objects.mjs                  # inventory only
//   node audit/cf-durable-objects.mjs --prune          # dry-run the delete
//   node audit/cf-durable-objects.mjs --prune --apply  # actually delete
//
// Auth: CLOUDFLARE_API_TOKEN if set (a token with Workers Scripts:Edit), else
// the OAuth token `wrangler login` already stored in ~/.wrangler. Reading the
// stored token means the usual case needs no secret in argv or shell history —
// if you are logged into wrangler, this just runs.
//
// Deleting a namespace destroys its stored data. For these sites that is the
// intent: the frontend-first rewrites rebuild their state in the browser or in
// KV. See notes/11-durable-objects.md.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT_ID = "83803d427e6fd1a7d6408ed63e0a9191";
const API = "https://api.cloudflare.com/client/v4";

// Prefer an explicit API token; otherwise reuse the wrangler OAuth session.
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

const PRUNE = process.argv.includes("--prune");
const APPLY = process.argv.includes("--apply");

const repoRoot = new URL("../", import.meta.url);
const manifestPath = new URL("./raw/cf-do-namespaces.json", import.meta.url);

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

// The namespace list paginates at 20 by default, which makes the account look
// far cleaner than it is. Page explicitly rather than trusting one response.
async function listNamespaces() {
  const all = [];
  for (let page = 1; ; page++) {
    const batch = await cf(
      `/accounts/${ACCOUNT_ID}/workers/durable_objects/namespaces?per_page=100&page=${page}`,
    );
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

// --- what the repo currently declares -------------------------------------

// Every DO class name still bound by a wrangler.toml in this repo. If the
// migration is complete this is empty, and every namespace on the account is an
// orphan. Anything in here is a live binding and must never be deleted.
function repoBoundClasses() {
  const bound = new Map(); // class_name -> site dir
  const sitesDir = new URL("./sites/", repoRoot);
  const dirs = readdirSync(sitesDir).map((d) => [d, new URL(`./${d}/wrangler.toml`, sitesDir)]);
  for (const top of ["apex", "fallback", "watchtower", "trigrams"]) {
    dirs.push([top, new URL(`./${top}/wrangler.toml`, repoRoot)]);
  }
  for (const [name, tomlUrl] of dirs) {
    if (!existsSync(tomlUrl)) continue;
    const toml = readFileSync(tomlUrl, "utf8");
    // Only look inside [[durable_objects.bindings]] tables. A `class_name` in a
    // [[migrations]] block (deleted_classes / new_sqlite_classes) is a ledger
    // entry, not a live binding, and must not count as "still bound".
    const section = toml.split(/^\[\[durable_objects\.bindings\]\]/m).slice(1);
    for (const chunk of section) {
      const head = chunk.split(/^\[/m)[0];
      const m = head.match(/class_name\s*=\s*"([^"]+)"/);
      if (m) bound.set(m[1], name);
    }
  }
  return bound;
}

// A [[migrations]] tag is applied once and then remembered by Cloudflare. That
// makes rewriting an existing tag in place a silent no-op: editing `v1` from
// new_sqlite_classes to deleted_classes means Cloudflare skips it (already seen
// v1) and then rejects the deploy for dropping a class its live DOs still
// depend on. The deletion must be a NEW tag. This caught five sites.
function migrationLedgerProblems() {
  const problems = [];
  const sitesDir = new URL("./sites/", repoRoot);
  for (const name of readdirSync(sitesDir)) {
    const tomlUrl = new URL(`./${name}/wrangler.toml`, sitesDir);
    if (!existsSync(tomlUrl)) continue;
    const toml = readFileSync(tomlUrl, "utf8");
    if (!toml.includes("deleted_classes")) continue;

    const blocks = toml.split(/^\[\[migrations\]\]/m).slice(1);
    const tags = [];
    for (const b of blocks) {
      const head = b.split(/^\[/m)[0];
      const tag = head.match(/tag\s*=\s*"([^"]+)"/);
      if (!tag) continue;
      tags.push({
        tag: tag[1],
        creates: /new_sqlite_classes|new_classes/.test(head),
        deletes: /deleted_classes/.test(head),
      });
    }
    const names = tags.map((t) => t.tag);
    if (new Set(names).size !== names.length) {
      problems.push(`${name}: duplicate migration tag`);
    } else if (tags.some((t) => t.deletes) && !tags.some((t) => t.creates)) {
      problems.push(`${name}: deletes a class with no create tag — v1 was likely overwritten in place`);
    } else {
      const both = tags.find((t) => t.creates && t.deletes);
      if (both) problems.push(`${name}: tag ${both.tag} both creates and deletes`);
    }
  }
  return problems;
}

// A namespace is safe to delete only if no wrangler.toml in the repo still
// binds its class. Cloudflare enforces the rest: the API refuses to delete a
// namespace while any *deployed* Worker binds it, and names the Worker and
// binding in the error — which is also the reliable way to identify which site
// a namespace belongs to when the repo no longer says.
function classify(ns, bound) {
  const cls = ns.class || ns.class_name || "";
  if (bound.has(cls)) {
    return { state: "BOUND", reason: `sites/${bound.get(cls)} still binds ${cls}` };
  }
  return { state: "ORPHAN", reason: "no wrangler.toml binds this class" };
}

let namespaces;
try {
  namespaces = await listNamespaces();
} catch (err) {
  // The stored wrangler OAuth token expires; a raw stack here reads like a bug
  // in this script rather than "log in again".
  if (/9109|Invalid access token|10000|Authentication/i.test(err.message)) {
    console.error(
      "Cloudflare rejected the credentials. The wrangler OAuth token expires —\n" +
        "run `wrangler login`, or set CLOUDFLARE_API_TOKEN to a token with\n" +
        "Workers Scripts:Edit on the account.",
    );
    process.exit(1);
  }
  throw err;
}
const bound = repoBoundClasses();

const rows = namespaces.map((ns) => {
  const { state, reason } = classify(ns, bound);
  return { id: ns.id, name: ns.name, class: ns.class || ns.class_name || "", script: ns.script || "", state, reason };
});

const orphans = rows.filter((r) => r.state === "ORPHAN");
const stillBound = rows.filter((r) => r.state === "BOUND");

for (const r of rows) {
  console.log(`${r.state.padEnd(6)} ${r.id}  ${(r.script || "-").padEnd(28)} ${r.class || "-"}  (${r.reason})`);
}
console.log(`\n${namespaces.length} namespace(s): ${orphans.length} orphan, ${stillBound.length} still bound by the repo.`);

const ledger = migrationLedgerProblems();
if (ledger.length) {
  console.log("\nMigration ledger problems (these break `wrangler deploy`):");
  for (const line of ledger) console.log(`  ${line}`);
}

if (!PRUNE) {
  console.log("\nRe-run with --prune to dry-run deletion, --prune --apply to delete.");
  process.exit(0);
}

const deleted = [];
const refused = [];
for (const r of orphans) {
  if (!APPLY) {
    console.log(`would delete ${r.id} (${r.script || "no worker"} / ${r.class || "?"})`);
    continue;
  }
  try {
    await cf(`/accounts/${ACCOUNT_ID}/workers/durable_objects/namespaces/${r.id}`, {
      method: "DELETE",
    });
    console.log(`deleted ${r.id} (${r.script || "no worker"} / ${r.class || "?"})`);
    deleted.push(r);
  } catch (err) {
    // Expected when a stale deployed build still binds the namespace even
    // though the repo does not — redeploy that site, then re-run. The error
    // names the Worker and binding.
    console.log(`REFUSED ${r.id} (${r.script || "no worker"} / ${r.class || "?"}): ${err.message}`);
    refused.push({ ...r, error: err.message });
  }
}

if (APPLY) {
  writeFileSync(manifestPath, JSON.stringify({ deleted, refused }, null, 2) + "\n");
  console.log(`\ndeleted ${deleted.length}, refused ${refused.length}. Wrote ${manifestPath.pathname}.`);
  if (refused.length) {
    console.log("Refusals mean a deployed build still binds the namespace: redeploy that site, then re-run.");
  }
}
