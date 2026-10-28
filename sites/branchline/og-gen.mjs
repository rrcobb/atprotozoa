// writes public/og.png: a static fractal tree on a clicked line, via @resvg/resvg-js
import { Resvg } from "../receipts/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
let s = "";
function br(x, y, a, l, d) {
  const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
  s += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="hsl(${28 + (9 - d) * 4} 45% ${22 + (9 - d) * 3}%)" stroke-width="${Math.max(1, d * 1.2)}" stroke-linecap="round"/>`;
  if (!d) return void (s += `<circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="4" fill="hsl(${90 + (x2 % 60)} 60% 55%)"/>`);
  br(x2, y2, a - 0.5, l * 0.74, d - 1); br(x2, y2, a + 0.5, l * 0.74, d - 1);
}
const pts = [[80, 560], [330, 420], [600, 540], [880, 400], [1120, 520]];
for (let i = 0; i < pts.length - 1; i++) { const [x, y] = pts[i], [nx, ny] = pts[i + 1]; br(x, y, Math.atan2(ny - y, nx - x) - Math.PI / 2, 110, 8); }
br(...pts.at(-1), -Math.PI / 2, 110, 8);
const line = pts.map((p) => p.join(",")).join(" ");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0d1410"/><polyline points="${line}" fill="none" stroke="#5a4630" stroke-width="4"/>${s}<text x="60" y="90" font-family="sans-serif" font-size="64" font-weight="600" fill="#cfe6d2">branchline</text><text x="60" y="130" font-family="sans-serif" font-size="26" fill="#8fb095">click points. watch the line grow trees.</text></svg>`;
writeFileSync("public/og.png", new Resvg(svg).render().asPng());
