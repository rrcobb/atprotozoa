// Generates public/og.png — the Open Graph preview card for foomtree.
// A recursive branching tree, gold-on-dark, each level a smaller copy of the
// last, mirroring the live "grow" animation the app renders. Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/droste/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0e0a";
const MUTED = "#8fa082";
const ACCENT = "#ffd23f";

// growth color scheme: dark forest green -> gold, matching the live app.
function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function gradient3(stops, t) {
  const [c0, c1, c2] = stops.map(hexToRgb);
  let a, b, tt;
  if (t < 0.5) { a = c0; b = c1; tt = t * 2; }
  else { a = c1; b = c2; tt = (t - 0.5) * 2; }
  const r = lerp(a[0], b[0], tt), g = lerp(a[1], b[1], tt), bl = lerp(a[2], b[2], tt);
  return `rgb(${r},${g},${bl})`;
}
const GROWTH = ["#0d2410", "#5c9c3a", "#ffd23f"];

const MAX_DEPTH = 9;
const ANGLE = 24;
const RATIO = 0.74;

const lines = [];
function rec(x, y, len, angle, level) {
  const rad = (angle * Math.PI) / 180;
  const x2 = x + len * Math.sin(rad);
  const y2 = y - len * Math.cos(rad);
  lines.push({ x1: x, y1: y, x2, y2, level });
  if (level >= MAX_DEPTH) return;
  rec(x2, y2, len * RATIO, angle - ANGLE, level + 1);
  rec(x2, y2, len * RATIO, angle + ANGLE, level + 1);
}
rec(0, 250, 150, 0, 0);

const branchShapes = lines
  .map((l) => {
    const color = gradient3(GROWTH, l.level / MAX_DEPTH);
    const width = Math.max(0.7, (MAX_DEPTH - l.level + 1.5) * 0.55);
    return `<line x1="${l.x1.toFixed(1)}" y1="${l.y1.toFixed(1)}" x2="${l.x2.toFixed(1)}" y2="${l.y2.toFixed(1)}" stroke="${color}" stroke-width="${width.toFixed(2)}" stroke-linecap="round"/>`;
  })
  .join("\n  ");

const treeCx = 860, treeCy = 610;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <!-- the tree: recursive, each branch a smaller copy of its parent -->
  <g transform="translate(${treeCx} ${treeCy})">
    ${branchShapes}
  </g>

  <text x="66" y="220" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${ACCENT}">foomtree</text>
  <text x="68" y="270" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">more of this thing, making more of this thing.</text>
  <text x="68" y="298" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">grow a fractal — trees, snowflakes, triangles —</text>
  <text x="68" y="326" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">and watch the shape count double each level.</text>
  <text x="68" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">foomtree.bisks.net</text>
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
