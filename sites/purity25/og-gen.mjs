// Generates public/og.png — the Open Graph preview card for purity25.
// A scorecard mock: masthead, a checklist strip, and a mock score readout.
// Drawn shapes + mono text, not emoji (the bundled font has no color-emoji
// glyphs and resvg would render tofu — same reasoning as
// sites/couplequiz/og-gen.mjs, which this is copied from). Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed).
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

const BG1 = "#17070a", BG2 = "#0c0c0e";
const INK = "#f2ede4", DIM = "#b9ada0";
const RED = "#e21b23", GOLD = "#e8b13c";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="55%">
      <stop offset="0" stop-color="${RED}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${RED}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="0%" r="50%">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.14"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="86" font-family="JetBrains Mono" font-weight="800" font-size="16" letter-spacing="4" fill="${RED}">ROLLING STONE TOP 25, 2026</text>
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="${INK}">purity25</text>
  <line x1="64" y1="178" x2="720" y2="178" stroke="${GOLD}" stroke-width="3"/>

  <text x="64" y="234" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Rate how well you actually know Rolling</text>
  <text x="64" y="262" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Stone's real 2026 top-25 creator list.</text>
  <text x="64" y="290" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Then read our own bios of every one.</text>

  <text x="64" y="574" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">purity25.bisks.net</text>

  <rect x="660" y="86" width="480" height="460" rx="18" fill="rgba(255,255,255,0.05)" stroke="rgba(244,234,212,0.18)" stroke-width="1.5"/>
  <text x="900" y="140" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="16" fill="${RED}">YOUR PURITY SCORE</text>
  <line x1="820" y1="158" x2="980" y2="158" stroke="${GOLD}" stroke-width="2"/>

  <text x="900" y="270" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="96" fill="${INK}">62</text>
  <text x="900" y="312" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="20" fill="${GOLD}">extremely online</text>

  <rect x="720" y="352" width="360" height="6" rx="3" fill="rgba(255,255,255,0.08)"/>
  <rect x="720" y="352" width="223" height="6" rx="3" fill="${RED}"/>

  <text x="900" y="410" text-anchor="middle" font-family="JetBrains Mono" font-size="17" fill="${DIM}">25 creators · likert-scale rated</text>
  <text x="900" y="440" text-anchor="middle" font-family="JetBrains Mono" font-size="17" fill="${DIM}">bios · socials · Bluesky · AI takes</text>
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
