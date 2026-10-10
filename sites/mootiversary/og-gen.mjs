// Generates public/og.png: a heatmap-looking card. Needs @resvg/resvg-js
// (npm install @resvg/resvg-js --no-save) and a font in ../kevinmoot/fonts.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
let cells = "";
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const blues = ["#0c2d6b", "#1158c7", "#388bfd", "#79c0ff"];
for (let c = 0; c < 44; c++) for (let r = 0; r < 7; r++) {
  const hit = rnd() < 0.14;
  const fill = hit ? blues[Math.floor(rnd() * 4)] : "#21262d";
  cells += `<rect x="${80 + c * 24}" y="${300 + r * 24}" width="20" height="20" rx="3" fill="${fill}"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#0d1117"/>
<text x="80" y="150" font-family="JetBrains Mono" font-size="84" font-weight="700" fill="#e6edf3">mootiversary</text>
<text x="80" y="215" font-family="JetBrains Mono" font-size="32" fill="#8b949e">every moot, on the day it became one</text>
${cells}
<text x="80" y="560" font-family="JetBrains Mono" font-size="26" fill="#79c0ff">mootiversary.bisks.net</text>
</svg>`;
const font = fileURLToPath(new URL("../kevinmoot/fonts/JetBrainsMono.ttf", import.meta.url));
const png = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
