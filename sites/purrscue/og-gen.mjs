// Generates public/og.png — the Open Graph preview card for purrscue.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed). Copied and reflavored
// from sites/spellclash/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (resvg is already a root devDep)
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0c0709", BG2 = "#1d1012", FG = "#f6eade", DIM = "#c2a08f";
const FLAME = "#ff7a3c", FLAME2 = "#ffb347", GOLD = "#ffd27a", CARD = "#180f11", BORDER = "#3a2020";

const cardX = 90, cardY = 70, cardW = 1020, cardH = 490;
const midX = cardX + cardW / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.82" r="0.5">
      <stop offset="0" stop-color="${FLAME}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${FLAME}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="22" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="22" fill="url(#glow)"/>

  <!-- little burning house, centered -->
  <g transform="translate(${midX},${cardY + 210})">
    <polygon points="-90,10 0,-60 90,10" fill="#2a1416" stroke="${BORDER}" stroke-width="3"/>
    <rect x="-75" y="5" width="150" height="80" rx="4" fill="#20100f" stroke="${BORDER}" stroke-width="3"/>
    <rect x="-15" y="35" width="30" height="50" fill="#160b0a" stroke="${BORDER}" stroke-width="2"/>
    <rect x="-58" y="22" width="22" height="22" fill="#160b0a" stroke="${BORDER}" stroke-width="2"/>
    <rect x="36" y="22" width="22" height="22" fill="#160b0a" stroke="${BORDER}" stroke-width="2"/>
    <path d="M-25 85 C-30 55 -12 48 -20 25 C0 38 5 12 -5 -8 C22 5 28 -28 15 -50 C48 -35 55 2 38 25 C58 15 62 42 42 60 C55 55 60 75 40 85 Z" fill="${FLAME}"/>
    <path d="M-8 85 C-11 62 3 55 -3 38 C10 47 15 27 8 12 C28 22 33 -2 24 -18 C46 -8 50 15 38 32 C52 26 56 46 42 58 C50 55 52 70 38 85 Z" fill="${FLAME2}" opacity="0.85"/>
  </g>

  <text x="${midX}" y="${cardY + 350}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="58" fill="${FG}">purrscue</text>
  <text x="${midX}" y="${cardY + 400}" text-anchor="middle" font-family="JetBrains Mono" font-size="23" fill="${DIM}">a burning house, a few cats, and you</text>
  <text x="${midX}" y="${cardY + 440}" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="${DIM}">click the house to save one. then throw it back in for another point.</text>

  <text x="${midX}" y="${cardY + cardH - 34}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${GOLD}">purrscue.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));

const resvg = new Resvg(svg, {
  font: {
    fontFiles: [fontPath],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
  background: BG,
});
const png = resvg.render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png");
