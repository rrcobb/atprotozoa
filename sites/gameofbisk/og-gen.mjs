// Generates public/og.png — the Open Graph preview card. Same recipe as
// sites/receipts/og-gen.mjs and sites/griftindex/og-gen.mjs: a hand-drawn
// SVG at the canonical OG size, rasterised with @resvg/resvg-js (no system
// Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#ffffff", INK = "#17180f", MUTED = "#6b6b60";
const ALIVE = "#20241f", ACCENT = "#3f7d3a", ANT = "#d1495b";

// A small deterministic PRNG so the card is reproducible across regenerations.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xbeef);

// Background: a faint field of Life-like cells, sparser near the top where
// the title sits so the text stays legible.
const CELL = 18;
const cols = Math.ceil(W / CELL);
const rows = Math.ceil(H / CELL);
let cellsSvg = "";
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < cols; x++) {
    const nearTitle = y < 8 && x < 30;
    const density = nearTitle ? 0.03 : 0.16;
    if (rng() < density) {
      const isAnt = rng() < 0.05;
      cellsSvg += `<rect x="${x * CELL}" y="${y * CELL}" width="${CELL - 2}" height="${CELL - 2}" rx="2" fill="${isAnt ? ANT : ALIVE}" opacity="${isAnt ? 0.85 : 0.16}"/>\n`;
    }
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${cellsSvg}
  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${INK}" stroke-width="10"/>

  <text x="64" y="230" font-family="JetBrains Mono" font-weight="800" font-size="88" fill="${INK}">game of <tspan fill="${ACCENT}">bisk</tspan></text>
  <text x="64" y="300" font-family="JetBrains Mono" font-size="27" fill="${MUTED}">pick a bisk, gridify it, then run cellular automata on it</text>

  <text x="64" y="380" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">Conway's Life · HighLife · Seeds · Day &amp; Night</text>
  <text x="64" y="418" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">Brian's Brain · <tspan fill="${ANT}">Langton's Ant</tspan> · Elementary CA</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">gameofbisk.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();

const outPath = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(outPath, png);
console.log(`wrote ${outPath} ${png.length} bytes`);
