// Generates public/og.png — the Open Graph preview card for innercircle, so
// a shared link auto-renders a picture in Bluesky / other unfurlers.
//
// Hand-draws a stylized matrix as an SVG (a corner of avatar dots, cells
// with little text-snippet lines instead of mootrace's plain dots — this
// site's whole point is quoted text) at the canonical OG size, then
// rasterises it with @resvg/resvg-js (pure native module, no system Chromium
// needed — this box has no fontconfig/system fonts either, so the font is
// bundled in ./fonts and loaded explicitly). Copied from
// sites/mootrace/og-gen.mjs (copy, don't abstract). Purely decorative now —
// the real feature it's illustrating is "first reply each way with each
// mutual," not a literal mutual×mutual grid (see topmutuals.js), but the
// matrix motif still reads fine as a stand-in.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const TINTS = ["#1a5fd0","#1f8a4c","#d81e6a","#e0a400","#8e44ad",
  "#c0392b","#0f9b9b","#e2711d","#5566dd","#2c8c3c"];
const INK = "#111111", MUTED = "#6b6b6b";
const GOOD = "#1f8a4c", GOOD_BG = "#e7f5ec";
const FAINT = "#e4e4e4", FAINTBG = "#f6f6f6";

// tiny seeded RNG so the layout is identical every run
let seed = 4242;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const N = 7; // grid participants
const cell = 42, gap = 3;
const gridX = 540, gridY = 150;
const headSize = 18;

let gridSvg = "";
// column avatar heads
for (let c = 0; c < N; c++) {
  const x = gridX + headSize + gap + c * (cell + gap) + cell / 2;
  const y = gridY - 14;
  gridSvg += `<circle cx="${x}" cy="${y}" r="9" fill="${TINTS[c % TINTS.length]}"/>`;
}
for (let r = 0; r < N; r++) {
  const rowY = gridY + r * (cell + gap);
  // row avatar head
  gridSvg += `<circle cx="${gridX + headSize / 2}" cy="${rowY + cell / 2}" r="9" fill="${TINTS[(r + 3) % TINTS.length]}"/>`;
  for (let c = 0; c < N; c++) {
    const x = gridX + headSize + gap + c * (cell + gap);
    if (r === c) {
      gridSvg += `<rect x="${x}" y="${rowY}" width="${cell}" height="${cell}" fill="${FAINTBG}"/>`;
      continue;
    }
    const roll = rnd();
    if (roll < 0.45) {
      // "hit" cell — a couple of little lines standing in for quoted text
      const w1 = 14 + rnd() * 16, w2 = 10 + rnd() * 14;
      gridSvg += `<rect x="${x}" y="${rowY}" width="${cell}" height="${cell}" fill="${GOOD_BG}" stroke="${GOOD}"/>
        <rect x="${x + 4}" y="${rowY + 12}" width="${w1}" height="4" rx="2" fill="${GOOD}"/>
        <rect x="${x + 4}" y="${rowY + 22}" width="${w2}" height="4" rx="2" fill="${GOOD}" opacity="0.6"/>`;
    } else {
      gridSvg += `<rect x="${x}" y="${rowY}" width="${cell}" height="${cell}" fill="#ffffff" stroke="${FAINT}"/>`;
    }
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <!-- wordmark -->
  <text x="64" y="90" font-family="JetBrains Mono" font-weight="700"
    font-size="42" fill="${INK}">innercircle</text>
  <text x="64" y="128" font-family="JetBrains Mono" font-size="18"
    fill="${MUTED}">your top mutuals' first</text>
  <text x="64" y="152" font-family="JetBrains Mono" font-size="18"
    fill="${MUTED}">words with you</text>

  <!-- blurb on the left -->
  <text x="64" y="230" font-family="JetBrains Mono" font-size="17" fill="${INK}">Rank the top 40</text>
  <text x="64" y="260" font-family="JetBrains Mono" font-size="17" fill="${INK}">mutuals purely from</text>
  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${INK}">constellation</text>
  <text x="64" y="320" font-family="JetBrains Mono" font-size="17" fill="${INK}">backlinks, then see</text>
  <text x="64" y="350" font-family="JetBrains Mono" font-size="17" fill="${INK}">the first reply each</text>
  <text x="64" y="380" font-family="JetBrains Mono" font-size="17" fill="${INK}">way — text and link.</text>

  <rect x="56" y="440" width="18" height="18" rx="3" fill="${GOOD_BG}" stroke="${GOOD}"/>
  <rect x="60" y="446" width="10" height="3" rx="1.5" fill="${GOOD}"/>
  <rect x="60" y="452" width="7" height="3" rx="1.5" fill="${GOOD}" opacity="0.6"/>
  <text x="86" y="454" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">first reply, quoted</text>

  <!-- the grid -->
  ${gridSvg}

  <!-- footer strip -->
  <text x="64" y="600" font-family="JetBrains Mono" font-size="16"
    fill="${MUTED}">type a handle · rank the top 40 · read who said what first</text>
  <text x="${W - 64}" y="600" text-anchor="end" font-family="JetBrains Mono"
    font-size="16" fill="#1a5fd0">innercircle.bisks.net</text>
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
