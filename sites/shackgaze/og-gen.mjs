// Generates public/og.png — the Open Graph card for shackgaze: a blurred
// four-lane highway of notes under a hazy shoegaze sky. Rasterised with
// @resvg/resvg-js; font bundled in ./fonts (no system fonts on the box).
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const lanes = ["#c05cb0", "#e98fa8", "#8f7bff", "#6ef2c9"];
let notes = "";
const pos = [[0,90],[2,200],[1,300],[3,150],[0,420],[2,470],[1,60],[3,380],[2,330],[0,250]];
for (const [l, y] of pos) {
  const x = 700 + l * 110 + 55;
  notes += `<circle cx="${x}" cy="${y}" r="38" fill="${lanes[l]}" filter="url(#blur)" opacity=".9"/>`;
  notes += `<circle cx="${x}" cy="${y}" r="20" fill="#fff" opacity=".7" filter="url(#soft)"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2140"/><stop offset=".7" stop-color="#6b3a73"/><stop offset="1" stop-color="#e98fa8"/></linearGradient>
<filter id="blur" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="soft" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect x="700" y="0" width="440" height="${H}" fill="#1c1530" opacity=".75"/>
${[0,1,2,3,4].map(i => `<rect x="${700 + i*110 - 1}" y="0" width="2" height="${H}" fill="#c05cb0" opacity=".5"/>`).join("")}
${notes}
<rect x="700" y="520" width="440" height="6" fill="#f0e6ff" opacity=".8"/>
<text x="70" y="290" font-family="JetBrains Mono" font-weight="700" font-size="104" fill="#f0e6ff">shackgaze</text>
<text x="74" y="355" font-family="JetBrains Mono" font-size="30" fill="#f0e6ff" opacity=".85">a wall of fuzz and a milkshake.</text>
<text x="74" y="400" font-family="JetBrains Mono" font-size="30" fill="#f0e6ff" opacity=".85">hit the notes through the haze.</text>
<text x="74" y="560" font-family="JetBrains Mono" font-size="26" fill="#e98fa8">shackgaze.bisks.net</text>
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote og.png", png.length);
