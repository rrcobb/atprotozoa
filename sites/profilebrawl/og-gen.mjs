// Generates public/og.png — the Open Graph preview card for profile brawl.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly). Copied and trimmed from sites/sillympics/og-gen.mjs.
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

const BG = "#120c14", BG2 = "#1e1420", FG = "#f5eef2", DIM = "#a395a3";
const A = "#4fd1c5", B = "#ff6fa1", GOLD = "#ffce54", CARD = "#1a121d", BORDER = "#33243a";

const cardX = 90, cardY = 60, cardW = 1020, cardH = 500;
const midX = cardX + cardW / 2;

// A simple boxing-glove silhouette: a rounded fist + a cuff, built from a
// path plus a couple of rects — no font/emoji dependency.
function glove(cx, cy, color, flip) {
  const s = flip ? -1 : 1;
  return `
  <g transform="translate(${cx},${cy}) scale(${s},1)" fill="${color}">
    <path d="M -34 -10 C -34 -34 -8 -40 8 -34 C 26 -28 30 -8 26 8 C 34 12 36 24 30 32 C 24 40 8 42 -4 38 C -22 34 -34 18 -34 -10 Z"/>
    <rect x="-4" y="30" width="46" height="24" rx="8"/>
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

  ${glove(cardX + 210, cardY + 150, A, false)}
  ${glove(cardX + cardW - 210, cardY + 150, B, true)}
  <text x="${midX}" y="${cardY + 160}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${GOLD}">VS</text>

  <text x="${midX}" y="${cardY + 250}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="56" fill="${FG}">profile brawl</text>
  <text x="${midX}" y="${cardY + 302}" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="${DIM}">two handles enter, five real criteria decide the winner</text>

  <g font-family="JetBrains Mono" font-size="18" fill="${DIM}">
    <text x="${midX}" y="${cardY + 348}" text-anchor="middle">cat pics · bio creativity · emoji rotation · hashtag hoarding · wordiness</text>
  </g>

  <text x="${midX}" y="${cardY + cardH - 34}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${GOLD}">profilebrawl.bisks.net</text>
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
