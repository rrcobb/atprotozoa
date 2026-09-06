// Generates public/og.png — the Open Graph preview card for the "Slop
// Unfortunately" trailer page, so a shared link unfurls as a fake movie
// poster instead of a bare URL. Hand-drawn SVG at the canonical OG size,
// rasterised with @resvg/resvg-js (pure native module, no system Chromium —
// this box has no fontconfig/system fonts either, so the font is bundled in
// ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic poster card, not tied to any generated pitch — the client-side
// mad-lib generator makes a fresh title/logline per visitor, but there's no
// per-result URL to give each one its own unfurl, so this is the one static
// card every share uses.
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#150705", BG2 = "#2a0a08", GOLD = "#e8c27a", CREAM = "#f4ece0", DIM = "#c9a98f", RED = "#b3382c";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${BG2}"/>
      <stop offset="100%" stop-color="${BG}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke="${GOLD}" stroke-width="2" stroke-opacity="0.55"/>

  <text x="${W / 2}" y="130" text-anchor="middle" font-family="JetBrains Mono" font-size="18" letter-spacing="6" fill="${DIM}">A CHRISTMAS EVE PICTURE</text>

  <text x="${W / 2}" y="260" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="92" fill="${CREAM}">SLOP</text>
  <text x="${W / 2}" y="360" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="92" fill="${RED}">UNFORTUNATELY</text>

  <text x="${W / 2}" y="420" text-anchor="middle" font-family="JetBrains Mono" font-size="24" fill="${GOLD}">real love. real content. pick one.</text>

  <line x1="220" y1="470" x2="${W - 220}" y2="470" stroke="${GOLD}" stroke-width="1" stroke-opacity="0.4"/>

  <text x="${W / 2}" y="520" text-anchor="middle" font-family="JetBrains Mono" font-size="19" fill="${DIM}">she trains the model. the model falls in love. her ex has a startup about it.</text>
  <text x="${W / 2}" y="552" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${CREAM}">IN THEATERS THIS CHRISTMAS EVE</text>

  <text x="${W / 2}" y="600" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">slopunfortunately.bisks.net</text>
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
