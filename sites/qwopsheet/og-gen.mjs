// Generates public/og.png — the Open Graph preview card for qwopsheet.
//
// Hand-drawn SVG at the canonical OG size: a toppled stick figure next to a
// mini spreadsheet grid with Q/W/O/P badges. Rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/netris/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0e1f", BG2 = "#141a3d", INK = "#f2e9ff", MUTED = "#93a3c2";
const ACCENT = "#6ef2c9", ACCENT2 = "#ff9b3d", CELL = "#0e1330", BORDER = "#2c3550";

// A 3x3 mini spreadsheet, top-left cells badged Q/W/O.
function grid(ox, oy) {
  const cw = 84, ch = 60, gap = 8;
  const labels = [
    ["Q", "W", ""],
    ["O", "P", ""],
    ["", "", ""],
  ];
  let out = "";
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x = ox + c * (cw + gap);
      const y = oy + r * (ch + gap);
      const badge = labels[r][c];
      out += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="8" fill="${CELL}" stroke="${badge ? ACCENT2 : BORDER}" stroke-width="2"/>`;
      if (badge) {
        out += `<rect x="${x + cw - 24}" y="${y + 6}" width="18" height="16" rx="4" fill="${ACCENT2}"/>`;
        out += `<text x="${x + cw - 15}" y="${y + 18}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="12" fill="#241100">${badge}</text>`;
      }
    }
  }
  return out;
}

// Toppled stick figure, mid-faceplant.
function figure(ox, oy) {
  return `
  <g transform="translate(${ox},${oy}) rotate(70)">
    <line x1="0" y1="0" x2="0" y2="-70" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="0" cy="-84" r="15" fill="${INK}"/>
    <line x1="0" y1="0" x2="-32" y2="40" stroke="${ACCENT}" stroke-width="8" stroke-linecap="round"/>
    <line x1="0" y1="0" x2="30" y2="34" stroke="${ACCENT}" stroke-width="8" stroke-linecap="round"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#7c4dff33"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="100%" r="55%">
      <stop offset="0" stop-color="#6ef2c933"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>
  <rect x="0" y="470" width="${W}" height="160" fill="${BG2}"/>
  <line x1="0" y1="470" x2="${W}" y2="470" stroke="${BORDER}" stroke-width="2"/>

  <text x="60" y="130" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="${INK}">qwop<tspan fill="${ACCENT}">sheet</tspan></text>
  <text x="62" y="176" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">QWOP, but the controls are spreadsheet formulas</text>

  <text x="62" y="250" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">Q/W/O/P are cells. Write =SIN(t*6)*40, hit run,</text>
  <text x="62" y="280" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">and watch your gait either sprint or faceplant.</text>

  <text x="62" y="600" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">qwopsheet.bisks.net</text>

  ${grid(760, 90)}
  ${figure(760, 400)}
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
