// Generates public/og.png — the Open Graph preview card for shipscore.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Copied and trimmed from sites/profilebrawl/og-gen.mjs.
// Shapes are drawn as SVG paths, not emoji glyphs — resvg with
// loadSystemFonts:false and only JetBrains Mono bundled has no emoji font,
// so any emoji dropped into a <text> node rasterizes as a blank tofu box.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#150e17", BG2 = "#231627", FG = "#f7eef4", DIM = "#a897ab";
const A = "#ff5d8f", B = "#a78bfa", GOLD = "#ffce54", CARD = "#1d1420", BORDER = "#382a3f";

const cardX = 90, cardY = 60, cardW = 1020, cardH = 500;
const midX = cardX + cardW / 2;

// A simple filled heart, built from a path — no font/emoji dependency.
function heart(cx, cy, scale, color) {
  return `
  <g transform="translate(${cx},${cy}) scale(${scale})" fill="${color}">
    <path d="M0 26 C -26 6 -40 -10 -40 -26 C -40 -40 -28 -50 -16 -50 C -6 -50 0 -44 0 -36 C 0 -44 6 -50 16 -50 C 28 -50 40 -40 40 -26 C 40 -10 26 6 0 26 Z"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <linearGradient id="glowA" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${A}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${A}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="glowB" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="${B}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${B}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW / 2}" height="${cardH}" fill="url(#glowA)"/>
  <rect x="${midX}" y="${cardY}" width="${cardW / 2}" height="${cardH}" fill="url(#glowB)"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="22" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>

  ${heart(cardX + 210, cardY + 150, 1.15, A)}
  ${heart(cardX + cardW - 210, cardY + 150, 1.15, B)}
  <text x="${midX}" y="${cardY + 160}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="42" fill="${GOLD}">×</text>

  <text x="${midX}" y="${cardY + 250}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="56" fill="${FG}">shipscore</text>
  <text x="${midX}" y="${cardY + 302}" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="${DIM}">how cool would it be if these two dated</text>

  <g font-family="JetBrains Mono" font-size="18" fill="${DIM}">
    <text x="${midX}" y="${cardY + 348}" text-anchor="middle">timezone sync · chaos · communication · humor · vocabulary · love language</text>
  </g>

  <text x="${midX}" y="${cardY + cardH - 34}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${GOLD}">shipscore.bisks.net</text>
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
