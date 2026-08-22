// Generates public/og.png — the Open Graph preview card for fourforces.
//
// Hand-drawn SVG: a Life-like bumpy hillside skyline in the four force
// colors, Sisyphus and the boulder mid-slope, and Q/W/O/P badges. Rasterised
// with @resvg/resvg-js (no system fontconfig on this box, so the font is
// bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/sisyphus/og-gen.mjs and sites/qwopsheet/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const SKY_TOP = "#0c1030", SKY_BOT = "#1c1440", FAR = "#2a2560";
const INK = "#eae6ff", DIM = "#93a3c2", ACCENT = "#7a5cff";
const Q = "#ff6b6b", WCOL = "#ffd166", O = "#6bffb8", P = "#7a5cff";
const FIGURE = "#eae6ff", BOULDER = "#8d86a8", BOULDER2 = "#c9c2ff";

const GROUND_Y = 470;

// a bumpy Life-like skyline built from a fixed column-population pattern,
// each column tinted toward whichever of the four force colors "owns" it
const POPS = [3, 5, 8, 4, 2, 6, 9, 11, 7, 3, 1, 4, 8, 12, 6, 2, 5, 9, 13, 10, 6, 3, 1, 2, 5, 8, 4, 7, 11, 6];
const COLORS = [Q, Q, WCOL, WCOL, O, O, P, P, Q, WCOL];
let terrain = "";
const colW = W / POPS.length;
POPS.forEach((pop, i) => {
  const x = i * colW;
  const h = pop * 9;
  const color = COLORS[i % COLORS.length];
  terrain += `<rect x="${x}" y="${GROUND_Y - h}" width="${colW + 1}" height="${H - GROUND_Y + h}" fill="${color}" opacity="${0.35 + pop / 26}"/>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${SKY_TOP}"/>
      <stop offset="1" stop-color="${SKY_BOT}"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#050410" stop-opacity="0.55"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <polygon points="-40,${GROUND_Y} 170,${GROUND_Y - 150} 380,${GROUND_Y}" fill="${FAR}" opacity="0.5"/>
  <polygon points="700,${GROUND_Y} 960,${GROUND_Y - 140} 1240,${GROUND_Y}" fill="${FAR}" opacity="0.5"/>

  ${terrain}
  <rect x="0" y="${GROUND_Y - 60}" width="${W}" height="${H - GROUND_Y + 60}" fill="url(#fade)"/>

  <!-- Sisyphus pushing the boulder, mid-slope -->
  <g transform="translate(500,${GROUND_Y - 30})">
    <circle cx="70" cy="-42" r="34" fill="${BOULDER}"/>
    <circle cx="58" cy="-52" r="8" fill="none" stroke="${BOULDER2}" stroke-width="3"/>
    <circle cx="82" cy="-32" r="6" fill="none" stroke="${BOULDER2}" stroke-width="3"/>
    <path d="M -6,-38 L -18,0 M -6,-38 L 8,0" stroke="${FIGURE}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M -6,-38 L 28,-62" stroke="${FIGURE}" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M 18,-56 L 42,-56" stroke="${FIGURE}" stroke-width="6" fill="none" stroke-linecap="round"/>
    <circle cx="32" cy="-70" r="10" fill="${FIGURE}"/>
  </g>

  <!-- QWOP badges -->
  <g font-family="JetBrains Mono" font-weight="800" font-size="24">
    <rect x="74" y="470" width="46" height="40" rx="8" fill="${Q}"/>
    <text x="97" y="497" text-anchor="middle" fill="#1a0808">Q</text>
    <rect x="128" y="470" width="46" height="40" rx="8" fill="${WCOL}"/>
    <text x="151" y="497" text-anchor="middle" fill="#241a00">W</text>
    <rect x="182" y="470" width="46" height="40" rx="8" fill="${O}"/>
    <text x="205" y="497" text-anchor="middle" fill="#001a10">O</text>
    <rect x="236" y="470" width="46" height="40" rx="8" fill="${P}"/>
    <text x="259" y="497" text-anchor="middle" fill="#eae6ff">P</text>
  </g>

  <!-- wordmark + tagline -->
  <text x="74" y="120" font-family="JetBrains Mono" font-weight="700"
    font-size="66" letter-spacing="1" fill="${INK}">four<tspan fill="${ACCENT}">forces</tspan></text>
  <text x="74" y="168" font-family="JetBrains Mono" font-size="22"
    fill="${DIM}">procgen QWOP <tspan fill="${ACCENT}">Sisyphus</tspan></text>
  <text x="74" y="202" font-family="JetBrains Mono" font-size="19"
    fill="${DIM}">Q/W/O/P dial the four fundamental forces. whichever wins</text>
  <text x="74" y="228" font-family="JetBrains Mono" font-size="19"
    fill="${DIM}">reshapes the hillside's cellular automaton. don't mash P.</text>

  <rect x="74" y="560" width="14" height="14" fill="${ACCENT}"/>
  <text x="98" y="572" font-family="JetBrains Mono" font-weight="700" font-size="21"
    fill="${ACCENT}">fourforces.bisks.net</text>
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
