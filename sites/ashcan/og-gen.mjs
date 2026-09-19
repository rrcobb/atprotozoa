// Generates public/og.png — the Open Graph preview card for ashcan.
// Same recipe as sites/burnbook/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0b0908", FG = "#f2ece2", DIM = "#a89686";
const EMBER = "#ff7a3d", EMBER2 = "#ffb347", DANGER = "#c0392b";
const CARD = "#1c1712", BORDER = "#3a2f24";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="-10%" r="65%">
      <stop offset="0" stop-color="#2a1608"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="flame" cx="50%" cy="38%" r="55%">
      <stop offset="0" stop-color="#ffdca0"/>
      <stop offset="0.4" stop-color="${EMBER}"/>
      <stop offset="1" stop-color="${DANGER}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${EMBER2}"/>
      <stop offset="1" stop-color="${EMBER}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="170" font-family="JetBrains Mono" font-weight="800" font-size="80" fill="url(#title)">ashcan</text>
  <text x="66" y="220" font-family="JetBrains Mono" font-size="24" fill="${DIM}">the delete button bluesky forgot.</text>

  <text x="66" y="300" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Press delete on a real post. It catches fire,</text>
  <text x="66" y="326" font-family="JetBrains Mono" font-size="17" fill="${DIM}">crumples, and tumbles into a burning can.</text>
  <text x="66" y="352" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Nothing on Bluesky is actually touched —</text>
  <text x="66" y="378" font-family="JetBrains Mono" font-size="17" fill="${DIM}">it's a private ceremony, just for you.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${EMBER}">ashcan.bisks.net</text>

  <g transform="translate(760,120)">
    <ellipse cx="150" cy="140" rx="110" ry="120" fill="url(#flame)"/>
    <path d="M60 180 L74 380 Q76 396 92 396 L208 396 Q224 396 226 380 L240 180 Z" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
    <path d="M60 180 L240 180 L236 200 L64 200 Z" fill="#3a3f46" stroke="${BORDER}" stroke-width="1.5"/>
    <rect x="118" y="140" width="64" height="34" rx="6" fill="#4a5058"/>
    <rect x="30" y="160" width="240" height="34" rx="8" fill="#3a3f46" stroke="${BORDER}" stroke-width="1.5"/>
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
