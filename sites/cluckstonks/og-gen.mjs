// Generates public/og.png — the Open Graph preview card for cluckstonks, so
// a shared link auto-renders the joke (a "stock AI" that's secretly a
// chicken) without anyone having to click through.
//
// Pure static site, no server render, so this is a generic (not per-user)
// snapshot: dark trading-terminal card, CluckTrade wordmark, a green
// sparkline going up and to the right, and a chicken. Rasterised with
// @resvg/resvg-js (pure native module, no system Chromium/fontconfig
// needed — font bundled in ./fonts and loaded explicitly).
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Adapted from
// sites/lavalamp/og-gen.mjs. Re-run by hand if you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#060807", INK = "#eaf5ea", MUTED = "#7f9482", UP = "#29f19c", ACCENT = "#ffd166";

// simple drawn chicken silhouette (no emoji — the bundled mono font has no
// color-emoji glyphs and resvg would render a tofu box instead)
function chickenIcon(cx, cy, s) {
  return `
    <g transform="translate(${cx},${cy}) scale(${s})">
      <ellipse cx="0" cy="4" rx="17" ry="13" fill="${INK}"/>
      <circle cx="15" cy="-8" r="9" fill="${INK}"/>
      <path d="M22,-9 L32,-6 L22,-3 Z" fill="${ACCENT}"/>
      <path d="M13,-16 Q15,-21 18,-16 Q16,-14 14,-14 Z" fill="#ff6b6b"/>
      <circle cx="18" cy="-9" r="1.6" fill="${BG}"/>
      <path d="M-4,16 L-8,24 M6,16 L2,24" stroke="${ACCENT}" stroke-width="2.5" stroke-linecap="round"/>
    </g>`;
}

// tiny seeded RNG so the layout is identical every run
let seed = 7;
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
      <stop offset="0" stop-color="rgba(41,241,156,0.16)"/>
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

  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#1c241d" stroke-width="2"/>

  ${chickenIcon(98, 100, 1.35)}
  <text x="150" y="118" font-family="JetBrains Mono" font-weight="800" font-size="46" fill="${INK}">CluckTrade</text>
  <text x="150" y="150" font-family="JetBrains Mono" font-size="20" fill="${MUTED}">AI-Powered Stock Intelligence</text>

  <text x="80" y="240" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${INK}">Our AI never loses.</text>
  <text x="80" y="300" font-family="JetBrains Mono" font-weight="800" font-size="56" fill="${UP}">It just knows.</text>

  <text x="80" y="352" font-family="JetBrains Mono" font-size="23" fill="${MUTED}">(it is, legally and biologically, a chicken)</text>

  <g>${sparkline(80, 400, 700, 150)}</g>

  <text x="820" y="470" font-family="JetBrains Mono" font-weight="700" font-size="30" fill="${ACCENT}">98.7% BUY confidence</text>
  <text x="820" y="510" font-family="JetBrains Mono" font-size="22" fill="${MUTED}">$RIR · Rhode Island Red Inc.</text>

  <text x="80" y="576" font-family="JetBrains Mono" font-weight="700" font-size="26" fill="${UP}">bisks.net/cluckstonks</text>
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
