// Generates public/og.png — the Open Graph card for mootmix: a cassette.
// Same recipe as sites/backscroll/og-gen.mjs (SVG -> @resvg/resvg-js).
//   npm install @resvg/resvg-js --no-save ; node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BG = "#14100c", FG = "#f2e9dc", DIM = "#9a8468", ACCENT = "#e0a95a";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="${BG}"/>
<g transform="translate(600 300)">
<rect x="-300" y="-170" width="600" height="340" rx="22" fill="#1b1611" stroke="${ACCENT}" stroke-width="5"/>
<rect x="-250" y="-130" width="500" height="150" rx="10" fill="#241a0c" stroke="${DIM}" stroke-width="2"/>
<text x="0" y="-40" font-family="monospace" font-size="64" font-weight="700" fill="${ACCENT}" text-anchor="middle">mootmix</text>
<text x="0" y="-0" font-family="monospace" font-size="24" fill="${DIM}" text-anchor="middle">side A: everything your moots posted</text>
<circle cx="-110" cy="85" r="44" fill="${BG}" stroke="${FG}" stroke-width="4"/><circle cx="-110" cy="85" r="16" fill="${ACCENT}"/>
<circle cx="110" cy="85" r="44" fill="${BG}" stroke="${FG}" stroke-width="4"/><circle cx="110" cy="85" r="16" fill="${ACCENT}"/>
<path d="M-200 170 L-160 120 H160 L200 170Z" fill="${BG}" stroke="${DIM}" stroke-width="3"/>
</g>
<text x="600" y="560" font-family="monospace" font-size="30" fill="${FG}" text-anchor="middle">a playlist from your moots' posts · mootmix.bisks.net</text>
</svg>`;
const png = new Resvg(svg).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
