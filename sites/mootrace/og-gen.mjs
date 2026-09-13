// Generates public/og.png — the Open Graph preview card for mootrace, so a
// shared link auto-renders a picture of the grid in Bluesky / other
// unfurlers.
//
// Hand-draws a representative "screenshot" of the race grid as an SVG (a
// corner of avatar dots, a matrix of gold/green/empty cells) at the
// canonical OG size, then rasterises it with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system
// fonts either, so the font is bundled in ./fonts and loaded explicitly).
// Copied from dial-a-mutual/og-gen.mjs (copy, don't abstract).
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
const GOLD = "#b8860b", GOLD_BG = "#fdf3d6";
const GOOD = "#1f8a4c", GOOD_BG = "#e7f5ec";
const FAINT = "#e4e4e4", FAINTBG = "#f6f6f6";

// tiny seeded RNG so the layout is identical every run
let seed = 9001;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const N = 9; // grid participants
const cell = 34, gap = 3;
const gridX = 560, gridY = 150;
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
    let fill = "#ffffff", stroke = FAINT, dot = "";
    if (roll < 0.22) { fill = GOLD_BG; stroke = GOLD; dot = `<circle cx="${x + cell / 2}" cy="${rowY + cell / 2}" r="5" fill="${GOLD}"/>`; }
    else if (roll < 0.4) { fill = GOOD_BG; stroke = GOOD; dot = `<circle cx="${x + cell / 2}" cy="${rowY + cell / 2}" r="4" fill="none" stroke="${GOOD}" stroke-width="2"/>`; }
    gridSvg += `<rect x="${x}" y="${rowY}" width="${cell}" height="${cell}" fill="${fill}" stroke="${stroke}"/>${dot}`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>

  <!-- wordmark -->
  <text x="64" y="90" font-family="JetBrains Mono" font-weight="700"
    font-size="42" fill="${INK}">mootrace</text>
  <text x="64" y="128" font-family="JetBrains Mono" font-size="19"
    fill="${MUTED}">who replied to whom first</text>

  <!-- blurb on the left -->
  <text x="64" y="230" font-family="JetBrains Mono" font-size="17" fill="${INK}">Every mutual,</text>
  <text x="64" y="260" font-family="JetBrains Mono" font-size="17" fill="${INK}">every pairing —</text>
  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${INK}">who broke the</text>
  <text x="64" y="320" font-family="JetBrains Mono" font-size="17" fill="${INK}">ice first by</text>
  <text x="64" y="350" font-family="JetBrains Mono" font-size="17" fill="${INK}">replying?</text>

  <rect x="56" y="410" width="18" height="18" rx="3" fill="${GOLD_BG}" stroke="${GOLD}"/>
  <circle cx="65" cy="419" r="5" fill="${GOLD}"/>
  <text x="86" y="424" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">first reply</text>
  <rect x="56" y="440" width="18" height="18" rx="3" fill="${GOOD_BG}" stroke="${GOOD}"/>
  <circle cx="65" cy="449" r="4" fill="none" stroke="${GOOD}" stroke-width="2"/>
  <text x="86" y="454" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">replied second</text>

  <!-- the grid -->
  ${gridSvg}

  <!-- footer strip -->
  <text x="64" y="600" font-family="JetBrains Mono" font-size="16"
    fill="${MUTED}">type a handle · scan its mutuals · see who went first</text>
  <text x="${W - 64}" y="600" text-anchor="end" font-family="JetBrains Mono"
    font-size="16" fill="#1a5fd0">mootrace.bisks.net</text>
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
