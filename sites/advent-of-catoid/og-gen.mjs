// Generates public/og.png: a calendar of cat-ear day tiles with gold stars.
//   (resvg lives in sites/receipts/node_modules; or npm install @resvg/resvg-js --no-save)
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
// the font has no star glyph, so draw one
const star = (cx, cy, on) => {
  const pts = Array.from({ length: 10 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 6 : 14;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return `<polygon points="${pts}" fill="${on ? "#ffd24a" : "#4a4360"}"/>`;
};
let tiles = "";
for (let i = 0; i < 30; i++) {
  const c = i % 10, r = Math.floor(i / 10);
  const x = 60 + c * 110, y = 250 + r * 115;
  const done = (i * 7) % 3 !== 0;
  tiles += `<g>
    <polygon points="${x + 8},${y} ${x + 28},${y - 22} ${x + 42},${y}" fill="#2a2440"/>
    <polygon points="${x + 58},${y} ${x + 72},${y - 22} ${x + 92},${y}" fill="#2a2440"/>
    <rect x="${x}" y="${y}" width="100" height="95" rx="10" fill="#1e1a2b" stroke="${done ? "#6b5a2a" : "#332d47"}" stroke-width="2"/>
    <text x="${x + 12}" y="${y + 30}" fill="#8f88a8" font-family="JetBrains Mono" font-size="20">${i + 1}</text>
    ${star(x + 24, y + 66, done)}${done && i % 2 ? star(x + 54, y + 66, true) : ""}
  </g>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#14111c"/>
<text x="60" y="130" fill="#e8e4f2" font-family="JetBrains Mono" font-weight="bold" font-size="76">advent of <tspan fill="#ff9ec7">catoid</tspan></text>
<text x="60" y="185" fill="#8f88a8" font-family="JetBrains Mono" font-size="28">thirty days of catoid-themed technical puzzles · two stars each</text>
${tiles}
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
