// Generates public/og.png — the Open Graph preview card for macpaint.
//
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). node_modules + fonts copied in
// from sites/brewpaint, which already vendors this. House style:
// self-contained, copy-don't-abstract.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#bfbfbf", WIN = "#ffffff", INK = "#000000", DIM = "#333333";

// same 8x8 Bayer matrix as app.js, rendered as a literal <rect> grid so the
// card shows the real dither ramp instead of describing it
const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];
function patBit(p, x, y) {
  if (p <= 0) return 0;
  if (p >= 16) return 1;
  return BAYER8[y & 7][x & 7] < p * 4 ? 1 : 0;
}

const stripX = 700, stripY = 440, cell = 12;
let ramp = "";
for (let p = 0; p < 17; p++) {
  const px = stripX + p * cell;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (patBit(p, x, y)) {
        ramp += `<rect x="${px + x * 1.5}" y="${stripY + y * 1.5}" width="1.5" height="1.5" fill="#000"/>`;
      }
    }
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">macpaint</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="20" fill="${DIM}">a 1-bit MacPaint tribute, human or LLM</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="18" fill="${DIM}">Pencil, bucket, spray can, dither patterns --</text>
  <text x="64" y="298" font-family="JetBrains Mono" font-size="18" fill="${DIM}">plus a tiny text drawing language, so an LLM</text>
  <text x="64" y="326" font-family="JetBrains Mono" font-size="18" fill="${DIM}">can paint by writing a script, not diffusing pixels.</text>
  <text x="64" y="366" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${INK}">No diffusion model. Just dithering.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${INK}">macpaint.bisks.net</text>

  <rect x="640" y="120" width="496" height="390" rx="4" fill="${WIN}" stroke="${INK}" stroke-width="3"/>
  <rect x="640" y="120" width="496" height="26" fill="${INK}"/>
  <rect x="838" y="120" width="100" height="26" fill="${WIN}"/>
  <text x="888" y="139" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="${INK}" text-anchor="middle">macpaint</text>

  <g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 690 300 L 700 270 L 760 210 L 790 240 L 730 300 Z"/>
    <ellipse cx="890" cy="240" rx="24" ry="18"/>
    <rect x="840" y="330" width="60" height="46"/>
    <rect x="920" y="330" width="60" height="46" fill="${INK}"/>
  </g>

  <text x="${stripX}" y="${stripY - 14}" font-family="JetBrains Mono" font-size="12" fill="${DIM}">pattern 0 -&gt; 16</text>
  <rect x="${stripX - 2}" y="${stripY - 2}" width="${17 * cell + 4}" height="${8 * 1.5 + 4}" fill="none" stroke="${INK}" stroke-width="1"/>
  ${ramp}
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
