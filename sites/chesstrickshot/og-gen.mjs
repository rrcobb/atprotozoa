// Generates public/og.png (1200x630): a board with a glowing capture chain.
// Run: node og-gen.mjs (npm install @resvg/resvg-js --no-save if missing).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const S = 70, X0 = 600, Y0 = 35;
let cells = "";
for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
  cells += `<rect x="${X0 + c*S}" y="${Y0 + r*S}" width="${S}" height="${S}" fill="${(r+c)%2 ? "#9b6b43" : "#e9d8b4"}"/>`;
const chain = [[7,0,"♕"],[4,3,"♟"],[4,6,"♞"],[1,6,"♜"],[1,2,"♚"]];
const pts = chain.map(([r,c]) => `${X0 + c*S + S/2},${Y0 + r*S + S/2}`).join(" ");
const glyphs = chain.map(([r,c,g], i) => `<text x="${X0 + c*S + S/2}" y="${Y0 + r*S + S*0.72}" font-size="50" text-anchor="middle" fill="${i === 0 ? "#fff8e8" : i === 4 ? "#d8584a" : "#2b2430"}" stroke="${i === 0 ? "#1a1209" : "#f1e9dc"}" stroke-width="1.5" font-family="DejaVu Sans, sans-serif">${g}</text>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#14110f"/>
${cells}<polyline points="${pts}" fill="none" stroke="#e8b04a" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>${glyphs}
<text x="50" y="250" font-size="64" font-weight="700" fill="#f1e9dc" font-family="DejaVu Sans, sans-serif">chess trickshot</text>
<text x="50" y="330" font-size="64" font-weight="700" fill="#e8b04a" font-family="DejaVu Sans, sans-serif">simulator</text>
<text x="50" y="395" font-size="26" fill="#9a8f80" font-family="DejaVu Sans, sans-serif">chesstrickshot.bisks.net</text></svg>`;
const png = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
