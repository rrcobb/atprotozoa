// Generates public/og.png — the Open Graph preview card for dontpressit.
//
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). node_modules + fonts copied in
// from sites/guestbet, which already vendors this. House style:
// self-contained, copy-don't-abstract.
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0a0a", INK = "#f2f2f2", MUTED = "#8a8a8a";
const RED = "#e0261f", REDDARK = "#3a1210";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <circle cx="330" cy="315" r="185" fill="${RED}"/>
  <circle cx="330" cy="315" r="185" fill="none" stroke="${REDDARK}" stroke-width="16"/>
  <text x="330" y="290" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="#ffffff" text-anchor="middle">DO NOT</text>
  <text x="330" y="332" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="#ffffff" text-anchor="middle">PRESS</text>
  <text x="330" y="374" font-family="JetBrains Mono" font-weight="800" font-size="34" fill="#ffffff" text-anchor="middle">THIS BUTTON</text>

  <text x="660" y="270" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${INK}">there is one button</text>
  <text x="660" y="316" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">one, total, shared by every visitor.</text>
  <text x="660" y="346" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">each round is somebody's name. press it and</text>
  <text x="660" y="376" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">they graduate forever. it never stops.</text>

  <text x="660" y="460" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${RED}">dontpressit.bisks.net</text>
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
