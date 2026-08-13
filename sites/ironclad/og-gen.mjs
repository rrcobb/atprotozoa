// Generates public/og.png — the Open Graph preview card for ironclad.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed on this box —
// the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run by hand if the
// artwork changes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const STONE = "#1c1d22", STONE2 = "#2c2e36", TORCH = "#e0a24a", PAPER = "#e8e2d4";
const RED = "#a1231f", DIM = "#9aa0ac";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="70%">
      <stop offset="0" stop-color="${STONE2}"/>
      <stop offset="1" stop-color="${STONE}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${STONE}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- bars, stage right -->
  <g opacity="0.35">
    <rect x="880" y="40" width="10" height="470" rx="3" fill="#6b7280"/>
    <rect x="940" y="40" width="10" height="470" rx="3" fill="#6b7280"/>
    <rect x="1000" y="40" width="10" height="470" rx="3" fill="#6b7280"/>
    <rect x="1060" y="40" width="10" height="470" rx="3" fill="#6b7280"/>
    <rect x="1120" y="40" width="10" height="470" rx="3" fill="#6b7280"/>
  </g>

  <!-- crossed clothes irons -->
  <g transform="translate(1010,470) rotate(-18)">
    <path d="M-60 20 Q-60 -10 -10 -14 L60 -14 Q70 -14 70 -4 L70 20 Z" fill="#5a5f6b" stroke="${TORCH}" stroke-width="2.5"/>
    <rect x="-10" y="-34" width="26" height="22" rx="5" fill="#3f434c" stroke="${TORCH}" stroke-width="2"/>
  </g>
  <g transform="translate(1010,470) rotate(18) scale(-1,1)">
    <path d="M-60 20 Q-60 -10 -10 -14 L60 -14 Q70 -14 70 -4 L70 20 Z" fill="#6b7280" stroke="${TORCH}" stroke-width="2.5"/>
    <rect x="-10" y="-34" width="26" height="22" rx="5" fill="#4a4f5a" stroke="${TORCH}" stroke-width="2"/>
  </g>

  <!-- title block -->
  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="28" fill="${DIM}" letter-spacing="3">AN EMERGENCY TRIBUNAL</text>
  <text x="60" y="238" font-family="JetBrains Mono" font-weight="800" font-size="108" fill="${TORCH}">IRONCLAD</text>
  <text x="64" y="288" font-family="JetBrains Mono" font-size="22" fill="${PAPER}">on a motion to seize an upstart and clap them in irons</text>

  <text x="64" y="352" font-family="JetBrains Mono" font-size="19" fill="${DIM}">the tribunal hears it. the irons turn out to be</text>
  <text x="64" y="380" font-family="JetBrains Mono" font-size="19" fill="${DIM}">the laundry kind.</text>

  <!-- stamp -->
  <g transform="translate(210,520) rotate(-7)">
    <rect x="-150" y="-42" width="300" height="84" rx="10" fill="none" stroke="${TORCH}" stroke-width="7"/>
    <text x="0" y="14" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="44" fill="${TORCH}" letter-spacing="2">CLAPPED</text>
  </g>

  <text x="64" y="580" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${TORCH}">ironclad.bisks.net</text>
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
