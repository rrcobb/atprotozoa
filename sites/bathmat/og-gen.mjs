// Generates public/og.png — the Open Graph preview card for bathmat.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Re-run by hand if the artwork changes.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG_A = "#efe6d3", BG_B = "#f4efe4", LINE = "#ddd2b8";
const INK = "#2b2620", DIM = "#746c5c", GOLD = "#a9822f", WAX = "#6f2430";

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BG_A}"/>
      <stop offset="100%" stop-color="${BG_B}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="${LINE}" stroke-width="2"/>

  <text x="76" y="112" font-family="JetBrains Mono" font-weight="600" font-size="22" letter-spacing="2" fill="${GOLD}">MARBLE &amp; MOSS — ATELIER DES SOLS</text>

  <text x="76" y="200" font-family="JetBrains Mono" font-weight="700" font-size="58" fill="${INK}">The Sovereign Bath Mat</text>
  <text x="76" y="248" font-family="JetBrains Mono" font-style="italic" font-size="26" fill="${WAX}">${esc("Plusher than the apology you're owed.")}</text>

  <text x="76" y="330" font-family="JetBrains Mono" font-size="24" fill="${INK}">Woven from Mongolian cashmere-blend pile, finished with</text>
  <text x="76" y="364" font-family="JetBrains Mono" font-size="24" fill="${INK}">hand-loomed Egyptian cotton and a discreet gold thread.</text>

  <text x="76" y="${H - 140}" font-family="JetBrains Mono" font-weight="700" font-size="46" fill="${WAX}">$6,840</text>
  <text x="76" y="${H - 98}" font-family="JetBrains Mono" font-size="20" fill="${DIM}">No. 042 of 250 · hand-verified by Étienne Foulard</text>

  <text x="${W - 76}" y="${H - 62}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${GOLD}">bisks.net/bathmat</text>
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
