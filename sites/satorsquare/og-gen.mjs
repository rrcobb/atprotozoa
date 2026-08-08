// Generates public/og.png — the Open Graph preview card. Hand-drawn SVG at
// the canonical OG size, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium/fontconfig needed — font bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG_TOP = "#2b2416", BG_MID = "#17140d", BG_BOT = "#0c0a06";
const GOLD = "#e7c874", GOLD_DIM = "#b8ab88", CELL = "#2f2716", CELL_LINE = "#4a3c20";
const INK = "#f2e2b8";

// A real solved square that also spells out the joke acronym this site was
// built for — CIA reads as row 2, ISP and API fall out of the columns.
const ROWS = ["CIA", "ISP", "API"];

const gridSize = 300;
const cell = gridSize / 3;
const gx = 700;
const gy = H / 2 - gridSize / 2;

let cells = "";
for (let i = 0; i < 3; i++) {
  for (let j = 0; j < 3; j++) {
    const x = gx + j * cell;
    const y = gy + i * cell;
    cells += `<rect x="${x + 3}" y="${y + 3}" width="${cell - 6}" height="${cell - 6}" fill="${CELL}" stroke="${CELL_LINE}" stroke-width="2"/>`;
    cells += `<text x="${x + cell / 2}" y="${y + cell / 2 + 16}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="46" fill="${INK}">${ROWS[i][j]}</text>`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="-10%" r="90%">
      <stop offset="0%" stop-color="${BG_TOP}"/>
      <stop offset="55%" stop-color="${BG_MID}"/>
      <stop offset="100%" stop-color="${BG_BOT}"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="60" y="150" font-family="DejaVu Serif" font-weight="700" font-size="64" letter-spacing="6" fill="${GOLD}">SATOR3</text>
  <text x="60" y="200" font-family="DejaVu Serif" font-size="24" fill="${GOLD_DIM}">a sator square generator + puzzle</text>

  <text x="60" y="270" font-family="DejaVu Serif" font-size="22" fill="${GOLD_DIM}">limited to real three-letter words —</text>
  <text x="60" y="304" font-family="DejaVu Serif" font-size="22" fill="${GOLD_DIM}">plus AOC, AGI, CIA, LSD and a few</text>
  <text x="60" y="338" font-family="DejaVu Serif" font-size="22" fill="${GOLD_DIM}">other honorary ones.</text>

  <text x="60" y="420" font-family="DejaVu Serif" font-size="20" fill="${GOLD_DIM}">reads the same across and down —</text>
  <text x="60" y="450" font-family="DejaVu Serif" font-size="20" fill="${GOLD_DIM}">the same trick as SATOR AREPO TENET</text>
  <text x="60" y="480" font-family="DejaVu Serif" font-size="20" fill="${GOLD_DIM}">OPERA ROTAS, 2000 years ago.</text>

  <rect x="${gx - 12}" y="${gy - 12}" width="${gridSize + 24}" height="${gridSize + 24}" fill="${CELL}" stroke="${CELL_LINE}" stroke-width="2"/>
  ${cells}

  <text x="60" y="570" font-family="DejaVu Serif" font-weight="700" font-size="22" fill="${INK}">satorsquare.bisks.net</text>
</svg>`;

const fontDir = fileURLToPath(new URL("./fonts/", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: {
    fontDirs: [fontDir],
    loadSystemFonts: false,
    defaultFontFamily: "DejaVu Serif",
  },
});
const png = r.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
