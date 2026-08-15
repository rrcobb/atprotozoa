// Generates public/og.png — the static Open Graph preview card for the bare
// speedhose link. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/bangerwatch/og-gen.mjs, sites/skyclone/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#07080d", BG2 = "#161927", FG = "#eef1ff", DIM = "#8b93b0";
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

  <text x="64" y="118" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">speedhose</text>
  <text x="66" y="160" font-family="JetBrains Mono" font-size="21" fill="${DIM}">your timeline, one word at a time, at 500 wpm. forever.</text>

  <g>
    <rect x="64" y="216" width="1072" height="220" rx="18" fill="${CARD}" stroke="${BORDER}"/>
    <line x1="600" y1="248" x2="600" y2="264" stroke="${BORDER}" stroke-width="2"/>
    <line x1="600" y1="388" x2="600" y2="404" stroke="${BORDER}" stroke-width="2"/>
    <text x="480" y="345" text-anchor="end" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${FG}">go bot</text>
    <text x="480" y="345" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${PINK}"> </text>
    <text x="600" y="345" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${PINK}">g</text>
    <text x="620" y="345" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${FG}">o</text>
  </g>

  <text x="64" y="480" font-family="JetBrains Mono" font-size="17" fill="${DIM}">enter a handle · watches the firehose for who they follow</text>
  <text x="64" y="508" font-family="JetBrains Mono" font-size="17" fill="${DIM}">2000-word rolling buffer · loops forever when it runs dry</text>

  <text x="64" y="588" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${CYAN}">speedhose.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
