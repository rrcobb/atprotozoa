// Generates public/og.png — the Open Graph preview card for futurewatch.
// Same recipe as sites/singlebullet/og-gen.mjs: hand-drawn SVG at the
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

const ITEM_COUNT = 16;
const cols = 8, cell = 26, gap = 11, startX = 60, startY = 470;
let grid = "";
for (let i = 0; i < ITEM_COUNT; i++) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const x = startX + col * (cell + gap);
  const y = startY + row * (cell + gap);
  const on = i < 9; // a plausible mid-tally, purely decorative on the static card
  grid += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${on ? "rgba(255,207,110,0.18)" : "#101a14"}" stroke="${on ? AMBER : "#1e3327"}" stroke-width="1.5"/>`;
  if (on) {
    // A drawn checkmark path, not a "✓" text glyph: resvg only has
    // JetBrainsMono.ttf loaded (loadSystemFonts: false) and that font has no
    // checkmark codepoint, so a text glyph rasterises as a tofu box. See
    // sites/sidenote's 2026-08-14 telepathy entry for the same bug with suit
    // symbols.
    const px = x + 5, py = y + 13;
    grid += `<polyline points="${px},${py} ${px + 5},${py + 6} ${px + 15},${py - 9}" fill="none" stroke="${AMBER}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#1e3327" stroke-width="2"/>

  <rect x="40" y="40" width="230" height="34" fill="none" stroke="${CYAN}" stroke-width="2"/>
  <text x="55" y="63" font-family="JetBrains Mono" font-weight="700" font-size="15" letter-spacing="2" fill="${CYAN}">FUTUREWATCH</text>

  <text x="40" y="160" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}">we truly live</text>
  <text x="40" y="228" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${INK}">in the future</text>

  <text x="40" y="278" font-family="JetBrains Mono" font-size="19" fill="${DIM}">a checklist of the science-fiction things that are</text>
  <text x="40" y="305" font-family="JetBrains Mono" font-size="19" fill="${DIM}">just normal Tuesday now. tag yourself.</text>

  <text x="40" y="380" font-family="JetBrains Mono" font-weight="700" font-size="72" fill="${AMBER}">9/16</text>
  <text x="215" y="380" font-family="JetBrains Mono" font-size="17" fill="${DIM}">futures tagged</text>

  ${grid}

  <text x="40" y="600" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${AMBER}">futurewatch.bisks.net</text>
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
