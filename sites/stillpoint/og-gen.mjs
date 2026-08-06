// Generates public/og.png — the static Open Graph preview card for
// stillpoint, so a bare link unfurls as a real thing in Bluesky / other
// unfurlers. Hand-drawn SVG matching the live page's night-indigo palette,
// rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — this box has no fontconfig/system fonts either, so the font is
// bundled in ./fonts).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#0b0e1a", GLOW = "#1c2350", FG = "#eef1f8", DIM = "#93a0bd";
const ACCENT = "#a9c6ff", ACCENT2 = "#c9a7ff";
const CARD = "#141833", BORDER = "#293060";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="-5%" r="75%">
      <stop offset="0" stop-color="${GLOW}"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orb" cx="35%" cy="30%" r="60%">
      <stop offset="0" stop-color="${ACCENT2}"/>
      <stop offset="0.55" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <circle cx="${W / 2}" cy="235" r="95" fill="url(#orb)" opacity="0.9"/>

  <text x="${W / 2}" y="380" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="84" fill="${FG}">stillpoint</text>
  <text x="${W / 2}" y="425" text-anchor="middle" font-family="JetBrains Mono" font-size="24" fill="${DIM}">a browser-only guided meditation room</text>

  <rect x="${W / 2 - 360}" y="470" width="240" height="76" rx="14" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${W / 2 - 240}" y="516" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FG}">Breath Anchor</text>

  <rect x="${W / 2 - 120}" y="470" width="240" height="76" rx="14" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${W / 2}" y="516" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FG}">Body Scan</text>

  <rect x="${W / 2 + 120}" y="470" width="240" height="76" rx="14" fill="${CARD}" stroke="${BORDER}" stroke-width="1.5"/>
  <text x="${W / 2 + 240}" y="516" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${FG}">Loving-Kindness</text>

  <text x="${W / 2}" y="590" text-anchor="middle" font-family="JetBrains Mono" font-weight="600" font-size="19" fill="${ACCENT}">stillpoint.bisks.net</text>
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
