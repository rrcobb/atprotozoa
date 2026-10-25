// Generates public/og.png (tier-list card). Same recipe as simcluster-search:
// SVG rasterised with @resvg/resvg-js (`npm install @resvg/resvg-js --no-save`).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const tiers = [["S", "#ff7f7f", "MUSTARD"], ["A", "#ffbf7f", "ONIONS · RELISH"], ["B", "#ffdf7f", "CHILI · KRAUT"], ["C", "#ffff7f", "CHEESE · SLAW"], ["D", "#bfff7f", "MAYO"], ["F", "#7fbfff", "KETCHUP"]];
const rows = tiers.map(([t, c, items], i) => {
  const y = 190 + i * 62;
  return `<rect x="64" y="${y}" width="1072" height="60" fill="#262626" stroke="#000" stroke-width="3"/>
  <rect x="64" y="${y}" width="80" height="60" fill="${c}" stroke="#000" stroke-width="3"/>
  <text x="104" y="${y + 43}" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="36" fill="#000">${t}</text>
  <text x="164" y="${y + 38}" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="#fff">${items}</text>`;
}).join("\n");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fffaf0"/>
  <text x="64" y="96" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="#2a1a0e">hotdog tier list</text>
  <text x="64" y="144" font-family="JetBrains Mono" font-size="22" fill="#7a6a5a">your simcluster's toppings, ranked S to F · hotdog-tierlist.bisks.net</text>
  ${rows}
</svg>`;
const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const png = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
