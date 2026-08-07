// Generates public/og.png — the Open Graph preview card for sleepsim.
// Drawn shapes, not emoji: the bundled mono font has no color-emoji glyphs
// and resvg would render a tofu box instead (same reasoning as
// sites/lovejar/og-gen.mjs, which this file is copied from).
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const FG = "#eae6df", DIM = "#756f66", ACCENT2 = "#8a8478", FAINT = "#4a4038";

function baseSvg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="vein" cx="50%" cy="18%" r="65%">
      <stop offset="0" stop-color="#2a1210" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#000000" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#000000"/>
  <rect width="${W}" height="${H}" fill="url(#vein)"/>
  ${inner}
</svg>`;
}

// A closed eye: a simple downward curve with three short lashes, drawn thin
// and dim — the one thing on an otherwise black card, same as the one thing
// you'd technically be able to see.
function closedEye(cx, cy, s) {
  const w = 130 * s;
  return `
  <g stroke="${ACCENT2}" stroke-width="${3.2 * s}" stroke-linecap="round" fill="none" opacity="0.85">
    <path d="M ${cx - w},${cy} Q ${cx},${cy + 26 * s} ${cx + w},${cy}" />
    <path d="M ${cx - w * 0.35},${cy + 20 * s} L ${cx - w * 0.42},${cy + 34 * s}" />
    <path d="M ${cx},${cy + 24 * s} L ${cx},${cy + 38 * s}" />
    <path d="M ${cx + w * 0.35},${cy + 20 * s} L ${cx + w * 0.42},${cy + 34 * s}" />
  </g>`;
}

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
function render(svg, outName) {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
  });
  const png = r.render().asPng();
  const out = new URL(`./public/${outName}`, import.meta.url).pathname;
  writeFileSync(out, png);
  console.log("wrote", out, png.length, "bytes");
}

const ogSvg = baseSvg(`
  <text x="70" y="120" font-family="JetBrains Mono" font-weight="700" font-size="30" letter-spacing="4" fill="${ACCENT2}">SLEEPING SIMULATOR</text>

  <text x="70" y="230" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${FG}">extremely accurate</text>
  <text x="70" y="290" font-family="JetBrains Mono" font-size="26" fill="${DIM}">shows you exactly what you see</text>
  <text x="70" y="326" font-family="JetBrains Mono" font-size="26" fill="${DIM}">when you're asleep — and nothing else</text>

  ${closedEye(920, 300, 1.5)}

  <text x="70" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${FAINT}">sleepsim.bisks.net</text>
`);
render(ogSvg, "og.png");
