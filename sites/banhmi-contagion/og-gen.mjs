// Generates public/og.png: a little contagion graph. `npm install @resvg/resvg-js --no-save` first.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const W = 1200, H = 630;
let seed = 11; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pts = [{ x: 780, y: 330, g: 0 }], edges = [];
for (let i = 1; i < 150; i++) {
  const p = pts[Math.floor(rnd() * pts.length)];
  const a = rnd() * 6.283, d = 26 + rnd() * 50;
  const q = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.8, g: p.g + 1 };
  if (q.x < 330 || q.x > 1170 || q.y < 30 || q.y > 600) { i--; continue; }
  pts.push(q); edges.push([p, q]);
}
const col = (g) => `rgb(${255 - Math.min(g * 14, 148)},90,${54 + Math.min(g * 2, 15)})`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#14100c"/>
${edges.map(([a, b]) => `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#ff784644" stroke-width="1.5"/>`).join("")}
${pts.map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="${i ? 5 : 13}" fill="${col(p.g)}"/>`).join("")}
<text x="60" y="250" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="#f3e9d8">banh mi</text>
<text x="60" y="325" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="#ff5a36">contagion</text>
<text x="60" y="390" font-family="JetBrains Mono" font-size="22" fill="#9a8c78">who caught it, and from whom</text>
<text x="60" y="570" font-family="JetBrains Mono" font-size="20" fill="#9a8c78">banhmi-contagion.bisks.net</text>
</svg>`;
const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const png = new Resvg(svg, { font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(new URL("./public/og.png", import.meta.url), png);
console.log("wrote og.png", png.length);
