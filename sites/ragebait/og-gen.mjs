// Generates public/og.png (1200x630) with @resvg/resvg-js.
// Run: node og-gen.mjs (npm install @resvg/resvg-js --no-save if missing).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const F = "DejaVu Sans, sans-serif";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#12151b"/>
<text x="60" y="140" font-size="84" font-weight="700" fill="#e9edf3" font-family="${F}">rage<tspan fill="#ff4d3d">bait</tspan></text>
<text x="60" y="200" font-size="30" fill="#8b95a5" font-family="${F}">fake posts by fake people. get mad for free.</text>
<rect x="60" y="250" width="1080" height="270" rx="22" fill="#1b2029" stroke="#2a3140" stroke-width="2"/>
<circle cx="120" cy="310" r="28" fill="#8a4a3a"/>
<text x="165" y="305" font-size="28" font-weight="700" fill="#e9edf3" font-family="${F}">Brad Haverstock 🔥</text>
<text x="165" y="338" font-size="22" fill="#8b95a5" font-family="${F}">@realbradhaverstock.bsky.social</text>
<text x="100" y="412" font-size="38" fill="#e9edf3" font-family="${F}">Unpopular opinion: you do not need to rinse</text>
<text x="100" y="462" font-size="38" fill="#e9edf3" font-family="${F}">dishes before the dishwasher. Ratio me.</text>
<text x="100" y="505" font-size="22" fill="#8b95a5" font-family="${F}">💬 3.2K    🔁 5.9K quotes    ♥ 14</text>
<text x="60" y="590" font-size="26" fill="#8b95a5" font-family="${F}">ragebait.bisks.net</text></svg>`;
const png = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
