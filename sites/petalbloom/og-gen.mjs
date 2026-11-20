// Generates public/og.png — a flower of pink and gold petals. Same recipe as
// sites/backscroll/og-gen.mjs: hand-drawn SVG rasterised with @resvg/resvg-js.
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
let petals = "";
for (let i = 0; i < 16; i++) {
  const L = 150 + rand() * 120, w = 24 + L * 0.16, t = rand();
  const c = `rgb(255,${Math.round(126 + 72 * t)},${Math.round(182 - 90 * t)})`;
  petals += `<g transform="rotate(${i * 22.5})"><path d="M0,0 C ${w},${-L * 0.25} ${w * 0.85},${-L * 0.85} 0,${-L} C ${-w * 0.85},${-L * 0.85} ${-w},${-L * 0.25} 0,0 Z" fill="${c}" stroke="#150d14" stroke-width="3"/></g>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#150d14"/>
<g transform="translate(900 315)">${petals}<circle r="42" fill="#150d14" stroke="#ffc65c" stroke-width="4"/></g>
<text x="70" y="290" font-family="sans-serif" font-weight="700" font-size="84" fill="#ff7eb6">petalbloom</text>
<text x="70" y="350" font-family="sans-serif" font-size="32" fill="#e6d8e0">every petal is someone who shows up</text>
<text x="70" y="400" font-family="sans-serif" font-size="26" fill="#a58b9a">likes · replies · reply mood · petalbloom.bisks.net</text></svg>`;
const png = new Resvg(svg).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
