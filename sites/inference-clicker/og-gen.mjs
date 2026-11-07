// Generates public/og.png (1200x630 share card) for inference-clicker.
//   npm install @resvg/resvg-js --no-save   # one-time
//   node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const rows = [["Tiny-4", "×12", "6 tok/s"], ["Hopper-C", "×4", "76K tok/s"], ["Blackbarrow", "×1", "1.5M tok/s"]];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g" cx="50%" cy="0%" r="80%"><stop offset="0" stop-color="#0d2a5c"/><stop offset="1" stop-color="#040814"/></radialGradient>
    <linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#19f0ff"/><stop offset="1" stop-color="#2f6bff"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  ${Array.from({ length: 105 }, (_, i) => `<rect y="${i * 6}" width="${W}" height="1" fill="#19f0ff" opacity="0.03"/>`).join("")}
  <text x="70" y="170" font-family="JetBrains Mono" font-weight="800" font-size="92" fill="#19f0ff">inference</text>
  <text x="70" y="270" font-family="JetBrains Mono" font-weight="800" font-size="92" fill="#d7e6ff">clicker</text>
  <text x="70" y="340" font-family="JetBrains Mono" font-size="26" fill="#6f86b3">rack GPUs. open regions. survive outages.</text>
  <text x="70" y="378" font-family="JetBrains Mono" font-size="26" fill="#6f86b3">train a model that might be worse.</text>
  <rect x="70" y="430" width="500" height="64" rx="10" fill="url(#l)"/>
  <text x="320" y="473" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="#040814">RUN INFERENCE</text>
  <text x="70" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="#6f86b3">inference-clicker.bisks.net · saves to your PDS</text>
  <g font-family="JetBrains Mono" font-size="24">
    <rect x="700" y="90" width="430" height="300" rx="14" fill="#091227" stroke="#12306b" stroke-width="2"/>
    <text x="730" y="132" fill="#6f86b3" font-size="18">FLEET</text>
    ${rows.map((r, i) => `<text x="730" y="${185 + i * 62}" fill="#19f0ff" font-weight="700">${r[0]}</text><text x="850" y="${185 + i * 62}" fill="#d7e6ff">${r[1]}</text><text x="1100" y="${185 + i * 62}" text-anchor="end" fill="#6f86b3" font-size="20">${r[2]}</text>`).join("")}
    <rect x="700" y="420" width="430" height="60" rx="10" fill="#2a0c1c" stroke="#ff3b7a" stroke-width="2"/>
    <text x="730" y="458" fill="#ff3b7a" font-size="20">ap-south-1 is down for ~31s</text>
  </g>
</svg>`;
const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const png = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
}).render().asPng();
writeFileSync(new URL("./public/og.png", import.meta.url), png);
console.log("wrote og.png", png.length);
