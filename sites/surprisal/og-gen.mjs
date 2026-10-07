// Generates public/og.png — the preview card: a bar chart of likes lift by
// surprise, with a draft post lit up per word. Rasterised with
// @resvg/resvg-js (npm install @resvg/resvg-js --no-save); font bundled in ./fonts.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const bars = [0.8, 0.9, 1.0, 1.15, 1.35, 1.6, 1.25, 0.7];
const barSvg = bars.map((v, i) => `<rect x="${110 + i * 62}" y="${470 - v * 130}" width="48" height="${v * 130}" rx="4" fill="#ff7ab6" opacity="${0.45 + i * 0.07}"/>`).join("");
const words = [["i", 0.1], ["would", 0.15], ["like", 0.1], ["a", 0.05], ["zeppelin", 0.9], ["of", 0.1], ["feelings", 0.6]];
let x = 640;
const wordSvg = words.map(([w, a]) => { const wd = w.length * 24 + 20; const s = `<rect x="${x}" y="250" width="${wd}" height="48" rx="8" fill="#ff7ab6" opacity="${a}"/><text x="${x + 10}" y="285" font-size="30" fill="#e8edf3">${w}</text>`; x += wd + 8; return s; }).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#7cf0c9"/><stop offset="1" stop-color="#ff7ab6"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="#0e1116"/>
<text x="80" y="130" font-family="JetBrains Mono" font-size="92" font-weight="700" fill="url(#g)">surprisal</text>
<text x="80" y="190" font-family="JetBrains Mono" font-size="30" fill="#8b98a8">be liked. be unpredictable.</text>
<g font-family="JetBrains Mono">${barSvg}${wordSvg}</g>
<text x="110" y="520" font-family="JetBrains Mono" font-size="24" fill="#8b98a8">predictable → surprising</text>
<text x="640" y="400" font-family="JetBrains Mono" font-size="40" fill="#ffd166" font-weight="700">142 pts</text>
<text x="640" y="450" font-family="JetBrains Mono" font-size="24" fill="#8b98a8">markov model + likes regression, on your moots</text>
<text x="80" y="590" font-family="JetBrains Mono" font-size="26" fill="#8b98a8">surprisal.bisks.net</text>
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
