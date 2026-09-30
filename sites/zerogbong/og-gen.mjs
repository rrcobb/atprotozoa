// Generates public/og.png for zerogbong. Needs @resvg/resvg-js
// (npm install @resvg/resvg-js --no-save). Copied in spirit from grasstoucher.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<defs><radialGradient id="w" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#c8ecff"/><stop offset=".6" stop-color="#4fb6ff"/><stop offset="1" stop-color="#1a5fa8"/></radialGradient></defs>
<rect width="1200" height="630" fill="#070b16"/>
<circle cx="880" cy="315" r="240" fill="#141c38" stroke="#5c6fb0" stroke-width="14"/>
<g stroke="#31427f" stroke-width="5"><path d="M880 315L1120 315M880 315L1000 107M880 315L760 107M880 315L640 315M880 315L760 523M880 315L1000 523"/></g>
<circle cx="880" cy="315" r="40" fill="#0a1024" stroke="#ffd166" stroke-width="8"/>
<circle cx="1050" cy="315" r="62" fill="url(#w)"/>
<text x="64" y="220" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="#dfe8ff">zerogbong</text>
<text x="66" y="280" font-family="JetBrains Mono" font-size="24" fill="#8390b0">water sphere physics, no gravity</text>
<text x="66" y="380" font-family="JetBrains Mono" font-size="22" fill="#dfe8ff">spin the chamber. hold the pull.</text>
<text x="66" y="416" font-family="JetBrains Mono" font-size="22" fill="#dfe8ff">don't let the sphere reach the stem.</text>
</svg>`;
const r = new Resvg(svg, { font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } });
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), r.render().asPng());
