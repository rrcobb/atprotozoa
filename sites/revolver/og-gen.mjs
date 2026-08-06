// Generates public/og.png — the Open Graph preview card for revolver. Hand-
// drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js (pure
// native module, no system Chromium/fontconfig needed — font is bundled in
// ./fonts and loaded explicitly). Copied from docmoot/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#140d0c", FG = "#f2ece2", DIM = "#a3958a";
const ACCENT = "#c9503f", BRASS = "#caa24a", CARD = "#1d1512", BORDER = "#3a2a24";

// A revolver cylinder, drawn as a ring of six chambers, one lit brass (the
// "loaded" round) — stands in for the whole mechanic without drawing an
// actual gun.
const cx = 940, cy = 330, ringR = 150, chamberR = 34;
let chambers = "";
for (let i = 0; i < 6; i++) {
  const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
  const x = cx + ringR * Math.cos(angle);
  const y = cy + ringR * Math.sin(angle);
  const lit = i === 0;
  chambers += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${chamberR}" fill="${lit ? ACCENT : CARD}" stroke="${lit ? BRASS : BORDER}" stroke-width="3"/>\n  `;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="0%" r="55%">
      <stop offset="0" stop-color="#3a1712"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="100%" r="60%">
      <stop offset="0" stop-color="#2c2007"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${BRASS}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">revolver</text>
  <text x="64" y="196" font-family="JetBrains Mono" font-size="22" fill="${DIM}">live russian roulette, <tspan fill="${BRASS}">played in dares</tspan></text>

  <text x="64" y="290" font-family="JetBrains Mono" font-size="17" fill="${DIM}">Load a dare. Challenge a handle. Agree, then</text>
  <text x="64" y="316" font-family="JetBrains Mono" font-size="17" fill="${DIM}">pull the trigger live — one bullet, your choice</text>
  <text x="64" y="342" font-family="JetBrains Mono" font-size="17" fill="${DIM}">of chambers. Lose, and it really posts.</text>

  <text x="64" y="560" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${BRASS}">revolver.bisks.net</text>

  <circle cx="${cx}" cy="${cy}" r="${ringR + chamberR + 14}" fill="none" stroke="${BORDER}" stroke-width="2"/>
  ${chambers}
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
