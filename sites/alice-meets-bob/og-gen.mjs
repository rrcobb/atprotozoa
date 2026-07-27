// Generates public/og.png — the Open Graph preview card for alice-meets-bob,
// so a shared link auto-renders a picture in Bluesky / other unfurlers.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Copied and trimmed from sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#150c14", BG2 = "#1f1219", FG = "#f4ecf0", DIM = "#b79aa8";
const ACCENT = "#ff4d6d", ACCENT2 = "#ffd166", CARD = "#241621", BORDER = "#40283a";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cardX = 90, cardY = 70, cardW = 1020, cardH = 490;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.32" r="0.7">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="22" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>

  <!-- two locks either side of a heart: alice + bob, unreadable to anyone else -->
  <g transform="translate(${cardX + 120},${cardY + 150})" fill="none" stroke="${ACCENT2}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="-34" y="-6" width="68" height="56" rx="10"/>
    <path d="M -20 -6 V -26 A 20 20 0 0 1 20 -26 V -6"/>
  </g>
  <g transform="translate(${cardX + cardW - 120},${cardY + 150})" fill="none" stroke="${ACCENT2}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="-34" y="-6" width="68" height="56" rx="10"/>
    <path d="M -20 -6 V -26 A 20 20 0 0 1 20 -26 V -6"/>
  </g>
  <path d="M ${cardX + cardW / 2} ${cardY + 190} c -34 -40 -96 -40 -96 6 c 0 34 52 62 96 96 c 44 -34 96 -62 96 -96 c 0 -46 -62 -46 -96 -6 Z"
        fill="${ACCENT}" opacity="0.92"/>

  <text x="${cardX + cardW / 2}" y="${cardY + 330}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="56" fill="${FG}">alice meets bob</text>
  <text x="${cardX + cardW / 2}" y="${cardY + 380}" text-anchor="middle" font-family="JetBrains Mono" font-size="24" fill="${DIM}">an all-frontend, public-key-encrypted crush matcher for atproto</text>

  <g font-family="JetBrains Mono" font-size="19" fill="${DIM}">
    <text x="${cardX + cardW / 2}" y="${cardY + 430}" text-anchor="middle">tell it who you like — nothing decrypts unless they said the same about you</text>
  </g>

  <text x="${cardX + cardW / 2}" y="${cardY + cardH - 34}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${ACCENT2}">bisks.net/alice-meets-bob</text>
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
