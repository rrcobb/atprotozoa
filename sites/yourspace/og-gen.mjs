// Generates public/og.png for yourspace (same recipe as sites/backscroll/og-gen.mjs:
// hand-drawn SVG rasterised with @resvg/resvg-js; `npm install @resvg/resvg-js --no-save` first).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
let tiles = "";
const cols = ["#ff4f9a", "#ffd23f", "#3fa9ff", "#7bff6b", "#b57bff", "#ff8a3f", "#3fffd2", "#ff6b6b"];
for (let i = 0; i < 8; i++) {
  const x = 640 + (i % 4) * 130, y = 330 + Math.floor(i / 4) * 130;
  tiles += `<rect x="${x}" y="${y}" width="110" height="110" fill="${cols[i]}" stroke="#111" stroke-width="3"/><text x="${x + 55}" y="${y + 70}" font-size="44" text-anchor="middle" font-family="Verdana, sans-serif" fill="#111">${i + 1}</text>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#6d9bd6"/>
<rect x="40" y="40" width="1120" height="550" fill="#fff" stroke="#003399" stroke-width="4"/>
<rect x="40" y="40" width="1120" height="52" fill="#003399"/>
<text x="64" y="76" font-family="Verdana, sans-serif" font-size="26" fill="#fff" font-weight="700">yourspace</text>
<rect x="70" y="130" width="230" height="230" fill="#003399"/><circle cx="185" cy="215" r="48" fill="#fff"/><rect x="115" y="280" width="140" height="80" rx="40" fill="#fff"/>
<text x="330" y="190" font-family="Verdana, sans-serif" font-size="64" font-weight="700" fill="#111">your page.</text>
<text x="330" y="262" font-family="Verdana, sans-serif" font-size="64" font-weight="700" fill="#d4008a">your repo.</text>
<text x="70" y="430" font-family="Verdana, sans-serif" font-size="30" fill="#111">a myspace for atproto</text>
<text x="70" y="480" font-family="Verdana, sans-serif" font-size="22" fill="#333">themes · top friends · widgets · autoplay</text>
<text x="70" y="540" font-family="Verdana, sans-serif" font-size="26" fill="#003399">yourspace.bisks.net</text>
<text x="640" y="316" font-family="Verdana, sans-serif" font-size="22" fill="#111">top 8</text>
${tiles}
</svg>`;
const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
