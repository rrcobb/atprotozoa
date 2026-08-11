// Generates public/og.png — the Open Graph preview card for monument.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Copied and trimmed from
// sites/cryptidgazette/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const STONE_DK = "#252932", STONE = "#333741", STONE_LT = "#4b505c";
const INK = "#eef0f3", MUTED = "#9aa0ac", BRASS = "#c9a15b";

const cx = W / 2;

const stars = [
  [140, 70], [220, 130], [300, 50], [400, 100], [520, 60], [610, 120],
  [700, 40], [790, 90], [860, 150], [60, 120], [170, 30], [470, 30],
  [750, 25], [350, 170], [1100, 60], [1040, 130], [980, 40], [890, 180],
  [1150, 100], [50, 180],
]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${1 + (x % 3) * 0.4}" fill="#ffffff" opacity="${0.5 + (y % 40) / 100}"/>`)
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#080a13"/>
      <stop offset="0.5" stop-color="#191029"/>
      <stop offset="0.85" stop-color="#3a2138"/>
      <stop offset="1" stop-color="#5c3a3a"/>
    </linearGradient>
    <radialGradient id="spot" cx="0.5" cy="1" r="0.6">
      <stop offset="0" stop-color="#d98a4f" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#d98a4f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${stars}
  <circle cx="${W - 150}" cy="100" r="34" fill="#f1ecd9"/>
  <rect x="0" y="${H - 90}" width="${W}" height="90" fill="#0c0d10"/>
  <rect x="0" y="${H - 420}" width="${W}" height="320" fill="url(#spot)"/>

  <rect x="${cx - 138}" y="420" width="276" height="90" fill="${STONE}"/>
  <polygon points="${cx - 92},210 ${cx + 92},210 ${cx + 114},420 ${cx - 114},420" fill="${STONE_DK}"/>
  <polygon points="${cx - 36},178 ${cx + 36},178 ${cx + 92},210 ${cx - 92},210" fill="${STONE_LT}"/>

  <text x="${cx}" y="58" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="14" fill="${BRASS}" letter-spacing="3">ERECTED IN PUBLIC · 2026</text>
  <text x="${cx}" y="106" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="48" fill="${INK}" letter-spacing="2">A MONUMENT</text>
  <text x="${cx}" y="144" text-anchor="middle" font-family="DejaVu Serif" font-size="23" fill="${MUTED}" font-style="italic">to globally accessible intelligence, cheap enough to give away for free</text>

  <text x="${cx}" y="${H - 58}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="27" fill="${BRASS}">read closely — the wind is picking up</text>
  <text x="${cx}" y="${H - 26}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="21" fill="${INK}">monument.bisks.net</text>
</svg>`;

const fontRegular = fileURLToPath(new URL("./fonts/DejaVuSerif.ttf", import.meta.url));
const fontBold = fileURLToPath(new URL("./fonts/DejaVuSerif-Bold.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontRegular, fontBold], loadSystemFonts: false, defaultFontFamily: "DejaVu Serif" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
