// Generates public/og.png — the Open Graph preview card, so a shared link
// unfurls a picture of the gacha instead of a bare URL. Hand-drawn SVG at
// the canonical OG size, rasterised with @resvg/resvg-js (pure native
// module, no system Chromium/fontconfig needed — font is bundled in
// ./fonts and loaded explicitly). Copied from sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Static, generic card (an SSR reveal, not tied to a real handle) — the
// per-pull share card is generated live, client-side, in public/app.js
// (buildShareCard).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0710", FG = "#f2e9ff", DIM = "#a996c4";
const GOLD = "#ffd24e", PURPLE = "#c084fc", CARD = "#241708", BORDER = "#ffd24e";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="0%" r="60%">
      <stop offset="0" stop-color="#3a1a52"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="85%" cy="90%" r="55%">
      <stop offset="0" stop-color="#3a2a0a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${PURPLE}"/>
    </linearGradient>
    <radialGradient id="cardglow" cx="50%" cy="35%" r="60%">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- left: wordmark + pitch -->
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">simcluster</text>
  <text x="64" y="210" font-family="JetBrains Mono" font-weight="800" font-size="58" fill="url(#title)">gacha</text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Every account in a handle's</text>
  <text x="64" y="318" font-family="JetBrains Mono" font-size="19" fill="${DIM}"><tspan fill="${GOLD}">SimCluster</tspan> becomes a card.</text>
  <text x="64" y="360" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Rarity is real followers, not luck.</text>
  <text x="64" y="388" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Whoever you search is the rate-up SSR.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="#6ef2c9">simcluster-gacha.bisks.net</text>

  <!-- right: sample SSR card -->
  <g>
    <rect x="750" y="70" width="380" height="490" rx="24" fill="${CARD}" stroke="${BORDER}" stroke-width="4"/>
    <rect x="750" y="70" width="380" height="490" rx="24" fill="url(#cardglow)"/>
    <circle cx="940" cy="200" r="72" fill="#2a1d3a" stroke="${GOLD}" stroke-width="3"/>
    <text x="940" y="222" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${GOLD}">?</text>
    <text x="940" y="300" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${GOLD}">SSR</text>
    <text x="940" y="345" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="${FG}">???</text>
    <text x="940" y="372" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${DIM}">@your.search.here</text>
    <text x="940" y="440" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="15" fill="${FG}">ATK ????   DEF ????   SPD ????</text>
    <text x="940" y="530" text-anchor="middle" font-family="JetBrains Mono" font-size="14" fill="${DIM}">pull to reveal</text>
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
