// Generates public/og.png: neon towers with swords under the title.
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630, HOR = 330;
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

let towers = "";
for (let i = 0; i < 26; i++) {
  const side = i % 2 ? 1 : -1;
  const depth = 1 + (i >> 1) * 0.55; // 1 = near
  const k = 520 / depth;
  const x = W / 2 + side * (150 + (i >> 1) * 45) * (1.6 / depth) * 1.4;
  const w = 60 * (1.3 / depth) + 20, hgt = (90 + rnd() * 150) * (1.3 / depth) + 40;
  const hue = (rnd() * 360) | 0;
  const base = HOR + 90 / depth + 20;
  const top = base - hgt;
  const len = hgt * (0.4 + rnd() * 0.4);
  towers += `<g opacity="${Math.min(1, 1.2 / depth + 0.25).toFixed(2)}">
    <rect x="${x - w / 2}" y="${top}" width="${w}" height="${hgt}" fill="hsl(${hue},45%,8%)" stroke="hsl(${hue},90%,58%)" stroke-width="2"/>
    <rect x="${x - (2 / depth + 1.5)}" y="${top + hgt * 0.1}" width="${4 / depth + 3}" height="${len}" fill="hsl(${hue},100%,80%)" filter="url(#glow)"/>
    <line x1="${x - w * 0.18}" y1="${top + hgt * 0.1}" x2="${x + w * 0.18}" y2="${top + hgt * 0.1}" stroke="hsl(${(hue + 40) % 360},90%,70%)" stroke-width="2.5"/>
  </g>`;
}
let grid = "";
for (let i = -6; i <= 6; i++) grid += `<line x1="${W / 2}" y1="${HOR}" x2="${W / 2 + i * 260}" y2="${H}" stroke="rgba(255,60,200,.3)" stroke-width="1.5"/>`;
for (let j = 1; j < 7; j++) grid += `<line x1="0" y1="${HOR + j * j * 8}" x2="${W}" y2="${HOR + j * j * 8}" stroke="rgba(60,220,255,.22)"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05030d"/><stop offset="1" stop-color="#3a0f55"/></linearGradient>
  <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0626"/><stop offset="1" stop-color="#050208"/></linearGradient>
  <filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="${W}" height="${HOR}" fill="url(#sky)"/>
<rect y="${HOR}" width="${W}" height="${H - HOR}" fill="url(#gr)"/>
${grid}${towers}
<rect x="0" y="40" width="${W}" height="150" fill="rgba(5,2,10,.62)"/>
<text x="60" y="130" font-family="JetBrains Mono" font-weight="700" font-size="84" fill="#ff3cc8" filter="url(#glow)" letter-spacing="6">HYPERSTREET</text>
<text x="62" y="172" font-family="JetBrains Mono" font-size="26" fill="#d8c8ee">every account on atproto is a building. every DID forges a sword.</text>
<text x="62" y="${H - 28}" font-family="JetBrains Mono" font-size="22" fill="#3cdcff">hyperstreet.bisks.net</text>
</svg>`;

const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png", png.length);
