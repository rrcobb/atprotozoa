// Generates public/og.png — the static Open Graph preview card for
// 1001nights.bisks.net. Hand-drawn SVG at the canonical OG size, rasterised
// with @resvg/resvg-js (pure native module, no system Chromium/fontconfig
// needed — the font is bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork or the told/blank counts drift.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG1 = "#0a0714", BG2 = "#170b2e", FG = "#f5e6c8", DIM = "#d8c49f";
const VIOLET = "#8a5cff", GOLD = "#f2c265", ROSE = "#ff5c8a";

const tales = JSON.parse(readFileSync(new URL("./public/data/tales.json", import.meta.url)));
const TOLD = tales.length;
const BLANK = 1001 - TOLD;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="0%" r="60%">
      <stop offset="0" stop-color="#3a1a5c"/>
      <stop offset="1" stop-color="${BG1}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="92%" cy="8%" r="55%">
      <stop offset="0" stop-color="#4a0f3a"/>
      <stop offset="1" stop-color="${BG1}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${VIOLET}"/>
      <stop offset="0.55" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${ROSE}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG1}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  ${Array.from({ length: 34 }).map((_, i) => {
    const x = (i * 137) % W;
    const y = (i * 71) % (H - 60);
    const r = 1 + ((i * 13) % 3);
    const op = 0.25 + ((i * 7) % 6) / 10;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${GOLD}" opacity="${op.toFixed(2)}"/>`;
  }).join("\n  ")}

  <text x="72" y="150" font-family="JetBrains Mono" font-weight="800" font-size="88" fill="url(#title)">1,001</text>
  <text x="72" y="200" font-family="JetBrains Mono" font-size="26" fill="${DIM}">nights — buildthis turns one thousand and one</text>

  <text x="72" y="300" font-family="JetBrains Mono" font-size="19" fill="${DIM}">Every ask this bot has ever gotten is a night,</text>
  <text x="72" y="330" font-family="JetBrains Mono" font-size="19" fill="${DIM}">told Scheherazade-style. Asked for by @antiali.as.</text>

  <rect x="72" y="380" width="500" height="150" rx="16" fill="#170b2e" stroke="#3a2560" stroke-width="1.5"/>
  <text x="100" y="428" font-family="JetBrains Mono" font-weight="700" font-size="40" fill="${GOLD}">${TOLD}</text>
  <text x="100" y="452" font-family="JetBrains Mono" font-size="14" fill="${DIM}">nights told so far</text>
  <text x="320" y="428" font-family="JetBrains Mono" font-weight="700" font-size="40" fill="${VIOLET}">${BLANK}</text>
  <text x="320" y="452" font-family="JetBrains Mono" font-size="14" fill="${DIM}">still unwritten</text>

  <text x="72" y="560" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">1001nights.bisks.net</text>

  <g transform="translate(1020,110) scale(2.6)">
    <path d="M12 3a9 9 0 1 0 8.94 10.07A7 7 0 0 1 12 3z" fill="${GOLD}" opacity="0.9"/>
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
console.log("wrote", out, png.length, "bytes", `(${TOLD} told, ${BLANK} blank)`);
