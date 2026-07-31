// Survey what each site needs to move back onto its own subdomain.
//
// Three independent things can need fixing per site:
//   1. routes  — still path-only, needs a <name>.bisks.net/* hostname route
//   2. strip   — src/index.ts slices the mount prefix UNCONDITIONALLY, which
//                mangles asset paths when the request arrives without it
//   3. mount   — client code hardcodes a MOUNT/prefix constant that would be
//                wrong on the subdomain
//
// Read-only. Prints a table plus counts; writes nothing.
import { readFileSync, readdirSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const sitesDir = new URL("./sites/", root);

const rows = [];
for (const name of readdirSync(sitesDir).sort()) {
  const dir = new URL(`./${name}/`, sitesDir);
  const tomlUrl = new URL("./wrangler.toml", dir);
  if (!existsSync(tomlUrl)) continue;
  const toml = readFileSync(tomlUrl, "utf8");

  const hasCustomDomain = /custom_domain\s*=\s*true/.test(toml);
  const hasHostRoute = new RegExp(`pattern\\s*=\\s*"${name}\\.bisks\\.net`).test(toml);
  const hasPathRoute = /pattern\s*=\s*"bisks\.net\//.test(toml);

  // Worker prefix handling
  let strip = "none";
  const idxUrl = new URL("./src/index.ts", dir);
  if (existsSync(idxUrl)) {
    const src = readFileSync(idxUrl, "utf8");
    if (/\.slice\(\s*PREFIX\.length\s*\)/.test(src)) {
      // Guarded if the slice is gated on a startsWith/=== check against PREFIX
      strip = /startsWith\(\s*PREFIX/.test(src) ? "guarded" : "UNGUARDED";
    }
  }

  // Client-side mount constants that would be wrong on a subdomain
  const mountFiles = [];
  const pubDir = new URL("./public/", dir);
  if (existsSync(pubDir)) {
    const walk = (d, rel = "") => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const child = new URL(`./${e.name}${e.isDirectory() ? "/" : ""}`, d);
        if (e.isDirectory()) walk(child, rel + e.name + "/");
        else if (/\.(js|html)$/.test(e.name)) {
          const txt = readFileSync(child, "utf8");
          // A hardcoded mount string, not one derived from location.*
          if (/(const|let|var)\s+MOUNT\s*=\s*["'`]/.test(txt)) {
            mountFiles.push(rel + e.name);
          }
        }
      }
    };
    walk(pubDir);
  }

  // Order matters: a custom_domain entry also mentions <name>.bisks.net, so
  // check it FIRST or every custom-domain site reads as already-migrated. They
  // are not interchangeable — a wildcard route shadows a Custom Domain but
  // loses to a hostname route, so custom-domain sites still need converting.
  let routeState;
  if (hasCustomDomain) routeState = "custom-domain";
  else if (hasHostRoute) routeState = "done";
  else if (hasPathRoute) routeState = "path-only";
  else routeState = "other";

  rows.push({ name, routeState, strip, mounts: mountFiles });
}

const needsWork = rows.filter(
  (r) => r.routeState !== "done" || r.strip === "UNGUARDED" || r.mounts.length,
);

for (const r of rows) {
  const flags = [];
  if (r.routeState !== "done") flags.push(`route:${r.routeState}`);
  if (r.strip === "UNGUARDED") flags.push("STRIP-UNGUARDED");
  if (r.mounts.length) flags.push(`mount:${r.mounts.join(",")}`);
  if (flags.length) console.log(`${r.name.padEnd(24)} ${flags.join("  ")}`);
}

const count = (pred) => rows.filter(pred).length;
console.log(`
total sites          ${rows.length}
already on host route ${count((r) => r.routeState === "done")}
path-only            ${count((r) => r.routeState === "path-only")}
custom-domain        ${count((r) => r.routeState === "custom-domain")}
other/none           ${count((r) => r.routeState === "other")}
UNGUARDED strip      ${count((r) => r.strip === "UNGUARDED")}
guarded strip        ${count((r) => r.strip === "guarded")}
hardcoded MOUNT      ${count((r) => r.mounts.length > 0)}
needs any work       ${needsWork.length}`);
