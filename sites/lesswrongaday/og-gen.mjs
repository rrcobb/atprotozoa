// Generates public/og.png. npm install @resvg/resvg-js --no-save ; node og-gen.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const { Resvg } = createRequire(process.env.RESVG_FROM || import.meta.url)("@resvg/resvg-js");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#fbfaf7"/>
<text x="60" y="170" font-family="Georgia, serif" font-size="80" font-weight="bold" fill="#222">LessWrong,</text>
<text x="60" y="260" font-family="Georgia, serif" font-size="80" font-weight="bold" fill="#5f9b65">one day at a time</text>
<text x="60" y="350" font-family="Georgia, serif" font-size="32" fill="#777">each real day replays one day of history, from 2012-01-01</text>
<text x="60" y="450" font-family="Georgia, serif" font-size="44" fill="#222">Monday, January 2, 2012</text>
<text x="60" y="500" font-family="Georgia, serif" font-size="28" fill="#777">posts and top comments, in order</text>
<text x="60" y="590" font-family="Georgia, serif" font-size="26" fill="#5f9b65">lesswrongaday.bisks.net</text>
</svg>`;
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
