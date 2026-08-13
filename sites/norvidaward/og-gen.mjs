// Generates public/og.png — the Open Graph preview card for norvidaward.
//
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). node_modules + fonts copied in
// from sites/canvass, which already vendors this. House style:
// self-contained, copy-don't-abstract.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const PARCH1 = "#f9f2df", PARCH2 = "#f0e6cc", GOLD = "#a9781f", INK = "#111111", MUTED = "#6b5a2f";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="parch" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PARCH1}"/>
      <stop offset="1" stop-color="${PARCH2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#parch)"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${GOLD}" stroke-width="6"/>
  <rect x="38" y="38" width="${W - 76}" height="${H - 76}" fill="none" stroke="${GOLD}" stroke-width="1.5"/>

  <text x="${W / 2}" y="92" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${MUTED}">NORVID STUDIES INSTITUTE OF CONFERRED HONORS</text>

  <text x="${W / 2}" y="150" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="${INK}">this certifies that</text>
  <text x="${W / 2}" y="208" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${GOLD}">NORVID STUDIES</text>
  <text x="${W / 2}" y="254" text-anchor="middle" font-family="JetBrains Mono" font-size="22" fill="${INK}">is hereby, irrevocably, awarded</text>

  <text x="${W / 2}" y="312" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="32" fill="${INK}">THE GRAND CROSS OF ACCURATE</text>
  <text x="${W / 2}" y="354" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="32" fill="${INK}">CHICKEN GENDERING, FIRST CLASS</text>

  <text x="${W / 2}" y="400" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="19" fill="${MUTED}">in recognition of the standing intent "i should give myself more awards"</text>
  <text x="${W / 2}" y="426" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="19" fill="${MUTED}">— fulfilled here, by someone else, so it counts</text>

  <circle cx="${W - 148}" cy="${H - 130}" r="74" fill="${GOLD}"/>
  <circle cx="${W - 148}" cy="${H - 130}" r="50" fill="${PARCH1}" stroke="${GOLD}" stroke-width="3"/>
  <text x="${W - 148}" y="${H - 116}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${GOLD}">N</text>

  <text x="76" y="${H - 100}" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${MUTED}">a new award every click</text>
  <text x="76" y="${H - 72}" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">norvidaward.bisks.net</text>
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
