// HTTP-check every site's primary route. Reads audit/raw/site-routes.txt,
// derives the canonical URL per site, fetches it (following redirects), and
// records status, final URL, timing, and a short body snippet for triage.
import { readFileSync, writeFileSync } from "node:fs";

const lines = readFileSync(
  new URL("./raw/site-routes.txt", import.meta.url),
  "utf8",
).trim().split("\n");

// Pick the primary URL for a site from its route patterns.
// - subdomain route "<x>.bisks.net"      -> https://<x>.bisks.net
// - path route "bisks.net/<x>"           -> https://bisks.net/<x>
// - wildcard-only "bisks.net/games/x*"   -> strip trailing * , https://bisks.net/games/x
function primaryUrl(routes) {
  const parts = routes.split(",").map((s) => s.trim()).filter(Boolean);
  // Prefer a non-wildcard route; fall back to a wildcard with * stripped.
  const nonWild = parts.find((p) => !p.includes("*"));
  let pick = nonWild || parts[0];
  if (!pick) return null;
  pick = pick.replace(/\*+$/, ""); // strip trailing wildcard
  pick = pick.replace(/\/$/, "");
  return "https://" + pick;
}

const sites = [];
for (const line of lines) {
  const [name, cd, wd, routesField] = line.split("\t");
  if (name === "" || routesField === undefined) continue;
  const routes = routesField.replace(/^routes=/, "");
  if (routesField === "NO_TOML") {
    sites.push({ name, url: null, note: "NO_TOML" });
    continue;
  }
  sites.push({
    name,
    custom_domain: cd === "cd=1",
    workers_dev: wd === "wd=1",
    routes,
    url: primaryUrl(routes),
  });
}

// apex, checked separately
sites.push({ name: "apex", url: "https://bisks.net", routes: "bisks.net" });

async function check(site) {
  if (!site.url) return { ...site, status: null, error: "no-url" };
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(site.url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": "atprotozoa-audit/1.0" },
    });
    clearTimeout(t);
    const body = await res.text();
    return {
      ...site,
      status: res.status,
      finalUrl: res.url,
      redirected: res.url !== site.url,
      ms: Date.now() - started,
      contentType: res.headers.get("content-type"),
      bytes: body.length,
      title: (body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]?.trim() || null,
      snippet: body.slice(0, 160).replace(/\s+/g, " ").trim(),
    };
  } catch (err) {
    return {
      ...site,
      status: null,
      ms: Date.now() - started,
      error: String(err.name === "AbortError" ? "timeout" : err.message || err),
    };
  }
}

const results = [];
const CONCURRENCY = 8;
let i = 0;
async function worker() {
  while (i < sites.length) {
    const idx = i++;
    results[idx] = await check(sites[idx]);
    const r = results[idx];
    console.error(
      `${r.status ?? "ERR"}\t${r.name}\t${r.url ?? ""}\t${r.error ?? r.title ?? ""}`,
    );
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

writeFileSync(
  new URL("./raw/site-http.json", import.meta.url),
  JSON.stringify(results, null, 2),
);
console.error(`\nWrote ${results.length} results.`);
