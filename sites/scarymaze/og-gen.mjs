// Generates public/og.png (needs @resvg/resvg-js; resolved from ../receipts/node_modules).
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { Resvg } = createRequire(import.meta.url)("../receipts/node_modules/@resvg/resvg-js");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#1b1b3a"/>
<polyline points="120,140 1080,140 1080,320 200,320 200,470 700,470" fill="none" stroke="#e8e8ff" stroke-width="70"/>
<rect x="100" y="120" width="40" height="40" fill="#2c2"/>
<ellipse cx="900" cy="470" rx="110" ry="140" fill="#d9d9c8"/>
<ellipse cx="860" cy="440" rx="25" ry="35" fill="#000"/><ellipse cx="940" cy="440" rx="25" ry="35" fill="#000"/>
<ellipse cx="900" cy="530" rx="38" ry="55" fill="#000"/>
<text x="60" y="590" font-family="sans-serif" font-size="64" font-weight="700" fill="#fff" stroke="#000" stroke-width="2">scary maze game</text>
</svg>`;
writeFileSync(new URL("./public/og.png", import.meta.url), new Resvg(svg).render().asPng());
