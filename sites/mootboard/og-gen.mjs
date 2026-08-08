// Generates public/og.png — the Open Graph preview card for mootboard.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Re-run by hand if the artwork changes.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const WOOD = "#3a2415", CORK_A = "#c69a5c", CORK_B = "#a97e42";
const INK = "#fff2ea", DIM = "#ffe4d6", STRING = "#c81e1e";

const cards = [
  { x: 210, y: 210, rot: -6, handle: "@moot.one", text: "\"the group chat\nnever sleeps\"", color: "#f2e8c9", pin: "#d1263b" },
  { x: 480, y: 330, rot: 4, handle: "@moot.two", text: "\"my plants are\nlistening now\"", color: "#f3d9de", pin: "#2560c4" },
  { x: 760, y: 200, rot: -3, handle: "@moot.three", text: "\"normal amount\nof likes tbh\"", color: "#d7e6ee", pin: "#e0a622" },
  { x: 950, y: 350, rot: 7, handle: "@moot.four", text: "\"it's all\nconnected\"", color: "#ecd9a6", pin: "#2a9d4f" },
];

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let strings = "";
const pairs = [[0, 1], [1, 2], [1, 3], [2, 3], [0, 2]];
for (const [i, j] of pairs) {
  const a = cards[i], b = cards[j];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + 40;
  strings += `<path d="M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}" stroke="${STRING}" stroke-width="3" fill="none" opacity="0.85"/>\n`;
}

let cardSvg = "";
for (const c of cards) {
  let textEl = `<text x="0" y="-30" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="#5a4a2a" text-anchor="middle">${esc(c.handle)}</text>\n`;
  const lines = c.text.split("\n");
  lines.forEach((line, i) => {
    textEl += `<text x="0" y="${-4 + i * 22}" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="#1c1c1c" text-anchor="middle">${esc(line)}</text>\n`;
  });
  cardSvg += `
  <g transform="translate(${c.x} ${c.y}) rotate(${c.rot})">
    <rect x="-95" y="-52" width="190" height="106" fill="${c.color}" opacity="0.98"/>
    <circle cx="0" cy="-52" r="7" fill="${c.pin}"/>
    ${textEl}
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${WOOD}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="${CORK_A}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="url(#speck)" opacity="0.5"/>
  <defs>
    <pattern id="speck" width="9" height="9" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="0.9" fill="${CORK_B}"/>
    </pattern>
  </defs>
  ${strings}
  ${cardSvg}
  <text x="60" y="86" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${INK}">mootboard</text>
  <text x="1140" y="${H - 44}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${DIM}">mootboard.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
