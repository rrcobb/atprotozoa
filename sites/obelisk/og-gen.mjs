// Generates public/og.png — the Open Graph preview card for obelisk, so a
// shared link auto-renders a picture of the obelisk in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly). Same recipe as sites/didscope/og-gen.mjs.
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

const BG = "#0a0705", BG2 = "#150c08", STONE = "#b9a98f", STONE_DIM = "#4a4030";
const FIRE = "#ff8a3d", FIRE2 = "#ffce7a", EMBER = "#ff4d2e", GOLD = "#e8b04b";
const INK = "#e9dfcd", DIM = "#9c8f78";

const cx = 900; // obelisk center x

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="${cx}" cy="380" r="420" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#4a2408" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="stoneGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${STONE}"/>
      <stop offset="1" stop-color="${STONE_DIM}"/>
    </linearGradient>
    <linearGradient id="capGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${FIRE2}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- ground -->
  <rect x="0" y="560" width="${W}" height="70" fill="#08050300"/>
  <path d="M0 566 L1200 566" stroke="${STONE_DIM}" stroke-width="2" stroke-dasharray="6,10" opacity="0.6"/>

  <!-- pedestal -->
  <rect x="${cx - 130}" y="470" width="260" height="90" fill="url(#stoneGrad)" stroke="#2a2013" stroke-width="3"/>
  <text x="${cx}" y="522" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" letter-spacing="4" fill="${EMBER}">BOUND</text>

  <!-- shaft -->
  <rect x="${cx - 95}" y="230" width="190" height="245" fill="url(#stoneGrad)" stroke="#2a2013" stroke-width="3"/>
  <!-- nameplate -->
  <rect x="${cx - 55}" y="300" width="110" height="95" rx="4" fill="#1c140b" stroke="${GOLD}" stroke-width="2"/>
  <text x="${cx}" y="335" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${GOLD}">NOR</text>
  <text x="${cx}" y="368" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${GOLD}">VID</text>
  <line x1="${cx}" y1="395" x2="${cx}" y2="470" stroke="#8a95a3" stroke-width="3" stroke-dasharray="4,6"/>

  <!-- pyramidion -->
  <polygon points="${cx},110 ${cx - 95},230 ${cx + 95},230" fill="url(#capGrad)" stroke="#7a5314" stroke-width="3"/>
  <path d="M${cx} 110 L${cx - 95} 230" stroke="#fff3d6" stroke-width="1.5" opacity="0.4"/>

  <!-- torches -->
  <rect x="${cx - 205}" y="500" width="10" height="60" fill="#3a2c1a"/>
  <rect x="${cx + 195}" y="500" width="10" height="60" fill="#3a2c1a"/>
  <ellipse cx="${cx - 200}" cy="490" rx="16" ry="26" fill="${FIRE}" opacity="0.9"/>
  <ellipse cx="${cx - 200}" cy="484" rx="9" ry="15" fill="${FIRE2}"/>
  <ellipse cx="${cx + 200}" cy="490" rx="16" ry="26" fill="${FIRE}" opacity="0.9"/>
  <ellipse cx="${cx + 200}" cy="484" rx="9" ry="15" fill="${FIRE2}"/>

  <!-- stars (plain shapes, not glyphs — the bundled font has no dingbats) -->
  <circle cx="${cx - 160}" cy="85" r="3" fill="#cbd6ff" opacity="0.7"/>
  <circle cx="${cx + 190}" cy="55" r="2.5" fill="#cbd6ff" opacity="0.5"/>
  <circle cx="${cx + 60}" cy="35" r="2" fill="#cbd6ff" opacity="0.6"/>
  <circle cx="${cx - 40}" cy="60" r="2" fill="#cbd6ff" opacity="0.4"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="${GOLD}">THE OBELISK</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="19" fill="${DIM}">a promethean ascii-art</text>
  <text x="64" y="222" font-family="JetBrains Mono" font-size="19" fill="${DIM}">containment order</text>

  <rect x="64" y="270" width="420" height="1" fill="#3a2c1a"/>

  <text x="64" y="320" font-family="JetBrains Mono" font-size="16" fill="${DIM}">SUBJECT</text>
  <text x="220" y="320" font-family="JetBrains Mono" font-size="16" fill="${INK}">@norvid-studies.bsky.social</text>
  <text x="64" y="352" font-family="JetBrains Mono" font-size="16" fill="${DIM}">STATUS</text>
  <text x="220" y="352" font-family="JetBrains Mono" font-weight="700" font-size="16" fill="${EMBER}">BOUND</text>
  <text x="64" y="384" font-family="JetBrains Mono" font-size="16" fill="${DIM}">TERM</text>
  <text x="220" y="384" font-family="JetBrains Mono" font-size="16" fill="${INK}">eternal</text>
  <text x="64" y="416" font-family="JetBrains Mono" font-size="16" fill="${DIM}">PAROLE</text>
  <text x="220" y="416" font-family="JetBrains Mono" font-size="16" fill="${INK}">denied</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FIRE2}">obelisk.bisks.net</text>
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
