// Switch hosted sites over to fallback/, then delete the Workers they leave.
//
// A site moved by audit/migrate-to-host.mjs is in fallback/sites.json, but its
// old Worker still holds the explicit <name>.bisks.net/* route, and an explicit
// route beats fallback's *.bisks.net/* wildcard. So the site keeps serving from
// the old Worker until that route is removed. This does the removal one site at
// a time and checks each:
//
//   1. fetch https://<name>.bisks.net/ from the old Worker: status + body hash
//   2. delete the site's route on the zone
//   3. fetch again until the response carries x-bisks-host: fallback
//   4. compare. On a mismatch, put the route back and report the site.
//
// A deleted route is the whole cutover: once it's gone, fallback answers.
// Putting it back is a single API call, so step 2 is the reversible one.
// Deleting the Worker afterwards is not reversible, and stays a separate step.
//
// A site is only cut over when the deployed fallback already lists it
// (https://fallback.bisks.net/hosted.json), so fallback is known to have its
// files. Not the last-deployed tag: one site that can't deploy keeps every run
// red and the tag still, and while the account is over the Worker cap a new
// site with server code is exactly that.
//
// Usage:
//   node audit/cf-cutover.mjs                    # plan: what each step would touch
//   node audit/cf-cutover.mjs --routes [N]       # cut over up to N sites (default all)
//   node audit/cf-cutover.mjs --workers          # delete Workers with no route whose
//                                                # site is hosted, plus route-less orphans
//   node audit/cf-cutover.mjs --retired          # delete the RETIRED stubs' routes and
//                                                # Workers (fallback says "nothing here")
//
// Auth: CLOUDFLARE_API_TOKEN (Workers Scripts:Edit on the account, Workers
// Routes:Edit on the zone), else the `wrangler login` OAuth token.
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "83803d427e6fd1a7d6408ed63e0a9191";
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || "1a089c79698cad41f55b2179d7880f25";
const API = "https://api.cloudflare.com/client/v4";
const FALLBACK = "atprotozoa-fallback";

function wranglerOAuthToken() {
  const cfg = join(homedir(), ".wrangler", "config", "default.toml");
  if (!existsSync(cfg)) return null;
  const m = readFileSync(cfg, "utf8").match(/^oauth_token\s*=\s*"([^"]+)"/m);
  return m ? m[1] : null;
}

const TOKEN = process.env.CLOUDFLARE_API_TOKEN || wranglerOAuthToken();
if (!TOKEN) {
  console.error("No credentials: set CLOUDFLARE_API_TOKEN or run `wrangler login`.");
  process.exit(1);
}

const args = process.argv.slice(2);
const mode = args.find((a) => a.startsWith("--")) || "--plan";
const limit = Number(args.find((a) => /^\d+$/.test(a))) || Infinity;

async function cf(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || (body && body.success === false)) {
    throw new Error(`${init.method || "GET"} ${path} -> ${res.status} ${JSON.stringify(body?.errors)}`);
  }
  return body?.result;
}

// The scripts endpoint returns the whole account in one response; see
// cf-workers.mjs for why this pages anyway.
async function listScripts() {
  const all = [];
  const seen = new Set();
  for (let page = 1; ; page++) {
    const batch = await cf(`/accounts/${ACCOUNT_ID}/workers/scripts?per_page=100&page=${page}`);
    if (!batch?.length) break;
    const fresh = batch.filter((s) => !seen.has(s.id));
    for (const s of fresh) seen.add(s.id);
    all.push(...fresh);
    if (!fresh.length || batch.length < 100) break;
  }
  return all;
}

// The sites the deployed fallback serves right now.
async function deployedHostedSites() {
  const res = await fetch("https://fallback.bisks.net/hosted.json", { headers: { "cache-control": "no-cache" } });
  return res.ok ? await res.json() : [];
}

async function probe(name) {
  const res = await fetch(`https://${name}.bisks.net/`, { redirect: "manual", headers: { "cache-control": "no-cache" } });
  const body = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    hash: createHash("sha256").update(body).digest("hex").slice(0, 16),
    fallback: res.headers.get("x-bisks-host") === "fallback",
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cutOver(name, route) {
  const before = await probe(name);
  if (before.fallback) return { name, ok: true, note: "already served by fallback" };
  await cf(`/zones/${ZONE_ID}/workers/routes/${route.id}`, { method: "DELETE" });
  // From here on, any outcome but a match puts the route back — including a
  // probe that throws (immortals hit "fetch failed" here on 2026-11-02 and
  // was left without its route).
  let after = { fallback: false, status: 0, hash: "" };
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    try {
      after = await probe(name);
    } catch {
      continue;
    }
    if (after.fallback) break;
  }
  if (after.fallback && after.status === before.status && after.hash === before.hash) {
    return { name, ok: true, note: `${before.status} ${before.hash}` };
  }
  await cf(`/zones/${ZONE_ID}/workers/routes`, {
    method: "POST",
    body: JSON.stringify({ pattern: route.pattern, script: route.script }),
  });
  const why = !after.fallback
    ? "fallback never answered within 60s"
    : `old ${before.status} ${before.hash} vs fallback ${after.status} ${after.hash}`;
  return { name, ok: false, note: `${why}; route restored` };
}

