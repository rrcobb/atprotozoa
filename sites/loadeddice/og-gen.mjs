// Generates public/og.png — a heart drawn by dice tallies, plus a lopsided face strip.
// Same recipe as sites/humanbench/og-gen.mjs (resvg, bundled font).
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { N, PICTURES, buildDice, rollSet } from "./public/lib/dice.js";

const pic = PICTURES.heart();
const dice = buildDice(pic);
let s = 7;
const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const tally = new Array(N * N).fill(0);
for (let i = 0; i < 6000; i++) { const { r, c } = rollSet(dice, rand); tally[r * N + c]++; }
const max = Math.max(...tally);
const cs = 26, gx = 90, gy = 55;
let cells = "";
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  const v = tally[r * N + c] / max, a = Math.round(v * 255);
  cells += `<rect x="${gx + c * cs}" y="${gy + r * cs}" width="${cs}" height="${cs}" fill="rgb(${a},${Math.round(a * .78)},${Math.round(a * .4)})"/>`;
}
const strip = dice.rowDie.weights.map((w, i, arr) => ({ w, x: arr.slice(0, i).reduce((a, b) => a + b, 0) }))
  .map(({ w, x }, i) => `<rect x="${660 + (x / dice.rowDie.total) * 460}" y="400" width="${(w / dice.rowDie.total) * 460}" height="60" fill="${i % 2 ? "#c58a3c" : "#e0a550"}" stroke="#12100f"/>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#12100f"/>
<rect x="${gx}" y="${gy}" width="${N * cs}" height="${N * cs}" fill="#0a0908"/>${cells}
<text x="660" y="170" font-family="JetBrains Mono" font-weight="700" font-size="64" fill="#f2ebe4">loaded<tspan fill="#ffb347">dice</tspan></text>
<text x="660" y="225" font-family="JetBrains Mono" font-size="26" fill="#a59a90">21 lopsided d20s.</text>
<text x="660" y="262" font-family="JetBrains Mono" font-size="26" fill="#a59a90">roll them. the tally draws</text>
<text x="660" y="299" font-family="JetBrains Mono" font-size="26" fill="#a59a90">the picture.</text>
<text x="660" y="385" font-family="JetBrains Mono" font-size="18" fill="#ffb347">the row die, faces sized by ink</text>${strip}
<text x="660" y="540" font-family="JetBrains Mono" font-size="20" fill="#a59a90">loadeddice.bisks.net</text>
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
