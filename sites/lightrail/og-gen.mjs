// node og-gen.mjs — renders public/og.png (needs @resvg/resvg-js, e.g. from ../didscope/node_modules)
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
const stops = [0,1,2,3,4,5,6,7].map((i) => `<circle cx="${130 + i*135}" cy="430" r="14" fill="#0d1b24" stroke="#00a3cc" stroke-width="6"/>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0d1b24"/>
<text x="80" y="230" font-family="sans-serif" font-weight="700" font-size="120" fill="#e8f1f6">light<tspan fill="#00a3cc">rail</tspan></text>
<text x="84" y="300" font-family="sans-serif" font-size="40" fill="#8fa8b8">live Baltimore Light RailLink tracker</text>
<rect x="130" y="427" width="945" height="6" fill="#00a3cc"/>${stops}
<rect x="500" y="385" width="150" height="40" rx="10" fill="#0d1b24" stroke="#ffb84d" stroke-width="4"/>
<text x="575" y="414" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="700" fill="#ffb84d">▲ 7011</text>
<text x="84" y="570" font-family="sans-serif" font-size="30" fill="#8fa8b8">lightrail.bisks.net</text></svg>`;
writeFileSync("public/og.png", new Resvg(svg).render().asPng());
