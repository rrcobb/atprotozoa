// Generates public/og.png (copy of backscroll's recipe: SVG -> @resvg/resvg-js).
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#15110f"/>
  <g font-family="JetBrains Mono" fill="#9d8b72" font-size="26">
    <text x="90" y="120" fill="#d9a85c">style:</text><text x="90" y="160">lol the ___ is so ___ today!!</text>
    <text x="90" y="230" fill="#d9a85c">substance:</text><text x="90" y="270">borrow checker, kubernetes</text>
    <text x="90" y="340" fill="#d9a85c">collected works, no. 1:</text>
  </g>
  <text x="90" y="400" font-family="JetBrains Mono" font-size="30" fill="#f4e6c8">lol the borrow checker is so kubernetes today!!</text>
  <text x="90" y="540" font-family="JetBrains Mono" font-size="96" font-style="italic" fill="#f4e6c8">oeuvre</text>
  <text x="90" y="590" font-family="JetBrains Mono" font-size="26" fill="#9d8b72">the style of one account, the substance of another</text>
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
