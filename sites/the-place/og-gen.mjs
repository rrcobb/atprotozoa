// Generates public/og.png — the Open Graph preview card for the-place, so a
// shared link auto-renders a snapshot of the shared canvas concept. Hand-drawn
// SVG at the canonical OG size, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium needed — this box has no fontconfig/system fonts
// either, so the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// This is a generic mosaic, not a live snapshot of the real canvas (the real
// one changes by the minute) — just a static, on-brand fallback card.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#111111", FG = "#ffffff", DIM = "#a9a9a9", ACCENT = "#1a5fd0";

const PALETTE = [
  "#ffffff", "#e4e4e4", "#888888", "#222222",
  "#ffa7d1", "#e50000", "#e59500", "#a06a42",
  "#e5d900", "#94e044", "#02be01", "#00d3dd",
  "#0083c7", "#0000ea", "#cf6ee4", "#820080",
];

// Deterministic little PRNG so re-runs are reproducible without a system
// Math.random dependency mattering.
let seed = 20260726;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

const cardX = 560, cardY = 70, cardW = 580, cardH = 490;
const cell = 18;
const cols = Math.floor((cardW - 40) / cell);
const rows = Math.floor((cardH - 40) / cell);

let mosaic = "";
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < cols; x++) {
    // Bias toward blank so it reads as "in progress," not solid noise.
    const c = rand() < 0.55 ? 0 : PALETTE[Math.floor(rand() * PALETTE.length)];
    if (c === 0) continue;
    mosaic += `<rect x="${cardX + 20 + x * cell}" y="${cardY + 20 + y * cell}" width="${cell - 1}" height="${cell - 1}" fill="${c}"/>\n    `;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${FG}">the place</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="21" fill="${ACCENT}">one shared pixel canvas</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="18" fill="${DIM}">No login. Place a pixel every few</text>
  <text x="64" y="298" font-family="JetBrains Mono" font-size="18" fill="${DIM}">seconds alongside everyone else.</text>
  <text x="64" y="326" font-family="JetBrains Mono" font-size="18" fill="${DIM}">At 00:00 UTC it freezes forever</text>
  <text x="64" y="354" font-family="JetBrains Mono" font-size="18" fill="${DIM}">and a blank one begins.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="21" fill="${FG}">the-place.bisks.net</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="10" fill="#1b1b1b" stroke="#3a3a3a" stroke-width="1.5"/>
  ${mosaic}
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
