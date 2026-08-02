// Generates public/og.png — the Open Graph preview card for eulerize.
// Hand-drawn SVG at the canonical OG size: a little street-grid graph with
// a numbered Eulerian circuit traced through it, echoing the live canvas.
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — this box has no fontconfig/system fonts either, so the font is
// bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/didscope/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0d1117", PANEL = "#151b23", BORDER = "#2a3441", FG = "#e6edf3", DIM = "#8b96a5";
const ACCENT = "#56d2c2", ACCENT2 = "#ff8a5c";

// A small hand-placed graph: every vertex has even degree, one connected
// component — a real Eulerian circuit, traced in order 1..N.
const nodes = [
  { id: "a", x: 640, y: 120 },
  { id: "b", x: 790, y: 120 },
  { id: "c", x: 790, y: 260 },
  { id: "d", x: 640, y: 260 },
  { id: "e", x: 640, y: 400 },
  { id: "f", x: 790, y: 400 },
  { id: "g", x: 940, y: 260 },
  { id: "h", x: 940, y: 120 },
];

// Circuit order (closed walk), each consecutive pair is one traced edge.
const circuit = ["a", "b", "h", "g", "c", "b", "c", "d", "a", "d", "e", "f", "c", "f", "e"];
// re-close to start
circuit.push(circuit[0]);

const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

const edgeSvg = circuit
  .slice(0, -1)
  .map((id, i) => {
    const a = byId[id], b = byId[circuit[i + 1]];
    const t = i / (circuit.length - 1);
    const hue = Math.round(168 - t * 40);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="hsl(${hue} 70% 60%)" stroke-width="5" stroke-linecap="round"/>
    <rect x="${mx - 12}" y="${my - 11}" width="24" height="18" rx="4" fill="#060c0a"/>
    <text x="${mx}" y="${my + 2}" text-anchor="middle" dominant-baseline="middle" font-family="JetBrains Mono" font-weight="700" font-size="13" fill="hsl(${hue} 85% 78%)">${i + 1}</text>`;
  })
  .join("\n    ");

const nodeSvg = nodes
  .map((n) => `<circle cx="${n.x}" cy="${n.y}" r="9" fill="${FG}"/>`)
  .join("\n    ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="55%">
      <stop offset="0" stop-color="#123a34"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">eulerize</text>
  <text x="64" y="200" font-family="JetBrains Mono" font-size="20" fill="${DIM}">trace a map, find its</text>
  <text x="64" y="228" font-family="JetBrains Mono" font-size="20" fill="${DIM}"><tspan fill="${ACCENT2}">eulerian circuit</tspan></text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="16" fill="${DIM}">Upload a picture of a map, trace the</text>
  <text x="64" y="326" font-family="JetBrains Mono" font-size="16" fill="${DIM}">streets as a graph, and Hierholzer's</text>
  <text x="64" y="352" font-family="JetBrains Mono" font-size="16" fill="${DIM}">algorithm finds a one-stroke tour —</text>
  <text x="64" y="378" font-family="JetBrains Mono" font-size="16" fill="${DIM}">or tells you exactly why none exists.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="19" fill="${ACCENT}">eulerize.bisks.net</text>

  <!-- right: traced graph panel -->
  <rect x="560" y="40" width="600" height="550" rx="16" fill="${PANEL}" stroke="${BORDER}" stroke-width="1.5"/>
  ${edgeSvg}
  ${nodeSvg}
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
