// Generates public/og.png — the Open Graph preview card for kolpelor.
// Same recipe as sites/mootmon/og-gen.mjs: hand-drawn SVG, rasterised with
// @resvg/resvg-js (no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#120e1a", FG = "#f3ecf7", DIM = "#a696b8";
const GOLD = "#ffd24e", PURPLE = "#c084fc", BLUE = "#4ea1ff";
const CARD = "#1e1729", BORDER = "#382c47";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="60%">
      <stop offset="0" stop-color="#2a1a3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="85%" cy="90%" r="55%">
      <stop offset="0" stop-color="#1a2a3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${PURPLE}"/>
    </linearGradient>
    <radialGradient id="cardglow" cx="50%" cy="35%" r="60%">
      <stop offset="0" stop-color="${PURPLE}" stop-opacity="0.3"/>
      <stop offset="1" stop-color="${PURPLE}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="170" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">kolpelor</text>

  <text x="64" y="230" font-family="JetBrains Mono" font-size="20" fill="${DIM}">Bind your Bluesky</text>
  <text x="64" y="260" font-family="JetBrains Mono" font-size="20" fill="${DIM}"><tspan fill="${GOLD}">SimCluster</tspan>. Every moot is a θήρ —</text>
  <text x="64" y="290" font-family="JetBrains Mono" font-size="20" fill="${DIM}">type, species, and stats pulled from</text>
  <text x="64" y="320" font-family="JetBrains Mono" font-size="20" fill="${DIM}">their real profile numbers.</text>
  <text x="64" y="368" font-family="JetBrains Mono" font-size="20" fill="${DIM}">Storm the gymnasion. Challenge a rival.</text>
  <text x="64" y="398" font-family="JetBrains Mono" font-size="20" fill="${DIM}">Your roster syncs to your own PDS.</text>

  <text x="64" y="450" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">αριστευε — "be the best"</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">kolpelor.bisks.net</text>

  <!-- right: sample encounter card -->
  <g>
    <rect x="750" y="70" width="380" height="490" rx="24" fill="${CARD}" stroke="${BORDER}" stroke-width="4"/>
    <rect x="750" y="70" width="380" height="490" rx="24" fill="url(#cardglow)"/>
    <text x="790" y="130" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${PURPLE}">WOOD</text>
    <circle cx="940" cy="200" r="72" fill="#1a1424" stroke="${PURPLE}" stroke-width="3"/>
    <text x="940" y="222" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${PURPLE}">?</text>
    <text x="940" y="305" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="${FG}">Echidna</text>
    <text x="940" y="332" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${DIM}">@your.moot.here</text>
    <rect x="800" y="352" width="280" height="10" rx="5" fill="#2a2038"/>
    <rect x="800" y="352" width="200" height="10" rx="5" fill="${PURPLE}"/>
    <text x="940" y="400" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${FG}">HP 88  ATK 38  DEF 28  SPD 20</text>
    <text x="940" y="440" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${GOLD}">LEGENDARY</text>
    <text x="940" y="530" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">extend philia to bind</text>
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
