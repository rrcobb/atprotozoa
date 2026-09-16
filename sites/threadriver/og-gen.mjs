// Generates public/og.png — the Open Graph preview card for threadriver.
// Same recipe as sites/mootflow/og-gen.mjs: hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (no system fontconfig needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Illustrative branching, not a real thread — it just needs to read as "a
// reply tree drawn as a sankey," the same tradeoff birdflow/mootflow make.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#08101a", SURFACE = "#0f1c2b", INK = "#eaf4f6", DIM = "#a9c0d4", MUTED = "#7690a1";
const ACCENT = "#3fb6c9";

// resvg doesn't reliably parse the CSS hsl() function in SVG fill attributes
// (it rendered solid black in testing) — convert to hex ourselves instead.
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
function depthColor(depth, maxDepth) {
  const t = depth / maxDepth;
  const hue = 205 - t * 175;
  return hslToHex(hue, 68, 56);
}

function ribbon(x1, y1a, y1b, x2, y2a, y2b, color) {
  const mx = (x1 + x2) / 2;
  return `<path d="M${x1},${y1a} C${mx},${y1a} ${mx},${y2a} ${x2},${y2a} L${x2},${y2b} C${mx},${y2b} ${mx},${y1b} ${x1},${y1b} Z" fill="${color}" opacity="0.55"/>`;
}

// A small illustrative tree: root -> 3 -> 6 -> 5, generations widening then
// narrowing back down, just enough branches to read as a sankey at a glance.
// y values start below the header text (which ends around y=178).
const gens = [
  { x: 250, nodes: [{ y: 250, h: 210 }] },
  { x: 480, nodes: [{ y: 200, h: 80 }, { y: 290, h: 110 }, { y: 410, h: 60 }] },
  { x: 710, nodes: [{ y: 195, h: 40 }, { y: 245, h: 30 }, { y: 295, h: 60 }, { y: 365, h: 45 }, { y: 420, h: 35 }, { y: 465, h: 20 }] },
  { x: 940, nodes: [{ y: 200, h: 25 }, { y: 250, h: 20 }, { y: 300, h: 45 }, { y: 370, h: 30 }, { y: 430, h: 18 }] },
];
const maxDepth = gens.length - 1;

let ribbons = "";
for (let g = 0; g < gens.length - 1; g++) {
  const cur = gens[g].nodes;
  const next = gens[g + 1].nodes;
  let ni = 0;
  for (let i = 0; i < cur.length; i++) {
    const n = cur[i];
    const fanCount = Math.max(1, Math.round(next.length / cur.length));
    let cy = n.y;
    for (let f = 0; f < fanCount && ni < next.length; f++, ni++) {
      const t = next[ni];
      const seg = n.h / fanCount;
      ribbons += ribbon(gens[g].x + 14, cy, cy + seg, gens[g + 1].x, t.y, t.y + t.h, depthColor(g + 1, maxDepth));
      cy += seg;
    }
  }
}

const nodesSvg = gens
  .map((gen, g) =>
    gen.nodes
      .map((n) => `<rect x="${gen.x}" y="${n.y}" width="14" height="${n.h}" rx="3" fill="${depthColor(g, maxDepth)}"/>`)
      .join(""),
  )
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="60%">
      <stop offset="0" stop-color="#132a38"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="106" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${ACCENT}">threadriver</text>
  <text x="64" y="142" font-family="JetBrains Mono" font-size="19" fill="${DIM}">a Bluesky thread, drawn as a giant sankey</text>
  <text x="64" y="168" font-family="JetBrains Mono" font-size="15" fill="${MUTED}">every reply, every branch — flow width is how much of the thread moves through it</text>

  ${ribbons}
  ${nodesSvg}

  <text x="64" y="${H - 44}" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">threadriver.bisks.net</text>
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
