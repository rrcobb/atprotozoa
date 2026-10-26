// Generates public/og.png (`npm install @resvg/resvg-js --no-save` if missing).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const W = 1200, H = 630;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#fff6e6"/>
<text x="600" y="250" text-anchor="middle" font-size="150">🥣➡️🔥➡️🍰</text>
<text x="600" y="400" text-anchor="middle" font-family="monospace" font-weight="800" font-size="76" fill="#3a2412">cheesecake factorio</text>
<text x="600" y="470" text-anchor="middle" font-family="monospace" font-size="32" fill="#7a6050">the factory must grow.</text>
<text x="600" y="580" text-anchor="middle" font-family="monospace" font-size="24" fill="#a78660">cheesecake-factorio.bisks.net</text>
</svg>`;
const png = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
