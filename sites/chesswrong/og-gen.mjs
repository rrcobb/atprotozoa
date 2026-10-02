// Generates public/og.png: a checkerboard strip plus sample rewrites.
//   npm install @resvg/resvg-js --no-save ; node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chessify } from "./public/lib/chess.js";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const samples = ["AI Safety Can't Afford to Pick a Side on Consciousness", "Leading The Parade", "Mistakes Were Made and Nobody Updated"];
let board = "";
for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) board += `<rect x="${c * 40}" y="${r * 40}" width="40" height="40" fill="${(r + c) % 2 ? "#8b5e3c" : "#ecd9b0"}"/>`;
let lines = samples.map((s, i) => {
  const t = esc(chessify(s).title);
  return `<text x="60" y="${330 + i * 70}" font-family="Georgia, serif" font-size="30" font-weight="bold" fill="#2b2118">${t.length > 58 ? t.slice(0, 57) + "…" : t}</text>`;
}).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#f1ead8"/>
<text x="60" y="130" font-family="Georgia, serif" font-size="84" font-weight="bold" fill="#2b2118">Chess<tspan fill="#b3401f">Wrong</tspan></text>
<text x="60" y="190" font-family="Georgia, serif" font-size="30" fill="#7a6a58">every LessWrong post, retitled to be about chess</text>
${lines}
<text x="60" y="590" font-family="Georgia, serif" font-size="26" fill="#8b5e3c">chesswrong.bisks.net</text>
<g transform="translate(840,40) scale(1)" opacity="0.95">${board}</g>
</svg>`;
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
