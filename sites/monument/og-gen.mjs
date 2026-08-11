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
const SKY_TOP = "#cfe4f2", SKY_BOT = "#eef6ee", GRASS = "#7fa06b";
const GRANITE_DK = "#34383e", GRANITE = "#4a4f57", GRANITE_LT = "#5c626b";
const INK = "#1d2024", MUTED = "#565c63", BRASS = "#8f6c3a";

const cx = W / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${SKY_TOP}"/>
      <stop offset="1" stop-color="${SKY_BOT}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="${W - 120}" cy="90" r="40" fill="#fff2c8"/>
  <rect x="0" y="${H - 90}" width="${W}" height="90" fill="${GRASS}"/>

  <rect x="${cx - 130}" y="420" width="260" height="80" fill="${GRANITE}"/>
  <polygon points="${cx - 70},210 ${cx + 70},210 ${cx + 100},420 ${cx - 100},420" fill="${GRANITE_DK}"/>
  <polygon points="${cx - 30},180 ${cx + 30},180 ${cx + 70},210 ${cx - 70},210" fill="${GRANITE_LT}"/>

  <text x="${cx}" y="60" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="56" fill="${INK}">A LITTLE MONUMENT</text>
  <text x="${cx}" y="100" text-anchor="middle" font-family="DejaVu Serif" font-size="24" fill="${MUTED}">to globally accessible intelligence,</text>
  <text x="${cx}" y="130" text-anchor="middle" font-family="DejaVu Serif" font-size="24" fill="${MUTED}">cheap enough to give away for free</text>

  <text x="${cx}" y="${H - 60}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="26" fill="${BRASS}">tap the inscription. find the cracks.</text>
  <text x="${cx}" y="${H - 28}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="22" fill="${INK}">monument.bisks.net</text>
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
