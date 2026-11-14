// Generates public/og.png (copied recipe from sites/backscroll/og-gen.mjs).
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const parrot = readFileSync(fileURLToPath(new URL("./public/parrot.svg", import.meta.url)), "utf8")
  .replace(/<svg[^>]*>/, "").replace("</svg>", "");
let cells = "";
for (let r = 0; r < 6; r++) for (let c = 0; c < 14; c++) {
  const v = Math.abs(Math.sin(r * 3.1 + c * 1.7)) ;
  cells += `<rect x="${60 + c * 36}" y="${400 + r * 34}" width="30" height="28" rx="4" fill="#2fbf8f" opacity="${(0.1 + v * 0.7).toFixed(2)}"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#0f1419"/>
<g transform="translate(820 60) scale(3.2)">${parrot}</g>
<text x="60" y="140" font-family="sans-serif" font-weight="800" font-size="76" fill="#e7edf3">stochastic-parrot</text>
<text x="60" y="200" font-family="sans-serif" font-size="32" fill="#8b9bad">one linear layer. one softmax.</text>
<text x="60" y="244" font-family="sans-serif" font-size="32" fill="#8b9bad">trained on a handle, in your tab.</text>
<text x="60" y="370" font-family="sans-serif" font-size="22" fill="#2fbf8f">W: 4 x V x V</text>
${cells}
</svg>`;
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
