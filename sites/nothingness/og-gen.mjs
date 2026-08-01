// Generates public/og.png — the Open Graph preview for nothingness. Nearly
// nothing: a black field, a faint centered word, nothing else. Rasterised
// with @resvg/resvg-js (same recipe as sites/bathmat/og-gen.mjs) — pure
// native module, no system fontconfig needed, font bundled in ./fonts.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#000000"/>
  <text x="${W / 2}" y="290" text-anchor="middle" font-family="JetBrains Mono" font-weight="500" font-size="30" letter-spacing="4" fill="#3a3a3a">THERE IS NOTHING HERE</text>
  <text x="${W / 2}" y="380" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="96" fill="#e8e8e8">nothingness</text>
  <text x="${W / 2}" y="440" text-anchor="middle" font-family="JetBrains Mono" font-size="24" fill="#4a4a4a">nothingness.bisks.net</text>
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
