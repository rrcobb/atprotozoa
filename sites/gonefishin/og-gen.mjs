// Generates public/og.png — the Open Graph preview card for gonefishin.
// Hand-drawn SVG matching the live page's dark-water look, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig needed —
// the font is bundled in ./fonts and loaded explicitly). Copied and trimmed
// from didscope/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const W = 1200, H = 630;

const BG1 = "#0d3247", BG2 = "#061620", FG = "#eaf6fb", DIM = "#7fa3b5";
const WATER = "#3fb6d3", GOLD = "#f2b84b", CARD = "#0b2233", BORDER = "#1c4258";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <linearGradient id="waterband" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${WATER}" stop-opacity="0.25"/>
      <stop offset="1" stop-color="${WATER}" stop-opacity="0.05"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect x="0" y="430" width="${W}" height="200" fill="url(#waterband)"/>
  <path d="M0 460 Q 150 430 300 460 T 600 460 T 900 460 T 1200 460 V 630 H 0 Z" fill="${WATER}" opacity="0.10"/>
  <path d="M0 500 Q 150 475 300 500 T 600 500 T 900 500 T 1200 500 V 630 H 0 Z" fill="${WATER}" opacity="0.14"/>

  <path d="M 900 40 Q 1000 20 1010 90 L 1010 170" stroke="${DIM}" stroke-width="3" fill="none" opacity="0.7"/>
  <path d="M 1010 170 q -18 14 -8 32 q 10 16 -10 26" stroke="${GOLD}" stroke-width="4" fill="none" stroke-linecap="round"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="700" font-size="72" fill="${FG}">gone<tspan fill="${GOLD}">fishin</tspan></text>
  <text x="66" y="180" font-family="JetBrains Mono" font-size="26" fill="${DIM}">cast a line into your own follows and moots</text>

  <rect x="64" y="230" width="1072" height="150" rx="16" fill="${CARD}" stroke="${BORDER}"/>
  <text x="96" y="280" font-family="JetBrains Mono" font-size="24" fill="${FG}">most casts: a <tspan fill="${FG}" font-weight="700">small fish</tspan> — a real post below their own median</text>
  <text x="96" y="325" font-family="JetBrains Mono" font-size="24" fill="${FG}">sometimes: a <tspan fill="${GOLD}" font-weight="700">whopper</tspan> — guess which post got more traction to land it</text>

  <text x="64" y="590" font-family="JetBrains Mono" font-size="22" fill="${DIM}">gonefishin.bisks.net</text>
</svg>`;

const fontPath = path.join(__dirname, "fonts/JetBrainsMono.ttf");

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: {
    fontFiles: [fontPath],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
  background: BG2,
});
const png = resvg.render().asPng();
writeFileSync(path.join(__dirname, "public/og.png"), png);
console.log("wrote public/og.png");
