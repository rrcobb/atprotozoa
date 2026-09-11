// Generates public/og.png — the Open Graph preview card for projecthydra.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font is
// bundled in ./fonts and loaded explicitly). Copied from sites/nextbigthing/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Per-pit shares (/s/<finished>/<active>) reuse this
// same generic image — only the title/description text varies per share,
// per notes/45-sharing-and-virality.md's tiered checklist.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG1 = "#1c1815", BG2 = "#0a0807";
const INK = "#f3ece2", MUTED = "#a89a89";
const ACCENT = "#ff6a45", GREEN = "#3ddc84", GOLD = "#f5c34d";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.15" r="1">
      <stop offset="0" stop-color="${BG1}"/>
      <stop offset="1" stop-color="${BG2}"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="60" y="150" font-family="JetBrains Mono" font-weight="800" font-size="76" fill="${INK}">project<tspan fill="${ACCENT}">hydra</tspan></text>
  <text x="60" y="200" font-family="JetBrains Mono" font-size="24" fill="${MUTED}">you start with 1 half-finished project.</text>

  <text x="60" y="290" font-family="JetBrains Mono" font-size="22" fill="${INK}">click it — 50/50 it actually gets done.</text>
  <text x="60" y="326" font-family="JetBrains Mono" font-size="22" fill="${INK}">the other 50/50, it splits into 3 new ones.</text>

  <circle cx="120" cy="440" r="44" fill="none" stroke="${GREEN}" stroke-width="4"/>
  <text x="120" y="452" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${GREEN}" text-anchor="middle">OK</text>
  <text x="185" y="432" font-family="JetBrains Mono" font-size="20" fill="${GREEN}">finished.</text>
  <text x="185" y="458" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">gone for good.</text>

  <circle cx="440" cy="440" r="44" fill="none" stroke="${ACCENT}" stroke-width="4"/>
  <text x="440" y="452" font-family="JetBrains Mono" font-weight="800" font-size="30" fill="${ACCENT}" text-anchor="middle">x3</text>
  <text x="505" y="432" font-family="JetBrains Mono" font-size="20" fill="${ACCENT}">spawns 3 more.</text>
  <text x="505" y="458" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">the pit is bottomless.</text>

  <text x="60" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">projecthydra.bisks.net</text>
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
