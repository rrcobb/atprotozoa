// Generates public/og.png. Needs @resvg/resvg-js (npm install --no-save); font bundled in ./fonts.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630, INK = "#14171a", MUTED = "#6b6b6b";
// pyramid on the left, sphere on the right
const pyr = `<polygon points="260,150 150,400 270,450" fill="#e8463c"/><polygon points="260,150 270,450 400,380" fill="#b92f2a"/><polygon points="150,400 270,450 400,380 290,340" fill="#8c2420"/>`;
const sph = `<defs><radialGradient id="g" cx="35%" cy="30%"><stop offset="0" stop-color="#ff8a7c"/><stop offset="1" stop-color="#8c2420"/></radialGradient></defs><circle cx="900" cy="300" r="170" fill="url(#g)"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#fffdf8"/>${pyr}${sph}
<text x="540" y="320" text-anchor="middle" font-family="JetBrains Mono" font-size="70" fill="${INK}">→</text>
<text x="64" y="90" font-family="JetBrains Mono" font-weight="800" font-size="48" fill="${INK}">polykatamari</text>
<text x="64" y="580" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">every pickup adds a vertex. roll until you're a sphere.</text>
<text x="1136" y="580" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="#1083fe">polykatamari.bisks.net</text>
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
