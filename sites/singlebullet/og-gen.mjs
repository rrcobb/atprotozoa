// Generates public/og.png — the Open Graph preview card for singlebullet.
// Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0e0d0a", INK = "#d8cfb8", DIM = "#948a72", AMBER = "#c98a2c", RED = "#a33b2e";

// window at top-left, a dashed line of sight down to a car mark — echoes the
// Exhibit A diagram on the live page, at OG-card scale.
const winX = 120, winY = 150, carX = 640, carY = 430;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#3a3426" stroke-width="2"/>

  <rect x="40" y="40" width="230" height="34" fill="none" stroke="${RED}" stroke-width="2"/>
  <text x="55" y="63" font-family="JetBrains Mono" font-weight="700" font-size="15" letter-spacing="2" fill="${RED}">DECLASSIFIED</text>

  <text x="40" y="150" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${INK}">single bullet</text>
  <text x="40" y="192" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a Dealey Plaza trajectory lab</text>

  <text x="40" y="245" font-family="JetBrains Mono" font-size="17" fill="${DIM}">schedule three shots against the rifle's real</text>
  <text x="40" y="272" font-family="JetBrains Mono" font-size="17" fill="${DIM}">bolt-cycle time, then test the single-bullet</text>
  <text x="40" y="299" font-family="JetBrains Mono" font-size="17" fill="${DIM}">trajectory geometry yourself, in the browser.</text>

  <rect x="${winX - 22}" y="${winY - 22}" width="44" height="44" fill="#1d1a14" stroke="${AMBER}" stroke-width="2"/>
  <text x="${winX}" y="${winY - 34}" font-family="JetBrains Mono" font-size="13" fill="${AMBER}" text-anchor="middle">6th floor window</text>
  <line x1="${winX}" y1="${winY}" x2="${carX}" y2="${carY}" stroke="${RED}" stroke-width="2" stroke-dasharray="8,7"/>
  <line x1="${winX}" y1="${carY}" x2="${carX}" y2="${carY}" stroke="#3a3426" stroke-width="1.5"/>
  <circle cx="${carX}" cy="${carY}" r="10" fill="${AMBER}"/>

  <text x="40" y="580" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${AMBER}">singlebullet.bisks.net</text>
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
