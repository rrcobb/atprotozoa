// Generates public/og.png — the Open Graph preview card for ridegently, a
// Daytona-USA-style select screen for LLMs that then puts the chosen one on
// a gentle rock-on-a-spring ride-on toy. Hand-drawn SVG, rasterised with
// @resvg/resvg-js (pure native module, no system Chromium needed — this box
// has no fontconfig/system fonts either, so the font is bundled in ./fonts
// and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// A generic card (riding Claude, the default first pod) — this is the
// static fallback for the bare link. Per-ride cards use the same title text
// swapped in server-side by /r/<id> (src/index.ts); the artwork itself
// doesn't vary per ride, same tradeoff didscope's static og.png makes.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0c14", BG2 = "#20172a", FG = "#f1f0ff", DIM = "#8d8bab";
const RIDE = "#d9744f";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="20%" cy="-10%" r="70%">
      <stop offset="0" stop-color="${BG2}"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffb703"/>
      <stop offset="0.6" stop-color="#ff5fa2"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="66" fill="url(#title)">ridegently</text>
  <text x="64" y="176" font-family="JetBrains Mono" font-size="21" fill="${DIM}">pick an LLM. ride it gently.</text>
  <text x="64" y="204" font-family="JetBrains Mono" font-size="21" fill="${DIM}">like the sheep, but it's Claude.</text>

  <text x="64" y="270" font-family="JetBrains Mono" font-size="16" fill="${DIM}">a Daytona-USA-style turntable select screen,</text>
  <text x="64" y="296" font-family="JetBrains Mono" font-size="16" fill="${DIM}">then a rock-on-a-spring ride for the one you pick.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="#ffb703">ridegently.bisks.net</text>

  <!-- right: the toy, mid-rock -->
  <g transform="translate(880,430) rotate(-7)">
    <path d="M-95 20 Q0 -30 95 20" stroke="#5b4636" stroke-width="12" fill="none" stroke-linecap="round"/>
    <rect x="-8" y="-30" width="16" height="70" rx="6" fill="#7a7a7a"/>
    <ellipse cx="0" cy="-95" rx="92" ry="76" fill="${RIDE}"/>
    <ellipse cx="-46" cy="-158" rx="12" ry="16" fill="#a5502e" transform="rotate(-18 -46 -158)"/>
    <ellipse cx="46" cy="-158" rx="12" ry="16" fill="#a5502e" transform="rotate(18 46 -158)"/>
    <text x="0" y="-72" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="70" fill="rgba(0,0,0,.45)">C</text>
    <circle cx="0" cy="-208" r="19" fill="#ffd8b0"/>
    <rect x="-17" y="-192" width="34" height="30" rx="12" fill="#4d5ea8"/>
    <rect x="-30" y="-186" width="20" height="7" rx="3" fill="#4d5ea8" transform="rotate(20 -30 -186)"/>
    <rect x="10" y="-186" width="20" height="7" rx="3" fill="#4d5ea8" transform="rotate(-20 30 -186)"/>
  </g>
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
