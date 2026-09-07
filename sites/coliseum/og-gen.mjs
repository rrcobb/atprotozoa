// Generates public/og.png — the Open Graph preview card for coliseum, so a
// shared link auto-renders a picture of the arena instead of a bare title.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly, same recipe as sites/didscope).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// This is the static fallback card for the bare link. Per-brawl share cards
// are generated live, client-side, in public/app.js (buildShareCard).

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#120c08", INK = "#f3e9da", MUTED = "#b3a08a";
const GOLD = "#e0b84f", A = "#4fb8e0", B = "#e05f5f", SAND = "#caa872", SAND2 = "#8a6a3f";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="30%" r="65%">
      <stop offset="0" stop-color="#3a2c1e"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="floor" cx="50%" cy="50%" r="55%">
      <stop offset="0" stop-color="${SAND}"/>
      <stop offset="1" stop-color="${SAND2}"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="${W / 2}" y="96" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="60" fill="${GOLD}">coliseum</text>
  <text x="${W / 2}" y="136" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">a bsky stands view of everyone fighting it out</text>

  <ellipse cx="${W / 2}" cy="360" rx="420" ry="150" fill="url(#floor)"/>

  <circle cx="${W / 2 - 220}" cy="320" r="48" fill="none" stroke="${A}" stroke-width="5"/>
  <circle cx="${W / 2 - 220}" cy="320" r="34" fill="#1c140e"/>
  <circle cx="${W / 2 + 220}" cy="320" r="48" fill="none" stroke="${B}" stroke-width="5"/>
  <circle cx="${W / 2 + 220}" cy="320" r="34" fill="#1c140e"/>
  <text x="${W / 2}" y="332" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="32" fill="#241a0c">VS</text>

  ${Array.from({ length: 18 })
    .map((_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 6);
      const cx = W / 2 + side * (300 + row * 40 + (i % 3) * 22);
      const cy = 470 + row * 34;
      const r = 9 + ((i * 7) % 6);
      const fill = i % 5 === 0 ? MUTED : side < 0 ? A : B;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="0.85"/>`;
    })
    .join("\n  ")}

  <text x="${W / 2}" y="575" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${MUTED}">paste a bsky post — the loudest replies fight, everyone else picks a stand</text>
  <text x="${W / 2}" y="608" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">coliseum.bisks.net</text>
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
