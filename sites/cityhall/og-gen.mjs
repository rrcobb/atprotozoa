// Generates public/og.png — the Open Graph preview card for cityhall.
// A mock "term complete" result card: masthead, an archetype verdict, and an
// approval score. Drawn shapes + mono text, not emoji (the bundled font has
// no color-emoji glyphs and resvg would render tofu — same reasoning as
// sites/colorwar/og-gen.mjs, which this is copied from).
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

const BG1 = "#10151b", BG2 = "#0a0d10";
const INK = "#eef1f4", DIM = "#93a0ab";
const GOLD = "#e0b354", GREEN = "#4be38c";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="8%" cy="-8%" r="55%">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.2"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="98%" cy="0%" r="50%">
      <stop offset="0" stop-color="${GREEN}" stop-opacity="0.14"/>
      <stop offset="1" stop-color="${GREEN}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="90" font-family="JetBrains Mono" font-weight="800" font-size="18" letter-spacing="4" fill="${GOLD}">CITYHALL</text>
  <text x="64" y="148" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${INK}">sim city, but they can</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${INK}">vote you down</text>
  <line x1="64" y1="222" x2="640" y2="222" stroke="${GOLD}" stroke-width="3"/>

  <text x="64" y="272" font-family="JetBrains Mono" font-size="19" fill="${DIM}">landlords, tenants, the chamber, the green</text>
  <text x="64" y="298" font-family="JetBrains Mono" font-size="19" fill="${DIM}">coalition, nimbys, and the police union —</text>
  <text x="64" y="324" font-family="JetBrains Mono" font-size="19" fill="${DIM}">all of them get a real vote.</text>

  <text x="64" y="574" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">cityhall.bisks.net</text>

  <rect x="660" y="86" width="480" height="460" rx="18" fill="rgba(255,255,255,0.05)" stroke="rgba(238,241,244,0.18)" stroke-width="1.5"/>
  <text x="900" y="146" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="17" fill="${GOLD}">TERM COMPLETE</text>
  <line x1="800" y1="164" x2="1000" y2="164" stroke="${GREEN}" stroke-width="2"/>

  <text x="900" y="224" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${GREEN}">COALITION</text>
  <text x="900" y="264" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${GREEN}">BUILDER</text>

  <text x="900" y="410" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${GREEN}">68</text>
  <text x="900" y="446" text-anchor="middle" font-family="JetBrains Mono" font-size="17" fill="${DIM}">APPROVAL &#183; 7 POLICIES PASSED</text>
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
