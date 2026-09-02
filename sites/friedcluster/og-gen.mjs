// Generates public/og.png — the Open Graph preview card, so a shared link
// unfurls a picture of the fry grid instead of a bare URL. Hand-drawn SVG at
// the canonical OG size, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium/fontconfig needed — font is bundled in ./fonts
// and loaded explicitly). Copied from sites/simcluster-gacha/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Static, generic card (the real grid depends on whoever's handle gets
// typed in) — per-result cards aren't worth the extra Worker route for a
// gag site like this one.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#120c08", FG = "#fbe9d0", DIM = "#c7a888";
const GOLD = "#ffb238", RED = "#ff5a3c", CARD = "#23180f", BORDER = "#4a3320";

function chip(x, y, seed) {
  const hue = (seed * 47) % 360;
  return `
  <g>
    <rect x="${x}" y="${y}" width="128" height="128" rx="10" fill="hsl(${hue} 55% 22%)" stroke="${BORDER}" stroke-width="2"/>
    <circle cx="${x + 64}" cy="${y + 54}" r="30" fill="hsl(${hue} 70% ${38 + seed * 3}%)"/>
    <rect x="${x + 24}" y="${y + 90}" width="80" height="12" rx="6" fill="hsl(${hue} 60% 30%)"/>
  </g>`;
}

let chips = "";
const COLS = 4, ROWS = 2, GAP = 18, START_X = 610, START_Y = 160;
for (let i = 0; i < COLS * ROWS; i++) {
  const col = i % COLS, row = Math.floor(i / COLS);
  chips += chip(START_X + col * (128 + GAP), START_Y + row * (128 + GAP), i + 1);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="65%">
      <stop offset="0" stop-color="#3a220f"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${RED}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="url(#title)">friedcluster</text>

  <text x="64" y="230" font-family="JetBrains Mono" font-size="20" fill="${DIM}">every pfp in a Bluesky handle's</text>
  <text x="64" y="260" font-family="JetBrains Mono" font-size="20" fill="${DIM}"><tspan fill="${GOLD}">SimCluster</tspan> gets recursively re-fried.</text>
  <text x="64" y="300" font-family="JetBrains Mono" font-size="20" fill="${DIM}">real canvas + JPEG re-encoding —</text>
  <text x="64" y="330" font-family="JetBrains Mono" font-size="20" fill="${DIM}">ten generations of "more delicious."</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${RED}">friedcluster.bisks.net</text>

  ${chips}
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
