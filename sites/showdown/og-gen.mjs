// Generates public/og.png — the Open Graph preview card for showdown.
// Copied and trimmed from sites/botbattle/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0b0f0b", BG2 = "#0e1a10", FG = "#f2fbf2", DIM = "#9fb8a0";
const RED = "#e0454f", BLUE = "#4a90d9", GOLD = "#f5cb42", CARD = "#10190f", BORDER = "#28402a";

const cardX = 90, cardY = 70, cardW = 1020, cardH = 490;
const midX = cardX + cardW / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <linearGradient id="glowA" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${RED}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${RED}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="glowB" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="${BLUE}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${BLUE}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW / 2}" height="${cardH}" fill="url(#glowA)"/>
  <rect x="${midX}" y="${cardY}" width="${cardW / 2}" height="${cardH}" fill="url(#glowB)"/>
  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="22" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>

  <g transform="translate(${cardX + 180},${cardY + 200}) scale(1.1)" fill="${RED}" opacity="0.92">
    <circle r="30"/>
    <path d="M -46 55 C -46 8 -26 -8 0 -8 C 26 -8 46 8 46 55 Z"/>
    <circle r="30" fill="none" stroke="${FG}" stroke-width="4"/>
  </g>
  <g transform="translate(${cardX + cardW - 180},${cardY + 200}) scale(1.1)" fill="${BLUE}" opacity="0.92">
    <circle r="30"/>
    <path d="M -46 55 C -46 8 -26 -8 0 -8 C 26 -8 46 8 46 55 Z"/>
    <circle r="30" fill="none" stroke="${FG}" stroke-width="4"/>
  </g>
  <text x="${midX}" y="${cardY + 215}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="34" fill="${GOLD}">VS</text>

  <text x="${midX}" y="${cardY + 320}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="58" fill="${FG}">showdown</text>
  <text x="${midX}" y="${cardY + 372}" text-anchor="middle" font-family="JetBrains Mono" font-size="23" fill="${DIM}">real random-battle teams, the real damage engine</text>
  <text x="${midX}" y="${cardY + 410}" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="${DIM}">powered by @pkmn/sim + @pkmn/dex + @pkmn/img</text>

  <text x="${midX}" y="${cardY + cardH - 34}" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${GOLD}">showdown.bisks.net</text>
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
