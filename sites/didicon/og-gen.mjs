// Generates public/og.png — a static grid of identicons for made-up DIDs, using
// the same iconSpec() as public/lib/icon.js (loaded via createRequire), drawn as
// SVG since resvg has no <canvas>.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const { iconSpec } = createRequire(import.meta.url)("./public/lib/icon.js");
const W = 1200, H = 630;

function iconSvg(did, x, y, size, id) {
  const s = iconSpec(did);
  const r = size * 0.18;
  let out = `<clipPath id="c${id}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}"/></clipPath>`;
  out += `<g clip-path="url(#c${id})"><rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${s.bg}"/>`;
  for (const k of s.strokes) {
    const a = (k.angle * Math.PI) / 180;
    const dx = (Math.cos(a) * k.len * size) / 2, dy = (Math.sin(a) * k.len * size) / 2;
    const px = x + k.cx * size, py = y + k.cy * size;
    out += `<line x1="${px - dx}" y1="${py - dy}" x2="${px + dx}" y2="${py + dy}" stroke="${k.color}" stroke-width="${k.width * size}" stroke-linecap="${s.round ? "round" : "butt"}"/>`;
  }
  return out + "</g>";
}

let icons = "";
const size = 150, gap = 18, cols = 4, rows = 3;
const gx = 1200 - 60 - (cols * size + (cols - 1) * gap);
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const n = r * cols + c;
    icons += iconSvg(`did:plc:example${n}zzzzzzzzzzzzzz${n * 7}`, gx + c * (size + gap), 70 + r * (size + gap) + 30, size, n);
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#0d0c11"/>
<text x="60" y="270" font-family="JetBrains Mono" font-weight="800" font-size="92" fill="#ff6b9a">didicon</text>
<text x="60" y="335" font-family="JetBrains Mono" font-size="25" fill="#f3f0f7">an identicon for your DID</text>
<text x="60" y="385" font-family="JetBrains Mono" font-size="20" fill="#a39fb5">palettes + angled strokes,</text>
<text x="60" y="415" font-family="JetBrains Mono" font-size="20" fill="#a39fb5">same identity, same icon.</text>
<text x="60" y="570" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="#7ee8d0">didicon.bisks.net</text>
${icons}</svg>`;

const png = new Resvg(svg, {
  font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
}).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png", png.length);
