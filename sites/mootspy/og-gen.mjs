// Generates public/og.png — the Open Graph preview card for mootspy. A mock
// of the game itself: a grid of pfp-circles (drawn as flat tinted dots, no
// real avatars — this runs with no network) with a few picked out green/red,
// under the title. Rasterised with @resvg/resvg-js (pure native module, no
// system Chromium needed) — same approach as sites/couplequiz/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0c0d0b";
const INK = "#eae7d8", MUTED = "#8a8a78", FAINT = "#2a2c22";
const ACCENT = "#e0a400", GOOD = "#39d67a", BAD = "#e35b4a";

const TINTS = [FAINT, FAINT, FAINT, "#3a3d2e", FAINT, FAINT, "#3a3d2e", FAINT];

// pick a handful of grid cells to mark as "found" (green) or "false alarm" (red)
const GOOD_CELLS = new Set([2, 7, 13, 20, 26]);
const BAD_CELLS = new Set([9, 22]);
const MISSED_CELLS = new Set([4, 17]);

const cols = 8, rows = 4;
const gridW = 560, cellW = gridW / cols, r = 28;
const gridX = 600, gridY = 175;

// small vector badges (no glyphs — resvg has no fallback font, so any emoji
// or ✓/× text character in the bundled JetBrains Mono renders as a tofu box)
function checkBadge(cx, cy) {
  const bx = cx + r * 0.72, by = cy - r * 0.72;
  return `<circle cx="${bx}" cy="${by}" r="11" fill="${GOOD}"/>
    <path d="M ${bx - 5} ${by} L ${bx - 1.5} ${by + 4} L ${bx + 5.5} ${by - 5}" stroke="#06210f" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function xBadge(cx, cy) {
  const bx = cx + r * 0.72, by = cy - r * 0.72;
  return `<circle cx="${bx}" cy="${by}" r="11" fill="${BAD}"/>
    <path d="M ${bx - 4} ${by - 4} L ${bx + 4} ${by + 4} M ${bx + 4} ${by - 4} L ${bx - 4} ${by + 4}" stroke="#2a0805" stroke-width="2.4" stroke-linecap="round"/>`;
}

let dots = "";
let n = 0;
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    const cx = gridX + col * cellW + cellW / 2;
    const cy = gridY + row * cellW + cellW / 2;
    const idx = n++;
    let stroke = FAINT, fill = TINTS[idx % TINTS.length], sw = 2;
    let badge = "";
    if (GOOD_CELLS.has(idx)) { stroke = GOOD; sw = 4; badge = checkBadge(cx, cy); }
    else if (BAD_CELLS.has(idx)) { stroke = BAD; sw = 4; badge = xBadge(cx, cy); }
    else if (MISSED_CELLS.has(idx)) { stroke = ACCENT; sw = 3; }
    dots += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${MISSED_CELLS.has(idx) ? 'stroke-dasharray="6 5"' : ""}/>${badge}`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="55%">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="50%">
      <stop offset="0" stop-color="${GOOD}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="${GOOD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <circle cx="70" cy="88" r="17" fill="none" stroke="${ACCENT}" stroke-width="6"/>
  <line x1="82" y1="100" x2="96" y2="114" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round"/>
  <text x="112" y="100" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${ACCENT}">mootspy</text>
  <text x="60" y="176" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${INK}">spot the moots in a pfp grid</text>

  <text x="60" y="240" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">Its real mutuals are hiding in a grid</text>
  <text x="60" y="268" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">of pfps, mixed with a pile of decoys.</text>
  <text x="60" y="296" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">Click by face alone. No names shown</text>
  <text x="60" y="324" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">until you reveal.</text>

  <rect x="60" y="368" width="4" height="70" fill="${GOOD}"/>
  <text x="80" y="392" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${GOOD}">green = correct hit</text>
  <text x="80" y="418" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${BAD}">red = false alarm</text>

  <text x="60" y="574" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">mootspy.bisks.net</text>

  ${dots}
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r_ = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r_.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
