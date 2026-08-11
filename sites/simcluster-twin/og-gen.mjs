// Generates public/og.png — the Open Graph preview card, so a shared link
// unfurls a picture instead of a bare URL. Hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — font is bundled in ./fonts and loaded
// explicitly). Copied from sites/simcluster-samesame/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Static, generic card (illustrative twin/anti-twin panels, not tied to a
// real handle) — the real per-handle graphic is generated live, client-side,
// in public/app.js (drawGraphic).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0710", FG = "#f2e9ff", DIM = "#a996c4";
const RED = "#ff6b6b", GREEN = "#6ef2c9";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="60%">
      <stop offset="0" stop-color="#3a1a52"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="85%" cy="100%" r="55%">
      <stop offset="0" stop-color="#0f2a26"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GREEN}"/>
      <stop offset="1" stop-color="${RED}"/>
    </linearGradient>
    <linearGradient id="panelTwin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a2420"/>
      <stop offset="1" stop-color="#0a1620"/>
    </linearGradient>
    <linearGradient id="panelAnti" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a0a0a"/>
      <stop offset="1" stop-color="#1a0505"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="110" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">twin &amp;</text>
  <text x="64" y="168" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">anti-twin</text>
  <text x="64" y="220" font-family="JetBrains Mono" font-size="19" fill="${DIM}">ADVANCED ALGORITHMS read every post in</text>
  <text x="64" y="248" font-family="JetBrains Mono" font-size="19" fill="${DIM}">your SimCluster to find who you post</text>
  <text x="64" y="276" font-family="JetBrains Mono" font-size="19" fill="${DIM}">most like — and least like.</text>
  <text x="64" y="330" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GREEN}">simcluster-twin.bisks.net</text>

  <g>
    <rect x="700" y="50" width="440" height="210" rx="16" fill="url(#panelTwin)" stroke="#1a3a36" stroke-width="2"/>
    <text x="740" y="95" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${GREEN}">🧬 TWIN</text>
    <text x="920" y="150" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="48" fill="${FG}">92%</text>
    <text x="920" y="230" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">closest match in the cluster</text>
  </g>

  <g>
    <rect x="700" y="290" width="440" height="210" rx="16" fill="url(#panelAnti)" stroke="#5a1a1a" stroke-width="2"/>
    <text x="740" y="335" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${RED}">🪞 ANTI-TWIN</text>
    <text x="920" y="390" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="48" fill="${FG}">11%</text>
    <text x="920" y="470" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">most opposite match, same cluster</text>
  </g>
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
