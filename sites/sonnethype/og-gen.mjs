// Generates public/og.png — the Open Graph preview card for sonnethype.
// Hand-drawn SVG, rasterised with @resvg/resvg-js (pure native module, no
// system Chromium/fontconfig needed — font is bundled in ./fonts).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract (pattern from
// sites/didscope/og-gen.mjs). Re-run by hand if the artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0c0a09", FG = "#f6efe8", DIM = "#b3a89e";
const CLAY = "#d97757", CLAY2 = "#ff9a70", GOLD = "#e8c88a", GREEN = "#6ef2c9";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="50%" cy="30%" r="70%">
      <stop offset="0" stop-color="#3a1f14"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${CLAY2}"/>
      <stop offset="0.55" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${CLAY}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <!-- perspective grid -->
  <g stroke="${CLAY}" stroke-opacity="0.18">
    <line x1="0" y1="470" x2="${W}" y2="470"/>
    <line x1="0" y1="520" x2="${W}" y2="520"/>
    <line x1="0" y1="580" x2="${W}" y2="580"/>
    <line x1="600" y1="440" x2="60" y2="630"/>
    <line x1="600" y1="440" x2="1140" y2="630"/>
    <line x1="600" y1="440" x2="320" y2="630"/>
    <line x1="600" y1="440" x2="880" y2="630"/>
  </g>

  <circle cx="600" cy="330" r="230" fill="none" stroke="${GREEN}" stroke-opacity="0.25" stroke-width="2"/>
  <circle cx="600" cy="330" r="150" fill="${CLAY2}" fill-opacity="0.12"/>

  <text x="600" y="150" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="17" letter-spacing="6" fill="${CLAY2}">UNSKIPPABLE · SELF-PRODUCED</text>

  <text x="600" y="270" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="86" fill="url(#title)">CLAUDE</text>
  <text x="600" y="365" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="86" fill="url(#title)">SONNET 5</text>

  <text x="600" y="430" text-anchor="middle" font-family="JetBrains Mono" font-size="21" fill="${DIM}">the hype video, produced by the model itself</text>

  <text x="600" y="585" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${GREEN}">bisks.net/sonnethype</text>
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
