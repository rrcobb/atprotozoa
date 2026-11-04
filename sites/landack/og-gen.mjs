// Writes public/og.png. Needs @resvg/resvg-js (npm install @resvg/resvg-js --no-save)
// and a font: pass one via FONT=/path.ttf (this box has no system fonts).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const F = "JetBrains Mono";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#f6f1e7"/>
<rect x="40" y="40" width="1120" height="550" rx="18" fill="#fffdf8" stroke="#d8ccb6" stroke-width="2"/>
<text x="90" y="170" font-family="${F}" font-weight="800" font-size="84" fill="#8a4b1f">landack</text>
<text x="90" y="250" font-family="${F}" font-size="30" fill="#2a2118">Search a place. Verify whose land it is.</text>
<text x="90" y="296" font-family="${F}" font-size="30" fill="#2a2118">Write an acknowledgement that only</text>
<text x="90" y="342" font-family="${F}" font-size="30" fill="#2a2118">says what you checked.</text>
<text x="90" y="470" font-family="${F}" font-size="22" fill="#6b5d4d">1 find the place   2 check the sources   3 write it</text>
<text x="90" y="540" font-family="${F}" font-size="22" fill="#6b5d4d">landack.bisks.net</text>
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [process.env.FONT], loadSystemFonts: false, defaultFontFamily: F } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
