// Generates public/og.png — the Open Graph preview card for selflikes. Same
// recipe as sites/backscroll/og-gen.mjs (copy, don't abstract): hand-drawn
// SVG at the canonical OG size, rasterised with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A heart looping back around to point at itself — the whole idea in one
// glance.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#10121a", FG = "#f4f6fb", DIM = "#8a8fae", ACCENT = "#ff6f9c";

const cx = 960, cy = 340, r = 150;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="75%" cy="45%" r="90%">
      <stop offset="0%" stop-color="#221421"/>
      <stop offset="55%" stop-color="${BG}"/>
      <stop offset="100%" stop-color="#07080d"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.9"/>
      <stop offset="45%" stop-color="${ACCENT}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="${ACCENT}"/>
    </marker>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <circle cx="${cx}" cy="${cy}" r="${r + 60}" fill="url(#glow)"/>
  <path d="M ${cx - r},${cy} A ${r},${r} 0 1 1 ${cx - r - 1},${cy + 2}" fill="none" stroke="${ACCENT}" stroke-width="4" stroke-dasharray="6 10" marker-end="url(#arrow)"/>
  <path transform="translate(${cx - 60},${cy - 50}) scale(2.2)" d="M27,47 C10,35 0,25 0,13 C0,4 7,-2 15,-2 C20,-2 24,1 27,6 C30,1 34,-2 39,-2 C47,-2 54,4 54,13 C54,25 44,35 27,47 Z" fill="${ACCENT}"/>

  <text x="64" y="188" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${FG}">selflikes</text>
  <text x="64" y="230" font-family="JetBrains Mono" font-size="22" fill="${ACCENT}">have you ever liked your own post?</text>

  <text x="64" y="300" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Downloads your whole repo in one shot and</text>
  <text x="64" y="328" font-family="JetBrains Mono" font-size="19" fill="${DIM}">cross-checks your likes against your own</text>
  <text x="64" y="356" font-family="JetBrains Mono" font-size="19" fill="${DIM}">posts. No public index of self-likes exists —</text>
  <text x="64" y="384" font-family="JetBrains Mono" font-size="19" fill="${DIM}">none is needed.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${FG}">selflikes.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r2 = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r2.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
