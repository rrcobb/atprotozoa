// Generates public/og.png — the Open Graph preview card, so a shared link
// unfurls a picture of the game instead of a bare URL. Hand-drawn SVG at
// the canonical OG size, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium/fontconfig needed — font is bundled in
// ./fonts and loaded explicitly). Copied from sites/simcluster-gacha/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Static, generic card — a wild encounter card, not tied to a real handle.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b1410", FG = "#eaf7ee", DIM = "#8fb39d";
const GREEN = "#6ee06e", BLUE = "#4ea1ff", GOLD = "#ffd24e", CARD = "#12211a", BORDER = "#6ee06e";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="60%">
      <stop offset="0" stop-color="#143824"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="85%" cy="90%" r="55%">
      <stop offset="0" stop-color="#1a2a3a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GREEN}"/>
      <stop offset="1" stop-color="${BLUE}"/>
    </linearGradient>
    <radialGradient id="cardglow" cx="50%" cy="35%" r="60%">
      <stop offset="0" stop-color="${GREEN}" stop-opacity="0.3"/>
      <stop offset="1" stop-color="${GREEN}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="180" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">mootmon</text>

  <text x="64" y="250" font-family="JetBrains Mono" font-size="20" fill="${DIM}">Catch your Bluesky</text>
  <text x="64" y="280" font-family="JetBrains Mono" font-size="20" fill="${DIM}"><tspan fill="${GREEN}">SimCluster</tspan>. Every moot is a creature —</text>
  <text x="64" y="310" font-family="JetBrains Mono" font-size="20" fill="${DIM}">type, rarity, and stats pulled from</text>
  <text x="64" y="340" font-family="JetBrains Mono" font-size="20" fill="${DIM}">their real profile numbers.</text>
  <text x="64" y="390" font-family="JetBrains Mono" font-size="20" fill="${DIM}">Catch a party. Battle other trainers.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">mootmon.bisks.net</text>

  <!-- right: sample encounter card -->
  <g>
    <rect x="750" y="70" width="380" height="490" rx="24" fill="${CARD}" stroke="${BORDER}" stroke-width="4"/>
    <rect x="750" y="70" width="380" height="490" rx="24" fill="url(#cardglow)"/>
    <text x="790" y="130" font-family="JetBrains Mono" font-size="34" fill="${GREEN}">🔥</text>
    <circle cx="940" cy="200" r="72" fill="#0f1c16" stroke="${GREEN}" stroke-width="3"/>
    <text x="940" y="222" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${GREEN}">?</text>
    <text x="940" y="305" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="${FG}">Emberkit</text>
    <text x="940" y="332" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${DIM}">@your.moot.here</text>
    <rect x="800" y="352" width="280" height="10" rx="5" fill="#1e3128"/>
    <rect x="800" y="352" width="200" height="10" rx="5" fill="${GREEN}"/>
    <text x="940" y="400" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${FG}">HP 62  ATK 41  DEF 33  SPD 28</text>
    <text x="940" y="440" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${GOLD}">RARE</text>
    <text x="940" y="530" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">throw a mootball to catch</text>
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
