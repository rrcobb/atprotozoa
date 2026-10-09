// Generates public/og.png. Needs @resvg/resvg-js (npm install @resvg/resvg-js --no-save).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
const W = 1200, H = 630;
const a = "4ke7qzp2xnvhy5dmwlbj3ocs", b = "4ke7q2pzxnvhy5dm1lbj3ocs";
const row = (s, y, other) => [...s].map((c, i) => `<text x="${90 + i * 42}" y="${y}" font-size="48" font-family="JetBrains Mono" fill="${other && c !== other[i] ? "#ff7a90" : "#e6edf3"}">${c}</text>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#0e1116"/>
<text x="90" y="150" font-size="96" font-family="JetBrains Mono" font-weight="700" fill="#5ee6a8">didlev</text>
<text x="90" y="215" font-size="32" font-family="JetBrains Mono" fill="#8b97a6">who is closest to your DID?</text>
${row(a, 360)}${row(b, 440, a)}
<text x="90" y="560" font-size="30" font-family="JetBrains Mono" fill="#8b97a6">levenshtein distance across all your mutuals</text></svg>`;
const png = new Resvg(svg, { font: { fontFiles: ["./fonts/JetBrainsMono.ttf"], loadSystemFonts: false } }).render().asPng();
writeFileSync("public/og.png", png);
