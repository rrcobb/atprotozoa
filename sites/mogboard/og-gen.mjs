import { Resvg } from "../receipts/node_modules/@resvg/resvg-js/index.js";
import { writeFileSync } from "node:fs";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0f1216"/>
<text x="70" y="190" font-family="sans-serif" font-size="120" font-weight="700" fill="#b8f5d4">mogboard</text>
<text x="70" y="262" font-family="sans-serif" font-size="38" fill="#93a0af">who out-wrote whom, every single day</text>
<g font-family="sans-serif" font-size="42" fill="#dfe6ee">
<rect x="70" y="330" width="1060" height="64" rx="12" fill="#2f8f64"/><text x="96" y="375">1. the one who wrote the most</text><text x="1100" y="375" text-anchor="end">23 mogs</text>
<rect x="70" y="414" width="760" height="64" rx="12" fill="#1d252e"/><text x="96" y="459">2. a close second</text>
<rect x="70" y="498" width="420" height="64" rx="12" fill="#1d252e"/><text x="96" y="543">3. getting mogged</text></g></svg>`;
writeFileSync("public/og.png", new Resvg(svg).render().asPng());
