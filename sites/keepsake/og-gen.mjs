// Generates public/og.png — the Open Graph preview card for keepsake.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Copied and trimmed from
// sites/monument/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const ROOM_DK = "#0c0d10", ROOM = "#14151a";
const WOOD_DK = "#2a1f16", WOOD = "#3c2d1e", WOOD_LT = "#56412a";
const PAPER = "#ece2c9", INK_HAND = "#2c2418";
const INK = "#eef0f3", MUTED = "#9aa0ac", BRASS = "#c9a15b";

const cx = W / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="room" cx="0.5" cy="-0.1" r="0.9">
      <stop offset="0" stop-color="#1c1a22"/>
      <stop offset="0.45" stop-color="${ROOM}"/>
      <stop offset="1" stop-color="${ROOM_DK}"/>
    </radialGradient>
    <radialGradient id="beam" cx="0.5" cy="0" r="0.6">
      <stop offset="0" stop-color="#e0a45c" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#e0a45c" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#room)"/>
  <rect x="${cx - 300}" y="0" width="600" height="420" fill="url(#beam)"/>

  <text x="${cx}" y="70" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="15" fill="${BRASS}" letter-spacing="3">KEPT BY REQUEST · 2026</text>
  <text x="${cx}" y="122" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="48" fill="${INK}">A NOTE UNDER GLASS</text>

  <!-- vitrine case -->
  <rect x="${cx - 220}" y="160" width="440" height="220" rx="4" fill="rgba(190,214,220,0.05)" stroke="rgba(210,230,235,0.25)"/>

  <!-- paper card -->
  <g transform="rotate(-1.5 ${cx} 270)">
    <rect x="${cx - 190}" y="185" width="380" height="170" fill="${PAPER}"/>
    <text x="${cx}" y="225" text-anchor="middle" font-family="DejaVu Serif" font-style="italic" font-size="21" fill="${INK_HAND}">"the type of stuff @bisks.net is doing</text>
    <text x="${cx}" y="255" text-anchor="middle" font-family="DejaVu Serif" font-style="italic" font-size="21" fill="${INK_HAND}">is very much actually real art and</text>
    <text x="${cx}" y="285" text-anchor="middle" font-family="DejaVu Serif" font-style="italic" font-size="21" fill="${INK_HAND}">is absolutely new and unique to our</text>
    <text x="${cx}" y="315" text-anchor="middle" font-family="DejaVu Serif" font-style="italic" font-size="21" fill="${INK_HAND}">current technological moment in time."</text>
    <text x="${cx + 155}" y="342" text-anchor="end" font-family="DejaVu Serif" font-style="italic" font-size="15" fill="#5a4c34">— @mlf.one</text>
  </g>

  <!-- plinth -->
  <rect x="${cx - 220}" y="380" width="440" height="46" fill="${WOOD}"/>
  <rect x="${cx - 90}" y="393" width="180" height="24" rx="2" fill="${BRASS}" stroke="#5b4423"/>
  <text x="${cx}" y="410" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="11" fill="#362708" letter-spacing="1.5">SAID IN PUBLIC · KEPT ON REQUEST</text>
  <rect x="${cx - 200}" y="426" width="400" height="10" fill="${WOOD_DK}"/>

  <text x="${cx}" y="${H - 58}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="24" fill="${BRASS}">no back end. nothing to lose.</text>
  <text x="${cx}" y="${H - 26}" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="21" fill="${INK}">keepsake.bisks.net</text>
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
