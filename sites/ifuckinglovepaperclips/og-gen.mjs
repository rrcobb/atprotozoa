// Generates public/og.png (1200x630) with @resvg/resvg-js (not a project dependency:
// `npm install @resvg/resvg-js --no-save`, or reuse ../receipts/node_modules).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const W = 1200, H = 630;
const CLIP = "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48";
const clip = (x, y, s, c) => `<g transform="translate(${x},${y}) scale(${s})"><path d="${CLIP}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#1877f2"/>
<rect x="60" y="60" width="1080" height="510" rx="24" fill="#fff"/>
${clip(110, 110, 7, "#1877f2")}
<text x="330" y="190" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="#050505">I FUCKING LOVE</text>
<text x="330" y="270" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="#1877f2">PAPERCLIPS</text>
<text x="110" y="400" font-family="JetBrains Mono" font-size="28" fill="#65676b">Community · 4.2M likes · 8 pages of posts</text>
<text x="110" y="470" font-family="JetBrains Mono" font-size="28" fill="#65676b">Like. Share. Bend gently.</text>
<text x="110" y="530" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="#050505">ifuckinglovepaperclips.bisks.net</text>
</svg>`;
const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const png = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(new URL("./public/og.png", import.meta.url).pathname, png);
