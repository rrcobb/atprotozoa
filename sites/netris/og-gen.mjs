// Generates public/og.png — the Open Graph preview card for netris.
//
// Hand-drawn SVG at the canonical OG size: a dark arena with two small
// battling stacks of tetrominoes facing off. Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig
// needed — the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/bigwalk/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG_TOP = "#141a3d", BG_BOTTOM = "#050714";
const INK = "#eef4ff", MUTED = "#93a3c2", AMBER = "#ffb648", ACCENT = "#4fd6a8", TAIL = "#ff5d6c";
const PIECE_COLORS = ["#4fd6f2", "#f2d94c", "#bb86fc", "#6fcf97", "#eb5757", "#5b8def", "#ff9b3d"];

// Two small stacks of blocks, bottom-right, facing off — one leaning amber
// (attacker), one leaning cool blue (defender), with a few "garbage" rows
// (flat grey) near the bottom of the right stack to sell the battle.
function stack(ox, oy, cols, heights, colorAt) {
  const bs = 26;
  let out = "";
  for (let c = 0; c < cols; c++) {
    const h = heights[c];
    for (let r = 0; r < h; r++) {
      const x = ox + c * bs;
      const y = oy - (r + 1) * bs;
      out += `<rect x="${x}" y="${y}" width="${bs - 2}" height="${bs - 2}" rx="3" fill="${colorAt(c, r)}"/>`;
    }
  }
  return out;
}

const leftStack = stack(700, 560, 5, [3, 5, 2, 6, 4], (c, r) => PIECE_COLORS[(c * 3 + r) % PIECE_COLORS.length]);
const rightStack = stack(940, 560, 5, [6, 4, 7, 3, 5], (c, r) =>
  r < 2 ? "#5c6478" : PIECE_COLORS[(c * 2 + r) % PIECE_COLORS.length],
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG_TOP}"/>
      <stop offset="1" stop-color="${BG_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="20%" r="55%">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="60" y="150" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}">net<tspan fill="${ACCENT}">ris</tspan></text>
  <text x="62" y="192" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">battle tetris with your moots</text>

  <text x="62" y="256" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">Type a handle, drop into live competitive Tetris —</text>
  <text x="62" y="282" font-family="JetBrains Mono" font-size="17" fill="${MUTED}">clear lines to send garbage at a random opponent.</text>

  <text x="62" y="340" font-family="JetBrains Mono" font-size="16" fill="${AMBER}">same pieces · clear lines · send garbage · last board standing</text>

  <text x="62" y="600" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">netris.bisks.net</text>

  ${leftStack}
  ${rightStack}
  <text x="856" y="486" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${AMBER}">VS</text>
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
