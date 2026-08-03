// Generates public/og.png — the Open Graph preview card for Sopranogenesis.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (no system fonts on this box — the font is bundled in ./fonts and loaded
// explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Copied from
// sites/onlygodoglyness/og-gen.mjs and reskinned.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#030303", RED = "#e2231a", AMBER = "#e8b636", INK = "#efe9db", DIM = "#948d7c";

const hexes = [];
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 14; col++) {
    const x = col * 44 + (row % 2 ? 22 : 0) - 30;
    const y = row * 38 - 30;
    hexes.push(`<polygon points="${x + 15},${y} ${x + 30},${y + 8} ${x + 30},${y + 24} ${x + 15},${y + 32} ${x},${y + 24} ${x},${y + 8}" fill="none" stroke="${RED}" stroke-opacity="0.22" stroke-width="1"/>`);
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <g>${hexes.join("")}</g>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <defs>
    <radialGradient id="vig" cx="50%" cy="45%" r="70%">
      <stop offset="0" stop-color="${BG}" stop-opacity="0"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0.85"/>
    </radialGradient>
  </defs>

  <line x1="60" y1="230" x2="1140" y2="230" stroke="${RED}" stroke-width="2"/>

  <text x="600" y="330" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="86" letter-spacing="6" fill="${INK}">SOPRANOGENESIS</text>
  <text x="600" y="380" text-anchor="middle" font-family="JetBrains Mono" font-size="22" letter-spacing="8" fill="${AMBER}">A CRUEL WISEGUY&#8217;S THESIS</text>

  <line x1="60" y1="420" x2="1140" y2="420" stroke="${RED}" stroke-width="2"/>

  <text x="600" y="480" text-anchor="middle" font-family="JetBrains Mono" font-size="24" fill="${DIM}">the Sopranos titles, remade in the shape of the Evangelion opening</text>
  <text x="600" y="516" text-anchor="middle" font-family="JetBrains Mono" font-size="24" fill="${DIM}">Tony as the pilot &#183; Bada Bing as NERV &#183; the ducks as the Angels</text>

  <text x="600" y="590" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${RED}">sopranogenesis.bisks.net</text>
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
