// Generates public/og.png — the Open Graph preview card for suave.
// A sample result card: masthead, a big percentage, the tier title, and a
// line of the tier description. Drawn shapes + mono text, not emoji (the
// bundled font has no color-emoji glyphs and resvg would render tofu — same
// reasoning as sites/shipname/og-gen.mjs). Rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed).
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

const BG1 = "#121a20", BG2 = "#0a0f13";
const INK = "#eef3f5", DIM = "#92a5ac";
const TEAL = "#4fb3a9", GOLD = "#d8b25c";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="12%" cy="-10%" r="55%">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.20"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="0%" r="50%">
      <stop offset="0" stop-color="${TEAL}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${TEAL}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="90" font-family="JetBrains Mono" font-weight="800" font-size="18" letter-spacing="4" fill="${TEAL}">THE SOCIAL SUAVENESS QUIZ</text>
  <text x="64" y="152" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${GOLD}">suave</text>
  <line x1="64" y1="180" x2="620" y2="180" stroke="${TEAL}" stroke-width="3"/>

  <text x="64" y="240" font-family="JetBrains Mono" font-size="20" fill="${DIM}">38 true/false questions on how you</text>
  <text x="64" y="268" font-family="JetBrains Mono" font-size="20" fill="${DIM}">read a room, take someone's perspective,</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="20" fill="${DIM}">and adjust on the fly.</text>

  <text x="64" y="574" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${TEAL}">suave.bisks.net</text>

  <rect x="640" y="86" width="500" height="460" rx="18" fill="rgba(255,255,255,0.05)" stroke="rgba(238,243,245,0.16)" stroke-width="1.5"/>
  <text x="890" y="146" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="18" fill="${TEAL}">SAMPLE RESULT</text>
  <line x1="800" y1="164" x2="980" y2="164" stroke="${GOLD}" stroke-width="2"/>

  <text x="890" y="270" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="78" fill="${INK}">86%</text>
  <text x="890" y="312" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="24" fill="${GOLD}">certifiably suave</text>

  <text x="890" y="370" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${DIM}">good at reading people, taking</text>
  <text x="890" y="396" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${DIM}">their perspective, and adjusting</text>
  <text x="890" y="422" text-anchor="middle" font-family="JetBrains Mono" font-size="18" fill="${DIM}">your behavior accordingly.</text>

  <text x="890" y="490" text-anchor="middle" font-family="JetBrains Mono" font-size="17" fill="${TEAL}">33 / 38</text>
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
