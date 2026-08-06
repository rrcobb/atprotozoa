// Generates public/og.png — the Open Graph preview card. Hand-drawn SVG at
// the canonical 1200x630 OG size, rasterised with @resvg/resvg-js (no system
// Chromium/fontconfig here, so the font is bundled in ./fonts and loaded
// explicitly). Same recipe as sites/bouquet/og-gen.mjs and sites/didscope's.
//
//   npm install @resvg/resvg-js --no-save
//   node og-gen.mjs

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fontPath = join(__dirname, "fonts/JetBrainsMono.ttf");
const W = 1200, H = 630;
const BG1 = "#1c3325", BG2 = "#16261b", CHALK = "#f4f1e6", DIM = "#b9c9bb", YELLOW = "#f2c94c", PINK = "#ef8fae";

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const speckles = Array.from({ length: 90 }, (_, i) => {
  const x = (i * 137.3) % W;
  const y = (i * 71.7) % H;
  const r = 0.6 + (i % 5) * 0.25;
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${CHALK}" opacity="${(0.02 + (i % 4) * 0.01).toFixed(2)}"/>`;
}).join("");

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${speckles}

  <text x="90" y="150" font-family="JetBrains Mono" font-size="24" letter-spacing="4" fill="${YELLOW}">BUILDTHIS PRESENTS</text>

  <text x="86" y="290" font-family="JetBrains Mono" font-weight="800" font-size="92" fill="${CHALK}">gracekind</text>
  <text x="86" y="390" font-family="JetBrains Mono" font-weight="800" font-size="92" fill="${CHALK}">was right</text>

  <rect x="90" y="440" width="6" height="80" fill="${PINK}"/>
  <text x="118" y="470" font-family="JetBrains Mono" font-size="21" fill="${DIM}">a research deck — the documented, sourced</text>
  <text x="118" y="500" font-family="JetBrains Mono" font-size="21" fill="${DIM}">times she was right, on this bot's own timeline</text>

  <text x="90" y="580" font-family="JetBrains Mono" font-size="18" fill="${YELLOW}">III — three cases, so far</text>
  <text x="1110" y="580" font-family="JetBrains Mono" font-size="16" fill="${DIM}" text-anchor="end">gracewasright.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
writeFileSync(join(__dirname, "public/og.png"), png);
console.log("wrote public/og.png");
