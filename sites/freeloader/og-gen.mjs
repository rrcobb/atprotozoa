// Generates public/og.png — the Open Graph preview card for freeloader.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Re-run by hand if the artwork changes.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#101316", PANEL = "#181c20", LINE = "#262b31";
const INK = "#eef1f4", DIM = "#8b96a3", ACCENT = "#5fc9a8", ALARM = "#ff6b57";

// simple clock face, top-right — hands pointed near "time's almost up"
function clock(cx, cy, r) {
  var handMin = `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r * 0.62}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
  var handHr = `<line x1="${cx}" y1="${cy}" x2="${cx + r * 0.42}" y2="${cy - r * 0.1}" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`;
  var ticks = "";
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI / 6) * i;
    const x1 = cx + Math.cos(a) * (r - 10), y1 = cy + Math.sin(a) * (r - 10);
    const x2 = cx + Math.cos(a) * (r - 2), y2 = cy + Math.sin(a) * (r - 2);
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${DIM}" stroke-width="3"/>`;
  }
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${PANEL}" stroke="${LINE}" stroke-width="4"/>
    ${ticks}
    ${handHr}${handMin}
    <circle cx="${cx}" cy="${cy}" r="6" fill="${ALARM}"/>
  </g>`;
}

// a little "key" glyph, feather-icon style, repeated as a row of API keys
const KEY_PATH = "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4";
function key(x, y, scale, color) {
  return `<g transform="translate(${x},${y}) scale(${scale})">
    <path d="${KEY_PATH}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

let keys = "";
for (let i = 0; i < 6; i++) {
  keys += key(60 + i * 46, 470, 1.6, i === 4 ? ALARM : DIM);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="6" fill="${ACCENT}"/>
  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="${ACCENT}"/>

  ${clock(1040, 130, 90)}

  <text x="60" y="140" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${INK}">freeloader</text>
  <text x="60" y="185" font-family="JetBrains Mono" font-size="22" fill="${ACCENT}">bisks.net/freeloader</text>

  <text x="60" y="250" font-family="JetBrains Mono" font-size="24" fill="${DIM}">a cheat-sheet of AI/inference API free tiers,</text>
  <text x="60" y="284" font-family="JetBrains Mono" font-size="24" fill="${DIM}">plus a tracker that reminds you to cancel —</text>
  <text x="60" y="318" font-family="JetBrains Mono" font-size="24" fill="${ALARM}">before a trial quietly starts billing you.</text>

  <rect x="0" y="420" width="${W}" height="110" fill="${PANEL}"/>
  <line x1="0" y1="420" x2="${W}" y2="420" stroke="${LINE}" stroke-width="2"/>
  ${keys}
  <text x="360" y="480" font-family="JetBrains Mono" font-size="20" fill="${DIM}">no account, no server list — it's just localStorage and a countdown</text>
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
