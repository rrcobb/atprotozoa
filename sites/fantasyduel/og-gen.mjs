// Generates public/og.png — the Open Graph preview card for fantasy duel.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Copied and trimmed from sites/botbattle/og-gen.mjs.
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

const BG = "#100b06", BG2 = "#1a1006", FG = "#f3e9d6", DIM = "#a99a80";
const A = "#ff9d4d", B = "#6fc4ff", GOLD = "#ffd166", CARD = "#191106", BORDER = "#3a2c15";

const cardX = 90, cardY = 70, cardW = 1020, cardH = 490;
const midX = cardX + cardW / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <linearGradient id="glowA" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${A}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${A}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="glowB" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="${B}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${B}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW / 2}" height="${cardH}" fill="url(#glowA)"/>
  <rect x="${midX}" y="${cardY}" width="${cardW / 2}" height="${cardH}" fill="url(#glowB)"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="22" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>

  <!-- two facing hero silhouettes either side of a crossed-swords VS -->
  <g transform="translate(${cardX + 190},${cardY + 190})" fill="${A}" opacity="0.9">
    <circle r="34"/>
    <path d="M -50 60 C -50 10 -30 -10 0 -10 C 30 -10 50 10 50 60 Z"/>
    <path d="M -60 -10 L -20 -50 L -10 -20 Z"/>
  </g>
  <g transform="translate(${cardX + cardW - 190},${cardY + 190})" fill="${B}" opacity="0.9">
    <circle r="34"/>
    <path d="M -50 60 C -50 10 -30 -10 0 -10 C 30 -10 50 10 50 60 Z"/>
    <path d="M 60 -10 L 20 -50 L 10 -20 Z"/>
  </g>
  <g transform="translate(${midX},${cardY + 190})" fill="none" stroke="${GOLD}" stroke-width="7" stroke-linecap="round">
    <path d="M -36 -34 L 36 34"/>
    <path d="M 36 -34 L -36 34"/>
  </g>

  <text x="${midX}" y="${cardY + 320}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="58" fill="${FG}">fantasy duel</text>
  <text x="${midX}" y="${cardY + 372}" text-anchor="middle" font-family="JetBrains Mono" font-size="23" fill="${DIM}">two handles enter as fantasy characters — one wins</text>

  <g font-family="JetBrains Mono" font-size="19" fill="${DIM}">
    <text x="${midX}" y="${cardY + 420}" text-anchor="middle">tweet strength, follower agility, and a fully made-up battle</text>
  </g>

  <text x="${midX}" y="${cardY + cardH - 34}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${GOLD}">fantasyduel.bisks.net</text>
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
