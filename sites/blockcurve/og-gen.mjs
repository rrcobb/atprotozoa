// Generates public/og.png — the static Open Graph preview card for
// blockcurve (the generic fallback for the bare link; per-handle previews
// are text-only, set server-side by src/index.ts's /s/<handle> route).
// Same recipe as sites/didscope/og-gen.mjs: hand-drawn SVG, rasterised with
// @resvg/resvg-js (no system fonts on this box, so the font is bundled in
// ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#101013", SURFACE = "#17171b", BORDER = "#2c2c33";
const FG = "#f3f3f1", DIM = "#b9b8c4", MUTED = "#7c7b87";
const BLUE = "#3987e5", ORANGE = "#d95926";

// A believable sample staircase — not real data, just the shape the chart
// makes: mostly-flat with a couple of jumps (one a modlist-style spike).
const chartX = 60, chartY = 300, chartW = W - 120, chartH = 260;
function stepPoints(steps) {
  // steps: [[xFrac, cumFrac], ...] sorted, cumulative fraction 0..1
  let d = `M ${chartX} ${chartY + chartH}`;
  let last = 0;
  for (const [xf, cf] of steps) {
    const px = chartX + xf * chartW;
    const py1 = chartY + chartH - last * chartH;
    const py2 = chartY + chartH - cf * chartH;
    d += ` L ${px.toFixed(1)} ${py1.toFixed(1)} L ${px.toFixed(1)} ${py2.toFixed(1)}`;
    last = cf;
  }
  d += ` L ${(chartX + chartW).toFixed(1)} ${(chartY + chartH - last * chartH).toFixed(1)}`;
  return d;
}
const directSteps = [
  [0.08, 0.06], [0.18, 0.12], [0.3, 0.2], [0.42, 0.28], [0.55, 0.4],
  [0.68, 0.5], [0.78, 0.62], [0.88, 0.78], [0.95, 0.9], [1, 1],
];
const totalSteps = [
  [0.08, 0.05], [0.18, 0.1], [0.3, 0.17], [0.42, 0.24], [0.5, 0.6],
  [0.55, 0.63], [0.68, 0.7], [0.78, 0.8], [0.88, 0.9], [0.95, 0.96], [1, 1],
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="60" y="100" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${BLUE}">blockcurve</text>
  <text x="60" y="150" font-family="JetBrains Mono" font-size="24" fill="${DIM}">a cumulative chart of every block you've received</text>
  <text x="60" y="182" font-family="JetBrains Mono" font-size="24" fill="${DIM}">built from public backlinks — for any handle</text>

  <rect x="${chartX}" y="${chartY}" width="${chartW}" height="${chartH}" rx="14" fill="${SURFACE}" stroke="${BORDER}" stroke-width="1.5"/>
  <path d="${stepPoints(totalSteps)}" fill="none" stroke="${ORANGE}" stroke-width="4" stroke-linejoin="round"/>
  <path d="${stepPoints(directSteps)}" fill="none" stroke="${BLUE}" stroke-width="4" stroke-linejoin="round"/>

  <circle cx="20" cy="560" r="6" fill="${BLUE}"/>
  <text x="34" y="566" font-family="JetBrains Mono" font-size="17" fill="${DIM}">direct blocks</text>
  <circle cx="220" cy="560" r="6" fill="${ORANGE}"/>
  <text x="234" y="566" font-family="JetBrains Mono" font-size="17" fill="${DIM}">incl. modlist adds</text>

  <text x="60" y="610" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${MUTED}">blockcurve.bisks.net</text>
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
