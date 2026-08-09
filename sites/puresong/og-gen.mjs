// Generates public/og.png — the static Open Graph preview card for
// puresong. Hand-drawn SVG, rasterised with @resvg/resvg-js and skyclone's
// bundled JetBrains Mono font (no system Chromium/fontconfig needed). Same
// recipe as sites/wentviral/og-gen.mjs, sites/didscope/og-gen.mjs, and
// sites/fieldguide/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (borrows resvg + the font
//                      # from sites/skyclone — build-time only, not a
//                      # runtime dependency of this site)

import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));

const W = 1200, H = 630;
const BG = "#05130f", BG2 = "#08201a", INK = "#eafff4", MUTED = "#9cc9ba";
const PURE = "#7bffd6", S = "#45e0a8", A = "#a8e05a", B = "#ffd23f", C = "#ff9f4d", D = "#ff5d6c";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function row(x, y, w, color, letter, birds) {
  return `
  <g>
    <rect x="${x}" y="${y}" width="46" height="46" rx="10" fill="${color}"/>
    <text x="${x + 23}" y="${y + 31}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="#06231b">${esc(letter)}</text>
    <text x="${x + 60}" y="${y + 30}" font-family="JetBrains Mono" font-size="17" fill="${INK}">${esc(birds)}</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-5%" r="60%">
      <stop offset="0" stop-color="#103d31"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="5%" r="55%">
      <stop offset="0" stop-color="#0f3a44"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PURE}"/>
      <stop offset="1" stop-color="${A}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="104" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">puresong</text>
  <text x="64" y="144" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">25 West Coast US birds, ranked by how pure their song sounds</text>

  <line x1="64" y1="176" x2="${W - 64}" y2="176" stroke="${INK}" stroke-opacity="0.15" stroke-width="2"/>

  ${row(64, 208, 500, PURE, "1", "Hermit Thrush, Swainson's Thrush, Pacific Wren")}
  ${row(64, 270, 500, S, "S", "Western Meadowlark, House Finch, Purple Finch")}
  ${row(64, 332, 500, A, "A", "Song Sparrow, American Robin, Wrentit")}
  ${row(624, 208, 500, B, "B", "Red-winged Blackbird, Western Tanager")}
  ${row(624, 270, 500, C, "C", "Anna's Hummingbird, Northern Mockingbird")}
  ${row(624, 332, 500, D, "D", "Steller's Jay, American Crow")}

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${PURE}">puresong.bisks.net</text>
  <text x="64" y="588" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">pure whistled tone vs. broadband noise — drag the cards to make it yours</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
const out = fileURLToPath(new URL("./public/og.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
