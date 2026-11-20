// Generates public/og.png: the heart the evolved dice draw (exact odds of a
// 700-generation evolution, best of six seeds) next to the title.
// Same recipe as sites/humanbench/og-gen.mjs (resvg, bundled font).
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { N, CELLS, CELL_OF_SUM, PICTURES, targetPmf, sumPmf } from "./public/lib/dice.js";
import { createEvolver } from "./public/lib/evolve.js";

// best of a few seeded runs, so the card shows a clear heart
let best = null;
for (const seed of [7, 11, 23, 42, 99, 123]) {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ev = createEvolver(targetPmf(PICTURES.heart()), rand);
  for (let g = 0; g < 700; g++) ev.step();
  if (!best || ev.best.fit > best.fit) best = ev.best;
}
const pmf = sumPmf(best.models);
const cell = new Array(CELLS).fill(0);
for (let k = 0; k < CELLS; k++) cell[CELL_OF_SUM[k]] = pmf[k];
const max = Math.max(...cell);
const cs = 62, gx = 80, gy = 67;
let cells = "";
for (let k = 0; k < CELLS; k++) {
  const a = Math.round((cell[k] / max) * 255);
  cells += `<rect x="${gx + (k % N) * cs}" y="${gy + Math.floor(k / N) * cs}" width="${cs}" height="${cs}" fill="rgb(${a},${Math.round(a * .78)},${Math.round(a * .4)})"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#12100f"/>
<rect x="${gx}" y="${gy}" width="${N * cs}" height="${N * cs}" fill="#0a0908"/>${cells}
<text x="660" y="170" font-family="JetBrains Mono" font-weight="700" font-size="64" fill="#f2ebe4">loaded<tspan fill="#ffb347">dice</tspan></text>
<text x="660" y="225" font-family="JetBrains Mono" font-size="26" fill="#a59a90">lumpy d7s and d20s.</text>
<text x="660" y="262" font-family="JetBrains Mono" font-size="26" fill="#a59a90">real physics, top faces add up,</text>
<text x="660" y="299" font-family="JetBrains Mono" font-size="26" fill="#a59a90">evolution draws the picture.</text>
<text x="660" y="540" font-family="JetBrains Mono" font-size="20" fill="#a59a90">loadeddice.bisks.net</text>
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
