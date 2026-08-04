// Generates public/og.png — the Open Graph preview card for tradorprog.
// Drawn shapes, not emoji: the bundled mono font has no color-emoji glyphs
// and resvg would render a tofu box instead (same reasoning as
// sites/warmhug/og-gen.mjs and sites/fortunejar/og-gen.mjs).
// Rasterised with @resvg/resvg-js (pure native module, no system
// Chromium/fontconfig needed).
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

const BG = "#120b18";
const INK = "#f3ecff", DIM = "#a897c2";
const TRAD = "#d98e3c", TRAD_DIM = "#8a6a54";
const PROG = "#7dd3fc", PROG2 = "#c084fc";

// A gauge track running from TRAD to PROG with a needle sitting just left of
// center — undecided, leaning trad, same tension the site asks about.
function gauge(x, y, w, needleFrac) {
  const h = 26;
  const needleX = x + w * needleFrac;
  return `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="url(#gaugeGrad)"/>
    <rect x="${(needleX - 5).toFixed(1)}" y="${(y - 14).toFixed(1)}" width="10" height="${h + 28}" rx="5" fill="#ffffff"/>
    <text x="${x}" y="${(y + h + 42).toFixed(1)}" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${TRAD}">TRAD</text>
    <text x="${(x + w).toFixed(1)}" y="${(y + h + 42).toFixed(1)}" text-anchor="end" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${PROG}">PROG</text>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="6%" cy="0%" r="55%">
      <stop offset="0" stop-color="${TRAD}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${TRAD}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="95%" cy="6%" r="55%">
      <stop offset="0" stop-color="${PROG}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${PROG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${TRAD}"/>
      <stop offset="0.5" stop-color="${PROG2}"/>
      <stop offset="1" stop-color="${PROG}"/>
    </linearGradient>
    <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${TRAD}"/>
      <stop offset="0.45" stop-color="${TRAD_DIM}"/>
      <stop offset="0.55" stop-color="${PROG2}"/>
      <stop offset="1" stop-color="${PROG}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="64" fill="url(#title)">trad or prog?</text>
  <text x="66" y="196" font-family="JetBrains Mono" font-size="21" fill="${DIM}">an oracle for the eternal shipping question</text>

  <text x="66" y="270" font-family="JetBrains Mono" font-size="18" fill="${INK}">Six forced-choice questions.</text>
  <text x="66" y="298" font-family="JetBrains Mono" font-size="18" fill="${INK}">Stay on the plain worker you</text>
  <text x="66" y="326" font-family="JetBrains Mono" font-size="18" fill="${INK}">already run, or plug into the</text>
  <text x="66" y="354" font-family="JetBrains Mono" font-size="18" fill="${INK}">ecosystem tooling — rook and</text>
  <text x="66" y="382" font-family="JetBrains Mono" font-size="18" fill="${INK}">friends. one verdict, one gauge.</text>

  ${gauge(64, 440, 1072, 0.42)}

  <text x="66" y="600" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${PROG2}">tradorprog.bisks.net</text>
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
