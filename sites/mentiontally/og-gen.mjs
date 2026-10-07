// Generates public/og.png. Needs @resvg/resvg-js (npm install --no-save); run: node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#0e1116"/>
<text x="80" y="200" font-family="JetBrains Mono" font-size="84" font-weight="700" fill="#e8edf4">mentiontally</text>
<text x="80" y="270" font-family="JetBrains Mono" font-size="32" fill="#8b97a8">who gets @-mentioned under a post?</text>
<g font-family="JetBrains Mono" font-size="34" fill="#e8edf4">
<text x="80" y="390">@alice.example</text><text x="800" y="390" fill="#4aa8ff">12</text><text x="960" y="390" fill="#8b97a8">31</text>
<text x="80" y="450">@bob.example</text><text x="800" y="450" fill="#4aa8ff">7</text><text x="960" y="450" fill="#8b97a8">19</text>
<text x="80" y="510">@carol.example</text><text x="800" y="510" fill="#4aa8ff">3</text><text x="960" y="510" fill="#8b97a8">22</text></g>
<text x="780" y="330" font-family="JetBrains Mono" font-size="22" fill="#8b97a8">this post</text>
<text x="950" y="330" font-family="JetBrains Mono" font-size="22" fill="#8b97a8">root</text>
<text x="80" y="590" font-family="JetBrains Mono" font-size="26" fill="#4aa8ff">mentiontally.bisks.net</text></svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
