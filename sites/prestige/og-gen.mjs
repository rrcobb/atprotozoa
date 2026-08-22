// Generates public/og.png — the Open Graph preview card for prestige. Hand-
// drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium/fontconfig needed — font is bundled in
// ./fonts and loaded explicitly). Copied from padmoot/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0d0b08", FG = "#f4ecd8", DIM = "#b8a888";
const GOLD = "#f4b400", GOLD2 = "#ffd76a", CARD = "#1c160c", BORDER = "#3a2f18";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="-8%" r="60%">
      <stop offset="0" stop-color="#3a2c08"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${GOLD2}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
    <linearGradient id="chip" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GOLD2}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">🏅 prestige</text>
  <text x="64" y="188" font-family="JetBrains Mono" font-size="22" fill="${DIM}">chain a maxed-out account to a fresh one</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="17" fill="${DIM}">no fake account creation, no fake deletion —</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="17" fill="${DIM}">just a signed record chaining old DID to new DID,</text>
  <text x="64" y="322" font-family="JetBrains Mono" font-size="17" fill="${DIM}">a hand-off badge, and the full lineage.</text>

  <g>
    <circle cx="960" cy="230" r="90" fill="none" stroke="${GOLD}" stroke-width="6"/>
    <circle cx="960" cy="230" r="72" fill="${CARD}" stroke="${BORDER}" stroke-width="2"/>
    <text x="960" y="248" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${GOLD2}">II</text>
  </g>
  <rect x="850" y="352" width="220" height="46" rx="23" fill="url(#chip)"/>
  <text x="960" y="382" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="19" fill="#1a1104">PRESTIGE II</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${GOLD2}">prestige.bisks.net</text>
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
