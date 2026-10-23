// Generates public/og.png (1200x630) for vulndensity. Run by hand:
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let cells = "";
const cols = ["#3c145a", "#be285a", "#ff8a3d", "#ffeb8c"];
for (let a = 0; a < 20; a++) for (let b = a; b < 20; b++) {
  const d = Math.exp(-(((a - 8) ** 2) + ((b - a - 4) ** 2)) / 18);
  const c = d > .75 ? 3 : d > .5 ? 2 : d > .2 ? 1 : 0;
  cells += `<rect x="${700 + a * 22}" y="${100 + (19 - b) * 22}" width="21" height="21" fill="${cols[c]}"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#0b0d10"/>
<rect width="1200" height="8" fill="#ff8a3d"/>
<text x="70" y="190" font-family="JetBrains Mono" font-size="96" font-weight="700" fill="#e8edf2">vuln<tspan fill="#ff8a3d">density</tspan></text>
<text x="74" y="260" font-family="JetBrains Mono" font-size="32" fill="#8794a3">year introduced × year discovered</text>
<text x="74" y="540" font-family="JetBrains Mono" font-size="30" fill="#e8edf2">vulndensity.bisks.net</text>
${cells}</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
