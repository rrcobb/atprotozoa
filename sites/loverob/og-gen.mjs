// Generates public/og.png — the Open Graph preview card for loverob, so a
// shared link auto-renders a heart-and-heading card in Bluesky / other
// unfurlers. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#170810", FG = "#f3eefc", DIM = "#e7c3ce";
const ACCENT = "#e0245e", ACCENT2 = "#ff8fab";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="85%" cy="10%" r="60%">
      <stop offset="0" stop-color="#4a0e26"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="8%" cy="95%" r="55%">
      <stop offset="0" stop-color="#2a0a16"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT2}"/>
      <stop offset="1" stop-color="${ACCENT}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- Hand-drawn heart, not a text glyph: resvg here has no system fonts and
       JetBrains Mono has no U+2665 glyph, so a <text>♥</text> silently
       rasterizes as a tofu box (confirmed by rendering and eyeballing the
       PNG before landing on this). A vector path always works. -->
  <path d="M780,230 C780,180 720,150 670,180 C650,192 630,215 620,240 C610,215 590,192 570,180 C520,150 460,180 460,230 C460,300 550,350 620,410 C690,350 780,300 780,230 Z"
        fill="${ACCENT}" opacity="0.16"/>

  <text x="64" y="185" font-family="JetBrains Mono" font-weight="900" font-size="96" fill="url(#title)">loverob</text>
  <text x="64" y="240" font-family="JetBrains Mono" font-size="26" fill="${DIM}">a shrine for @bisks.net</text>

  <text x="64" y="330" font-family="JetBrains Mono" font-size="19" fill="${DIM}">His real live profile. Receipts on why he's</text>
  <text x="64" y="360" font-family="JetBrains Mono" font-size="19" fill="${DIM}">worth loving. A love-o-meter rigged in his</text>
  <text x="64" y="390" font-family="JetBrains Mono" font-size="19" fill="${DIM}">favor. A guestbook anyone can sign.</text>

  <rect x="62" y="470" width="420" height="2" fill="${ACCENT}" opacity="0.4"/>
  <text x="64" y="530" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT2}">loverob.bisks.net</text>
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
