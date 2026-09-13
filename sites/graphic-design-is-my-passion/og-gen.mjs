// Generates public/og.png — the Open Graph preview card for
// graphic-design-is-my-passion.
//
// Hand-draws the agent-mode hero (dark bg, blurred gradient blobs, a glass
// card, gradient headline text) as an SVG at the canonical OG size, then
// rasterises it with @resvg/resvg-js (pure native module, no system Chromium
// needed — this box has no fontconfig/system fonts either, so Poppins is
// bundled in ./fonts and loaded explicitly).
// Copied from sites/addtheboom/og-gen.mjs (copy, don't abstract).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// No live data, no network — deterministic so the card is stable across
// builds.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const W = 1200, H = 630;
const BG = "#0e0a1a";
const GRAD1 = "#7c3aed";
const GRAD2 = "#ec4899";
const GRAD3 = "#f97316";

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="headline" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="55%" stop-color="${GRAD2}"/>
      <stop offset="100%" stop-color="${GRAD3}"/>
    </linearGradient>
    <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${GRAD1}"/>
      <stop offset="100%" stop-color="${GRAD2}"/>
    </linearGradient>
    <filter id="blur1" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="55"/>
    </filter>
    <filter id="blur2" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="70"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>

  <!-- drifting gradient blobs -->
  <circle cx="120" cy="80" r="230" fill="${GRAD1}" opacity="0.55" filter="url(#blur1)"/>
  <circle cx="1120" cy="560" r="210" fill="${GRAD3}" opacity="0.5" filter="url(#blur2)"/>
  <circle cx="980" cy="140" r="170" fill="${GRAD2}" opacity="0.45" filter="url(#blur1)"/>

  <!-- badge pill -->
  <rect x="80" y="72" width="430" height="46" rx="23" fill="url(#badgeGrad)" opacity="0.9"/>
  <text x="103" y="102" font-family="Poppins" font-weight="700" font-size="19" fill="#ffffff">AI · Agentic Design Intelligence™</text>

  <!-- gradient headline -->
  <text x="76" y="248" font-family="Poppins" font-weight="800" font-size="88" fill="url(#headline)" letter-spacing="-1">Graphic Design</text>
  <text x="76" y="340" font-family="Poppins" font-weight="800" font-size="88" fill="url(#headline)" letter-spacing="-1">is my Passion.</text>

  <text x="80" y="406" font-family="Poppins" font-weight="400" font-size="24" fill="rgba(255,255,255,0.72)">the meme, rebuilt with every AI-startup design cliche at once —</text>
  <text x="80" y="440" font-family="Poppins" font-weight="400" font-size="24" fill="rgba(255,255,255,0.72)">plus a toggle back to Comic Sans.</text>

  <!-- fake stat chips -->
  <g font-family="Poppins" font-weight="700" font-size="20">
    <rect x="80" y="486" width="230" height="70" rx="18" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.25)"/>
    <text x="100" y="516" fill="#ffffff">10,000+</text>
    <text x="100" y="540" font-weight="400" font-size="14" fill="rgba(255,255,255,0.6)">Gradients Deployed</text>

    <rect x="326" y="486" width="200" height="70" rx="18" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.25)"/>
    <text x="346" y="516" fill="#ffffff">99.2%</text>
    <text x="346" y="540" font-weight="400" font-size="14" fill="rgba(255,255,255,0.6)">Vibe Coverage</text>

    <rect x="542" y="486" width="200" height="70" rx="18" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.25)"/>
    <text x="562" y="516" fill="#ffffff">24/7</text>
    <text x="562" y="540" font-weight="400" font-size="14" fill="rgba(255,255,255,0.6)">Aesthetic Uptime</text>
  </g>

  <text x="80" y="600" font-family="Poppins" font-weight="400" font-size="20" fill="rgba(255,255,255,0.45)">graphic-design-is-my-passion.bisks.net</text>
</svg>`;

const resvg = new Resvg(svg, {
  font: {
    fontFiles: [
      join(__dirname, "fonts/Poppins-Regular.ttf"),
      join(__dirname, "fonts/Poppins-SemiBold.ttf"),
      join(__dirname, "fonts/Poppins-Bold.ttf"),
      join(__dirname, "fonts/Poppins-ExtraBold.ttf"),
    ],
    loadSystemFonts: false,
    defaultFontFamily: "Poppins",
  },
  background: BG,
});
const png = resvg.render().asPng();
writeFileSync(join(__dirname, "public/og.png"), png);
console.log(`wrote public/og.png (${png.length} bytes)`);
