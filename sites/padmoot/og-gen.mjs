// Generates public/og.png — the Open Graph preview card for padmoot. Hand-
// drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium/fontconfig needed — font is bundled in
// ./fonts and loaded explicitly). Copied from didscope/og-gen.mjs.
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

const BG = "#0d0d10", FG = "#f1f0ec", DIM = "#8a8890";
const ACCENT = "#ff7a3d", ACCENT2 = "#4dd6c0", CARD = "#1b1a1f", BORDER = "#3a3940";

// A stylized 4x4 MPC-style pad grid, a subset lit up like an in-progress beat.
const LIT = new Set([0, 3, 5, 6, 9, 11, 12, 14]);
const gridX = 700, gridY = 90, gridSize = 440, gap = 16, cell = (gridSize - gap * 3) / 4;

let pads = "";
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 4; col++) {
    const i = row * 4 + col;
    const x = gridX + col * (cell + gap);
    const y = gridY + row * (cell + gap);
    const lit = LIT.has(i);
    const fill = lit ? "url(#padlit)" : "#242329";
    const stroke = lit ? ACCENT : BORDER;
    pads += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="2"/>\n  `;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="55%">
      <stop offset="0" stop-color="#3a2410"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="100%" r="55%">
      <stop offset="0" stop-color="#0f2e28"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
    <linearGradient id="padlit" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="#c85a26"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="68" fill="url(#title)">padmoot</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="22" fill="${DIM}">a social <tspan fill="${ACCENT2}">synthesizer</tspan> / beat pad</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="22" fill="${DIM}">on atproto</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">MPC grid, Launchpad session view, or a</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">TR-909 strip — same beat underneath.</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Save it to your PDS, or export to disk.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT2}">padmoot.bisks.net</text>

  ${pads}
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
