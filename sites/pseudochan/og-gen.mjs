// Generates public/og.png — a grid of catalog cards, imageboard-yellow-on-blue.
//   npm install @resvg/resvg-js --no-save   # one-time
//   node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
let seed = 20261001;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

let cards = "";
for (let r = 0; r < 2; r++) {
  for (let c = 0; c < 6; c++) {
    const x = 60 + c * 180, y = 250 + r * 170;
    const img = rand() > 0.35;
    cards += img
      ? `<rect x="${x}" y="${y}" width="120" height="96" fill="hsl(${Math.floor(rand() * 360)} 35% 70%)" stroke="#999"/>`
      : `<rect x="${x}" y="${y}" width="120" height="96" fill="#f6f7ff" stroke="#999" stroke-dasharray="4"/><text x="${x + 6}" y="${y + 18}" font-size="13" fill="#789922" font-family="Arial">&gt;be me</text>`;
    cards += `<text x="${x + 60}" y="${y + 118}" font-size="13" text-anchor="middle" font-family="Arial">R: <tspan font-weight="bold">${Math.floor(rand() * 40)}</tspan> / I: <tspan font-weight="bold">${Math.floor(rand() * 9)}</tspan></text>`;
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#eef2ff"/>
<text x="60" y="110" font-size="76" font-weight="bold" fill="#af0a0f" font-family="Arial">/b/ pseudochan</text>
<text x="62" y="160" font-size="30" fill="#800" font-family="Arial">any Bluesky account, as an imageboard</text>
<line x1="60" y1="200" x2="1140" y2="200" stroke="#b7c5d9" stroke-width="2"/>
<text x="62" y="232" font-size="20" fill="#117743" font-weight="bold" font-family="Arial">catalog · index · threads · swappable post IDs</text>
${cards}
</svg>`;
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng());
