// Generates public/og.png — the Open Graph preview card for cartouche.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — fonts bundled
// in ./fonts and loaded explicitly, same pattern as sites/monument). Draws
// real Egyptian hieroglyphs (Noto Sans Egyptian Hieroglyphs) alongside Latin
// title text (DejaVu Serif).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const STONE_DK = "#1b140c", STONE = "#2b2013", STONE_LT = "#3f3220";
const INK = "#f1e6cf", MUTED = "#9c8f74", GOLD = "#d9b25c", GOLD_HI = "#f2d385";

const cx = W / 2;

const stars = [
  [140, 60], [220, 110], [300, 40], [400, 90], [520, 50], [610, 100],
  [700, 30], [790, 80], [860, 130], [60, 100], [170, 20], [470, 25],
  [1100, 55], [1040, 110], [980, 35], [890, 150], [1150, 90], [50, 160],
]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${1 + (x % 3) * 0.4}" fill="#ffffff" opacity="${0.5 + (y % 40) / 100}"/>`)
  .join("\n  ");

const glyphString = "𓁹𓋹𓆣𓅓𓊪𓏏𓆓𓂋";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="sky" cx="0.5" cy="0.1" r="0.9">
      <stop offset="0" stop-color="#241a0f"/>
      <stop offset="1" stop-color="#0a0806"/>
    </radialGradient>
    <linearGradient id="stele" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${STONE_LT}"/>
      <stop offset="1" stop-color="${STONE_DK}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${stars}

  <!-- three tilted floating steles -->
  <g transform="translate(140,300) rotate(-7)">
    <rect x="0" y="0" width="230" height="270" rx="10" fill="url(#stele)" stroke="${GOLD}" stroke-opacity="0.35"/>
    <text x="115" y="150" text-anchor="middle" font-family="Noto Sans Egyptian Hieroglyphs" font-size="46" fill="${GOLD_HI}">𓅓𓊪𓏏</text>
  </g>
  <g transform="translate(830,290) rotate(6)">
    <rect x="0" y="0" width="230" height="270" rx="10" fill="url(#stele)" stroke="${GOLD}" stroke-opacity="0.35"/>
    <text x="115" y="150" text-anchor="middle" font-family="Noto Sans Egyptian Hieroglyphs" font-size="46" fill="${GOLD_HI}">𓆓𓂋𓆣</text>
  </g>

  <!-- central cartouche -->
  <g transform="translate(${cx},250)">
    <rect x="-190" y="-70" width="380" height="140" rx="68" fill="none" stroke="${GOLD}" stroke-width="6"/>
    <text x="0" y="14" text-anchor="middle" font-family="Noto Sans Egyptian Hieroglyphs" font-size="52" fill="${GOLD_HI}">${glyphString}</text>
  </g>

  <text x="${cx}" y="70" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="14" fill="${GOLD}" letter-spacing="4">A WEBSITE WRITTEN ENTIRELY IN HIEROGLYPHS</text>
  <text x="${cx}" y="450" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="54" fill="${INK}" letter-spacing="3">CARTOUCHE</text>
  <text x="${cx}" y="490" text-anchor="middle" font-family="DejaVu Serif" font-size="20" fill="${MUTED}" font-style="italic">a real Bluesky profile, carved glyph by glyph, floating in 3D</text>

  <rect x="0" y="${H - 60}" width="${W}" height="60" fill="#0c0906"/>
  <text x="${cx}" y="${H - 22}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="21" fill="${GOLD}">cartouche.bisks.net</text>
</svg>`;

const fontRegular = fileURLToPath(new URL("./fonts/DejaVuSerif.ttf", import.meta.url));
const fontBold = fileURLToPath(new URL("./fonts/DejaVuSerif-Bold.ttf", import.meta.url));
const fontGlyph = fileURLToPath(new URL("./fonts/NotoSansEgyptianHieroglyphs.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: {
    fontFiles: [fontRegular, fontBold, fontGlyph],
    loadSystemFonts: false,
    defaultFontFamily: "DejaVu Serif",
  },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
