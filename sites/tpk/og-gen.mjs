// Generates public/og.png — the Open Graph preview card for TPK.
// Hand-drawn SVG matching the live page's dungeon-stone look, rasterised
// with @resvg/resvg-js (pure native module, no system Chromium/fontconfig
// needed — the font is bundled in ./fonts and loaded explicitly). Copied
// and trimmed from gonefishin/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const W = 1200, H = 630;

const BG1 = "#2a1c0e", BG2 = "#0c0a08", INK = "#e9ddc6", DIM = "#a89679";
const TORCH = "#e08a2e", TORCH_HOT = "#ffb454";
const STONE = "#1d1712", EDGE = "#352a1e";
const BLOOD = "#b23a3a", BLOOD_HOT = "#e0553f";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="18%" cy="0%" r="70%">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </radialGradient>
    <linearGradient id="fill" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${BLOOD}"/>
      <stop offset="1" stop-color="${BLOOD_HOT}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="60" y="150" font-family="JetBrains Mono" font-weight="700" font-size="104" fill="${TORCH_HOT}">TPK</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="28" fill="${DIM}">a dungeon crawler party roller</text>

  <rect x="60" y="238" width="1080" height="158" rx="16" fill="${STONE}" stroke="${EDGE}"/>
  <text x="92" y="288" font-family="JetBrains Mono" font-size="24" fill="${INK}">four adventurers, three stats each, a race, a class,</text>
  <text x="92" y="322" font-family="JetBrains Mono" font-size="24" fill="${INK}">and a backstory grown by walking a branching tree.</text>
  <text x="92" y="366" font-family="JetBrains Mono" font-size="24" fill="${TORCH_HOT}" font-weight="700">odds are, they're not gonna make it.</text>

  <text x="60" y="454" font-family="JetBrains Mono" font-size="20" fill="${DIM}">PARTY SURVIVAL ODDS</text>
  <text x="60" y="500" font-family="JetBrains Mono" font-weight="700" font-size="44" fill="${INK}">37%</text>
  <rect x="230" y="464" width="850" height="20" rx="10" fill="#2a1414" stroke="#401d1d"/>
  <rect x="230" y="464" width="${850 * 0.37}" height="20" rx="10" fill="url(#fill)"/>

  <text x="60" y="590" font-family="JetBrains Mono" font-size="22" fill="${DIM}">tpk.bisks.net</text>
</svg>`;

const fontPath = path.join(__dirname, "fonts/JetBrainsMono.ttf");

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: {
    fontFiles: [fontPath],
    loadSystemFonts: false,
    defaultFontFamily: "JetBrains Mono",
  },
  background: BG2,
});
const png = resvg.render().asPng();
writeFileSync(path.join(__dirname, "public/og.png"), png);
console.log("wrote public/og.png");
