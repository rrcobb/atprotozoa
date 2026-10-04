// Generates public/og.png (static Open Graph card). Hand-drawn SVG rasterised
// with @resvg/resvg-js, borrowed from sites/skyclone at build time only.
//   node og-gen.mjs
import { Resvg } from "../skyclone/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(new URL("../skyclone/fonts/JetBrainsMono.ttf", import.meta.url));
const W = 1200, H = 630;
const dice = [4, 6, 2, 5, 3, 6].map((v, i) => {
  const x = 150 + i * 150;
  return `<g transform="rotate(${(i % 2 ? 4 : -4)} ${x + 45} 520)"><rect x="${x}" y="475" width="90" height="90" rx="16" fill="#fff" stroke="#3a2f22" stroke-width="5"/><text x="${x + 45}" y="537" font-family="JetBrains Mono" font-weight="700" font-size="52" text-anchor="middle" fill="#3a2f22">${v}</text></g>`;
}).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7e7b8"/><stop offset="1" stop-color="#f5ecd6"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="990" cy="150" r="70" fill="#e9b949" opacity="0.85"/>
  <path d="M0 430 Q300 380 600 420 T1200 400 V630 H0Z" fill="#a9c47a"/>
  <path d="M0 470 Q300 430 640 460 T1200 450 V630 H0Z" fill="#8fae5f"/>
  <g transform="translate(790 250)">
    <rect x="0" y="80" width="260" height="120" fill="#e8d9b5" stroke="#3a2f22" stroke-width="5"/>
    <path d="M-25 85 L130 -10 L285 85Z" fill="#b98b47" stroke="#3a2f22" stroke-width="5"/>
    <rect x="105" y="125" width="50" height="75" rx="4" fill="#6b4a2a"/>
    <rect x="30" y="110" width="45" height="40" fill="#f9f0cf" stroke="#3a2f22" stroke-width="4"/>
    <rect x="185" y="110" width="45" height="40" fill="#f9f0cf" stroke="#3a2f22" stroke-width="4"/>
  </g>
  <text x="80" y="190" font-family="JetBrains Mono" font-weight="700" font-size="92" fill="#3a2f22">bailiwick</text>
  <text x="84" y="250" font-family="JetBrains Mono" font-size="28" fill="#6b5a3e">a cozy day-by-day game about being a manorial bailiff</text>
  <text x="84" y="300" font-family="JetBrains Mono" font-size="22" fill="#6b5a3e">roll dice, settle squabbles, mend roofs &#8212; bailiwick.bisks.net</text>
  ${dice}
</svg>`;
const png = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote og.png", png.length);
