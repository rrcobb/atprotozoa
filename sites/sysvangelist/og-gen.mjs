// Generates public/og.png — the Open Graph preview card for sysvangelist.
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
const BG = "#0c0a0a", INK = "#f4ece7", MUTED = "#9a8888";
const RED = "#c81e1e", GOLD = "#d8a13a";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="56" fill="${RED}"/>
  <text x="${W / 2}" y="37" font-family="JetBrains Mono" font-weight="800" font-size="22" fill="#ffffff" text-anchor="middle" letter-spacing="4">UNBROKEN LINEAGE OR NOTHING</text>

  <text x="90" y="220" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${INK}">RETURN TO</text>
  <text x="90" y="300" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="${GOLD}">THE SOURCE</text>

  <text x="90" y="360" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">a petition: drop systemd, drop wayland.</text>
  <text x="90" y="392" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">return to sysvinit and xlibre — the only</text>
  <text x="90" y="424" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">software with a lineage nobody had to fork twice to keep honest.</text>

  <rect x="88" y="470" width="420" height="1" fill="#332020"/>
  <text x="90" y="520" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${RED}">sysvangelist.bisks.net</text>
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
