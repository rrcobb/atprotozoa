// Generates public/og.png — the Open Graph preview card for hailstone.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium needed — font bundled in ./fonts).
// Same recipe as sites/griftindex/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#070b12", FG = "#eaf3fb", DIM = "#90a7bf";
const ICE = "#7fd4ff", ICE2 = "#bff0ff";

// A deterministic generalized-hailstone walk (m=3, a=1, d=2, seed=27),
// rendered as a stepped line — the same walk the site itself sonifies.
function hailstoneWalk(seed, steps, m, a, d) {
  const out = [seed];
  let n = seed;
  for (let i = 0; i < steps; i++) {
    n = n % d === 0 ? n / d : n * m + a;
    out.push(n);
  }
  return out;
}
const walk = hailstoneWalk(20, 14, 3, 1, 2);
const maxV = Math.max(...walk);
const plotX = 64, plotY = 420, plotW = 1072, plotH = 150;
const stepW = plotW / (walk.length - 1);
let path = "";
walk.forEach((v, i) => {
  const x = plotX + i * stepW;
  const y = plotY + plotH - (v / maxV) * plotH;
  path += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
});
const dotsSvg = walk
  .map((v, i) => {
    const x = plotX + i * stepW;
    const y = plotY + plotH - (v / maxV) * plotH;
    const isTail = v <= 4;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isTail ? 5 : 3}" fill="${isTail ? ICE2 : ICE}"/>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="10%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#14273a"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="100%" cy="0%" r="55%">
      <stop offset="0" stop-color="#0e2233"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="title" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ICE2}"/>
      <stop offset="1" stop-color="${ICE}"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="64" y="140" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="url(#title)">hailstone</text>
  <text x="64" y="186" font-family="JetBrains Mono" font-size="22" fill="${DIM}">a sound synthesis engine with no oscillators</text>
  <text x="64" y="216" font-family="JetBrains Mono" font-size="22" fill="${DIM}">and no Web Audio API, anywhere</text>

  <text x="64" y="272" font-family="JetBrains Mono" font-size="16" fill="${DIM}">every note is a live generalized Collatz walk,</text>
  <text x="64" y="298" font-family="JetBrains Mono" font-size="16" fill="${DIM}">hashed sample-by-sample into a waveform and</text>
  <text x="64" y="324" font-family="JetBrains Mono" font-size="16" fill="${DIM}">rendered straight to a plain WAV file</text>

  <rect x="${plotX - 24}" y="${plotY - 40}" width="${plotW + 48}" height="${plotH + 70}" rx="16" fill="#0d1522" stroke="#223448" stroke-width="1.5"/>
  <text x="${plotX}" y="${plotY - 14}" font-family="JetBrains Mono" font-size="14" letter-spacing="2" fill="${DIM}">SEED 20 · m=3 a=1 d=2 · FALLS TO 4-2-1</text>
  <path d="${path}" fill="none" stroke="${ICE}" stroke-width="2.5" stroke-opacity="0.85"/>
  ${dotsSvg}

  <text x="64" y="600" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${ICE2}">hailstone.bisks.net</text>
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
