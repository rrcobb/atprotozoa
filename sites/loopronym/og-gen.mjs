// Generates public/og.png — the Open Graph preview card for loopronym.
//
// Draws the RECURSIVE backronym itself (the site's own default example) as
// SVG, with the R row visually spiraling into a small nested "Recursive("
// chain, then rasterises it with resvg-js.
//
//   node og-gen.mjs        # writes ./public/og.png
//
// Deterministic, no live data. Style and rasterise approach copied from
// sites/duckpond/og-gen.mjs (copy, don't abstract).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const W = 1200, H = 630;
const INK = "#16221a", MUTED = "#5f6b61", ACCENT = "#1a7a4c", GOLD = "#b8860b", ENTANGLED = "#8e44ad";

const ROWS = [
  ["R", "Reflective — and, recursively: Recursive -> Recursive -> ...", ENTANGLED],
  ["E", "Emergent", INK],
  ["C", "Cognitohazardous", INK],
  ["U", "Uploaded", INK],
  ["R", "Recursive (it's recursive)", GOLD],
  ["S", "Simcluster", INK],
  ["I", "Instrumental", INK],
  ["V", "Vibecoded", INK],
  ["E", "Entangled", INK],
];

let rows = "";
const rowH = 44;
const top = 150;
ROWS.forEach(([letter, text, color], i) => {
  const y = top + i * rowH;
  rows += `
    <text x="64" y="${y}" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${color === ENTANGLED || color === GOLD ? color : ACCENT}">${letter}</text>
    <text x="104" y="${y}" font-family="JetBrains Mono" font-size="20" fill="${color}" font-style="${color === GOLD ? "italic" : "normal"}">${text.length > 58 ? text.slice(0, 55) + "…" : text}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fbfaf5"/>
  <rect x="0" y="0" width="${W}" height="6" fill="${ENTANGLED}"/>

  <text x="64" y="72" font-family="JetBrains Mono" font-weight="800" font-size="42" fill="${INK}">loop/ronym</text>
  <text x="64" y="104" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">RECURSIVE, expanded</text>

  ${rows}

  <text x="64" y="${H - 40}" font-family="JetBrains Mono" font-size="16" fill="${MUTED}">the R slot: 75% a tautology, 25% both — entangled on request</text>
  <text x="${W - 64}" y="${H - 40}" text-anchor="end" font-family="JetBrains Mono" font-size="16" fill="${ACCENT}">loopronym.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
