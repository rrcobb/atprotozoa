// Generates public/og.png (resvg, same recipe as sites/acid100/og-gen.mjs).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const W = 1200, H = 630;
let g = "";
for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
  const gone = (x === 3 && y === 3) || (Math.abs(x - 3) + Math.abs(y - 3) === 1);
  g += `<rect x="${700 + x * 60}" y="${120 + y * 60}" width="54" height="54" rx="5" fill="${gone ? "#e8e8e2" : "#fff"}" stroke="#d0d0c8" stroke-width="2"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f4f4f1"/>
<text x="60" y="200" font-family="JetBrains Mono" font-weight="800" font-size="76" fill="#222">bleekcube</text>
<text x="60" y="270" font-family="JetBrains Mono" font-size="28" fill="#888">a cube composed of</text>
<text x="60" y="310" font-family="JetBrains Mono" font-size="28" fill="#888">everyone's bleesks.</text>
<text x="60" y="380" font-family="JetBrains Mono" font-size="24" fill="#1185fe">what's inside?</text>
${g}<text x="60" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="#222">bleekcube.bisks.net</text></svg>`;
const r = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } });
writeFileSync(new URL("./public/og.png", import.meta.url).pathname, r.render().asPng());
