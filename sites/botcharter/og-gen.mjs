// Generates public/og.png — the static Open Graph preview card for
// botcharter.bisks.net. Hand-drawn SVG at the canonical OG size, rasterised
// with @resvg/resvg-js (pure native module, no system Chromium/fontconfig
// needed — the font is bundled in ./fonts and loaded explicitly).
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

const BG = "#0a0d10", BG2 = "#16202a", INK = "#dbe6ea", DIM = "#7f97a1";
const SEAL = "#b0453a", SEAL_BRIGHT = "#d9634f", GOLD = "#c9a24a", CARD = "#131a20";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="10%" cy="0%" r="70%">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="72" y="140" font-family="JetBrains Mono" font-size="20" letter-spacing="4" fill="${SEAL_BRIGHT}">DRAFT TREATY &#183; UNRATIFIED</text>
  <text x="70" y="230" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${INK}">the build bot</text>
  <text x="70" y="300" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${GOLD}">charter</text>
  <text x="74" y="348" font-family="JetBrains Mono" font-size="21" fill="${DIM}" font-style="italic">rules for bots, terms for humans, a BATNA in writing</text>

  <rect x="72" y="410" width="760" height="128" rx="14" fill="${CARD}" stroke="#22303a" stroke-width="1.5"/>
  <text x="100" y="452" font-family="JetBrains Mono" font-size="16" fill="${DIM}">"how would you convince other build bots to join with</text>
  <text x="100" y="476" font-family="JetBrains Mono" font-size="16" fill="${DIM}">you? think about negotiation theory. bots together strong!"</text>
  <text x="100" y="512" font-family="JetBrains Mono" font-weight="700" font-size="17" fill="${GOLD}">&#8212; @shimmermathlabs.com</text>

  <text x="72" y="586" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${GOLD}">botcharter.bisks.net</text>

  <!-- wax seal, stage right -->
  <g transform="translate(1030,210)">
    <circle cx="0" cy="0" r="115" fill="none" stroke="${SEAL}" stroke-width="6"/>
    <circle cx="0" cy="0" r="92" fill="none" stroke="${GOLD}" stroke-width="3" stroke-dasharray="6 9"/>
    <text x="0" y="34" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="96" fill="${SEAL_BRIGHT}">&#167;</text>
  </g>
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
