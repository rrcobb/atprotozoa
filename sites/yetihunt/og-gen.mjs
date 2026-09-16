// Generates public/og.png — the Open Graph preview card for yetihunt.
// Same recipe as sites/creaturearena/og-gen.mjs: hand-drawn SVG at the
// canonical OG size, rasterised with @resvg/resvg-js (no system Chromium
// needed, no fontconfig on this box either, so the font is bundled in
// ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const SKY = "#cfe8f7", SKY2 = "#eef7ff", INK = "#1c2b3a", MUTED = "#4d6274";
const ACCENT = "#d1373f", ACCENT2 = "#1c6fd1", SNOW = "#f4f9ff", CARD = "#ffffff", BORDER = "#c9dcec";

const cardX = 90, cardY = 62, cardW = 1020, cardH = 506;
const midX = cardX + cardW / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${SKY}"/>
      <stop offset="1" stop-color="${SKY2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="22" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>

  <!-- yeti, left -->
  <g transform="translate(${cardX + 190},${cardY + 250})">
    <path d="M -8 74 L -14 110 M 8 74 L 14 110" stroke="#c7d0d8" stroke-width="10" stroke-linecap="round" fill="none"/>
    <path d="M 0 -80 C 34 -80 46 -46 44 -6 C 42 34 32 62 0 66 C -32 62 -42 34 -44 -6 C -46 -46 -34 -80 0 -80 Z" fill="#eef3f6" stroke="#9aa7b2" stroke-width="3"/>
    <path d="M -32 -6 L -66 22 M 32 -6 L 66 -22" stroke="#eef3f6" stroke-width="14" stroke-linecap="round"/>
    <circle cx="-14" cy="-30" r="7" fill="${ACCENT}"/>
    <circle cx="14" cy="-30" r="7" fill="${ACCENT}"/>
    <path d="M -12 -6 L 12 -6 L 0 14 Z" fill="#3a2f2f"/>
  </g>

  <!-- skier, right -->
  <g transform="translate(${cardX + cardW - 210},${cardY + 260})">
    <path d="M -30 60 L 0 66 M 6 66 L 32 60" stroke="${INK}" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M 0 6 L -16 56 M 0 6 L 16 56" stroke="${ACCENT2}" stroke-width="8" stroke-linecap="round" fill="none"/>
    <path d="M -16 -20 L 16 -20 L 12 16 L -12 16 Z" fill="${ACCENT}" stroke="#8a1f26" stroke-width="2"/>
    <path d="M -14 -10 L -34 8 M 14 -10 L 34 8" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M -34 8 L -42 32 M 34 8 L 42 32" stroke="${MUTED}" stroke-width="3" fill="none"/>
    <circle cx="0" cy="-30" r="12" fill="#f4c89a"/>
    <path d="M -13 -33 A 13 13 0 0 1 13 -33 L 13 -36 L -13 -36 Z" fill="${INK}"/>
  </g>

  <!-- crosshair over the yeti -->
  <g transform="translate(${cardX + 190},${cardY + 200})" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity="0.75">
    <circle r="30" fill="none"/>
    <path d="M -46 0 L -34 0 M 34 0 L 46 0 M 0 -46 L 0 -34 M 0 34 L 0 46"/>
  </g>

  <text x="${midX}" y="${cardY + 336}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="60" fill="${INK}">yetihunt</text>
  <text x="${midX}" y="${cardY + 390}" text-anchor="middle" font-family="JetBrains Mono" font-size="23" fill="${MUTED}">SkiFree, but you shoot back</text>
  <text x="${midX}" y="${cardY + 436}" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">dodge the trees, then mouse-aim snowballs at the yeti before it catches you</text>

  <text x="${midX}" y="${cardY + cardH - 34}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${ACCENT2}">yetihunt.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));

const resvg = new Resvg(svg, {
  font: {
    fontFiles: [fontPath],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
  background: SKY,
});
const png = resvg.render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png");
