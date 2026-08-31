// Generates public/og.png — the Open Graph preview card for petalgarden.
// A small row of petal-projection flowers (same rose-curve math as
// public/app.js, duplicated here rather than shared — see the "copy, don't
// abstract" house style) rasterised with @resvg/resvg-js.
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
const BG = "#0b0f13", INK = "#e8eef2", MUTED = "#8fa1ad", ACCENT = "#7bd88f";
const PALETTE = ["#ff8a7b", "#7bd88f", "#ffd166", "#a78bfa", "#66d1e0"];

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}
function petalMultiplier(n) {
  for (let k = Math.floor(n / 2); k >= 1; k--) if (gcd(k, n) === 1) return k;
  return 1;
}

function flowerPath(n, samples, radius, cx, cy) {
  const k = petalMultiplier(n);
  let d = "";
  for (let i = 0; i < n; i++) {
    for (let s = 0; s <= samples; s++) {
      const u = s / samples;
      const t = i + u;
      const angle = (2 * Math.PI * k * t) / n;
      const r = Math.sin(Math.PI * u) * radius;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      d += (i === 0 && s === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
    }
  }
  return d + "Z";
}

// A little garden: four flowers, increasing petal counts, across the bottom.
const flowers = [
  { n: 5, color: PALETTE[0] },
  { n: 7, color: PALETTE[1] },
  { n: 9, color: PALETTE[2] },
  { n: 11, color: PALETTE[3] },
];
const fR = 110;
const fY = 420;
const fXs = [190, 460, 730, 1000];

const flowerShapes = flowers
  .map(
    (f, i) =>
      `<path d="${flowerPath(f.n, 20, fR, fXs[i], fY)}" fill="none" stroke="${f.color}" stroke-width="5" stroke-linejoin="round" opacity="0.92"/>`
  )
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="15%" cy="10%" r="70%">
      <stop offset="0" stop-color="#16241c"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="66" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">petal<tspan fill="${ACCENT}">garden</tspan></text>
  <text x="68" y="200" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">a grid of random knots, one petal projection per permutation</text>

  ${flowerShapes}

  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="${ACCENT}"/>
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
