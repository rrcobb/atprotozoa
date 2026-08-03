// Generates public/og.png — the static Open Graph preview card for
// rural-solar.bisks.net. Hand-drawn SVG, rasterised with @resvg/resvg-js and
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
const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4";
const ACCENT = "#1a7d3a", BAD = "#b3401e";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function row(y, claim, reality) {
  return `
  <g>
    <rect x="64" y="${y}" width="${W - 128}" height="94" fill="none" stroke="${FAINT}" stroke-width="2"/>
    <text x="88" y="${y + 34}" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${BAD}">CLAIM</text>
    <text x="180" y="${y + 34}" font-family="JetBrains Mono" font-size="19" fill="${INK}">${esc(claim)}</text>
    <text x="88" y="${y + 68}" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${ACCENT}">REALITY</text>
    <text x="212" y="${y + 68}" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">${esc(reality)}</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="100" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">rural solar is ok</text>
  <text x="64" y="140" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">a myth-by-myth answer to the "panels will kill your cows" panic</text>

  <line x1="64" y1="172" x2="${W - 64}" y2="172" stroke="${INK}" stroke-width="2"/>

  ${row(200, "panels will kill livestock", "cows nap in whatever shade they can find")}
  ${row(304, "panels ruin crops and soil", "shade-grown berries test out sweeter, not worse")}
  ${row(408, "panels leach metals + PFAS", "sealed glass and silicon — nothing to leach")}

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">rural-solar.bisks.net</text>
  <text x="64" y="588" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">what the actual agrivoltaics research says</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
