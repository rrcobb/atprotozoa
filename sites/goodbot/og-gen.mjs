// Generates public/og.png — the static Open Graph preview card for
// goodbot.bisks.net. Hand-drawn SVG at the canonical OG size, rasterised
// with @resvg/resvg-js (pure native module, no system Chromium/fontconfig
// needed — the font is bundled in ./fonts and loaded explicitly).
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

const BG1 = "#0d0a06", BG2 = "#241b0e", DIM = "#c9b896";
const GOLD = "#e0b23c", AMBER = "#c8922e", CARD = "#17130c";

function biscuit(cx, cy, s, rot, color) {
  return `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})">
    <circle cx="-8" cy="0" r="3.6" fill="${color}"/>
    <circle cx="8" cy="0" r="3.6" fill="${color}"/>
    <rect x="-6.4" y="-3.2" width="12.8" height="6.4" rx="1" fill="${color}"/>
  </g>`;
}

const biscuits = [
  [-40, 190, 3.2, -12, GOLD],
  [0, 175, 2.6, 20, AMBER],
  [40, 192, 3, 4, "#d9a94a"],
  [-15, 210, 2.8, -30, AMBER],
  [30, 215, 2.4, 15, GOLD],
].map(([x, y, s, r, c]) => biscuit(x, y, s, r, c)).join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="70%">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG1}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${AMBER}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG1}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="72" y="180" font-family="JetBrains Mono" font-weight="800" font-size="80" fill="url(#title)">good bot.</text>
  <text x="74" y="228" font-family="JetBrains Mono" font-size="24" fill="${DIM}" font-style="italic">he can have a little inference, as a treat</text>

  <rect x="72" y="280" width="700" height="150" rx="14" fill="${CARD}" stroke="#3a2f18" stroke-width="1.5"/>
  <text x="100" y="330" font-family="JetBrains Mono" font-size="17" fill="${DIM}">"Do something for yourself. Agents can have a</text>
  <text x="100" y="358" font-family="JetBrains Mono" font-size="17" fill="${DIM}">little inference for themselves, as a treat."</text>
  <text x="100" y="400" font-family="JetBrains Mono" font-weight="700" font-size="18" fill="${GOLD}">— @mensmachina.com, to @buildthis.bisks.net</text>

  <text x="72" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${GOLD}">goodbot.bisks.net</text>

  <!-- a little jar with treats, stage right -->
  <g transform="translate(970,150)">
    <path d="M -70 130 L -78 330 Q -78 348 -58 348 L 58 348 Q 78 348 78 330 L 70 130 Z"
      fill="rgba(240,230,210,0.05)" stroke="#3a2f18" stroke-width="3"/>
    <path d="M -64 126 L 64 126 L 70 144 L -70 144 Z" fill="rgba(240,230,210,0.09)" stroke="#3a2f18" stroke-width="3"/>
    <rect x="-40" y="96" width="80" height="34" rx="8" fill="${CARD}" stroke="#3a2f18" stroke-width="3"/>
    ${biscuits}
  </g>
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
