// Generates public/og.png (rasterised with @resvg/resvg-js, borrowed from
// gratitude-garden's node_modules since it's a one-off tool, not a dependency).
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(new URL("../gratitude-garden/package.json", import.meta.url));
const { Resvg } = require("@resvg/resvg-js");
const towers = Array.from({ length: 16 }, (_, i) => {
  const h = 120 + ((i * 53) % 190), x = i * 78;
  const wins = Array.from({ length: 6 }, (_, j) => `<rect x="${x + 12 + (j % 2) * 30}" y="${630 - h + 16 + Math.floor(j / 2) * 34}" width="14" height="14" fill="${(i + j) % 3 ? "#2ff3e0" : "#ff4fa3"}" opacity=".8"/>`).join("");
  return `<rect x="${x}" y="${630 - h}" width="72" height="${h}" fill="#1d1230"/>${wins}`;
}).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b1a5e"/><stop offset="1" stop-color="#120a1f"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#g)"/>${towers}
<rect x="0" y="560" width="1200" height="70" fill="#0d0716"/>
<rect x="0" y="558" width="1200" height="4" fill="#ff4fa3"/>
<g transform="translate(860 420)"><ellipse cx="0" cy="40" rx="70" ry="42" fill="#7d6a98"/><circle cx="62" cy="22" r="26" fill="#7d6a98"/><circle cx="52" cy="2" r="14" fill="#9b87b8"/><circle cx="72" cy="18" r="4" fill="#2ff3e0"/><path d="M-70 44 Q-150 70 -170 20" stroke="#c9a0b8" stroke-width="7" fill="none"/></g>
<g fill="#2ff3e0"><path d="M170 540 q40 -70 80 0z"/><path d="M280 540 q30 -50 60 0z" fill="#ff4fa3"/><path d="M370 540 q40 -80 80 0z"/></g>
<text x="60" y="150" font-family="monospace" font-size="110" font-weight="700" fill="#2ff3e0">UNDERGROW</text>
<text x="64" y="205" font-family="monospace" font-size="34" fill="#f2e9ff">a rat. a rooftop. a neon farm.</text>
<text x="64" y="250" font-family="monospace" font-size="26" fill="#a897c8">something is humming in the drain.</text>
</svg>`;
writeFileSync(new URL("./public/og.png", import.meta.url), new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
