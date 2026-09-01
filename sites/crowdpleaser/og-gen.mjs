// Generates public/og.png — the Open Graph preview card for crowdpleaser.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Copied from sites/skymash/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Per-combo shares (/s/<seed>) reuse this same
// generic image — only the title/description text varies per share, per
// notes/45-sharing-and-virality.md's tiered checklist.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG1 = "#fff6e9", BG2 = "#ffe0b0";
const INK = "#2a1e12", MUTED = "#7a6a55";
const ACCENT = "#ff5d73", GOLD = "#f5a623", GREEN = "#2fb88a";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="60" y="140" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${ACCENT}">crowdpleaser</text>
  <text x="60" y="188" font-family="JetBrains Mono" font-size="24" fill="${INK}">a website engineered so that literally everyone likes it.</text>

  <text x="60" y="270" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">cute animal + relatable feeling + wholesome outcome</text>
  <text x="60" y="300" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">= a fresh certified crowd-pleaser, every single time.</text>

  <rect x="60" y="360" width="640" height="20" rx="10" fill="#f0e6d6"/>
  <rect x="60" y="360" width="640" height="20" rx="10" fill="${GREEN}"/>
  <text x="60" y="420" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${GREEN}">✓ 100% approval, margin of error: none</text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">crowdpleaser.bisks.net</text>
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
