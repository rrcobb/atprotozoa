// Generates public/og.png — the Open Graph preview card for DOOMOLINGO.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (native module, no system Chromium/fontconfig needed — fonts bundled in
// ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// This is the generic promo card for the bare link. Per-run share cards
// (with a real score) are drawn client-side in public/lib/game.js
// (buildShareCard), same split as sites/didscope.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;

const BG1 = "#0c0505",
  BG2 = "#3a0e0e",
  RED = "#ff3b1f",
  RED_DIM = "#a8280f",
  INK = "#f4e6de",
  DIM = "#c98f7d";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="75%">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG1}"/>
    </radialGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${RED_DIM}"/>
      <stop offset="1" stop-color="${RED}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="${RED}" stroke-width="5" opacity="0.8"/>

  <text x="${W / 2}" y="230" text-anchor="middle" font-family="Nosifer" font-size="112" fill="${RED}">DOOMOLINGO</text>

  <text x="${W / 2}" y="300" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="27" letter-spacing="2" fill="${DIM}">THE LANGUAGE LEARNING APP THAT'S NOT FOR BABIES</text>

  <g stroke="${RED}" stroke-width="4" fill="none" stroke-linejoin="round">
    <path d="M 100 430 L 118 358 L 140 396 L 165 350 L 190 396 L 212 358 L 230 430 Z"/>
    <circle cx="140" cy="392" r="7" fill="${RED}" stroke="none"/>
    <circle cx="190" cy="392" r="7" fill="${RED}" stroke="none"/>
  </g>
  <text x="230" y="400" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${INK}">TRANSLATE: "WOLF"</text>
  <text x="230" y="436" font-family="JetBrains Mono" font-size="20" fill="${DIM}">1  perro     2  lobo     3  gato     4  oso</text>

  <rect x="230" y="470" width="500" height="14" rx="4" fill="#1a0505" stroke="${RED_DIM}" stroke-width="1"/>
  <rect x="230" y="470" width="330" height="14" rx="4" fill="url(#bar)"/>

  <text x="${W / 2}" y="560" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${RED}">doomolingo.bisks.net</text>
</svg>`;

const fontPaths = [
  fileURLToPath(new URL("./fonts/Nosifer-Regular.ttf", import.meta.url)),
  fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url)),
];

const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: fontPaths, loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