// Run fn over items a few at a time, printing a line every `every` results.
async function pool(items, size, every, fn) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      try {
        results.push(await fn(item));
      } catch (err) {
        results.push({ name: item.name || item.id || String(item), ok: false, note: err.message });
      }
      if (results.length % every === 0) console.log(`${results.length}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

function report(results) {
  const failed = results.filter((r) => !r.ok);
  for (const r of failed) console.log(`  FAILED ${r.name}: ${r.note}`);
  console.log(`${results.length - failed.length} done, ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
}

const hosted = new Set(Object.keys(JSON.parse(readFileSync("fallback/sites.json", "utf8")).sites));
const deployedHosted = new Set(await deployedHostedSites());
const routes = (await cf(`/zones/${ZONE_ID}/workers/routes`)) || [];
const scripts = await listScripts();
const scriptRoutes = new Map(scripts.map((s) => [s.id, routes.filter((r) => r.script === s.id)]));

// Hosted sites whose own route is still in place.
const pending = [...hosted]
  .map((name) => ({ name, route: routes.find((r) => r.pattern === `${name}.bisks.net/*` && r.script !== FALLBACK) }))
  .filter((x) => x.route);
const ready = pending.filter((x) => deployedHosted.has(x.name));
const notDeployed = pending.filter((x) => !deployedHosted.has(x.name));

// Workers nothing routes to: a hosted site's old Worker, or an orphan.
const siteOf = (id) => id.replace(/^atprotozoa-/, "");
const unused = scripts.filter((s) => {
  if (!s.id.startsWith("atprotozoa-") || scriptRoutes.get(s.id).length) return false;
  if (s.id === FALLBACK || s.id === "atprotozoa-watchtower") return false;
  const name = siteOf(s.id);
  if (hosted.has(name)) return true;
  return !existsSync(`sites/${name}`) && !existsSync(name);
});

const retired = scripts.filter((s) => {
  const name = siteOf(s.id);
  return s.id.startsWith("atprotozoa-") && existsSync(`sites/${name}/RETIRED.md`);
});

if (mode === "--plan") {
  console.log(`${hosted.size} hosted sites`);
  console.log(`  ${ready.length} still routed to their old Worker, ready to cut over (--routes)`);
  if (notDeployed.length) {
    console.log(`  ${notDeployed.length} still routed, but the deployed fallback doesn't serve them yet: ${notDeployed.map((x) => x.name).join(" ")}`);
  }
  console.log(`${unused.length} Workers with no route that can be deleted (--workers): ${unused.map((s) => s.id).join(" ")}`);
  console.log(`${retired.length} retired stubs still deployed (--retired): ${retired.map((s) => s.id).join(" ")}`);
  console.log(`account: ${scripts.length} Workers`);
} else if (mode === "--routes") {
  const batch = ready.slice(0, limit);
  console.log(`cutting over ${batch.length} sites`);
  report(await pool(batch, 6, 10, ({ name, route }) => cutOver(name, route)));
} else if (mode === "--workers") {
  console.log(`deleting ${unused.length} Workers`);
  report(
    await pool(unused, 6, 25, async (s) => {
      await cf(`/accounts/${ACCOUNT_ID}/workers/scripts/${s.id}?force=true`, { method: "DELETE" });
      return { name: s.id, ok: true };
    }),
  );
} else if (mode === "--retired") {
  console.log(`retiring ${retired.length} Workers`);
  report(
    await pool(retired, 3, 5, async (s) => {
      for (const r of scriptRoutes.get(s.id)) {
        await cf(`/zones/${ZONE_ID}/workers/routes/${r.id}`, { method: "DELETE" });
      }
      await cf(`/accounts/${ACCOUNT_ID}/workers/scripts/${s.id}?force=true`, { method: "DELETE" });
      return { name: s.id, ok: true };
    }),
  );
} else {
  console.error(`unknown mode ${mode}`);
  process.exit(1);
}
