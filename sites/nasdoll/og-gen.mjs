// Generates public/og.png — the Open Graph preview card for nasdoll, so a
// shared link auto-renders the joke (a "stock AI" that's secretly a shelf of
// dolls) without anyone having to click through.
//
// Pure static site, no server render, so this is a generic (not per-user)
// snapshot: dark trading-terminal card, DollDEX wordmark, a pink sparkline
// going up and to the right, and a nesting-doll silhouette. Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig
// needed — font bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/cluckstonks/og-gen.mjs. Re-run by hand if you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0a0710", INK = "#f6ecf5", MUTED = "#9384a3", UP = "#ff7fb4", ACCENT = "#ffd166";

// simple drawn nesting-doll silhouette (no emoji — the bundled mono font has
// no color-emoji glyphs and resvg would render a tofu box instead)
function dollIcon(cx, cy, s) {
  return `
    <g transform="translate(${cx},${cy}) scale(${s})">
      <path d="M0,-28 C11,-28 17,-18 17,-4 C17,10 22,18 22,28 L-22,28 C-22,18 -17,10 -17,-4 C-17,-18 -11,-28 0,-28 Z" fill="${INK}"/>
      <path d="M0,-28 C7,-28 11,-22 11,-14 C11,-6 6,-2 0,-2 C-6,-2 -11,-6 -11,-14 C-11,-22 -7,-28 0,-28 Z" fill="${UP}"/>
      <circle cx="-5" cy="-15" r="1.8" fill="${BG}"/>
      <circle cx="5" cy="-15" r="1.8" fill="${BG}"/>
      <path d="M-4,-9 Q0,-6 4,-9" stroke="${BG}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <path d="M-13,10 Q0,18 13,10" stroke="${ACCENT}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    </g>`;
}

// tiny seeded RNG so the layout is identical every run
let seed = 11;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

// a chart that trends up-and-to-the-right, same shape as the live sparkline
function sparkline(x0, y0, w, h) {
  const n = 26;
  let pts = [];
  let y = h * 0.62;
  for (let i = 0; i < n; i++) {
    y -= (rnd() - 0.35) * h * 0.11;
    y = Math.max(h * 0.06, Math.min(h * 0.92, y));
    pts.push([x0 + (i * w) / (n - 1), y0 + y]);
  }
  pts[n - 1][1] = y0 + h * 0.08; // strong finish up top
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L${pts[n - 1][0].toFixed(1)},${y0 + h} L${x0},${y0 + h} Z`;
  return `
    <defs>
      <linearGradient id="chartfade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${UP}" stop-opacity="0.35"/>
        <stop offset="1" stop-color="${UP}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#chartfade)"/>
    <path d="${d}" fill="none" stroke="${UP}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow1" cx="12%" cy="0%" r="65%">
      <stop offset="0" stop-color="rgba(255,127,180,0.16)"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="100%" cy="10%" r="55%">
      <stop offset="0" stop-color="rgba(255,209,102,0.10)"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#241a33" stroke-width="2"/>

  ${dollIcon(98, 100, 1.35)}
  <text x="150" y="118" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${INK}">DollDEX</text>
  <text x="150" y="150" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">The Doll-Backed Stock Exchange</text>

  <text x="80" y="240" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${INK}">Doll stocks drove</text>
  <text x="80" y="300" font-family="JetBrains Mono" font-weight="800" font-size="52" fill="${UP}">market growth.</text>

  <text x="80" y="352" font-family="JetBrains Mono" font-size="23" fill="${MUTED}">(the AI is, legally and structurally, a shelf)</text>

  <g>${sparkline(80, 400, 700, 150)}</g>

  <text x="820" y="470" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${ACCENT}">98.7% BUY confidence</text>
  <text x="820" y="510" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">$BJD · Joint Capital</text>

  <text x="80" y="576" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${UP}">nasdoll.bisks.net</text>
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
