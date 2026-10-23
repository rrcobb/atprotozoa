// Generates public/og.png (static preview card). Needs @resvg/resvg-js:
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const n = 7, cx = 880, cy = 315, R = 200;
const pt = (r, i) => [cx + r * Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / n), cy + r * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / n)];
const poly = (f) => Array.from({ length: n }, (_, i) => pt(R * f, i).join(",")).join(" ");
const vals = [0.8, 0.6, 0.7, 0.45, 0.85, 0.5, 1];
const shape = vals.map((v, i) => pt(R * v, i).join(",")).join(" ");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#0a0712"/>
${[0.25, 0.5, 0.75, 1].map((f) => `<polygon points="${poly(f)}" fill="none" stroke="#362647"/>`).join("")}
<polygon points="${shape}" fill="#f4c76a" fill-opacity="0.3" stroke="#f4c76a" stroke-width="4"/>
<text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="#f4c76a">claim your honor</text>
<text x="64" y="215" font-family="JetBrains Mono" font-size="24" fill="#a996c4">your honor, plotted by the tenets</text>
<text x="64" y="250" font-family="JetBrains Mono" font-size="24" fill="#a996c4">of the simcluster code.</text>
<text x="64" y="320" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="#f2e9ff">be excellent.</text>
<text x="64" y="570" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="#f4c76a">honorcode.bisks.net</text>
</svg>`;
const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const png = new Resvg(svg, { font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
