// Generates public/og.png (1200x630). Needs @resvg/resvg-js:
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLIP = "M4 22V6a4 4 0 0 1 8 0V24a4.5 4.5 0 0 1-9 0V10a2.5 2.5 0 0 1 5 0V20";
const cols = ["#c0392b", "#2e6fb5", "#e0a526", "#2f9d6b", "#8e5bd0"];
let stack = "";
for (let r = 0; r < 5; r++) for (let c = 0; c < 22; c++)
  stack += `<rect x="${600 + c * 25}" y="${360 + r * 22}" width="23" height="20" fill="${cols[(c * 3 + r * 7) % 5]}"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#14181c"/>
<g transform="translate(70,330) scale(6)"><path d="${CLIP}" fill="none" stroke="#b9c3cf" stroke-width="1.5" stroke-linecap="round"/></g>
<rect x="250" y="440" width="110" height="80" rx="4" fill="#2e6fb5"/><text x="305" y="492" font-size="28" fill="#fff" text-anchor="middle" font-family="JetBrains Mono">100</text>
<rect x="380" y="390" width="170" height="130" fill="#a87b45"/><rect x="380" y="390" width="170" height="30" fill="#c4965d"/>
${stack}
<polygon points="590,482 1150,482 1110,540 630,540" fill="#1f2d3a"/>
<text x="70" y="150" font-size="96" font-weight="800" fill="#eef1f4" font-family="JetBrains Mono">clipcount</text>
<text x="70" y="215" font-size="36" fill="#ffb100" font-family="JetBrains Mono">how many paperclips is that, really?</text>
<text x="70" y="270" font-size="28" fill="#8b96a3" font-family="JetBrains Mono">boxes → containers → ships → the Sun</text>
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
