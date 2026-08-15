// Generates public/og.png — the Open Graph preview card for partytime.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Pattern copied from sites/keepsake/og-gen.mjs.
//
//   ln -s ../keepsake/node_modules node_modules   # one-time, not a real dep
//   node og-gen.mjs                               # writes ./public/og.png
//   rm node_modules                                # clean up the symlink after

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const RED_DK = "#3a0505", RED = "#7a0e0e";
const GOLD = "#ffcb52", GOLD_LT = "#ffe9a8", GOLD_DK = "#c98f1f";
const INK = "#fff6de";

const cx = W / 2;

function lantern(x, y, scale) {
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <ellipse cx="0" cy="0" rx="30" ry="38" fill="${GOLD}" opacity="0.9"/>
    <rect x="-6" y="-46" width="12" height="12" fill="${GOLD_DK}"/>
    <rect x="-4" y="36" width="8" height="14" fill="${GOLD_DK}"/>
    <line x1="0" y1="50" x2="0" y2="66" stroke="${GOLD_DK}" stroke-width="2"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.5" cy="0.15" r="0.75">
      <stop offset="0" stop-color="#a4181c"/>
      <stop offset="0.6" stop-color="${RED}"/>
      <stop offset="1" stop-color="${RED_DK}"/>
    </radialGradient>
    <linearGradient id="goldtext" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GOLD_LT}"/>
      <stop offset="0.55" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${GOLD_DK}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  ${lantern(140, 130, 1.3)}
  ${lantern(1060, 150, 1.1)}
  ${lantern(90, 460, 0.9)}
  ${lantern(1110, 470, 1.15)}

  <text x="${cx}" y="150" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="17" fill="${GOLD}" letter-spacing="6">BISKS.NET PRESENTS</text>
  <text x="${cx}" y="250" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="76" fill="url(#goldtext)">PARTY TIME CLOCK</text>

  <rect x="${cx - 260}" y="300" width="520" height="150" rx="24" fill="#921419" stroke="${GOLD}" stroke-width="4"/>
  <text x="${cx}" y="405" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="92" fill="${GOLD_LT}">22:00–08:00</text>

  <text x="${cx}" y="500" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="30" fill="${INK}">UTC+8 · China Standard Time · every single night</text>
  <text x="${cx}" y="${H - 46}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="26" fill="${GOLD}">partytime.bisks.net</text>
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
