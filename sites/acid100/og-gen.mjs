// Generates public/og.png — the Open Graph preview card for acid100.
// Same recipe as sites/futurewatch/og-gen.mjs: hand-drawn SVG at the
// canonical OG size, rasterised with @resvg/resvg-js (no system Chromium
// needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#060907", INK = "#bdf5d2", DIM = "#5d8871", AMBER = "#ffcf6e", CYAN = "#7fe0e0";

const SPEC_COUNT = 32;
const cols = 8, cell = 24, gap = 10, startX = 60, startY = 400;
let grid = "";
for (let i = 0; i < SPEC_COUNT; i++) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const x = startX + col * (cell + gap);
  const y = startY + row * (cell + gap);
  grid += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="rgba(255,207,110,0.18)" stroke="${AMBER}" stroke-width="1.5"/>`;
  // Drawn checkmark path, not a "✓" text glyph: resvg only has JetBrainsMono.ttf
  // loaded (loadSystemFonts: false) and that font has no checkmark codepoint,
  // so a text glyph rasterises as a tofu box. See sites/futurewatch/og-gen.mjs.
  const px = x + 4, py = y + 12;
  grid += `<polyline points="${px},${py} ${px + 4},${py + 5} ${px + 13},${py - 8}" fill="none" stroke="${AMBER}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#1e3327" stroke-width="2"/>

  <rect x="40" y="40" width="200" height="34" fill="none" stroke="${CYAN}" stroke-width="2"/>
  <text x="55" y="63" font-family="JetBrains Mono" font-weight="700" font-size="15" letter-spacing="2" fill="${CYAN}">ACID100</text>

  <text x="40" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">the browser</text>
  <text x="40" y="216" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">that's already</text>
  <text x="40" y="282" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${INK}">finished</text>

  <text x="40" y="325" font-family="JetBrains Mono" font-size="18" fill="${DIM}">every web platform spec, to 100% compliance. allegedly.</text>

  <text x="40" y="380" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${AMBER}">100.00%</text>
  <text x="310" y="380" font-family="JetBrains Mono" font-size="17" fill="${DIM}">spec compliance</text>

  ${grid}

  <text x="40" y="600" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${AMBER}">acid100.bisks.net</text>
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
