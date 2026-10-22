// Generates public/og.png (1200x630) for vulnwatch. Run by hand:
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#0b0d10"/>
<rect x="0" y="0" width="1200" height="8" fill="#ff3b5c"/>
<text x="70" y="190" font-family="JetBrains Mono" font-size="110" font-weight="700" fill="#e8edf2">vuln<tspan fill="#ff3b5c">watch</tspan></text>
<text x="74" y="260" font-family="JetBrains Mono" font-size="34" fill="#8794a3">every CVE since 20 Oct 2026, live from the NVD</text>
<g font-family="JetBrains Mono" font-size="26" fill="#0b0d10" font-weight="700">
<rect x="70" y="340" width="230" height="64" rx="8" fill="#ff3b5c"/><text x="92" y="382">CRITICAL</text>
<rect x="320" y="340" width="180" height="64" rx="8" fill="#ff8a3d"/><text x="342" y="382">HIGH</text>
<rect x="520" y="340" width="210" height="64" rx="8" fill="#f5c542"/><text x="542" y="382">MEDIUM</text>
<rect x="750" y="340" width="160" height="64" rx="8" fill="#4fc3a1"/><text x="772" y="382">LOW</text></g>
<g fill="#232a33"><rect x="70" y="470" width="60" height="90"/><rect x="150" y="440" width="60" height="120"/><rect x="230" y="400" width="60" height="160"/><rect x="310" y="460" width="60" height="100"/></g>
<text x="410" y="540" font-family="JetBrains Mono" font-size="30" fill="#e8edf2">vulnwatch.bisks.net</text>
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
