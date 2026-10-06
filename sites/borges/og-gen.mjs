// Generates public/og.png (1200x630) with @resvg/resvg-js, borrowing the font
// bundled in ../didscope/fonts (this box has no system fonts).
//   npm install @resvg/resvg-js --no-save   # one-time
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
  const a = Math.PI / 3 * i + Math.PI / 6;
  return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
}).join(" ");
let hexes = "";
for (let row = -1; row < 6; row++) for (let col = 0; col < 8; col++) {
  const r = 64, cx = 560 + col * r * 1.74 + (row % 2 ? r * 0.87 : 0), cy = row * r * 1.5 + 20;
  hexes += `<polygon points="${hex(cx, cy, r - 3)}" fill="none" stroke="#e0925f" stroke-opacity="0.22" stroke-width="2"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#17140f"/>${hexes}
<rect x="0" y="0" width="640" height="630" fill="#17140f" fill-opacity="0.88"/>
<text x="64" y="230" font-family="JetBrains Mono" font-weight="800" font-size="84" fill="#ece4d3">borges</text>
<text x="64" y="290" font-family="JetBrains Mono" font-size="26" fill="#e0925f">1899–1986</text>
<text x="64" y="370" font-family="JetBrains Mono" font-size="22" fill="#a39887">a reference page, and a note</text>
<text x="64" y="402" font-family="JetBrains Mono" font-size="22" fill="#a39887">on librarians as knowledge nodes</text>
<text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="#e0925f">borges.bisks.net</text>
</svg>`;
const font = fileURLToPath(new URL("../didscope/fonts/JetBrainsMono.ttf", import.meta.url));
const png = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
