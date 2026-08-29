// Generates public/og.png — the Open Graph preview card for shibbisms.
// Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#100c14", FG = "#f2eef6", DIM = "#9a8fa8";
const ACCENT = "#c98bff", ACCENT2 = "#ffb3d1", GOLD = "#ffd166";
const CARD = "#171220", BORDER = "#332a40";

const quoteLines = [
  "“everything is about gender, except",
  "gender, which is about sex”",
];

const cardX = 64, cardY = 300, cardW = 1072, cardH = 190;
const quoteSvg = quoteLines
  .map(
    (line, i) =>
      `<text x="${cardX + 40}" y="${cardY + 70 + i * 44}" font-family="JetBrains Mono" font-size="34" fill="${FG}">${line}</text>`,
  )
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="6%" cy="-8%" r="55%">
      <stop offset="0" stop-color="#2a1a3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="98%" cy="4%" r="50%">
      <stop offset="0" stop-color="#3a1a2c"/>
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

  <text x="64" y="108" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">shibbisms</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="21" fill="${DIM}">shibbi.me's quality aphorisms, per buildthis</text>
  <text x="64" y="180" font-family="JetBrains Mono" font-size="21" fill="${DIM}">17,589 posts pulled. 17 made the cut.</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 40}" y="${cardY + 40}" font-family="JetBrains Mono" font-weight="800" font-size="14" letter-spacing="2" fill="${GOLD}">THE SEED &#8226; @shibbi.me</text>
  ${quoteSvg}

  <text x="64" y="600" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">shibbisms.bisks.net</text>
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
