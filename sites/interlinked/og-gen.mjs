// Generates public/og.png — the static Open Graph preview card for
// interlinked.bisks.net. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/cartelclock/og-gen.mjs and sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#050506", PANEL = "#0b0c0e", LINE = "#23262b", FG = "#e7e6e2", DIM = "#7c8189", ACCENT = "#d8b25a";

function phraseRow(y, text) {
  return `
  <g>
    <rect x="80" y="${y}" width="${W - 160}" height="46" fill="${PANEL}" stroke="${LINE}" stroke-width="1.5"/>
    <text x="102" y="${y + 30}" font-family="JetBrains Mono" font-size="17" fill="${FG}">${text}</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="80" y="92" font-family="JetBrains Mono" font-size="16" fill="${DIM}" letter-spacing="3">POST-SIMCLUSTER BASELINE TEST</text>
  <text x="80" y="160" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${FG}">interlinked</text>
  <line x1="80" y1="182" x2="${W - 80}" y2="182" stroke="${LINE}" stroke-width="2"/>

  ${phraseRow(214, "EXAMINER:  bisk, interlinked within bloosk,")}
  ${phraseRow(268, "EXAMINER:  interlinked within a borges story,")}
  ${phraseRow(322, "EXAMINER:  interlinked within a gwern cat post,")}
  ${phraseRow(376, "EXAMINER:  interlinked within the wall cukes —")}

  <circle cx="112" cy="450" r="5" fill="${ACCENT}"/>
  <text x="130" y="456" font-family="JetBrains Mono" font-size="16" fill="${ACCENT}">gm, fellow top chickens. interlinked, interlinked, interlinked.</text>

  <text x="80" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">interlinked.bisks.net</text>
  <text x="80" y="592" font-family="JetBrains Mono" font-size="15" fill="${DIM}">a simcluster baseline test — a fresh weave every run</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
