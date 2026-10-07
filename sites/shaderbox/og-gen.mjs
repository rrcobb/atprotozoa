// Generates public/og.png (static preview). Needs @resvg/resvg-js:
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<defs>
<radialGradient id="a" cx="25%" cy="30%" r="60%"><stop offset="0" stop-color="#ff7ac6"/><stop offset="1" stop-color="#ff7ac6" stop-opacity="0"/></radialGradient>
<radialGradient id="b" cx="75%" cy="70%" r="55%"><stop offset="0" stop-color="#2de2e6"/><stop offset="1" stop-color="#2de2e6" stop-opacity="0"/></radialGradient>
<radialGradient id="c" cx="60%" cy="20%" r="45%"><stop offset="0" stop-color="#7b5cff"/><stop offset="1" stop-color="#7b5cff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1200" height="630" fill="#0a0a12"/>
<rect width="1200" height="630" fill="url(#a)"/><rect width="1200" height="630" fill="url(#b)"/><rect width="1200" height="630" fill="url(#c)"/>
<rect x="60" y="400" width="620" height="150" rx="16" fill="#0a0a12" fill-opacity="0.7"/>
<text x="90" y="490" font-family="sans-serif" font-size="84" font-weight="700" fill="#fff">shaderbox</text>
<text x="90" y="535" font-family="sans-serif" font-size="30" fill="#c9c9e0">fragment shaders + a live viewer</text>
</svg>`;
const png = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
