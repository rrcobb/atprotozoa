// Generates public/og.png — the static Open Graph preview card for
// chickencorp. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/topchicken/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const PAPER = "#f4efe4", NAVY = "#0f1b2d", GOLD = "#c8971f", MUTED = "#6b6357", LINE = "#d8cfb8";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>
  <g opacity="0.5">
    ${Array.from({ length: 15 }, (_, i) => `<line x1="0" y1="${i * 44 + 20}" x2="${W}" y2="${i * 44 + 20}" stroke="${LINE}" stroke-width="1"/>`).join("")}
  </g>

  <text x="70" y="90" font-family="JetBrains Mono" font-weight="700" font-size="15" letter-spacing="4" fill="${GOLD}">CHICKEN CORP · CATEGORY RETROSPECTIVE</text>

  <text x="66" y="230" font-family="JetBrains Mono" font-weight="800" font-size="96" fill="${NAVY}">TOP CHICKEN</text>
  <rect x="70" y="252" width="620" height="6" fill="${GOLD}"/>

  <text x="70" y="320" font-family="JetBrains Mono" font-size="24" font-style="italic" fill="${MUTED}">a 10-slide briefing on a phrase with zero</text>
  <text x="70" y="352" font-family="JetBrains Mono" font-size="24" font-style="italic" fill="${MUTED}">pre-2026 attestations, and one live definition</text>

  <rect x="70" y="410" width="1060" height="1" fill="${LINE}"/>

  <text x="70" y="460" font-family="JetBrains Mono" font-size="19" fill="${NAVY}">01 Executive summary  ·  04 The coop before us  ·  05 Founding incident</text>
  <text x="70" y="490" font-family="JetBrains Mono" font-size="19" fill="${NAVY}">08 Competitive landscape  ·  09 Risk register  ·  10 Outlook</text>

  <text x="70" y="580" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">chickencorp.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
