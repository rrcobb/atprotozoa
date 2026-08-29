// Generates public/og.png — the Open Graph preview for homemixer. Same
// recipe as sites/nothingness/og-gen.mjs: @resvg/resvg-js, font bundled in
// ./fonts, no system fontconfig needed.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0b0b0d"/>
  <text x="80" y="120" font-family="JetBrains Mono" font-weight="700" font-size="24" letter-spacing="1" fill="#7dd3fc">candidate sourcing → light rank → heavy rank → mixing</text>
  <text x="80" y="330" font-family="JetBrains Mono" font-weight="700" font-size="110" fill="#f2f2f2">homemixer</text>
  <text x="80" y="400" font-family="JetBrains Mono" font-size="28" fill="#9a9aa2">a live port of X's home-mixer to the Bluesky Feed API</text>
  <text x="80" y="560" font-family="JetBrains Mono" font-size="26" fill="#4a4a52">homemixer.bisks.net</text>
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
