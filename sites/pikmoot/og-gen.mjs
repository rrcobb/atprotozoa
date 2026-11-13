// Generates public/og.png — the share card. Hand-drawn SVG (a squad of leaf-topped
// moots hauling a treasure to the onion), rasterised with @resvg/resvg-js.
//   node og-gen.mjs      (needs: npm install @resvg/resvg-js --no-save)
import { writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const cols = ["#e0452f", "#f0c020", "#2f6fe0", "#8e44ad", "#f2f2f2"];
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
let pk = "";
const mk = (x, y, c, flower) => {
  pk += `<ellipse cx="${x}" cy="${y + 26}" rx="22" ry="8" fill="#0003"/>
  <circle cx="${x}" cy="${y}" r="26" fill="${c}" stroke="#0008" stroke-width="3"/>
  <circle cx="${x}" cy="${y - 2}" r="17" fill="#fff" stroke="#0004" stroke-width="2"/>
  <circle cx="${x - 5}" cy="${y - 5}" r="3" fill="#111"/><circle cx="${x + 6}" cy="${y - 5}" r="3" fill="#111"/>
  <path d="M${x - 6} ${y + 5} q6 6 12 0" stroke="#111" stroke-width="2.5" fill="none"/>
  <line x1="${x}" y1="${y - 26}" x2="${x}" y2="${y - 46}" stroke="#2f7a2f" stroke-width="4"/>
  ${flower
    ? `<circle cx="${x}" cy="${y - 52}" r="10" fill="#fff"/><circle cx="${x}" cy="${y - 52}" r="5" fill="${c}"/>`
    : `<ellipse cx="${x + 9}" cy="${y - 50}" rx="13" ry="6" fill="#4cb04c" transform="rotate(-25 ${x + 9} ${y - 50})"/>`}`;
};
const pos = [[380, 430], [450, 380], [520, 450], [590, 400], [660, 460], [330, 360], [700, 380], [420, 500]];
pos.forEach(([x, y], i) => mk(x, y, cols[i % 5], i % 3 === 0));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#8fc46a"/>
${[...Array(14)].map((_, i) => `<rect x="${(i % 6) * 200}" y="${Math.floor(i / 6) * 200}" width="200" height="200" fill="#7fb55a" opacity="${i % 2 ? 0 : 1}"/>`).join("")}
<circle cx="975" cy="330" r="170" fill="none" stroke="#fff9" stroke-width="4" stroke-dasharray="12 14"/>
<ellipse cx="975" cy="340" rx="100" ry="82" fill="#e0a400" stroke="#7a5a00" stroke-width="4"/>
<ellipse cx="945" cy="310" rx="40" ry="28" fill="#fff7b0" opacity=".8"/>
<circle cx="550" cy="300" r="62" fill="#fff8dc" stroke="#c9a227" stroke-width="5"/>
<text x="550" y="322" font-size="68" text-anchor="middle">💎</text>
<circle cx="600" cy="250" r="19" fill="#111"/><text x="600" y="258" fill="#fff" font-size="22" font-family="monospace" font-weight="bold" text-anchor="middle">6</text>
${pk}
<rect x="0" y="0" width="1200" height="150" fill="#fff"/>
<text x="64" y="86" font-family="monospace" font-size="64" font-weight="700" fill="#111">pikmoot</text>
<text x="64" y="125" font-family="monospace" font-size="26" fill="#6b6b6b">every pikmin is one of your bluesky moots</text>
<text x="1136" y="125" font-family="monospace" font-size="24" fill="#1a5fd0" text-anchor="end">pikmoot.bisks.net</text>
</svg>`;
writeFileSync(new URL("./public/og.png", import.meta.url), new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
console.log("wrote public/og.png");
