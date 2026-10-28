// writes public/og.png: a 3x3 grid of Hopf-fiber 3-sphere views, via @resvg/resvg-js
// (npm install @resvg/resvg-js --no-save, then node og-gen.mjs)
import { Resvg } from "../receipts/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
const W = 1200, H = 630, N = 3, cell = 190, gx = 700, gy = 20;
function view(a, b, ox, oy) {
  let out = "";
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  for (let i = 0; i < 5; i++) {
    const eta = (i + .5) / 5 * Math.PI / 2;
    for (let k = 0; k < 10; k++) {
      const d = k / 10 * 2 * Math.PI + i * .3; let pts = [], wsum = 0;
      for (let s = 0; s <= 50; s++) {
        const t = s / 50 * 2 * Math.PI;
        const x = Math.cos(eta) * Math.cos(t), y = Math.cos(eta) * Math.sin(t), z = Math.sin(eta) * Math.cos(t + d), w = Math.sin(eta) * Math.sin(t + d);
        const x2 = x * ca - w * sa, w2 = x * sa + w * ca, y2 = y * cb - w2 * sb, w3 = y * sb + w2 * cb;
        const f = 2.4 / (2.4 - w3), Y = y2 * f, Z = z * f, Yt = Y * .8776 - Z * .4794, Zt = Y * .4794 + Z * .8776, g = 4 / (4 - Zt);
        pts.push((ox + cell / 2 + x2 * f * g * cell * .32).toFixed(1) + "," + (oy + cell / 2 + Yt * g * cell * .32).toFixed(1)); wsum += w3;
      }
      const u = (wsum / 51 + 1) / 2;
      out += `<polyline points="${pts.join(" ")}" fill="none" stroke="hsl(${200 + i * 36 + u * 90},85%,${35 + u * 40}%)" stroke-opacity=".7" stroke-width="1.3"/>`;
    }
  }
  return out;
}
let cells = "";
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  const ox = gx + c * (cell + 6) - 60, oy = gy + r * (cell + 6) + 10;
  cells += `<rect x="${ox}" y="${oy}" width="${cell}" height="${cell}" rx="8" fill="#0b0b16"/>` + view(c / N * 2 * Math.PI, r / N * 2 * Math.PI, ox, oy);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#07070d"/>${cells}
<text x="60" y="290" font-family="sans-serif" font-weight="700" font-size="84" fill="#cfd3ff">hypersphere</text>
<text x="60" y="350" font-family="sans-serif" font-size="30" fill="#8a8fbf">every angle of a sphere,</text>
<text x="60" y="392" font-family="sans-serif" font-size="30" fill="#8a8fbf">including the fourth.</text></svg>`;
writeFileSync(new URL("./public/og.png", import.meta.url), new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
