// Generates public/og.png — the Open Graph preview card for vadrone, so a
// shared link unfurls as the VAD triangle instead of a bare URL.
//
// Rasterised with @resvg/resvg-js (pure native module, no system Chromium
// needed — font bundled in ./fonts). Adapted from
// sites/code-for-airports/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200,
  H = 630;
const BG = "#06070c";
const INK = "#eef0f2";
const MUTED = "#7c8290";
const FAINT = "#1c2028";
const VALENCE = "#f0b429";
const AROUSAL = "#ff6b6b";
const DOMINANCE = "#4fd1c5";

// A triangle sized to sit in the right half of the card, with a dot pulled
// slightly toward valence+dominance (a bright, forward, pleasant mood) —
// the card's own little demo position, not tied to any user's state.
const V = { x: 900, y: 120 };
const A = { x: 760, y: 480 };
const D = { x: 1040, y: 480 };
const w = { v: 0.5, a: 0.18, d: 0.32 };
const dot = {
  x: w.v * V.x + w.a * A.x + w.d * D.x,
  y: w.v * V.y + w.a * A.y + w.d * D.y,
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="72%" cy="10%" r="65%">
      <stop offset="0" stop-color="#0c2422"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="76" y="150" font-family="JetBrains Mono" font-weight="700" font-size="22" letter-spacing="6" fill="${VALENCE}">VALENCE · AROUSAL · DOMINANCE</text>
  <text x="76" y="230" font-family="JetBrains Mono" font-weight="800" font-size="72" letter-spacing="1" fill="${INK}">vadrone</text>
  <text x="76" y="284" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">an Eno-style drone, steered by a mood</text>
  <text x="76" y="480" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">drag the triangle. the pitch, tempo</text>
  <text x="76" y="512" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">and register bend to match, live.</text>
  <text x="76" y="574" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${VALENCE}">vadrone.bisks.net</text>

  <polygon points="${V.x},${V.y} ${A.x},${A.y} ${D.x},${D.y}" fill="rgba(255,255,255,0.03)" stroke="${FAINT}" stroke-width="2"/>
  <line x1="${V.x}" y1="${V.y}" x2="${(A.x + D.x) / 2}" y2="${(A.y + D.y) / 2}" stroke="${FAINT}" stroke-width="1.5"/>
  <text x="${V.x}" y="${V.y - 20}" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${VALENCE}">V</text>
  <text x="${A.x - 26}" y="${A.y + 12}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${AROUSAL}">A</text>
  <text x="${D.x + 26}" y="${D.y + 12}" text-anchor="start" font-family="JetBrains Mono" font-weight="700" font-size="20" fill="${DOMINANCE}">D</text>
  <circle cx="${dot.x}" cy="${dot.y}" r="12" fill="${INK}" stroke="#000" stroke-width="2"/>
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
