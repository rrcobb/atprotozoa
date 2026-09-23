// Generates public/og.png — the static Open Graph preview card for
// cartelclock.bisks.net. Hand-drawn SVG, rasterised with @resvg/resvg-js and
// skyclone's bundled JetBrains Mono font (no system Chromium/fontconfig
// needed). Same recipe as sites/wentviral/og-gen.mjs and sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const PAPER = "#eee8da", PAPER_DARK = "#e2dac6", INK = "#201d16", MUTED = "#5c5645", STAMP = "#8c2f22";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function row(y, no, year, title) {
  return `
  <g>
    <rect x="64" y="${y}" width="${W - 128}" height="52" fill="${PAPER_DARK}" stroke="#c9bfa3" stroke-width="1.5"/>
    <text x="86" y="${y + 33}" font-family="JetBrains Mono" font-weight="800" font-size="16" fill="${STAMP}">${no}</text>
    <text x="150" y="${y + 33}" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">${year}</text>
    <text x="240" y="${y + 33}" font-family="JetBrains Mono" font-weight="600" font-size="17" fill="${INK}">${esc(title)}</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>

  <g transform="translate(${W - 210}, 36) rotate(6)">
    <rect x="0" y="0" width="170" height="34" fill="none" stroke="${STAMP}" stroke-width="3"/>
    <text x="85" y="23" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="15" fill="${STAMP}" letter-spacing="1">DECLASSIFIED</text>
  </g>

  <text x="64" y="76" font-family="JetBrains Mono" font-size="16" fill="${MUTED}" letter-spacing="2">CASE FILE COLLECTION · LONG 20TH CENTURY</text>
  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">cartelclock</text>
  <line x1="64" y1="150" x2="${W - 64}" y2="150" stroke="${INK}" stroke-width="3"/>

  ${row(176, "01", "1917", "aircraft patent pool")}
  ${row(238, "04", "1919", "RCA / radio monopoly")}
  ${row(300, "05", "1924", "the Phoebus light bulb cartel")}
  ${row(362, "06", "1929", "IG Farben / Standard Oil rubber")}
  ${row(424, "08", "1951", "the secrecy order that never expired")}

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${STAMP}">cartelclock.bisks.net</text>
  <text x="64" y="590" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">8 documented deals that rerouted 20th-century technology</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
