// Generates public/og.png — the Open Graph preview card for norvidrate.
// Hand-drawn SVG at the canonical OG size: a little converter panel showing
// USD converting to NORVID and a few real currencies. Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/xrate/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0d1117", PANEL = "#151b23", PANEL2 = "#1c2430", BORDER = "#2a3441", FG = "#e6edf3", DIM = "#8b96a5";
const ACCENT = "#56d2c2", ACCENT2 = "#ff8a5c";

const rows = [
  ["EUR", "86.09"],
  ["GBP", "73.96"],
  ["JPY", "15,418"],
];

const rowSvg = rows
  .map((r, i) => {
    const y = 300 + i * 62;
    return `<line x1="600" y1="${y + 30}" x2="1140" y2="${y + 30}" stroke="${BORDER}" stroke-width="1"/>
    <text x="620" y="${y + 14}" font-family="JetBrains Mono" font-size="20" fill="${DIM}">100 USD →</text>
    <text x="1120" y="${y + 14}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${FG}">${r[1]} <tspan fill="${ACCENT}">${r[0]}</tspan></text>`;
  })
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="55%">
      <stop offset="0" stop-color="#123a34"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="url(#title)">norvidrate</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="20" fill="${DIM}">currency converter,</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="20" fill="${DIM}">denominated in <tspan fill="${ACCENT2}">norvids</tspan></text>

  <text x="64" y="288" font-family="JetBrains Mono" font-size="16" fill="${DIM}">1 norvid = what xbill would bill to</text>
  <text x="64" y="314" font-family="JetBrains Mono" font-size="16" fill="${DIM}">download norvid-studies' own repo at</text>
  <text x="64" y="340" font-family="JetBrains Mono" font-size="16" fill="${DIM}">X's read-API rates. Recomputed daily.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${ACCENT}">norvidrate.bisks.net</text>

  <!-- right: sample conversion panel -->
  <rect x="560" y="40" width="600" height="550" rx="16" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <rect x="600" y="80" width="520" height="130" rx="12" fill="${PANEL2}" stroke="${BORDER}" stroke-width="1"/>
  <text x="622" y="130" font-family="JetBrains Mono" font-size="18" fill="${DIM}">100 USD =</text>
  <text x="622" y="180" font-family="JetBrains Mono" font-weight="800" font-size="42" fill="${ACCENT}">0.3428 <tspan fill="${ACCENT2}">NORVID</tspan></text>
  ${rowSvg}
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
