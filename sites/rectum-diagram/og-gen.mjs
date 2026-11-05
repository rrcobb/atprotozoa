// Renders public/og.png (1200x630) from the 119th-congress seat counts. Needs @resvg/resvg-js.
import { Resvg } from "../receipts/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
const rows = [12, 16, 20, 24, 28], seats = [];
rows.forEach((n, ri) => { const rad = 150 + ri * 52; for (let k = 0; k < n; k++) { const a = Math.PI - Math.PI * (k + .5) / n; seats.push({ a, rad, x: 600 + rad * Math.cos(a), y: 560 - rad * Math.sin(a) }); } });
seats.sort((p, q) => q.a - p.a || p.rad - q.rad);
const col = i => i < 45 ? "#4a86e8" : i < 47 ? "#f2c14e" : "#e5484d";
const dots = seats.map((s, i) => `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="17" fill="${col(i)}"/>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#12131a"/>${dots}
<text x="600" y="470" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="64" fill="#e8e9ee">rectum-diagram</text>
<text x="600" y="520" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#8d92a3">election analysis by goose colonoscopy.</text></svg>`;
writeFileSync(new URL("./public/og.png", import.meta.url), new Resvg(svg).render().asPng());
