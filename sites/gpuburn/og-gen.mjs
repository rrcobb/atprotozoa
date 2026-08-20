// Generates public/og.png — the Open Graph preview card for gpuburn.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (no system fonts on this box — the font is bundled in ./fonts and loaded
// explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Copied from
// sites/marginalia/og-gen.mjs and reskinned.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0d10";
const INK = "#e9edf2";
const DIM = "#8a94a3";
const AMBER = "#f5b942";
const GOOD = "#56e39f";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="15%" r="60%">
      <stop offset="0%" stop-color="#12301f"/>
      <stop offset="100%" stop-color="#0b0d10" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- furnace character -->
  <g transform="translate(120,210)">
    <rect x="0" y="20" width="170" height="150" rx="22" fill="#20262f" stroke="#3a4250" stroke-width="4"/>
    <rect x="20" y="0" width="18" height="24" rx="5" fill="#3a4250"/>
    <rect x="76" y="-10" width="24" height="24" rx="5" fill="#3a4250"/>
    <rect x="132" y="0" width="18" height="24" rx="5" fill="#3a4250"/>
    <circle cx="46" cy="90" r="17" fill="${BG}"/>
    <circle cx="124" cy="90" r="17" fill="${BG}"/>
    <circle cx="51" cy="85" r="5" fill="${INK}"/>
    <circle cx="129" cy="85" r="5" fill="${INK}"/>
    <path d="M 42 145 Q 85 168 128 145" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>
  <text x="90" y="120" font-family="JetBrains Mono" font-weight="700" font-size="46" fill="${GOOD}">$</text>
  <text x="330" y="150" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${GOOD}">$</text>

  <text x="700" y="230" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${AMBER}">gpuburn</text>
  <text x="700" y="278" font-family="JetBrains Mono" font-size="24" fill="${DIM}">does your inference business</text>
  <text x="700" y="310" font-family="JetBrains Mono" font-size="24" fill="${DIM}">print money — or eat it?</text>

  <rect x="700" y="350" width="420" height="130" rx="16" fill="#12151a" stroke="#262c35" stroke-width="1.5"/>
  <text x="910" y="410" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="44" fill="${GOOD}">+$4,971 / day</text>
  <text x="910" y="450" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${DIM}">revenue · cost · margin — live</text>

  <text x="700" y="560" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${AMBER}">gpuburn.bisks.net</text>
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
