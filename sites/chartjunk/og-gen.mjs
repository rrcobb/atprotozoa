// Generates public/og.png — the Open Graph preview card for chartjunk.
// Hand-drawn SVG at the canonical OG size, rasterised with @resvg/resvg-js
// (pure native module, no system Chromium / fontconfig needed — the font is
// bundled in ./fonts and loaded explicitly). Same recipe as
// sites/griftmax/og-gen.mjs / sites/didscope/og-gen.mjs.
//
//   node og-gen.mjs   # writes ./public/og.png
//
// The card is itself deliberately bad chart design — exploded 3D pie,
// fake-cylinder bars, clashing colors, a legend nobody asked for — because
// that's the whole bit.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const BG = "#1b0f2e";
const HOT = "#ff2fb0", LIME = "#c6ff2f", CYAN = "#2ff5ff", ORANGE = "#ff8a2f", GOLD = "#ffd76a";
const FG = "#fff6ff", DIM = "#cbb8e6";

// --- exploded 3D pie, hand-computed wedges (values are chartjunk, not data) ---
const slices = [
  { v: 34, color: HOT },
  { v: 26, color: LIME },
  { v: 20, color: CYAN },
  { v: 12, color: ORANGE },
  { v: 8, color: GOLD },
];
const total = slices.reduce((s, x) => s + x.v, 0);
const cx = 860, cy = 330, r = 150, depth = 26, explode = 14;

function polar(cx, cy, rr, angleDeg) {
  const a = (angleDeg - 90) * (Math.PI / 180);
  return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
}

let angle = 0;
const wedgePaths = [];
for (const s of slices) {
  const sweep = (s.v / total) * 360;
  const mid = angle + sweep / 2;
  const [ox, oy] = polar(0, 0, explode, mid); // explode offset for this wedge
  const wcx = cx + ox, wcy = cy + oy;
  const [x1, y1] = polar(wcx, wcy, r, angle);
  const [x2, y2] = polar(wcx, wcy, r, angle + sweep);
  const large = sweep > 180 ? 1 : 0;
  // fake-3D: a darker skirt dropped down by `depth`, then the top face on top
  const skirt = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x2} ${y2 + depth} A ${r} ${r} 0 ${large} 1 ${x1} ${y1 + depth} Z`;
  const top = `M ${wcx} ${wcy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  wedgePaths.push(
    `<path d="${skirt}" fill="${s.color}" opacity="0.55"/>`,
    `<path d="${top}" fill="${s.color}" stroke="#1b0f2e" stroke-width="2"/>`
  );
  angle += sweep;
}

// --- fake-cylinder bars, bottom-left, three ugly heights ---
const bars = [
  { x: 90, h: 120, color: CYAN },
  { x: 170, h: 190, color: HOT },
  { x: 250, h: 90, color: ORANGE },
  { x: 330, h: 230, color: LIME },
];
const barScale = 0.72;
const barBase = 470, barW = 56, cap = 10;
const barShapes = bars
  .map((b) => {
    const h = b.h * barScale;
    return `
  <rect x="${b.x}" y="${barBase - h}" width="${barW}" height="${h}" fill="${b.color}"/>
  <ellipse cx="${b.x + barW / 2}" cy="${barBase - h}" rx="${barW / 2}" ry="${cap}" fill="${b.color}" stroke="#1b0f2e" stroke-width="2"/>
  <ellipse cx="${b.x + barW / 2}" cy="${barBase}" rx="${barW / 2}" ry="${cap}" fill="${b.color}" opacity="0.7"/>`;
  })
  .join("\n");

const legend = slices
  .map(
    (s, i) => `<rect x="${64 + i * 168}" y="522" width="16" height="16" fill="${s.color}"/>
  <text x="${64 + i * 168 + 22}" y="535" font-family="JetBrains Mono" font-size="15" fill="${DIM}">series ${i + 1}</text>`
  )
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="15%" cy="10%" r="60%">
      <stop offset="0" stop-color="#3a1a55"/>
      <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <text x="64" y="130" font-family="JetBrains Mono" font-weight="800" font-size="72" fill="${FG}">chartjunk</text>
  <text x="64" y="175" font-family="JetBrains Mono" font-size="22" fill="${GOLD}">the only way out is through the pie chart</text>

  <text x="64" y="240" font-family="JetBrains Mono" font-size="17" fill="${DIM}">a chamber of the worst charts we could make,</text>
  <text x="64" y="266" font-family="JetBrains Mono" font-size="17" fill="${DIM}">for a "charts and graphs" enjoyer. escape by</text>
  <text x="64" y="292" font-family="JetBrains Mono" font-size="17" fill="${DIM}">clicking "appreciate" until it lets you leave.</text>

  ${barShapes}
  ${wedgePaths.join("\n  ")}
  ${legend}

  <text x="64" y="596" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${GOLD}">chartjunk.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r2 = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r2.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
