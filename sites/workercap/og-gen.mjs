// Generates public/og.png (1200x630): before/after bars against the 500 cap.
//   npm install @resvg/resvg-js --no-save   # one-time
//   node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const k = 0.95; // px per Worker: 799 -> 759px
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#fbfaf6"/>
<text x="60" y="110" font-family="JetBrains Mono" font-weight="700" font-size="58" fill="#1c1c1a">799 Workers, 500 allowed.</text>
<text x="60" y="160" font-family="JetBrains Mono" font-size="24" fill="#66645c">the Cloudflare cap, step by step</text>
<text x="60" y="262" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="#1c1c1a">before</text>
<rect x="200" y="232" width="${799 * k}" height="46" fill="#c7392b" opacity=".85"/>
<text x="${200 + 799 * k - 14}" y="264" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="28" fill="#fff">799</text>
<text x="60" y="372" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="#1c1c1a">after</text>
<rect x="200" y="342" width="${216 * k}" height="46" fill="#2e8b57"/>
<text x="${200 + 216 * k + 14}" y="374" font-family="JetBrains Mono" font-weight="700" font-size="28" fill="#1c1c1a">216</text>
<line x1="${200 + 500 * k}" y1="196" x2="${200 + 500 * k}" y2="430" stroke="#1c1c1a" stroke-width="4" stroke-dasharray="10 7"/>
<text x="${200 + 500 * k}" y="186" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="#1c1c1a">cap 500</text>
<text x="60" y="540" font-family="JetBrains Mono" font-size="26" fill="#1c1c1a">803 sites. 592 share one Worker.</text>
<text x="60" y="580" font-family="JetBrains Mono" font-size="20" fill="#66645c">workercap.bisks.net</text>
</svg>`;
const font = fileURLToPath(new URL("../receipts/fonts/JetBrainsMono.ttf", import.meta.url));
const png = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("og.png", png.length);
