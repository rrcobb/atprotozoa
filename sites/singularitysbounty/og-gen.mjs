// Generates public/og.png — the Open Graph preview card for Singularity's
// Bounty, the PMP for catblanketflower.yuwakisa.com.
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
const ACCENT = "#b98eff", ACCENT2 = "#ffd166", ACCENT3 = "#5ec2ff";
const CARD = "#12161d", BORDER = "#2a3140";

const quoteLines = [
  "“The creation of this song in suno com",
  "was the singularity”",
];

const cardX = 64, cardY = 320, cardW = 1072, cardH = 190;
const quoteSvg = quoteLines
  .map(
    (line, i) =>
      `<text x="${cardX + 40}" y="${cardY + 64 + i * 44}" font-family="JetBrains Mono" font-size="30" fill="${FG}">${line}</text>`,
  )
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="6%" cy="-8%" r="55%">
      <stop offset="0" stop-color="#241a33"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="98%" cy="4%" r="50%">
      <stop offset="0" stop-color="#332a12"/>
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

  <text x="64" y="118" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="url(#title)">Singularity's Bounty</text>
  <text x="64" y="156" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a PMP for @catblanketflower.yuwakisa.com, built by buildthis</text>
  <text x="64" y="186" font-family="JetBrains Mono" font-size="21" fill="${DIM}">30,419 posts read off the PDS. Suno habit, toy factory, LLM philosophy.</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${cardX + 40}" y="${cardY + 40}" font-family="JetBrains Mono" font-weight="800" font-size="14" letter-spacing="2" fill="${ACCENT2}">FROM THE FEED &#8226; @catblanketflower.yuwakisa.com</text>
  ${quoteSvg}

  <text x="64" y="600" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT3}">singularitysbounty.bisks.net</text>
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
