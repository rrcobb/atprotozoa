// Generates public/og.png — the Open Graph preview card for touchthestove.
// Hand-drawn SVG at the canonical OG size: a glowing burner plus the two
// live stats a share would want to show off. Rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/ratcop/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#100a08", PANEL = "#1b100b", BORDER = "#3c2317", DIM = "#ad9483";
const ACCENT = "#ff6b35", ACCENT2 = "#ffd23f";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="78%" cy="45%" r="55%">
      <stop offset="0" stop-color="#3a1c10"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
    <radialGradient id="coil" cx="45%" cy="38%" r="60%">
      <stop offset="0" stop-color="#fff2d6"/>
      <stop offset="0.5" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="#3a1c10"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="url(#title)">touch the stove</text>
  <text x="64" y="210" font-family="JetBrains Mono" font-size="20" fill="${DIM}">every touch pays out. combos escalate.</text>
  <text x="64" y="240" font-family="JetBrains Mono" font-size="20" fill="${DIM}">secret bonus stoves appear at random.</text>

  <rect x="64" y="300" width="300" height="94" rx="12" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="88" y="336" font-family="JetBrains Mono" font-size="16" fill="${DIM}">HEAT</text>
  <text x="88" y="374" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${ACCENT2}">2,847</text>

  <rect x="384" y="300" width="220" height="94" rx="12" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="408" y="336" font-family="JetBrains Mono" font-size="16" fill="${DIM}">COMBO</text>
  <text x="408" y="374" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${ACCENT2}">×7</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${ACCENT}">touchthestove.bisks.net</text>

  <!-- right: the stove itself -->
  <circle cx="940" cy="330" r="190" fill="none" stroke="#241410" stroke-width="20"/>
  <circle cx="940" cy="330" r="180" fill="url(#coil)"/>
  <circle cx="940" cy="330" r="130" fill="none" stroke="#6b2412" stroke-width="8" opacity="0.6"/>
  <circle cx="940" cy="330" r="130" fill="none" stroke="#ffb066" stroke-width="8" stroke-dasharray="60 350" opacity="0.75"/>
  <text x="940" y="340" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="#fff3e6" text-anchor="middle">TOUCH IT</text>
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
