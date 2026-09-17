// Generates public/og.png — the Open Graph preview card for followtide.
// Same recipe as sites/mootflow/og-gen.mjs (itself following sites/receipts):
// hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (no system fontconfig needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Illustrative cohort numbers, not live data — same tradeoff birdflow/mootflow
// make: the card just needs to look like the real thing.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0d0d0d", SURFACE = "#1a1a19", INK = "#ffffff", DIM = "#c3c2b7", MUTED = "#898781";
const ACCENT = "#1fd6c0";
const OLD_HEX = "#5b6f99", NEW_HEX = "#1fd6c0";

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function tideColor(t) {
  const a = hexToRgb(OLD_HEX);
  const b = hexToRgb(NEW_HEX);
  return `rgb(${lerp(a[0], b[0], t)}, ${lerp(a[1], b[1], t)}, ${lerp(a[2], b[2], t)})`;
}

// A representative cohort split on a real time axis: "following now" sits
// at the present, on the left, and each cohort sits however far back it
// happened — newest closest to the sink, oldest farthest right.
const cohorts = [
  { label: "Aug 2026", x: 300, h: 62 },
  { label: "Jun 2026", x: 380, h: 44 },
  { label: "Q3 2025", x: 480, h: 70 },
  { label: "Q1 2025", x: 600, h: 58 },
  { label: "2024", x: 740, h: 78 },
  { label: "2023", x: 900, h: 46 },
];

const sinkX = 170;
const top = 210;
let ribbons = "", nodesSvg = "";
const sinkTotal = cohorts.reduce((a, c) => a + c.h, 0);
let sinkCursor = top;
const n = cohorts.length;
cohorts.forEach((c, i) => {
  const t = 1 - i / (n - 1);
  const color = tideColor(t);
  const nodeTop = top + (sinkTotal - c.h) / 2 - i * 4;
  const y1a = sinkCursor, y1b = sinkCursor + c.h;
  const y2a = nodeTop, y2b = nodeTop + c.h;
  const mx = (sinkX + 16 + c.x) / 2;
  ribbons += `<path d="M${sinkX + 16},${y1a} C${mx},${y1a} ${mx},${y2a} ${c.x},${y2a} L${c.x},${y2b} C${mx},${y2b} ${mx},${y1b} ${sinkX + 16},${y1b} Z" fill="${color}" opacity="0.55"/>`;
  nodesSvg += `<rect x="${c.x}" y="${nodeTop}" width="16" height="${c.h}" rx="4" fill="${color}"/>
    <text x="${c.x + 8}" y="${nodeTop - 12}" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${INK}">${c.label}</text>`;
  sinkCursor += c.h;
});
nodesSvg += `<rect x="${sinkX}" y="${top}" width="16" height="${sinkTotal}" rx="4" fill="${DIM}"/>
  <text x="${sinkX - 12}" y="${top + sinkTotal / 2 + 6}" text-anchor="end" font-family="JetBrains Mono" font-size="19" font-weight="700" fill="${INK}">following now</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="6%" cy="-10%" r="55%">
      <stop offset="0" stop-color="#12332f"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="112" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${ACCENT}">followtide</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-size="20" fill="${DIM}">a sankey of when you followed everyone</text>
  <text x="64" y="178" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">bucketed by month/quarter/year followed, present on the left</text>

  ${ribbons}
  ${nodesSvg}

  <text x="64" y="${H - 44}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">followtide.bisks.net</text>
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
