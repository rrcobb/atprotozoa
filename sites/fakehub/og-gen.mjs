// Generates public/og.png (1200x630) with @resvg/resvg-js; font bundled in ./fonts.
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" font-family="JetBrains Mono">
<rect width="1200" height="630" fill="#0d1117"/>
<text x="70" y="140" font-size="76" font-weight="700" fill="#e6edf3">fakehub</text>
<text x="70" y="200" font-size="28" fill="#8b949e">the GitHub profile your avatar implies</text>
<rect x="70" y="250" width="1060" height="290" rx="10" fill="#161b22" stroke="#30363d"/>
<rect x="100" y="285" width="100" height="30" rx="15" fill="#8957e5"/><text x="118" y="308" font-size="18" fill="#fff">merged</text>
<text x="220" y="308" font-size="26" fill="#e6edf3">feat: robust, production-ready abstraction layer</text>
<text x="100" y="350" font-size="20" fill="#3fb950">+2,140</text><text x="210" y="350" font-size="20" fill="#f85149">-87</text>
<rect x="100" y="395" width="100" height="30" rx="15" fill="#8957e5"/><text x="118" y="418" font-size="18" fill="#fff">merged</text>
<text x="220" y="418" font-size="26" fill="#e6edf3">fix typo</text>
<text x="100" y="460" font-size="20" fill="#3fb950">+1</text><text x="150" y="460" font-size="20" fill="#f85149">-1</text>
<text x="100" y="515" font-size="22" fill="#8b949e">type a Bluesky handle · fakehub.bisks.net</text>
</svg>`;
const png = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
