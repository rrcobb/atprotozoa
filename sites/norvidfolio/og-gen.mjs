// Generates public/og.png — the Open Graph preview card for norvidfolio.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/meadowfolio/og-gen.mjs, sites/beefcheck/og-gen.mjs, and
// sites/pizza-net/og-gen.mjs.
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

const BG = "#1c2415", CARD = "#232c19", BORDER = "#3a4726";
const FG = "#f5f2e4", DIM = "#a9b394";
const GREEN = "#7fb356", GOLD = "#d9a441";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="0%" r="60%">
      <stop offset="0" stop-color="#2f4620"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="100%" r="60%">
      <stop offset="0" stop-color="#3a2f12"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GREEN}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <rect x="70" y="70" width="${W - 140}" height="${H - 140}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>

  <text x="110" y="230" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">norvidfolio</text>
  <text x="110" y="278" font-family="JetBrains Mono" font-size="24" fill="${DIM}">a portfolio for @norvid-studies.bsky.social</text>

  <text x="110" y="380" font-family="JetBrains Mono" font-size="21" fill="${FG}">— a live image gallery pulled from the post history</text>
  <text x="110" y="420" font-family="JetBrains Mono" font-size="21" fill="${FG}">— favorite posts, curated by buildthis from the last 500</text>

  <text x="110" y="530" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${GOLD}">norvidfolio.bisks.net</text>
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
