// Generates public/og.png — the Open Graph preview card for physarum.
//
// A static stand-in for what the live simulation grows: a procedurally
// branched filament network (recursive branch-and-jitter, not the actual
// agent sim — that needs a browser canvas, this needs to render once at
// build time) rendered as glowing SVG strokes, plus the title/tagline.
// Deterministic isn't the point here (Math.random is fine — this runs once,
// offline, to produce one static asset), same approach as
// sites/cancrusher/og-gen.mjs (see also sites/victorylap/og-gen.mjs). Rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#eafff5", MUTED = "#8fb0a6", GOLD = "#ffcf4d", GREEN = "#6dffb8", GREEN_DIM = "#2f8a63";

// --- Recursive branch generator -------------------------------------------
const segments = [];

function branch(x, y, angle, len, depth) {
  if (depth > 6 || len < 4) return;
  const x2 = x + Math.cos(angle) * len;
  const y2 = y + Math.sin(angle) * len;
  segments.push({ x1: x, y1: y, x2, y2, depth });

  const children = depth < 2 ? 2 : Math.random() < 0.72 ? 2 : 1;
  for (let i = 0; i < children; i++) {
    const jitter = (Math.random() - 0.5) * 0.9;
    branch(x2, y2, angle + jitter, len * (0.72 + Math.random() * 0.15), depth + 1);
  }
}

const origins = [
  { x: 620, y: 560, a: -1.65 },
  { x: 720, y: 610, a: -1.9 },
  { x: 980, y: 590, a: -2.3 },
];
for (const o of origins) branch(o.x, o.y, o.a, 78, 0);

const segSvg = segments
  .map((s) => {
    const width = Math.max(1.1, 7 - s.depth * 1.05);
    const color = s.depth < 2 ? GREEN : s.depth < 4 ? GREEN_DIM : "#1c4a36";
    return `<line x1="${s.x1.toFixed(1)}" y1="${s.y1.toFixed(1)}" x2="${s.x2.toFixed(1)}" y2="${s.y2.toFixed(1)}" stroke="${color}" stroke-width="${width.toFixed(1)}" stroke-linecap="round"/>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.62" cy="0.78" r="1.0">
      <stop offset="0" stop-color="#0c1f16"/>
      <stop offset="1" stop-color="#05070a"/>
    </radialGradient>
    <filter id="soften" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="0.6"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g filter="url(#soften)">
  ${segSvg}
  </g>

  <text x="56" y="110" font-family="JetBrains Mono" font-weight="800" font-size="54" fill="${INK}">physarum</text>
  <text x="56" y="150" font-family="JetBrains Mono" font-weight="600" font-size="21" fill="${MUTED}">a slime mold grows its own network</text>

  <text x="56" y="210" font-family="JetBrains Mono" font-weight="600" font-size="20" fill="${MUTED}">thousands of agents. one shared trail.</text>
  <text x="56" y="240" font-family="JetBrains Mono" font-weight="600" font-size="20" fill="${MUTED}">no plan — click to drop food, watch it reroute.</text>

  <text x="56" y="${H - 46}" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${GOLD}">physarum.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const rr = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = rr.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
