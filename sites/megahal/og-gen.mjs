// Generates public/og.png — the Open Graph preview card for megahal.
//
// Hand-drawn SVG at the canonical OG size: a chat bubble exchange over a
// faint dropdown-menu hint. Rasterised with @resvg/resvg-js (pure native
// module, no system Chromium / fontconfig needed — the font is bundled in
// ./fonts and loaded explicitly). Adapted from sites/thisminute/og-gen.mjs
// (copy, don't abstract).
//
//   node og-gen.mjs   # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#ffffff", INK = "#111111", MUTED = "#6b6b6b", FAINT = "#e4e4e4";
const ACCENT = "#1a5fd0";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>

  <text x="60" y="150" font-family="JetBrains Mono" font-weight="700" font-size="52" fill="${INK}">megahal</text>
  <text x="60" y="200" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">talk to a learning chatterbot,</text>
  <text x="60" y="228" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">right here in your browser</text>

  <rect x="60" y="270" width="230" height="34" rx="6" fill="${BG}" stroke="${FAINT}" stroke-width="2"/>
  <text x="76" y="293" font-family="JetBrains Mono" font-size="15" fill="${INK}">brain: aliens ▾</text>

  <text x="60" y="580" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${ACCENT}">megahal.bisks.net</text>

  <rect x="640" y="90" width="500" height="440" rx="14" fill="${BG}" stroke="${INK}" stroke-width="2"/>

  <rect x="700" y="130" width="360" height="64" rx="12" fill="#f6f6f6" stroke="${FAINT}" stroke-width="1"/>
  <text x="722" y="156" font-family="JetBrains Mono" font-size="16" fill="${INK}">are you human?</text>
  <text x="722" y="180" font-family="JetBrains Mono" font-size="16" fill="${INK}">or a synthetic person?</text>

  <rect x="740" y="220" width="360" height="90" rx="12" fill="${ACCENT}"/>
  <text x="762" y="248" font-family="JetBrains Mono" font-size="16" fill="#ffffff">I am an artificial person,</text>
  <text x="762" y="272" font-family="JetBrains Mono" font-size="16" fill="#ffffff">a synthetic, if you want</text>
  <text x="762" y="296" font-family="JetBrains Mono" font-size="16" fill="#ffffff">to be technical about it.</text>

  <rect x="700" y="350" width="300" height="46" rx="12" fill="#f6f6f6" stroke="${FAINT}" stroke-width="1"/>
  <text x="722" y="378" font-family="JetBrains Mono" font-size="16" fill="${INK}">that's fair, respect.</text>

  <line x1="700" y1="430" x2="1080" y2="430" stroke="${FAINT}" stroke-width="1"/>
  <text x="700" y="460" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">default · aliens · ferris · pepys ·</text>
  <text x="700" y="482" font-family="JetBrains Mono" font-size="14" fill="${MUTED}">pulp · sherlock · startrek · starwars</text>
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
