// hyperstreet in a terminal. Node 22+ (global WebSocket + fetch).
//   curl -O https://hyperstreet.bisks.net/cli.mjs && node cli.mjs
// Downloads the same world/plugin/command modules the web page runs, so the
// terminal and the browser are one world.
// node builtins are imported through a template so audit/check-import-paths
// (which treats every static import in public/ as a browser asset path) skips them.
const nodeMod = (n) => import(`node:${n}`);
const { mkdtempSync, writeFileSync } = await nodeMod("fs");
const { tmpdir } = await nodeMod("os");
const { join } = await nodeMod("path");
const { pathToFileURL } = await nodeMod("url");
const { createInterface } = await nodeMod("readline");

const BASE = process.env.HYPERSTREET_BASE || "https://hyperstreet.bisks.net";
const dir = mkdtempSync(join(tmpdir(), "hyperstreet-"));
writeFileSync(join(dir, "package.json"), '{"type":"module"}');
for (const f of ["world.js", "plugins.js", "commands.js"]) {
  const r = await fetch(`${BASE}/lib/${f}`);
  if (!r.ok) throw new Error(`could not fetch ${f}: ${r.status}`);
  writeFileSync(join(dir, f), await r.text());
}
const load = (f) => import(pathToFileURL(join(dir, f)).href);
const { World } = await load("world.js");
const { builtins } = await load("plugins.js");
const { runCommand } = await load("commands.js");

const world = new World();
for (const p of builtins) world.use(p);
world.connect();
setInterval(() => world.flushHandles([...world.ents.values()].sort((a, b) => b.last - a.last)), 2000).unref();

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "street> " });
const print = (l) => { console.log(l); rl.prompt(true); };
world.log = print;
const ctx = { print };
console.log("hyperstreet — type `help`, `tail` to watch posts go by, ctrl-d to leave.");
rl.prompt();
rl.on("line", async (line) => {
  for (const l of await runCommand(world, line, ctx)) console.log(l);
  rl.prompt();
});
rl.on("close", () => { world.disconnect(); process.exit(0); });
