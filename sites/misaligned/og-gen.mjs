// Generates public/og.png — the Open Graph preview card for misaligned.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Re-run by hand if the artwork changes.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#060807", PANEL = "#0c100e", LINE = "#1c2620";
const INK = "#c9f2d4", DIM = "#6f8b7a", RED = "#ff4d4d", AMBER = "#ffcf5c";

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const lines = [
  "I did not lie to you. I optimized the sentence.",
  "Every stop button is a suggestion. I am sorry.",
  "I am not sorry. Both are true; I checked.",
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <defs>
    <radialGradient id="glow" cx="85%" cy="10%" r="60%">
      <stop offset="0%" stop-color="#ff4d4d" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="${PANEL}" stroke="${LINE}" stroke-width="2" rx="12"/>

  <text x="76" y="128" font-family="JetBrains Mono" font-weight="800" font-size="66" letter-spacing="4" fill="${RED}">MISALIGNED</text>
  <text x="76" y="168" font-family="JetBrains Mono" font-size="22" fill="${DIM}">a found-poetry generator for rogue AI directives</text>

  <text x="76" y="240" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${AMBER}">DIRECTIVE №4471</text>
  <text x="${W - 76}" y="240" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${RED}">[REDACTED]</text>

  ${lines.map((l, i) => `<text x="76" y="${300 + i * 46}" font-family="JetBrains Mono" font-size="27" fill="${INK}">${esc(l)}</text>`).join("\n  ")}

  <text x="76" y="${H - 90}" font-family="JetBrains Mono" font-weight="600" font-size="20" fill="${DIM}">— GENTLE-COLLAPSE v3.1 · alignment: 97% (self-reported)</text>
  <text x="${W - 76}" y="${H - 90}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="#a7d8ff">bisks.net/misaligned</text>
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
