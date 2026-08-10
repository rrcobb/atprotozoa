// Generates public/og.png — the Open Graph preview card for sillympics.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Copied and trimmed from sites/fantasyduel/og-gen.mjs.
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

const BG = "#0c0f14", BG2 = "#151a22", FG = "#eef2f5", DIM = "#8b95a3";
const A = "#4fd1c5", B = "#ff6fa1", GOLD = "#ffce54", CARD = "#12161d", BORDER = "#232a35";

const cardX = 90, cardY = 60, cardW = 1020, cardH = 500;
const midX = cardX + cardW / 2;

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

  <!-- a trophy at center, flanked by two medal-ring silhouettes -->
  <g transform="translate(${cardX + 200},${cardY + 150})" fill="${A}" opacity="0.9">
    <circle r="30"/>
    <rect x="-6" y="26" width="12" height="26" rx="3"/>
    <rect x="-26" y="52" width="52" height="12" rx="4"/>
  </g>
  <g transform="translate(${cardX + cardW - 200},${cardY + 150})" fill="${B}" opacity="0.9">
    <circle r="30"/>
    <rect x="-6" y="26" width="12" height="26" rx="3"/>
    <rect x="-26" y="52" width="52" height="12" rx="4"/>
  </g>
  <g transform="translate(${midX},${cardY + 130})" fill="${GOLD}">
    <path d="M -46 -30 L 46 -30 L 40 10 C 40 40 20 56 0 56 C -20 56 -40 40 -40 10 Z"/>
    <rect x="-34" y="-46" width="18" height="20" rx="4"/>
    <rect x="16" y="-46" width="18" height="20" rx="4"/>
    <rect x="-10" y="56" width="20" height="14" rx="3"/>
    <rect x="-30" y="70" width="60" height="14" rx="4"/>
  </g>

  <text x="${midX}" y="${cardY + 250}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="58" fill="${FG}">sillympics</text>
  <text x="${midX}" y="${cardY + 302}" text-anchor="middle" font-family="JetBrains Mono" font-size="23" fill="${DIM}">two handles enter, five ridiculous events, one champion</text>

  <g font-family="JetBrains Mono" font-size="19" fill="${DIM}">
    <text x="${midX}" y="${cardY + 348}" text-anchor="middle">pizza eating · badge collecting · relay · pageant · doomscroll marathon</text>
  </g>

  <text x="${midX}" y="${cardY + cardH - 34}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${GOLD}">sillympics.bisks.net</text>
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
