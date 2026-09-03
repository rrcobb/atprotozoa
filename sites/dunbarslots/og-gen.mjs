// Generates public/og.png — the Open Graph preview card for dunbarslots.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
// Copied from sites/ashbychart/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png (needs @resvg/resvg-js, already
//                      # in the repo root's pnpm store; --no-save install here
//                      # if it's somehow missing)

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#fcfcfb", INK = "#0b0b0b", MUTED = "#898781", GRID = "#e1e0d9";
const ACCENT = "#2a78d6";

const plotX = 64, plotY = 380, plotW = 1072, plotH = 190;

// A staircase that vaguely resembles the real chart's shape, plus dashed
// reference lines at the Dunbar layers (5 / 15 / 50 / 150), log-ish spaced.
const layers = [
  { y: plotY + plotH - 20, label: "5" },
  { y: plotY + plotH - 70, label: "15" },
  { y: plotY + plotH - 130, label: "50" },
  { y: plotY + 10, label: "150" },
];

const stairs = [
  [0, 0.92], [0.08, 0.92], [0.08, 0.8], [0.18, 0.8], [0.18, 0.68],
  [0.3, 0.68], [0.3, 0.55], [0.42, 0.55], [0.42, 0.42], [0.55, 0.42],
  [0.55, 0.3], [0.68, 0.3], [0.68, 0.18], [0.82, 0.18], [0.82, 0.06], [1, 0.06],
];
const stairPts = stairs
  .map(([fx, fy]) => `${plotX + fx * plotW},${plotY + fy * plotH}`)
  .join(" ");

const gridLines = layers
  .map(
    (l) =>
      `<line x1="${plotX}" y1="${l.y}" x2="${plotX + plotW}" y2="${l.y}" stroke="${GRID}" stroke-width="2" stroke-dasharray="6 6"/>
  <text x="${plotX + plotW + 12}" y="${l.y + 5}" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">${l.label}</text>`
  )
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="96" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${INK}">dunbarslots</text>
  <text x="64" y="140" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">how many of your <tspan fill="${ACCENT}">150 Dunbar slots</tspan></text>
  <text x="64" y="168" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">are spent modeling an AI's personality?</text>
  <text x="64" y="220" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">pick the models you know. watch the exponential trend</text>
  <text x="64" y="244" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">tell you exactly when you max out.</text>

  <rect x="${plotX - 16}" y="${plotY - 16}" width="${plotW + 250}" height="${plotH + 40}" fill="none"/>
  ${gridLines}
  <polyline points="${stairPts}" fill="none" stroke="${ACCENT}" stroke-width="4" stroke-linejoin="round"/>
  <text x="${plotX}" y="${plotY + plotH + 26}" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">5 support clique · 15 sympathy group · 50 band · 150 Dunbar's number</text>

  <text x="64" y="612" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">dunbarslots.bisks.net</text>
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
