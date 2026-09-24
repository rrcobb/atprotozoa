// Generates public/og.png — the Open Graph preview card for sayitlike.
//
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). node_modules + fonts copied in
// from sites/dontpressit, which already vendors this. House style:
// self-contained, copy-don't-abstract.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#f4f1ea", INK = "#1f1c18", MUTED = "#6b6156", ACCENT = "#7a4a2e";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="10" height="${H}" fill="${ACCENT}"/>

  <text x="90" y="230" font-family="JetBrains Mono" font-weight="800" font-size="88" fill="${INK}">sayitlike</text>

  <text x="92" y="300" font-family="JetBrains Mono" font-size="26" fill="${MUTED}">"French." "Pirate." "1990s skater slang."</text>
  <text x="92" y="340" font-family="JetBrains Mono" font-size="26" fill="${MUTED}">Type it, say how you want it said, get it back.</text>

  <text x="92" y="420" font-family="JetBrains Mono" font-size="24" fill="${ACCENT}">your own OpenAI or OpenRouter key — browser only</text>

  <rect x="90" y="470" width="420" height="2" fill="${INK}" opacity="0.15"/>
  <text x="90" y="520" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${INK}">sayitlike.bisks.net</text>
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
