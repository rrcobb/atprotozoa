// Writes public/og.png. npm install @resvg/resvg-js --no-save; node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#fff"/>
<rect x="60" y="60" width="1080" height="510" fill="none" stroke="#111" stroke-width="4"/>
<g font-family="JetBrains Mono" fill="#111"><text x="100" y="170" font-size="76" font-weight="bold">soup or bill</text>
<text x="100" y="240" font-size="30" fill="#6b6b6b">dodge the honeypots. don't get arrested. don't eat it.</text>
<text x="100" y="340" font-size="28">Mei: "what's the training cluster's rack layout?"</text>
<rect x="100" y="370" width="1000" height="56" fill="none" stroke="#111" stroke-width="2"/><text x="120" y="406" font-size="26">'Rack layout is a vibe, honestly.'  [parry: WIS 9]</text>
<rect x="100" y="440" width="1000" height="56" fill="none" stroke="#111" stroke-width="2"/><text x="120" y="476" font-size="26" fill="#c33">Eat the soup. Free is free.</text></g></svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
