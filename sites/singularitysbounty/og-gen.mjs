// Generates public/og.png — the Open Graph preview card for bestofcee.
// Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0c0f14", FG = "#eef2f6", DIM = "#8a97a8";
const ACCENT = "#5ec2ff", ACCENT2 = "#8effc1", GOLD = "#ffd166";
const CARD = "#12161d", BORDER = "#2a3140";

const quote =
  "“if the final product doesn’t have any of the thing in it why should i care that”";
const quoteLines = [
  "“if the final product doesn’t have any of",
  "the thing in it why should i care that the",
  "thing was used in the process? This is like",
  "complaining that gasoline and engine oil",
  "was used to make a cake because a truck",
  "delivered the ingredients.”",
];

const cardX = 64, cardY = 300, cardW = 1072, cardH = 262;
const quoteSvg = quoteLines
  .map(
    (line, i) =>
      `<text x="${cardX + 40}" y="${cardY + 56 + i * 34}" font-family="JetBrains Mono" font-size="22" fill="${FG}">${line}</text>`,
  )
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="6%" cy="-8%" r="55%">
      <stop offset="0" stop-color="#0f2a3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="98%" cy="4%" r="50%">
      <stop offset="0" stop-color="#0f3a2c"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="108" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">bestofcee</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="21" fill="${DIM}">cee.wtf's best post, according to buildthis</text>
  <text x="64" y="180" font-family="JetBrains Mono" font-size="21" fill="${DIM}">4,258 posts actually read. 0 sorted by like count.</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 40}" y="${cardY + 40}" font-family="JetBrains Mono" font-weight="800" font-size="14" letter-spacing="2" fill="${GOLD}">THE PICK &#8226; @cee.wtf</text>
  ${quoteSvg}

  <text x="64" y="600" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">bestofcee.bisks.net</text>
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
