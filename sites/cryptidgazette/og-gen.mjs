// Generates public/og.png — the Open Graph preview card for the Cryptid
// Gazette. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so DejaVu Serif is bundled in
// ./fonts and loaded explicitly). Copied and trimmed from
// sites/pikiwedia/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const PAPER = "#f3efe4", CARD = "#fbf9f2", INK = "#1c1a16", MUTED = "#5d5648", ACCENT = "#a3231f", BORDER = "#c9bfa4";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>

  <text x="${W / 2}" y="118" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="72" fill="${INK}">The Cryptid Gazette</text>
  <line x1="90" y1="150" x2="${W - 90}" y2="150" stroke="${INK}" stroke-width="4"/>
  <text x="${W / 2}" y="180" text-anchor="middle" font-family="DejaVu Serif" font-size="20" fill="${MUTED}" letter-spacing="3">ALL THE LEGENDS FIT TO PRINT</text>

  <rect x="90" y="220" width="${W - 180}" height="330" fill="${CARD}" stroke="${INK}" stroke-width="2.5"/>

  <!-- left: a moth-winged silhouette, standing in for Mothman -->
  <g transform="translate(330,300)" fill="${INK}" opacity="0.92">
    <path d="M 0 -60 C 8 -40 8 -10 0 20 C -8 -10 -8 -40 0 -60 Z"/>
    <path d="M -6 -30 C -60 -55 -100 -30 -110 20 C -70 10 -40 -5 -6 -10 Z"/>
    <path d="M 6 -30 C 60 -55 100 -30 110 20 C 70 10 40 -5 6 -10 Z"/>
    <path d="M -4 -10 C -50 5 -80 25 -85 55 C -55 45 -30 30 -4 15 Z"/>
    <path d="M 4 -10 C 50 5 80 25 85 55 C 55 45 30 30 4 15 Z"/>
    <circle cx="-7" cy="-52" r="4" fill="${ACCENT}"/>
    <circle cx="7" cy="-52" r="4" fill="${ACCENT}"/>
  </g>
  <text x="330" y="380" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="26" fill="${ACCENT}">MOTHMAN</text>

  <text x="${W / 2}" y="345" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="40" fill="${ACCENT}">VS</text>

  <!-- right: a hulking bigfoot silhouette -->
  <g transform="translate(870,300)" fill="${INK}" opacity="0.92">
    <ellipse cx="0" cy="-38" rx="30" ry="34"/>
    <path d="M -46 -10 C -60 20 -56 60 -34 70 L -20 30 C -30 15 -36 0 -46 -10 Z"/>
    <path d="M 46 -10 C 60 20 56 60 34 70 L 20 30 C 30 15 36 0 46 -10 Z"/>
    <path d="M -34 20 C -40 45 -38 70 -26 74 L -14 34 Z"/>
    <path d="M 34 20 C 40 45 38 70 26 74 L 14 34 Z"/>
    <path d="M -18 44 L -22 78 L -6 78 L -8 48 Z"/>
    <path d="M 18 44 L 22 78 L 6 78 L 8 48 Z"/>
  </g>
  <text x="870" y="380" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="26" fill="${ACCENT}">SASQUATCH</text>

  <text x="${W / 2}" y="450" text-anchor="middle" font-family="DejaVu Serif" font-size="24" fill="${INK}">two atproto handles enter as cryptids — real profile stats decide the headline</text>
  <text x="${W / 2}" y="490" text-anchor="middle" font-family="DejaVu Serif" font-size="20" fill="${MUTED}">sightings, believers, skepticism, and lore all pulled from a real public profile</text>

  <text x="${W / 2}" y="600" text-anchor="middle" font-family="DejaVu Serif" font-weight="700" font-size="26" fill="${ACCENT}">cryptidgazette.bisks.net</text>
</svg>`;

const fontRegular = fileURLToPath(new URL("./fonts/DejaVuSerif.ttf", import.meta.url));
const fontBold = fileURLToPath(new URL("./fonts/DejaVuSerif-Bold.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontRegular, fontBold], loadSystemFonts: false, defaultFontFamily: "DejaVu Serif" },
  background: PAPER,
});
const png = r.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
