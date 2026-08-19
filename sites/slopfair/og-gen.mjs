// Generates public/og.png — the Open Graph preview card for the World Fair
// of Slop. Same recipe as sites/receipts/og-gen.mjs: hand-drawn SVG at the
// canonical OG size, rasterised with @resvg/resvg-js (no system Chromium
// needed).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0c0a10";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3aed"/>
      <stop offset="0.5" stop-color="#ec4899"/>
      <stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f59e0b"/>
      <stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
    <radialGradient id="glow" cx="10%" cy="0%" r="60%">
      <stop offset="0" stop-color="#241638"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <rect x="64" y="64" width="${W - 128}" height="220" rx="16" fill="url(#hero)"/>
  <text x="${W / 2}" y="170" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="#ffffff">Unlock Your Potential.</text>
  <text x="${W / 2}" y="212" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="#f3e8ff">The all-in-one platform that helps ambitious teams supercharge everything.</text>
  <rect x="${W / 2 - 110}" y="236" width="220" height="34" rx="17" fill="#ffffff"/>
  <text x="${W / 2}" y="259" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="15" fill="#6d28d9">Get Started Free →</text>

  <text x="64" y="360" font-family="JetBrains Mono" font-weight="900" font-size="54" fill="url(#title)">🎪 The World Fair of Slop</text>
  <text x="64" y="404" font-family="JetBrains Mono" font-size="19" fill="#a598bd">An international exposition of default AI-slop web design —</text>
  <text x="64" y="430" font-family="JetBrains Mono" font-size="19" fill="#a598bd">gradient heroes, trust badges, chatbot ambush bubbles, all placarded.</text>

  <text x="64" y="500" font-family="JetBrains Mono" font-size="15" fill="#ffd166">EXHIBIT 01 — THE GRADIENT HERO · Purpurea diagonalis</text>

  <text x="64" y="574" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="#ece6f6">slopfair.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
