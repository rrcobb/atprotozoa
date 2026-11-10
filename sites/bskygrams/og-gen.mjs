// Generates public/og.png (needs: npm install @resvg/resvg-js --no-save).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL(".", import.meta.url));
const line = (pts, c) => `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#fbf8f1"/>
<text x="70" y="140" font-family="JetBrains Mono" font-weight="800" font-size="84" fill="#1c1b17">bskygrams</text>
<text x="70" y="200" font-family="JetBrains Mono" font-size="32" fill="#6b6558">ngrams for bluesky</text>
${line("70,560 240,520 410,540 580,430 750,380 920,300 1130,260", "#2563eb")}
${line("70,540 240,550 410,500 580,520 750,470 920,480 1130,430", "#e4572e")}
</svg>`;
const r = new Resvg(svg, { font: { fontFiles: readdirSync(dir + "fonts").map((f) => dir + "fonts/" + f), loadSystemFonts: false } });
writeFileSync(dir + "public/og.png", r.render().asPng());
