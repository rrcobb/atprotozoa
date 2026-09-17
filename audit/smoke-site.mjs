// Smoke-check one site before declaring a build finished.
//
// The builder box has node, curl and wrangler — no browser, no jsdom. So this
// is not a rendering test. It catches the class of bug that shipped repeatedly
// and that users ended up reporting themselves (see
// notes/history/2026-09-buildthis-issue-themes.md, theme 3): a module that
// can't even load.
//
// Usage, from the repo root:
//   node audit/smoke-site.mjs <site>          # link-check the site's modules
//   node audit/smoke-site.mjs <site> --live   # also fetch the DEPLOYED page
//
// What the link check does: `import()` every .js under public/. Node parses and
// links the module graph before running any module body, so the two failures
// below surface even though the file is browser code that will later touch
// `window`:
//
//   SyntaxError: ... does not provide an export named 'x'
//   SyntaxError: Unexpected token ...
//
// Those are real bugs, always. By contrast:
//
//   ReferenceError: window is not defined   (or document/navigator/location)
//
// means the graph linked cleanly and evaluation then hit the browser. That is
// the PASS signal for browser code, not a failure — a browser module is
// SUPPOSED to fail that way under node.
//
// Exit 0 = no link-time failures. Exit 1 = at least one real failure.
import { readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

const args = process.argv.slice(2);
const site = args.find((a) => !a.startsWith("--"));
const wantLive = args.includes("--live");

if (!site) {
  console.error("usage: node audit/smoke-site.mjs <site> [--live]");
  process.exit(2);
}

const publicDir = path.join(REPO_ROOT, "sites", site, "public");
if (!existsSync(publicDir)) {
  console.error(`no such site (expected ${path.relative(REPO_ROOT, publicDir)})`);
  process.exit(2);
}

function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...jsFiles(full));
    else if (entry.endsWith(".js")) out.push(full);
  }
  return out;
}

// A browser global tripping during evaluation means the module graph already
// linked. That is success for this check.
const BROWSER_GLOBAL =
  /^(window|document|navigator|location|localStorage|sessionStorage|fetch|customElements|HTMLElement|Image|WebSocket|self|screen|history|matchMedia|requestAnimationFrame|alert) is not defined$/;

const files = jsFiles(publicDir).sort();
if (files.length === 0) console.log("no .js under public/ — nothing to link-check");

let failed = 0;
let linked = 0;

for (const file of files) {
  const rel = path.relative(REPO_ROOT, file);
  try {
    await import(file);
    linked++;
    console.log(`ok       ${rel} (loaded cleanly)`);
  } catch (err) {
    if (err instanceof ReferenceError && BROWSER_GLOBAL.test(err.message)) {
      linked++;
      console.log(`ok       ${rel} (linked; needs a browser: ${err.message})`);
    } else if (err instanceof SyntaxError) {
      failed++;
      console.log(`BROKEN   ${rel}\n         ${err.message}`);
    } else {
      // Anything else ran far enough to link. Report it, but it is not
      // necessarily a defect — a module may legitimately throw on load
      // outside a browser for reasons other than a missing global.
      linked++;
      console.log(`check    ${rel}\n         ${err.constructor.name}: ${err.message}`);
    }
  }
}

console.log(`\nlink-check: ${linked} ok, ${failed} broken, ${files.length} total`);

if (wantLive) {
  const url = `https://${site}.bisks.net/`;
  console.log(`\nfetching DEPLOYED page ${url}`);
  console.log("(this is the site as it is live RIGHT NOW — it does not include");
  console.log(" the edits in your working tree, which have not deployed yet)");
  try {
    const res = await fetch(url, { redirect: "follow" });
    const body = await res.text();
    console.log(`  status ${res.status}, ${body.length} bytes`);
    if (!res.ok) failed++;
  } catch (err) {
    console.log(`  fetch failed: ${err.message}`);
    failed++;
  }
}

process.exit(failed > 0 ? 1 : 0);
