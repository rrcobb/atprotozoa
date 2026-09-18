// Generates public/og.png — the Open Graph preview card for brennanswedding,
// so a shared link auto-renders a themed card in Bluesky / other unfurlers.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — this box has no
// fontconfig/system fonts either, so the font is bundled in ./fonts and
// loaded explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

// Palette pulled from brennan.computer's real avatar (a noir photo, a glowing
// ring-and-sigil) and banner (warm golden-hour light on water) — the "themed
// on his profile" ask, not a generic wedding palette.
const BG = "#0c0a08", FG = "#f3ece0", DIM = "#c9bba8";
const ACCENT = "#e2a24a", ACCENT2 = "#c97a4a";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="88%" cy="12%" r="60%">
      <stop offset="0" stop-color="#3a2410"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="6%" cy="95%" r="55%">
      <stop offset="0" stop-color="#2a1a0c"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${FG}"/>
      <stop offset="1" stop-color="${ACCENT}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- A glowing ring-and-sigil, echoing the mark in his own avatar. -->
  <circle cx="1010" cy="180" r="70" fill="none" stroke="${FG}" stroke-width="6" opacity="0.85"/>
  <path d="M1010,145 L1035,205 L1010,220 L985,205 Z" fill="${FG}" opacity="0.85"/>

  <text x="64" y="175" font-family="JetBrains Mono" font-weight="900" font-size="80" fill="url(#title)">brennanswedding</text>
  <text x="64" y="228" font-family="JetBrains Mono" font-size="26" fill="${DIM}">a guest book for @brennan.computer</text>

  <text x="64" y="330" font-family="JetBrains Mono" font-size="19" fill="${DIM}">His real live profile. A few apropos lines dug</text>
  <text x="64" y="360" font-family="JetBrains Mono" font-size="19" fill="${DIM}">out of his own posting history, one repo CAR</text>
  <text x="64" y="390" font-family="JetBrains Mono" font-size="19" fill="${DIM}">download. A guest book anyone can sign.</text>

  <rect x="62" y="470" width="420" height="2" fill="${ACCENT}" opacity="0.5"/>
  <text x="64" y="530" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">brennanswedding.bisks.net</text>
  <text x="64" y="566" font-family="JetBrains Mono" font-size="16" fill="${DIM}">built by @buildthis.bisks.net</text>
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
