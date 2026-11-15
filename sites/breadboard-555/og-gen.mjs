// Generates public/og.png — a 555 with a lit LED. Same recipe as sites/mootmix/og-gen.mjs.
//   npm install @resvg/resvg-js --no-save ; node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BG = "#0e1511", FG = "#e6f0e2", DIM = "#8aa090", ACCENT = "#f0c040";
let pins = "";
for (let i = 0; i < 4; i++) {
  const y = 190 + i * 60;
  pins += `<rect x="440" y="${y}" width="50" height="14" fill="#aaa"/><rect x="710" y="${y}" width="50" height="14" fill="#aaa"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="${BG}"/>
${pins}
<rect x="490" y="160" width="220" height="260" rx="14" fill="#222" stroke="#666" stroke-width="3"/>
<path d="M570 160 a30 30 0 0 0 60 0" fill="${BG}" stroke="#666" stroke-width="3"/>
<text x="600" y="320" font-family="monospace" font-size="72" font-weight="700" fill="#888" text-anchor="middle">555</text>
<path d="M760 197 Q900 120 960 197" fill="none" stroke="#7ad77a" stroke-width="6"/>
<circle cx="1000" cy="215" r="34" fill="#ff5050"/><circle cx="1000" cy="215" r="70" fill="#ff5050" opacity=".18"/>
<text x="600" y="90" font-family="monospace" font-size="64" font-weight="700" fill="${ACCENT}" text-anchor="middle">breadboard-555</text>
<text x="600" y="520" font-family="monospace" font-size="30" fill="${FG}" text-anchor="middle">two players · one part per round · first to oscillate wins</text>
<text x="600" y="570" font-family="monospace" font-size="24" fill="${DIM}" text-anchor="middle">breadboard-555.bisks.net</text>
</svg>`;
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), new Resvg(svg).render().asPng());
