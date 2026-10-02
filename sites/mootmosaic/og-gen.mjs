// Generates public/og.png (needs @resvg/resvg-js: npm install @resvg/resvg-js --no-save)
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const W = 1200, H = 630;
const pal = ["#5fd0c4", "#ff8fb1", "#ffd166", "#7aa2ff", "#b28cff", "#ff9f6e", "#6ee7a0", "#f4f4f8"];
let tiles = "";
const n = 4, s = 130, ox = 720, oy = 70;
for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
  const col = pal[(r * 3 + c * 5 + r * c) % pal.length];
  tiles += `<rect x="${ox + c * (s + 6)}" y="${oy + r * (s + 6)}" width="${s}" height="${s}" rx="6" fill="${col}" opacity="${0.55 + ((r + c) % 3) * 0.2}"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#0f1218"/>${tiles}
<text x="64" y="250" font-family="JetBrains Mono" font-weight="800" font-size="76" fill="#5fd0c4">mootmosaic</text>
<text x="64" y="320" font-family="JetBrains Mono" font-size="26" fill="#8b95a8">every photo your moots posted today,</text>
<text x="64" y="356" font-family="JetBrains Mono" font-size="26" fill="#8b95a8">tiled into one. a year of them,</text>
<text x="64" y="392" font-family="JetBrains Mono" font-size="26" fill="#8b95a8">a calendar.</text>
<text x="64" y="560" font-family="JetBrains Mono" font-size="22" fill="#ff8fb1">mootmosaic.bisks.net</text></svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
