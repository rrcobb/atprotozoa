// Generates public/og.png — the Open Graph preview card for pointless.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js.
// Copied from sites/nextbigthing/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG1 = "#f7f8fc", BG2 = "#e0e2f7";
const INK = "#14152b", MUTED = "#5b5f7a";
const ACCENT = "#4f46e5", GREEN = "#16a34a";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="none" stroke="${ACCENT}" stroke-width="4"/>

  <text x="60" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${INK}">Pointless&#8482;</text>
  <text x="60" y="200" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">the platform for doing nothing, at scale.</text>

  <text x="60" y="290" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">enterprise-grade software that accomplishes</text>
  <text x="60" y="320" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">absolutely nothing, faster than any competitor's nothing.</text>

  <text x="60" y="420" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${GREEN}">Uselessness Score: 100%</text>
  <text x="60" y="460" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">get your Certificate of Complete Uselessness</text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ACCENT}">pointless.bisks.net</text>
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
