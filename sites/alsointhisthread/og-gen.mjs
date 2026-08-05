// Generates public/og.png — the Open Graph preview card for
// alsointhisthread. Hand-drawn SVG at the canonical OG size, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium / fontconfig
// needed — the font is bundled in ./fonts and loaded explicitly). Same
// recipe as sites/intrigue/og-gen.mjs and sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0a12", FG = "#ece9f7", DIM = "#9a93b8";
const ACCENT = "#4fd1c5", ACCENT2 = "#f3a35c";

// A small, deliberately abstract "doctor" figure — round head, white coat,
// stethoscope loop — evoking the "I too am in this thread" reaction format
// in shape only, not a likeness of any real actor or a reproduction of any
// show's artwork.
const doctor = `
  <g transform="translate(90,150) scale(3.4)">
    <circle cx="43" cy="43" r="41" fill="#1c1730" stroke="#2b2540" stroke-width="1.5"/>
    <path d="M22 78c1-16 8-24 21-24s20 8 21 24" fill="${FG}"/>
    <path d="M31 55l6 6-6 4-4-8z" fill="#ffffff"/>
    <path d="M55 55l-6 6 6 4 4-8z" fill="#ffffff"/>
    <circle cx="43" cy="38" r="15" fill="#f3c9a1"/>
    <circle cx="38" cy="37" r="1.6" fill="#241c33"/>
    <circle cx="48" cy="37" r="1.6" fill="#241c33"/>
    <path d="M38 44c2 2 8 2 10 0" stroke="#241c33" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M33 58c3 8 17 8 20 0" stroke="#c9c2e8" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="30" cy="64" r="3" fill="#c9c2e8"/>
  </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#2a1250"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="0%" r="55%">
      <stop offset="0" stop-color="#3a2408"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT2}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="56" y="90" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="url(#title)">also in this thread</text>

  ${doctor}

  <text x="340" y="290" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${FG}">"I too am in</text>
  <text x="340" y="346" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${FG}">this thread."</text>

  <text x="56" y="450" font-family="JetBrains Mono" font-size="22" fill="${DIM}">Every thread you've ever said "buh" in.</text>
  <text x="56" y="482" font-family="JetBrains Mono" font-size="22" fill="${DIM}">Every time you called something "interesting."</text>
  <text x="56" y="514" font-family="JetBrains Mono" font-size="22" fill="${DIM}">Read from your <tspan fill="${ACCENT2}">whole</tspan> post history.</text>

  <text x="56" y="580" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT2}">alsointhisthread.bisks.net</text>
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
