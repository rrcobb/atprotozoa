// Generates public/og.png — the static Open Graph preview card for the bare
// blipverts link. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/speedhose/og-gen.mjs, sites/bangerwatch/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#07080d", FG = "#eef1ff", DIM = "#8b93b0";
const CYAN = "#4df3ff", PINK = "#ff4dd8", YELLOW = "#ffe14d", CARD = "#10121b", BORDER = "#232840";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="14%" cy="4%" r="55%">
      <stop offset="0" stop-color="#0e2a33"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${CYAN}"/>
      <stop offset="0.6" stop-color="${PINK}"/>
      <stop offset="1" stop-color="${YELLOW}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="118" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">blipverts</text>
  <text x="66" y="160" font-family="JetBrains Mono" font-size="21" fill="${DIM}">your timeline, one WHOLE POST at a time, flashed instantly.</text>

  <g>
    <rect x="64" y="216" width="1072" height="220" rx="18" fill="${CARD}" stroke="${BORDER}"/>
    <text x="600" y="300" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${FG}">does anyone remember blipverts?</text>
    <text x="600" y="358" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${PINK}">now you will.</text>
  </g>

  <text x="64" y="480" font-family="JetBrains Mono" font-size="17" fill="${DIM}">enter a handle · watches the firehose for who they follow</text>
  <text x="64" y="508" font-family="JetBrains Mono" font-size="17" fill="${DIM}">whole-post rolling buffer · loops forever when it runs dry</text>

  <text x="64" y="588" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${CYAN}">blipverts.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
