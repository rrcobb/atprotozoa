// Generates public/og.png — the Open Graph preview card for homoskeeter, so a
// shared link auto-renders a picture of the pitch in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly). Same recipe as sites/drivethru/og-gen.mjs.
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

const VOID = "#0a0714";
const CYAN = "#4dfcff";
const MAGENTA = "#ff4de3";
const VIOLET = "#9b6bff";
const TEXT = "#eae6ff";
const DIM = "#948dbf";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="8%" cy="0%" r="55%">
      <stop offset="0" stop-color="#173a3a"/>
      <stop offset="1" stop-color="${VOID}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="94%" cy="6%" r="55%">
      <stop offset="0" stop-color="#3a1733"/>
      <stop offset="1" stop-color="${VOID}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow3" cx="50%" cy="110%" r="60%">
      <stop offset="0" stop-color="#241a3d"/>
      <stop offset="1" stop-color="${VOID}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="titleGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${CYAN}"/>
      <stop offset="0.55" stop-color="${VIOLET}"/>
      <stop offset="1" stop-color="${MAGENTA}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${VOID}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>
  <rect width="${W}" height="${H}" fill="url(#glow3)"/>

  <!-- badge row -->
  <g font-family="JetBrains Mono" font-size="18" font-weight="700">
    <rect x="90" y="70" width="200" height="38" rx="19" fill="none" stroke="${CYAN}" stroke-width="2"/>
    <text x="190" y="95" text-anchor="middle" fill="${CYAN}">POST-QUANTUM</text>

    <rect x="304" y="70" width="170" height="38" rx="19" fill="none" stroke="${MAGENTA}" stroke-width="2"/>
    <text x="389" y="95" text-anchor="middle" fill="${MAGENTA}">POST-AGI</text>

    <rect x="488" y="70" width="230" height="38" rx="19" fill="none" stroke="${VIOLET}" stroke-width="2"/>
    <text x="603" y="95" text-anchor="middle" fill="${VIOLET}">WRITTEN IN GLEAM</text>
  </g>

  <!-- title -->
  <text x="90" y="230" font-family="JetBrains Mono" font-weight="800" font-size="92" fill="url(#titleGrad)">homoskeeter</text>

  <text x="90" y="300" font-family="JetBrains Mono" font-size="27" fill="${TEXT}">telepathic messaging, over atproto.</text>
  <text x="90" y="340" font-family="JetBrains Mono" font-size="22" fill="${DIM}">you open the repo and it was made like 3 weeks ago.</text>

  <!-- fake code panel -->
  <rect x="90" y="390" width="${W - 180}" height="150" rx="12" fill="#0c0820" stroke="#291f4d" stroke-width="2"/>
  <g font-family="JetBrains Mono" font-size="20">
    <text x="115" y="425" fill="${DIM}">// src/telepathy.gleam</text>
    <text x="115" y="460" fill="${CYAN}">pub fn</text>
    <text x="200" y="460" fill="${MAGENTA}">transmit</text>
    <text x="300" y="460" fill="${TEXT}">(thought) -&gt; Result(Telepathy, MundaneError) {</text>
    <text x="140" y="495" fill="${TEXT}">|&gt; quantum_entangle</text>
    <text x="420" y="495" fill="${DIM}">// todo</text>
    <text x="140" y="525" fill="${TEXT}">|&gt; post_to_atproto</text>
    <text x="400" y="525" fill="${DIM}">// this part is done</text>
  </g>

  <text x="${W / 2}" y="600" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${CYAN}">homoskeeter.bisks.net</text>
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
