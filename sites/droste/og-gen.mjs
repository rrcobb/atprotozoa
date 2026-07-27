// Generates public/og.png — the Open Graph preview card for droste.
// A doodle scribbled outside a square frame, with the frame itself showing
// nested, progressively rotated copies of itself receding to a point — a
// static approximation of the live spiral the app renders. Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/enshittify/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#111111", MUTED = "#6b6b6b", ACCENT = "#1a5fd0", PAPER = "#ffffff";

const cx = 800, cy = 330;
const squares = [];
{
  let size = 400, rot = 0;
  for (let i = 0; i < 7; i++) {
    squares.push({ size, rot, opacity: Math.max(0.22, 1 - i * 0.13), width: i === 0 ? 5 : 2 });
    size *= 0.6;
    rot += 15;
  }
}
const squareShapes = squares
  .map(
    (s) =>
      `<rect x="${cx - s.size / 2}" y="${cy - s.size / 2}" width="${s.size}" height="${s.size}" fill="none" stroke="${INK}" stroke-width="${s.width}" opacity="${s.opacity}" transform="rotate(${s.rot} ${cx} ${cy})"/>`
  )
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>

  <!-- a doodle, drawn outside the frame -->
  <path d="M 70 150 Q 110 90 150 150 T 230 150 T 300 120" fill="none" stroke="${INK}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 80 470 Q 140 420 130 500 Q 120 560 190 520" fill="none" stroke="${ACCENT}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="330" cy="480" r="9" fill="#c0392b"/>

  <!-- the frame: nested, rotated copies receding inward -->
  ${squareShapes}

  <text x="66" y="240" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">droste</text>
  <text x="68" y="290" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">draw around the frame — watch it echo</text>
  <text x="68" y="318" font-family="JetBrains Mono" font-size="21" fill="${MUTED}">inward, again and again, forever</text>
  <text x="68" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">bisks.net/droste</text>
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
