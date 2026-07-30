// Generates public/og.png — the Open Graph preview card for mootcraft.
// A static cross-section of the mine: dirt up top, stone below, a few ore
// blocks picked out in tier colors (gold/diamond/viral) with heart badges,
// title + pitch on the left. Rasterised with @resvg/resvg-js (pure native
// module, no system Chromium/fontconfig needed — font bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/didscope/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0906", INK = "#f2ead9", MUTED = "#9c8d74", ACCENT = "#e8a33d", CYAN = "#4fd1c5";

// tiny seeded RNG so the layout is identical every run
let seed = 7;
const rnd = (a = 1, b = 0) => b + ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * (a - b);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// --- right panel: a grid cross-section, grass/dirt/stone with a few ore ---
const gridX = 660, gridY = 70, cols = 7, rows = 7, cell = 68;
const GRASS_ROW = 0, DIRT_ROWS = [1, 2], STONE_ROWS = [3, 4, 5, 6];
const PALETTE = {
  grass: { base: "#3f7d43", dark: "#2c5c30" },
  dirt: { base: "#6b4a2c", dark: "#4a3320" },
  stone: { base: "#6b6a63", dark: "#504f49" },
};
const ORE = [
  { r: 2, c: 1, tier: "gold", color: "#e8c23d", likes: 34 },
  { r: 4, c: 4, tier: "diamond", color: "#4fd1c5", likes: 118 },
  { r: 5, c: 1, tier: "iron", color: "#c8926a", likes: 9 },
  { r: 6, c: 5, tier: "viral", color: "#ff5fd1", likes: 312 },
];
const oreAt = (r, c) => ORE.find((o) => o.r === r && o.c === c);

let gridSvg = "";
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const x = gridX + c * cell, y = gridY + r * cell;
    let base, dark;
    if (r === GRASS_ROW) ({ base, dark } = PALETTE.grass);
    else if (DIRT_ROWS.includes(r)) ({ base, dark } = PALETTE.dirt);
    else ({ base, dark } = PALETTE.stone);
    gridSvg += `<rect x="${x}" y="${y}" width="${cell - 3}" height="${cell - 3}" fill="${base}"/>`;
    // a few noise flecks per cell for texture
    for (let i = 0; i < 3; i++) {
      const fx = x + rnd(cell - 10, 4), fy = y + rnd(cell - 10, 4);
      gridSvg += `<rect x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="4" height="4" fill="${dark}" opacity="0.55"/>`;
    }
    const ore = oreAt(r, c);
    if (ore) {
      const cx = x + cell / 2, cy = y + cell / 2;
      gridSvg += `
      <rect x="${x + 3}" y="${y + 3}" width="${cell - 9}" height="${cell - 9}" fill="${ore.color}" opacity="0.92" rx="4"/>
      <circle cx="${cx}" cy="${cy - 6}" r="12" fill="rgba(0,0,0,0.35)"/>
      <text x="${cx}" y="${cy + 20}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="#0b0906">+${ore.likes}</text>`;
    }
  }
}
const gridBorderW = cols * cell - 3, gridBorderH = rows * cell - 3;

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="18%" cy="20%" r="70%">
      <stop offset="0" stop-color="#3a2b12" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${INK}"/>
      <stop offset="1" stop-color="${ACCENT}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <rect x="${gridX - 6}" y="${gridY - 6}" width="${gridBorderW + 12}" height="${gridBorderH + 12}" fill="none" stroke="#2c2417" stroke-width="3"/>
  ${gridSvg}

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">moot<tspan fill="${ACCENT}">craft</tspan></text>

  <text x="64" y="220" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">a first-person voxel mine.</text>
  <text x="64" y="252" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">every ore block is a real post</text>
  <text x="64" y="284" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">from you or a moot.</text>

  <text x="64" y="340" font-family="JetBrains Mono" font-weight="700" font-size="21" fill="${CYAN}">likes = ore. dig it up.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">bisks.net/games/mootcraft</text>
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
