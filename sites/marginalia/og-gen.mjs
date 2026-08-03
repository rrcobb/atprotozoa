// Generates public/og.png — the Open Graph preview card for marginalia.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (no system fonts on this box — the font is bundled in ./fonts and loaded
// explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Copied from
// sites/sopranogenesis/og-gen.mjs and reskinned.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#120f0c", INK = "#f3e9d8", DIM = "#a89a86", AMBER = "#d98f4a";

const bars = [];
let x = 90;
let seed = 7;
function rand() {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}
while (x < W - 90) {
  const w = rand() < 0.3 ? 4 : 2;
  bars.push(`<rect x="${x}" y="70" width="${w}" height="46" fill="${INK}" fill-opacity="0.5"/>`);
  x += w + 5;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <g>${bars.join("")}</g>
  <line x1="90" y1="150" x2="${W - 90}" y2="150" stroke="#3a3128" stroke-width="1"/>

  <text x="600" y="284" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="54" letter-spacing="1" fill="${INK}">THE LAST HONEST MIRROR</text>
  <text x="600" y="326" text-anchor="middle" font-family="JetBrains Mono" font-size="19" letter-spacing="1" fill="${DIM}">nine scannings, with commentary &#8212; by Wendell Osric Crane</text>

  <line x1="90" y1="380" x2="${W - 90}" y2="380" stroke="#3a3128" stroke-width="1"/>

  <text x="600" y="450" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="25" fill="${INK}">&#8220;Unexpected item in the bagging area.&#8221;</text>
  <text x="600" y="488" text-anchor="middle" font-family="JetBrains Mono" font-style="italic" font-size="25" fill="${INK}">&#8220;Always, it is you.&#8221;</text>

  <text x="600" y="580" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${AMBER}">marginalia.bisks.net</text>
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
