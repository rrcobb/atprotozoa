// Generates public/og.png — the Open Graph preview card for nextbigthing.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Copied from sites/crowdpleaser/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Per-crowning shares (/s/<term>/<count>) reuse this
// same generic image — only the title/description text varies per share,
// per notes/45-sharing-and-virality.md's tiered checklist.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG1 = "#eaf3ff", BG2 = "#bcdcff";
const INK = "#0b1f33", MUTED = "#57708c";
const ACCENT = "#1185fe", GOLD = "#f5a623", GREEN = "#2fb88a";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="60" y="140" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${ACCENT}">nextbigthing</text>
  <text x="60" y="188" font-family="JetBrains Mono" font-size="24" fill="${INK}">the next big thing on bluesky, decided honestly.</text>

  <text x="60" y="270" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">whatever's genuinely trending on the live firehose right now —</text>
  <text x="60" y="300" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">recomputed every second. nothing here is manufactured.</text>

  <rect x="60" y="360" width="640" height="20" rx="10" fill="#dcebff"/>
  <rect x="60" y="360" width="420" height="20" rx="10" fill="${GOLD}"/>
  <text x="60" y="420" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="${GREEN}">real posts. real words. no fabricated hype.</text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">nextbigthing.bisks.net</text>
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
