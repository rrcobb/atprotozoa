// Generates public/og.png — the Open Graph preview card, so a shared link
// unfurls a picture instead of a bare URL. Hand-drawn SVG at the canonical
// OG size, rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed — font is bundled in ./fonts and loaded
// explicitly). Copied from sites/simcluster-levels/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// Static, generic card (two illustrative seals, not tied to real handles) —
// the real per-pairing card is generated live, client-side, in
// public/app.js (drawShareCard).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b1c2c", PAPER = "#0f2740", INK = "#eaf6ff", DIM = "#7fa3bf";
const BLUBBER = "#ffb84d", BLUBBER2 = "#ff7a5c", FROST = "#9fe3ff", BLUE = "#5aa9d6";

function seal(cx, cy, r, color, blubberized) {
  const fill = blubberized ? BLUBBER : color;
  return `
    <ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.72}" fill="${fill}"/>
    <ellipse cx="${cx}" cy="${cy + r * 0.22}" rx="${r * 0.55}" ry="${r * 0.32}" fill="#00000022"/>
    <circle cx="${cx}" cy="${cy - r * 0.85}" r="${r * 0.32}" fill="${fill}"/>
    <circle cx="${cx - r * 0.12}" cy="${cy - r * 0.9}" r="${Math.max(2, r * 0.045)}" fill="#0c1a26"/>
    <circle cx="${cx + r * 0.12}" cy="${cy - r * 0.9}" r="${Math.max(2, r * 0.045)}" fill="#0c1a26"/>
  `;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="60%">
      <stop offset="0" stop-color="${FROST}" stop-opacity="0.14"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="100%" cy="100%" r="60%">
      <stop offset="0" stop-color="${BLUBBER2}" stop-opacity="0.12"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <rect x="60" y="60" width="1080" height="510" rx="22" fill="${PAPER}" stroke="#1c3c58" stroke-width="2"/>

  <text x="100" y="150" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${FROST}">SEAL FISSION CHAMBER</text>
  <text x="100" y="220" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">blubberize</text>
  <text x="100" y="270" font-family="JetBrains Mono" font-size="20" fill="${DIM}">Bluesky but every account is a seal, sized</text>
  <text x="100" y="300" font-family="JetBrains Mono" font-size="20" fill="${DIM}">by followers. fission off half your blubber</text>
  <text x="100" y="330" font-family="JetBrains Mono" font-size="20" fill="${DIM}">and render a target BLUBBERIZED.</text>
  <text x="100" y="390" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${BLUBBER}">blubberize.bisks.net</text>

  ${seal(870, 420, 60, BLUE, false)}
  <text x="870" y="520" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${DIM}">you</text>

  <polygon points="980,382 950,422 968,422 956,458 992,414 972,414" fill="${BLUBBER2}"/>

  ${seal(1075, 420, 78, BLUE, true)}
  <text x="1075" y="540" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${BLUBBER}">blubberized</text>
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
