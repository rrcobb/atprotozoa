// Generates public/og.png — the Open Graph preview card for littleguys, so a
// shared link auto-renders a little street grid with wandering dots on it.
// Hand-drawn SVG at the canonical OG size, matching the live page's look,
// rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — this box has no fontconfig/system fonts either, so the font is
// bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract, adapted from
// sites/warmtrail/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#14181a", FG = "#eef1ee", DIM = "#93a19b";
const ACCENT = "#ff7a45", ACCENT2 = "#5b9bd9", CARD = "#1c2226", BORDER = "#2b3338";

// A little illustrative street grid, not tied to any real query — a few
// blocks with wandering colored trails on top, echoing the live map view.
const gridX0 = 600, gridY0 = 120, gridW = 480, gridH = 420;
const vLines = [660, 760, 880, 980, 1060];
const hLines = [180, 260, 340, 420, 500];
const gridLines = [
  ...vLines.map((x) => `<line x1="${x}" y1="${gridY0 + 10}" x2="${x}" y2="${gridY0 + gridH - 10}" stroke="${BORDER}" stroke-width="6"/>`),
  ...hLines.map((y) => `<line x1="${gridX0 + 10}" y1="${y}" x2="${gridX0 + gridW - 10}" y2="${y}" stroke="${BORDER}" stroke-width="6"/>`),
].join("\n  ");

// A handful of hand-placed wandering paths through the grid, each a little
// guy's trail, colored the same golden-angle-hue way the live app spreads
// its walker colors.
const trails = [
  { pts: [[660, 500], [660, 420], [760, 420], [760, 340], [880, 340]], hue: 18 },
  { pts: [[980, 500], [980, 420], [1060, 420], [1060, 260]], hue: 156 },
  { pts: [[660, 180], [760, 180], [760, 260], [880, 260], [880, 180]], hue: 294 },
  { pts: [[880, 500], [980, 500], [980, 420], [880, 420], [880, 340]], hue: 72 },
];
const trailSvg = trails
  .map(({ pts, hue }) => {
    const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" ");
    const [ex, ey] = pts[pts.length - 1];
    const color = `hsl(${hue}, 70%, 60%)`;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>
  <circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="4" fill="${DIM}"/>
  <circle cx="${ex}" cy="${ey}" r="7" fill="${color}"/>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="55%">
      <stop offset="0" stop-color="#2a1f16"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="15%" r="55%">
      <stop offset="0" stop-color="#132433"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="url(#title)">littleguys</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="22" fill="${DIM}">drop up to 500 little guys</text>
  <text x="64" y="230" font-family="JetBrains Mono" font-size="22" fill="${DIM}">anywhere in a real city and</text>
  <text x="64" y="260" font-family="JetBrains Mono" font-size="22" fill="${ACCENT2}">watch them wander the streets.</text>

  <text x="64" y="340" font-family="JetBrains Mono" font-size="17" fill="${DIM}">real OpenStreetMap street data,</text>
  <text x="64" y="366" font-family="JetBrains Mono" font-size="17" fill="${DIM}">a random turn at every real</text>
  <text x="64" y="392" font-family="JetBrains Mono" font-size="17" fill="${DIM}">intersection, no plan at all.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">littleguys.bisks.net</text>

  <!-- street grid card -->
  <rect x="${gridX0}" y="${gridY0}" width="${gridW}" height="${gridH}" rx="18" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
  ${gridLines}
  ${trailSvg}
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r2 = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r2.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
