// Generates public/og.png — the Open Graph preview card, so a shared link
// unfurls a picture instead of a bare URL. Hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — font is bundled in ./fonts and loaded
// explicitly). Copied from sites/simcluster-alignment/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Static, generic card (an illustrative shortlist + score, not tied to a
// real handle) — the real per-offer share card is generated live,
// client-side, in public/app.js (drawShareCard).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0d0605", FG = "#f5e9e4", DIM = "#b08b85";
const RED = "#ff5a4d", GOLD = "#f4c76a";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="20%" cy="0%" r="60%">
      <stop offset="0" stop-color="#4a1414"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="88%" cy="90%" r="55%">
      <stop offset="0" stop-color="#241018"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${RED}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
    <radialGradient id="orb" cx="35%" cy="30%" r="70%">
      <stop offset="0" stop-color="#ffd7cf"/>
      <stop offset="0.5" stop-color="${RED}"/>
      <stop offset="1" stop-color="#2a0a08" stop-opacity="0.2"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="120" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="url(#title)">villain</text>
  <text x="64" y="178" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="url(#title)">HR</text>
  <text x="64" y="232" font-family="JetBrains Mono" font-size="19" fill="${DIM}">rank your SimCluster's top 10 villain</text>
  <text x="64" y="260" font-family="JetBrains Mono" font-size="19" fill="${DIM}">candidates. audition. mandatory coding</text>
  <text x="64" y="288" font-family="JetBrains Mono" font-size="19" fill="${DIM}">interview. offer letter.</text>
  <text x="64" y="340" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD}">villainhr.bisks.net</text>

  <circle cx="960" cy="315" r="200" fill="url(#orb)"/>
  <text x="960" y="335" text-anchor="middle" font-family="JetBrains Mono" font-weight="900" font-size="66" fill="#1a0705">#1</text>
  <text x="960" y="565" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${FG}">Credible Threat</text>
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
