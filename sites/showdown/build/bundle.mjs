// Pre-bundles @pkmn/sim + @pkmn/randoms + @pkmn/img for the browser. Run
// manually (`node build/bundle.mjs`) after touching build/entry.mjs or
// bumping the @pkmn/* deps; the output is committed to public/vendor/.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.join(dir, "entry.mjs")],
  bundle: true,
  format: "iife",
  minify: true,
  outfile: path.join(dir, "../public/vendor/pkmn.js"),
});

console.log("wrote public/vendor/pkmn.js");
