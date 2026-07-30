// Generates public/og.png — the Open Graph preview card for sisyphus, so a
// shared link auto-renders a picture of the game in Bluesky / other
// unfurlers. Hand-drawn SVG echoing the live page's marble-agora palette and
// the actual scene (Sisyphus mid-push, boulder, a chasm, a crow overhead),
// rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — this box has no fontconfig/system fonts either, so the font is
// bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (cousin of
// sites/didscope/og-gen.mjs and sites/sokobisks/og-gen.mjs). Re-run by hand
// if the artwork or palette changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

// marble-agora palette, lifted from public/game.js THEMES['marble-agora']
const SKY_TOP = "#bfe3ff", SKY_BOT = "#f4ecd2", FAR = "#9fb3c9", MID = "#7f97ad";
const SLOPE = "#d8c7a2", SLOPE_LINE = "#8a6f4d", BOULDER = "#6d6862", BOULDER2 = "#a39a8e";
const FIGURE = "#2c2a28", ACCENT = "#b8452e", CHASM = "#231c15", CROW = "#241f1a";
const INK = "#2c2a28", DIM = "#5a4d3f";

const GROUND_Y = 430;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${SKY_TOP}"/>
      <stop offset="1" stop-color="${SKY_BOT}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${GROUND_Y}" fill="url(#sky)"/>

  <!-- far mountains -->
  <polygon points="-40,${GROUND_Y} 170,${GROUND_Y - 150} 380,${GROUND_Y}" fill="${FAR}" opacity="0.55"/>
  <polygon points="260,${GROUND_Y} 520,${GROUND_Y - 190} 800,${GROUND_Y}" fill="${FAR}" opacity="0.55"/>
  <polygon points="700,${GROUND_Y} 960,${GROUND_Y - 140} 1240,${GROUND_Y}" fill="${FAR}" opacity="0.55"/>

  <!-- mid cliffs -->
  <polygon points="60,${GROUND_Y} 260,${GROUND_Y - 90} 460,${GROUND_Y}" fill="${MID}" opacity="0.6"/>
  <polygon points="600,${GROUND_Y} 820,${GROUND_Y - 110} 1040,${GROUND_Y}" fill="${MID}" opacity="0.6"/>

  <!-- slope band -->
  <rect x="0" y="${GROUND_Y}" width="${W}" height="${H - GROUND_Y}" fill="${SLOPE}"/>

  <!-- a chasm, off to the right -->
  <polygon points="960,${GROUND_Y} 990,${H} 1120,${H} 1150,${GROUND_Y}" fill="${CHASM}"/>

  <!-- surface line -->
  <line x1="0" y1="${GROUND_Y}" x2="960" y2="${GROUND_Y}" stroke="${SLOPE_LINE}" stroke-width="4"/>
  <line x1="1150" y1="${GROUND_Y}" x2="${W}" y2="${GROUND_Y}" stroke="${SLOPE_LINE}" stroke-width="4"/>

  <!-- crow overhead -->
  <g transform="translate(760,150)" fill="${CROW}">
    <polygon points="0,0 -22,-14 -6,2 6,2 22,-14"/>
    <circle cx="0" cy="-2" r="5"/>
  </g>

  <!-- Sisyphus pushing the boulder, mid-slope -->
  <g transform="translate(430,${GROUND_Y})">
    <!-- boulder -->
    <circle cx="70" cy="-42" r="38" fill="${BOULDER}"/>
    <circle cx="58" cy="-54" r="9" fill="none" stroke="${BOULDER2}" stroke-width="3"/>
    <circle cx="84" cy="-30" r="7" fill="none" stroke="${BOULDER2}" stroke-width="3"/>
    <!-- legs -->
    <path d="M -6,-38 L -18,0 M -6,-38 L 8,0" stroke="${FIGURE}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <!-- torso, leaning into the push -->
    <path d="M -6,-38 L 30,-64" stroke="${FIGURE}" stroke-width="11" fill="none" stroke-linecap="round"/>
    <!-- arm to the boulder -->
    <path d="M 20,-58 L 44,-58" stroke="${FIGURE}" stroke-width="6" fill="none" stroke-linecap="round"/>
    <!-- head -->
    <circle cx="34" cy="-72" r="11" fill="${FIGURE}"/>
  </g>

  <!-- wordmark + tagline -->
  <text x="74" y="118" font-family="JetBrains Mono" font-weight="700"
    font-size="66" letter-spacing="1" fill="${INK}">sisyphus</text>
  <text x="74" y="166" font-family="JetBrains Mono" font-size="22"
    fill="${DIM}">a side-scrolling <tspan fill="${ACCENT}">myth simulator</tspan></text>
  <text x="74" y="200" font-family="JetBrains Mono" font-size="19"
    fill="${DIM}">push the boulder up the mountain. get hit and it</text>
  <text x="74" y="226" font-family="JetBrains Mono" font-size="19"
    fill="${DIM}">rolls back down the slope. forever.</text>

  <rect x="74" y="560" width="14" height="14" fill="${ACCENT}"/>
  <text x="98" y="572" font-family="JetBrains Mono" font-weight="700" font-size="21"
    fill="${ACCENT}">bisks.net/games/sisyphus</text>
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
