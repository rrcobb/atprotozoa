// Generates public/og.png — the Open Graph preview card for everzoom.
// A glowing Mandelbrot cardioid silhouette (real parametric boundary, not
// freehand) ringed by concentric zoom-portal arcs in the same cosine
// palette the live shader cycles through. Rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed).
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
const BG_TOP = "#120a24", BG_BOT = "#050308";
const INK = "#f4ecff", MUTED = "#b9a8e8", ACCENT = "#d7b8ff";

// cosine palette, matching pal() in the live shader
function pal(t) {
  const f = (ph) => Math.round(255 * (0.5 + 0.5 * Math.cos(2 * Math.PI * (t + ph))));
  return `rgb(${f(0)}, ${f(0.33)}, ${f(0.67)})`;
}

// main cardioid boundary: c(t) = e^{it}/2 - e^{2it}/4
const cx = 880, cy = 315, unit = 250;
let cardioid = "";
for (let i = 0; i <= 240; i++) {
  const t = (i / 240) * Math.PI * 2;
  const re = 0.5 * Math.cos(t) - 0.25 * Math.cos(2 * t);
  const im = 0.5 * Math.sin(t) - 0.25 * Math.sin(2 * t);
  const x = cx + re * unit;
  const y = cy - im * unit;
  cardioid += (i === 0 ? "M " : "L ") + x.toFixed(1) + " " + y.toFixed(1) + " ";
}
cardioid += "Z";

// period-2 bulb: circle at (-1, 0), radius 0.25
const bulbCx = cx + -1 * unit, bulbCy = cy, bulbR = 0.25 * unit;

// concentric zoom-portal rings behind the fractal, palette-cycled
let rings = "";
for (let i = 0; i < 9; i++) {
  const r = 60 + i * 62;
  const hue = i * 0.09;
  rings += `<circle cx="${cx - 30}" cy="${cy}" r="${r}" fill="none" stroke="${pal(hue)}" stroke-width="2" opacity="${(0.34 - i * 0.03).toFixed(2)}"/>\n  `;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="38%" cy="46%" r="75%">
      <stop offset="0%" stop-color="${BG_TOP}"/>
      <stop offset="100%" stop-color="${BG_BOT}"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  ${rings}

  <circle cx="${cx - 15}" cy="${cy}" r="200" fill="url(#glow)"/>

  <path d="${cardioid}" fill="#08040f" stroke="${ACCENT}" stroke-width="3.5"/>
  <circle cx="${bulbCx}" cy="${bulbCy}" r="${bulbR}" fill="#08040f" stroke="${ACCENT}" stroke-width="3.5"/>

  <text x="70" y="220" font-family="JetBrains Mono" font-weight="800" font-size="76" fill="${INK}">everzoom</text>
  <text x="72" y="270" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">an eternally zooming fractal</text>
  <text x="72" y="300" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">double-float GLSL &#8212; forever</text>
  <text x="72" y="580" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${ACCENT}">bisks.net/everzoom</text>
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
