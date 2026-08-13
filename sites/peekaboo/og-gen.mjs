// Generates public/og.png — the Open Graph preview card for peekaboo.
// Deliberately a *teaser*: a locked grid over a dark void, never the actual
// hidden.svg artwork — the whole point of the site is not spoiling the
// picture, so the unfurl card shouldn't either. Hand-drawn SVG at the
// canonical OG size, rasterised with @resvg/resvg-js (pure native module, no
// system Chromium/fontconfig needed — font is bundled in ./fonts). Same
// recipe as sites/drivethru/og-gen.mjs / sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;

const BG = "#191225";
const PANEL = "#2c2044";
const LINE = "#3c2d5a";
const INK = "#f2e9ff";
const PINK = "#ff6fa5";
const GOLD = "#ffce54";

const GRID = 5;
const CELL = 68;
const gridW = CELL * GRID;
const gridH = CELL * GRID;
const gx = (W - gridW) / 2;
const gy = 128;

// Vector-drawn icons only — no emoji glyphs, since the rasteriser only has
// JetBrains Mono loaded (no color-emoji font) and would render tofu boxes.
function lockIcon(cx, cy) {
  const s = 11;
  return `<g opacity="0.55" stroke="${INK}" stroke-width="2.4" fill="none">
    <rect x="${cx - s}" y="${cy - s * 0.1}" width="${s * 2}" height="${s * 1.5}" rx="3" fill="${BG}" stroke="${INK}"/>
    <path d="M${cx - s * 0.65} ${cy - s * 0.1} v-${s * 0.7} a${s * 0.65} ${s * 0.65} 0 0 1 ${s * 1.3} 0 v${s * 0.7}"/>
  </g>`;
}
function sparkleIcon(cx, cy) {
  const r = 13;
  return `<path d="M${cx} ${cy - r} L${cx + r * 0.28} ${cy - r * 0.28} L${cx + r} ${cy} L${cx + r * 0.28} ${cy + r * 0.28} L${cx} ${cy + r} L${cx - r * 0.28} ${cy + r * 0.28} L${cx - r} ${cy} L${cx - r * 0.28} ${cy - r * 0.28} Z" fill="${GOLD}"/>`;
}

let cells = "";
for (let row = 0; row < GRID; row++) {
  for (let col = 0; col < GRID; col++) {
    const x = gx + col * CELL;
    const y = gy + row * CELL;
    const revealed = (row === 2 && col === 2) || (row === 1 && col === 3) || (row === 3 && col === 1);
    cells += `<rect x="${x + 2}" y="${y + 2}" width="${CELL - 4}" height="${CELL - 4}" rx="8"
      fill="${revealed ? "#463a63" : PANEL}" stroke="${LINE}" stroke-width="2"/>`;
    cells += revealed ? sparkleIcon(x + CELL / 2, y + CELL / 2) : lockIcon(x + CELL / 2, y + CELL / 2);
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="0%" r="60%">
      <stop offset="0" stop-color="#3a2050"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="10%" r="55%">
      <stop offset="0" stop-color="#4a3a10"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="${W / 2}" y="66" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${GOLD}">peekaboo</text>

  ${cells}

  <text x="${W / 2}" y="${gy + gridH + 48}" text-anchor="middle" font-family="JetBrains Mono" font-size="23" fill="${INK}">something great is hiding under this grid</text>
  <text x="${W / 2}" y="${gy + gridH + 80}" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="${PINK}">like your moots' posts to reveal it — one square at a time</text>
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
