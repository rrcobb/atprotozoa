// Generates public/og.png. SVG rasterised with @resvg/resvg-js
// (`npm install @resvg/resvg-js --no-save`); font borrowed from hotdog-tierlist.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
const W = 1200, H = 630;
const rows = (x, c, ws) => ws.map((w, i) => `<rect x="${x}" y="${190 + i * 60}" width="${520 - i * 60}" height="48" fill="${c}" opacity=".3"/><text x="${x + 14}" y="${224 + i * 60}" font-family="JetBrains Mono" font-size="28" font-weight="700" fill="#26211c">${w}</text>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fbf7ef"/>
<text x="60" y="90" font-family="JetBrains Mono" font-size="56" font-weight="800" fill="#26211c">pfpwords</text>
<text x="60" y="136" font-family="JetBrains Mono" font-size="24" fill="#7b7066">cat pfps vs anime pfps · live from new profiles (illustrative)</text>
<text x="60" y="176" font-family="JetBrains Mono" font-size="22" fill="#e8873a">CAT PFP</text><text x="640" y="176" font-family="JetBrains Mono" font-size="22" fill="#7a5cf0">ANIME PFP</text>
${rows(60, "#e8873a", ["🐱 mom", "dogs", "coffee", "plants", "books"])}${rows(640, "#7a5cf0", ["art", "commissions", "game", "18+", "vtuber"])}
</svg>`;
const font = new URL("../hotdog-tierlist/fonts/JetBrainsMono.ttf", import.meta.url).pathname;
const png = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(new URL("./public/og.png", import.meta.url).pathname, png);
