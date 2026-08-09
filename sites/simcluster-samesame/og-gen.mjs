// Generates public/og.png — the Open Graph preview card, so a shared link
// unfurls a picture instead of a bare URL. Hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — font is bundled in ./fonts and loaded
// explicitly). Copied from sites/simcluster-gacha/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Static, generic card (two illustrative mini bar charts, not tied to a
// real handle) — the real per-handle graphic is generated live,
// client-side, in public/app.js (drawGraphic).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0710", FG = "#f2e9ff", DIM = "#a996c4";
const RED = "#ff6b6b", GREEN = "#6ef2c9", BLUE = "#4ea1ff";

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
      <stop offset="0" stop-color="${RED}"/>
      <stop offset="1" stop-color="${GREEN}"/>
    </linearGradient>
    <linearGradient id="panelA" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a0a0a"/>
      <stop offset="1" stop-color="#1a0505"/>
    </linearGradient>
    <linearGradient id="panelB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0a2420"/>
      <stop offset="1" stop-color="#0a1620"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="110" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">same graphic,</text>
  <text x="64" y="168" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">twice</text>
  <text x="64" y="220" font-family="JetBrains Mono" font-size="19" fill="${DIM}">One real number from your SimCluster —</text>
  <text x="64" y="248" font-family="JetBrains Mono" font-size="19" fill="${DIM}">the mutual rate — plotted once to look</text>
  <text x="64" y="276" font-family="JetBrains Mono" font-size="19" fill="${DIM}">alarming, once to look calm.</text>
  <text x="64" y="330" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GREEN}">simcluster-samesame.bisks.net</text>

  <!-- mini alarming panel -->
  <g>
    <rect x="700" y="50" width="440" height="220" rx="16" fill="url(#panelA)" stroke="#5a1a1a" stroke-width="2"/>
    <text x="920" y="90" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${RED}">!! EXPOSED !!</text>
    <rect x="760" y="120" width="70" height="120" rx="6" fill="${RED}"/>
    <rect x="890" y="180" width="70" height="60" rx="6" fill="#7a3a3a"/>
    <line x1="740" y1="240" x2="1020" y2="240" stroke="#ff8a8a" stroke-width="2"/>
    <text x="920" y="260" text-anchor="middle" font-family="JetBrains Mono" font-size="12" fill="#e8a0a0">*axis doesn't start at 0</text>
  </g>

  <!-- mini calm panel -->
  <g>
    <rect x="700" y="300" width="440" height="220" rx="16" fill="url(#panelB)" stroke="#1a3a36" stroke-width="2"/>
    <text x="920" y="335" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="${FG}">honestly</text>
    <line x1="760" y1="490" x2="1080" y2="490" stroke="rgba(242,233,255,0.3)" stroke-width="1"/>
    <line x1="760" y1="455" x2="1080" y2="455" stroke="rgba(242,233,255,0.15)" stroke-width="1"/>
    <line x1="760" y1="420" x2="1080" y2="420" stroke="rgba(242,233,255,0.15)" stroke-width="1"/>
    <rect x="780" y="440" width="70" height="50" rx="6" fill="${BLUE}"/>
    <rect x="910" y="470" width="70" height="20" rx="6" fill="${GREEN}"/>
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
