// Generates public/og.png — the Open Graph preview card for chesslingo.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;

const BG = "#faf7f0",
  BG2 = "#e6f2ea",
  INK = "#241b12",
  DIM = "#7a6f5d",
  ACCENT = "#1f7a4d",
  BORDER = "#e5dcc7",
  GOLD = "#c9a227",
  SQ_LIGHT = "#f4ecd8",
  SQ_DARK = "#a9c9b4";

// a small 4x4 corner of a chessboard with a knight fork illustrated
function boardSquares(x0, y0, cell) {
  let s = "";
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const light = (r + c) % 2 === 0;
      s += `<rect x="${x0 + c * cell}" y="${y0 + r * cell}" width="${cell}" height="${cell}" fill="${light ? SQ_LIGHT : SQ_DARK}"/>`;
    }
  }
  return s;
}

const bx = 700,
  by = 230,
  cell = 62;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="80%" cy="-10%" r="65%">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG}"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${ACCENT}" stroke-width="5"/>

  <text x="70" y="130" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">chesslingo</text>
  <text x="70" y="172" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${DIM}">duolingo for chess</text>

  <g font-family="JetBrains Mono" font-weight="700" font-size="22">
    <text x="70" y="240" fill="${ACCENT}">📈 profitability and high demand,</text>
    <text x="70" y="270" fill="${DIM}">allegedly</text>
  </g>

  <rect x="70" y="320" width="${W - 140}" height="130" rx="14" fill="#ffffff" stroke="${BORDER}" stroke-width="2"/>
  <text x="100" y="358" font-family="JetBrains Mono" font-size="18" fill="${DIM}" letter-spacing="1">WHAT'S THE TACTIC?</text>
  <g font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${INK}">
    <text x="100" y="410">Fork · Pin · Skewer</text>
    <text x="100" y="436">Discovered Attack</text>
  </g>

  <g fill="none" stroke="${BORDER}" stroke-width="2">
    <rect x="${bx - 2}" y="${by - 2}" width="${cell * 4 + 4}" height="${cell * 4 + 4}" fill="${BORDER}"/>
  </g>
  ${boardSquares(bx, by, cell)}
  <text x="${bx + cell * 0.5}" y="${by + cell * 2.5 + 12}" text-anchor="middle" font-size="42" fill="${INK}">♞</text>
  <text x="${bx + cell * 3.5}" y="${by + cell * 0.5 + 12}" text-anchor="middle" font-size="42" fill="${INK}">♜</text>
  <text x="${bx + cell * 2.5}" y="${by + cell * 3.5 + 12}" text-anchor="middle" font-size="42" fill="${INK}">♚</text>

  <g font-family="JetBrains Mono" font-weight="700" font-size="22">
    <text x="70" y="500" fill="${ACCENT}">❤️ ❤️ ❤️</text>
    <text x="260" y="500" fill="${DIM}">3 hearts</text>
    <text x="450" y="500" fill="#ff9500">🔥 12</text>
    <text x="600" y="500" fill="${DIM}">day streak</text>
    <text x="760" y="500" fill="${GOLD}">✦ 480 elo</text>
  </g>

  <text x="70" y="565" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${ACCENT}">chesslingo.bisks.net</text>
</svg>`;

const fontPaths = [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))];

const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: fontPaths, loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
