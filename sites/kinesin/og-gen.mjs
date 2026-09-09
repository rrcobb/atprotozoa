// Generates public/og.png — the Open Graph preview card for kinesin.
//
// Hand-drawn SVG at the canonical OG size: a microtubule lattice with a
// two-headed kinesin motor mid-step. Rasterised with @resvg/resvg-js (pure
// native module, no system Chromium/fontconfig needed — the font is bundled
// in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork. Adapted from sites/qwopsheet/og-gen.mjs.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0b0e1f", BG2 = "#141a3d", INK = "#f2e9ff", MUTED = "#93a3c2";
const ACCENT = "#6ef2c9", ACCENT2 = "#ff9b3d", CARGO = "#7c4dff", BORDER = "#2c3550";

// A scrolling row of alternating alpha/beta tubulin dimers.
function microtubule(ox, oy, w) {
  const dimerW = 30;
  let out = `<rect x="${ox}" y="${oy}" width="${w}" height="72" rx="6" fill="${BG2}" stroke="${BORDER}" stroke-width="2"/>`;
  let i = 0;
  for (let x = ox + 10; x < ox + w - 10; x += dimerW) {
    const fill = i % 2 === 0 ? "#2a3465" : "#232b52";
    out += `<ellipse cx="${x + dimerW / 2}" cy="${oy + 20}" rx="12" ry="10" fill="${fill}"/>`;
    out += `<ellipse cx="${x + dimerW / 2}" cy="${oy + 52}" rx="12" ry="10" fill="${fill}"/>`;
    i++;
  }
  return out;
}

// Two-headed kinesin: stalk up to a cargo vesicle, one head bound (green),
// one head reaching forward (orange), mid hand-over-hand step.
function motor(ox, oy) {
  return `
  <g transform="translate(${ox},${oy})">
    <line x1="0" y1="0" x2="-6" y2="-70" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
    <circle cx="-6" cy="-88" r="19" fill="${CARGO}"/>
    <circle cx="-6" cy="-88" r="19" fill="none" stroke="#c9b8ff" stroke-width="2"/>
    <line x1="0" y1="0" x2="-38" y2="52" stroke="${ACCENT}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="-38" cy="52" r="7" fill="${ACCENT}"/>
    <line x1="0" y1="0" x2="46" y2="18" stroke="${ACCENT2}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="46" cy="18" r="7" fill="${ACCENT2}"/>
  </g>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="15%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#7c4dff33"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="90%" cy="100%" r="55%">
      <stop offset="0" stop-color="#6ef2c933"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <text x="60" y="130" font-family="JetBrains Mono" font-weight="800" font-size="62" fill="${INK}">kine<tspan fill="${ACCENT}">sin</tspan></text>
  <text x="62" y="176" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">QWOP, but you're a motor protein on a microtubule</text>

  <text x="62" y="250" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">Q/W swing the heads, O/P burn ATP to lock them on —</text>
  <text x="62" y="280" font-family="JetBrains Mono" font-size="19" fill="${MUTED}">walk hand-over-hand before Brownian motion sweeps you off.</text>

  <text x="62" y="600" font-family="JetBrains Mono" font-weight="700" font-size="24" fill="${ACCENT}">kinesin.bisks.net</text>

  ${microtubule(700, 380, 430)}
  ${motor(880, 380)}
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
