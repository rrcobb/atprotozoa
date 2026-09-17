// Run site test suites. A site has tests if it ships tests/*.test.mjs; the
// convention is `node --test`, no dependencies, colocated in the site
// (sites/voidshout is the reference).
//
// Nothing blocks on this. Deploys do not run tests — a red test should never
// stop a push, per notes/20-deploy.md's history of CI silently blocking every
// deploy. This is a tool the builder runs for the site it just touched, and a
// suite anyone can run over everything out of band.
//
// Usage:
//   node audit/run-tests.mjs <site>    # one site, exits non-zero if it fails
//   node audit/run-tests.mjs           # every site with tests, always exits 0
//                                      # and prints a summary
import { readdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const only = process.argv[2];

function hasTests(name) {
  const dir = `sites/${name}/tests`;
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(".test.mjs"));
}

// Pass explicit files rather than a directory or a glob: `node --test tests/`
// resolves as a module path on node 24, and a glob would need a shell.
function testFiles(name) {
  return readdirSync(`sites/${name}/tests`)
    .filter((f) => f.endsWith(".test.mjs"))
    .sort()
    .map((f) => `tests/${f}`);
}

const sites = readdirSync("sites")
  .filter((n) => existsSync(`sites/${n}/wrangler.toml`))
  .filter(hasTests)
  .sort();

if (only) {
  if (!hasTests(only)) {
    // Not an error: most sites have no tests and are not expected to.
    console.log(`${only}: no tests (sites/${only}/tests/*.test.mjs)`);
    process.exit(0);
  }
  const r = spawnSync("node", ["--test", ...testFiles(only)], {
    cwd: `sites/${only}`,
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}

if (sites.length === 0) {
  console.log("no sites ship tests yet");
  process.exit(0);
}

const failed = [];
for (const name of sites) {
  const r = spawnSync("node", ["--test", ...testFiles(name)], {
    cwd: `sites/${name}`,
    encoding: "utf8",
  });
  const out = (r.stdout || "") + (r.stderr || "");
  // node --test prints "ℹ pass N" on a tty-less run and "# pass N" under TAP.
  const pass = (out.match(/^[ℹ#] pass (\d+)$/m) || [])[1] ?? "?";
  const fail = (out.match(/^[ℹ#] fail (\d+)$/m) || [])[1] ?? "?";
  const ok = r.status === 0;
  if (!ok) failed.push({ name, out });
  console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(20)} ${pass} passed, ${fail} failed`);
}

for (const f of failed) {
  console.log(`\n=== ${f.name} ===\n${f.out}`);
}

console.log(
  `\n${sites.length} site(s) with tests, ${sites.length - failed.length} green, ${failed.length} red`,
);
// Always exit 0 in sweep mode: this is a report, not a gate.
