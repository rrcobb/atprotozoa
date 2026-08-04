// Generates public/og.png — the Open Graph preview card for atombank.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium/fontconfig needed — font bundled
// in ./fonts and loaded explicitly). Re-run by hand if the artwork changes.
//
//   node og-gen.mjs   # writes ./public/og.png (uses @resvg/resvg-js from the repo root)

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const INK = "#f1e9d6", DIM = "#a99a78", GOLD = "#d9a441", LINE = "#3a3324";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#181410"/>
      <stop offset="100%" stop-color="#0f0d09"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="none" stroke="${LINE}" stroke-width="2"/>

  <g transform="translate(96,110) rotate(20)" stroke="${GOLD}" stroke-width="4" fill="none">
    <ellipse rx="46" ry="18"/>
    <ellipse rx="46" ry="18" transform="rotate(60)"/>
    <ellipse rx="46" ry="18" transform="rotate(120)"/>
  </g>
  <circle cx="96" cy="110" r="7" fill="${GOLD}"/>
  <text x="160" y="128" font-family="JetBrains Mono" font-weight="700" font-size="64" fill="${GOLD}">atombank</text>
  <text x="72" y="196" font-family="JetBrains Mono" font-size="26" fill="${DIM}">lexical atom bank</text>

  <text x="72" y="330" font-family="JetBrains Mono" font-size="30" fill="${INK}">paste any text. deduplicate it into unique</text>
  <text x="72" y="372" font-family="JetBrains Mono" font-size="30" fill="${INK}">"lexical atoms." deposit them into your vault.</text>

  <text x="72" y="460" font-family="JetBrains Mono" font-size="22" fill="${DIM}">a real tool, built after a bsky thread dubbed a post</text>
  <text x="72" y="492" font-family="JetBrains Mono" font-size="22" fill="${DIM}">"Lexical Atom Bank Deduplication."</text>

  <text x="${W - 72}" y="${H - 60}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${GOLD}">atombank.bisks.net</text>
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
