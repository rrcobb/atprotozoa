// Generates public/og.png — the Open Graph preview card for attractors.
//
// Runs a real Clifford attractor (fixed "pretty" parameters, not random —
// deterministic here just means reproducible, not that determinism is the
// point) for a burn-in plus a sample stretch, then renders the sampled
// points as small semi-transparent SVG circles — overlapping circles darken
// each other's background out, which reads as the same density-brightening
// look the live canvas renderer produces. Same approach as
// sites/physarum/og-gen.mjs and sites/cancrusher/og-gen.mjs. Rasterised
// with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#eef2ff", MUTED = "#94a0c2", GOLD = "#ffcf4d", ACCENT = "#8f9dff";

// A well-known pretty Clifford attractor: x' = sin(ay) + c*cos(ax), y' = sin(bx) + d*cos(by)
const P = { a: -1.4, b: 1.6, c: 1.0, d: 0.7 };
function step(x, y) {
  return [Math.sin(P.a * y) + P.c * Math.cos(P.a * x), Math.sin(P.b * x) + P.d * Math.cos(P.b * y)];
}

let x = 0.1, y = 0.1;
for (let i = 0; i < 500; i++) [x, y] = step(x, y);

const pts = [];
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (let i = 0; i < 26000; i++) {
  [x, y] = step(x, y);
  pts.push([x, y]);
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
}

// Fit into the right-hand two-thirds of the card, leaving room for the
// title block in the lower-left corner.
const boxX = W * 0.32, boxY = 20, boxW = W * 0.66, boxH = H - 40;
const rangeX = maxX - minX, rangeY = maxY - minY;
const scale = Math.min(boxW / rangeX, boxH / rangeY) * 0.92;
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
const px0 = boxX + boxW / 2, py0 = boxY + boxH / 2;

const dotsSvg = pts
  .map(([px, py]) => {
    const sx = (px0 + (px - cx) * scale).toFixed(1);
    const sy = (py0 + (py - cy) * scale).toFixed(1);
    return `<circle cx="${sx}" cy="${sy}" r="1.15" fill="${ACCENT}" fill-opacity="0.16"/>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.72" cy="0.5" r="1.0">
      <stop offset="0" stop-color="#0d0f22"/>
      <stop offset="1" stop-color="#05060a"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${dotsSvg}

  <rect x="0" y="0" width="${W * 0.34}" height="${H}" fill="#05060a" fill-opacity="0.55"/>
  <text x="56" y="150" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">attractors</text>
  <text x="56" y="190" font-family="JetBrains Mono" font-weight="600" font-size="20" fill="${MUTED}">a chaotic map draws its own shape</text>

  <text x="56" y="260" font-family="JetBrains Mono" font-weight="600" font-size="19" fill="${MUTED}">a few sines and cosines, fed back</text>
  <text x="56" y="288" font-family="JetBrains Mono" font-weight="600" font-size="19" fill="${MUTED}">through themselves a few million times.</text>

  <text x="56" y="${H - 46}" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${GOLD}">attractors.bisks.net</text>
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
