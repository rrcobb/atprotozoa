// Generates public/og.png (1200x630) with @resvg/resvg-js: a chessboard with a
// snaking purple path. Run: node og-gen.mjs (npm install @resvg/resvg-js --no-save if missing).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PATH } from "./public/logic.js";

const S = 70, X0 = 600, Y0 = 35;
const onPath = (r, c) => PATH.some(([a, b]) => a === r && b === c);
let cells = "";
for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++)
  cells += `<rect x="${X0 + c*S}" y="${Y0 + r*S}" width="${S}" height="${S}" fill="${onPath(r,c) ? "#46385a" : (r+c)%2 ? "#9b6b43" : "#e9d8b4"}"/>`;
const pieces = [["♖",1,2],["♗",1,5],["♘",3,3],["♕",5,4],["♜",0,1],["♟",2,4],["♛",4,6]]
  .map(([g,r,c]) => `<text x="${X0 + c*S + S/2}" y="${Y0 + r*S + S*0.72}" font-size="${g==="♛"?64:50}" text-anchor="middle" fill="${"♖♗♘♕".includes(g) ? "#fff8e8" : "#15101c"}" stroke="${"♖♗♘♕".includes(g) ? "#1a1209" : "#d8584a"}" stroke-width="1.5" font-family="DejaVu Sans, sans-serif">${g}</text>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#14110f"/>
${cells}${pieces}
<text x="50" y="250" font-size="64" font-weight="700" fill="#f1e9dc" font-family="DejaVu Sans, sans-serif">chess, but in</text>
<text x="50" y="330" font-size="64" font-weight="700" fill="#e8b04a" font-family="DejaVu Sans, sans-serif">tower defense</text>
<text x="50" y="395" font-size="26" fill="#9a8f80" font-family="DejaVu Sans, sans-serif">chessgenres.bisks.net</text></svg>`;
const png = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
