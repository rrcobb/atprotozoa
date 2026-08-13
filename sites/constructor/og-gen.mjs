// Generates public/og.png — the Open Graph preview card for constructor.
// A blueprint sheet: graph-paper grid, a handful of labeled schematic nodes
// with leader lines, deterministic so re-runs are byte-stable. Rasterised
// with @resvg/resvg-js (pure native module, no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/replicators/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a1626";
const GRID = "#132a44";
const MUTED = "#7fa2c4";
const ACCENT = "#6ee7ff";
const FG = "#dbe9f5";

let rngState = 7;
function rng() { // tiny deterministic PRNG so re-runs are byte-stable
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return (rngState % 10000) / 10000;
}

const gridLines = [];
for (let x = 0; x <= W; x += 30) gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${GRID}" stroke-width="1"/>`);
for (let y = 0; y <= H; y += 30) gridLines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${GRID}" stroke-width="1"/>`);

const LABELS = ["thruster", "servo mount", "solar vane", "chassis plate", "docking clamp", "logic board"];
const nodes = LABELS.map((label, i) => {
  const x = 780 + (i % 2 === 0 ? 0 : 190) + rng() * 40;
  const y = 90 + Math.floor(i / 2) * 150 + rng() * 30;
  return { x, y, label, leftSide: false };
});

const nodeSvg = nodes.map((n) => {
  const lx = n.x + 26;
  return `
  <line x1="${n.x.toFixed(1)}" y1="${n.y.toFixed(1)}" x2="${lx.toFixed(1)}" y2="${n.y.toFixed(1)}" stroke="${GRID}" stroke-width="1.5"/>
  <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="7" fill="${BG}" stroke="${ACCENT}" stroke-width="2.5"/>
  <text x="${(lx + 4).toFixed(1)}" y="${(n.y + 5).toFixed(1)}" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">${n.label}</text>`;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <g>${gridLines.join("")}</g>
  ${nodeSvg}

  <text x="66" y="110" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${ACCENT}">constructor</text>
  <text x="68" y="150" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">SPEC NO. 0X001 &#183; universal constructor</text>
  <text x="66" y="220" font-family="JetBrains Mono" font-size="22" fill="${FG}">tell it what to build. it assembles a</text>
  <text x="66" y="252" font-family="JetBrains Mono" font-size="22" fill="${FG}">one-off blueprint on the spot &#8212; and</text>
  <text x="66" y="284" font-family="JetBrains Mono" font-size="22" fill="${FG}">hands back a real link to the build.</text>
  <text x="66" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">constructor.bisks.net</text>
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
