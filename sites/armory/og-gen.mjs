// Writes public/og.png. Needs @resvg/resvg-js (`npm install @resvg/resvg-js --no-save`).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#120d0b"/>
<circle cx="900" cy="330" r="170" fill="#ff6a3d"/><circle cx="900" cy="330" r="110" fill="#ffd166"/>
<rect x="880" y="120" width="40" height="60" fill="#b89a90"/>
<text x="70" y="270" font-family="JetBrains Mono" font-weight="800" font-size="100" fill="#f6ece6">armory</text>
<text x="70" y="350" font-family="JetBrains Mono" font-size="40" fill="#b89a90">1000 discourse grenades.</text>
<text x="70" y="410" font-family="JetBrains Mono" font-size="40" fill="#ff6a3d">pull a pin.</text>
</svg>`;
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng());
